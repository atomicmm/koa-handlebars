'use strict';

const LruCache = require("lru-cache");
const handlebars = require('handlebars');
const debug = require('debug')('koa-handlebars');
const fs = require('fs');
const readDir = require('recursive-readdir');

let engine; //handlebars engine
let options = {}; //global options
let cacheInstance; //lru-cache instance

function regHelpers(helpers) {

}

function regPartials(partialPath) {
    return new Promise((resolve, reject) => {
        if (!engine) reject(new Error('the handlebars engine must be initial first'));

        debug('begin to scan partialPath with %s', options.partialPath);

        const o = options;
        const extension = o.extension;
        const dir = path.resolve(o.root, o.partialPath);
        const cacheKey = `partials:list:${dir}`;

        if (!fs.existsSync(dir)) resolve();

        if (o.cache && cacheInstance.peek(cacheKey)) resolve(cacheInstance.get(cacheKey));

        let files;
        readDir(dir, (err, result) => {
            files = result
                .map(file => path.relative(dir, file))
                .filter(file => extension.indexOf(path.extname(file)) > -1);
        })
        if (o.cache && files.length > 0) cacheInstance.set(cacheKey, files);
        debug('%s partials found, begin to compile', files.length);

        files
            .map(file => compileTemplate(file));
        resolve();
    });
}

function compileTemplate(file) {
    debug('compiling template %s', file.rel);

    return new Promise((resolve, reject) => {
        fs.readFile(path, 'utf8', function(err, str) {
            if (err) reject(err);
            let meta = {};
            // remove extraneous utf8 BOM marker
            meta.body = str.replace(/^\uFEFF/, '');
            meta.fn = engine.compile(meta.body);
            meta.render = (locals, options) => this.fn(locals, options);

            resolve(meta);
        });
    })
}

function findTemplate(file) {
    const o = options;
    debug('PreCompileTemplate with %s', file);

    const cacheKey = `template:${file.abs}`;

    if (o.cache) {
        if (cacheInstance.peek(cacheKey)) {
            debug('template cache hitted');
            return cacheInstance.get(cacheKey);
        } else {
            const template = compileTemplate(file.abs);
            debug('saving template %s to cache', file.rel);
            cacheInstance.set(cacheKey, template);
            return template;
        }
    } else {
        return compileTemplate(file.abs);
    }
}

module.exports.init = (options) => {
    debug('begin to init handlebars engine...')
    if (!engine) engine = handlebars.create();

    if (options.helpers) regHelpers(options.helpers);

    regPartials(options.partialPath);

    if (options.cache) {
        debug('caching enabled with lru-cache');
        cacheInstance = new LruCache({
            max: 100
        });
    }
}

module.exports.render = (template, locals, options) => {
    const o = options;

    locals = Object.assign({}, locals);
    options = Object.assign({}, o, options);
    debug("rendering %s template", template);

    const layoutId = typeof locals.layout === 'undefined' ? o.defaultLayout : locals.layout;
    delete locals.layout;

    let body = options.body;

    return new Promise((resolve, reject) => {
        let layout = findTemplate(layoutId);
        if (!body) let view = findTemplate(template);

        // set up some special meta options
        options.view = template;
        if (layoutId) options.layout = layoutId;

        if (layout) { //compile view with layout
            debug('rendering with layout %s', layoutId);

            //@body===> replace with view content
            options.data.body = body || view.render(locals, options);
            resolve(layout.render(locals, options));
        } else { //without layout
            resolve(body || view.render(locals, options));
        }
    });
}
