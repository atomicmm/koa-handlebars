'use strict';

const LruCache = require("lru-cache");
const handlebars = require('handlebars');
const debug = require('debug')('koa-handlebars');
const fs = require('fs');
const path = require('path');
const readDir = require('recursive-readdir');
const Q = require('q');

let engine; //handlebars engine
let options = {}; //global options
let cacheInstance; //lru-cache instance

function regHelpers(helpers) {

}

function regPartials(partialPath) {
    const defer = Q.defer();

    if (!engine) {
        defer.reject(new Error('the handlebars engine must be initial first'));
        return defer.promise;
    }

    debug('begin to scan partialPath with %s', options.partialPath);
    const o = options;
    const extension = o.extension;
    const dir = path.resolve(o.root, o.partialPath);
    const cacheKey = `partials:list:${dir}`;

    // dir not exist
    if (!fs.existsSync(dir)) {
        defer.reject(new Error('the partials path doesnot exist!'));
        return defer.promise;
    }

    //cached
    if (o.cache && cacheInstance.peek(cacheKey)) {
        defer.resolve(cacheInstance.get(cacheKey));

        return defer.promise;
    }


    readDir(dir, (err, result) => {
        if (err) {
            defer.reject(err);
            return defer.promise;
        }

        const partials = result
            .map(file => path.relative(dir, file))
            .filter(file => extension.indexOf(path.extname(file)) > -1)
            .map(file => compilePartial(file));

        debug('%s partials found, begin to compile', files.length);

        Q.all(partials).done(templates => {
            if (o.cache && templates.length > 0) cacheInstance.set(cacheKey, templates);

            templates.forEach(item => {
                engine.registerPartial(item.name, item.body);
            });

            defer.resolve(templates);
        });
    });

    return defer.promise;
}

function compilePartial(file) {
    debug('compiling partials  %s', file.rel);

    const defer = Q.defer();
    fs.readFile(file.abs, 'utf8', (err, str) => {
        if (err) defer.reject(err);
        defer.resolve({
            name: file.rel,
            body: str.replace(/^\uFEFF/, '')
        });
    });

    return defer.promise;
}

function compileTemplate(file) {
    debug('compiling template %s', file.rel);

    const defer = Q.defer();

    fs.readFile(path, 'utf8', function(err, str) {
        if (err) defer.reject(err);

        let meta = {};
        // remove extraneous utf8 BOM marker
        meta.body = str.replace(/^\uFEFF/, '');
        meta.fn = engine.compile(meta.body);
        meta.render = (locals, options) => this.fn(locals, options);

        defer.resolve(meta);
    });

    return defer.promise;
}

function findTemplate(file) {
    const o = options;
    debug('PreCompileTemplate with %s', file);

    const cacheKey = `template:${file.abs}`;

    const defer = Q.defer();
    if (o.cache) {
        if (cacheInstance.peek(cacheKey)) {
            debug('template cache hitted');
            defer.resolve(cacheInstance.get(cacheKey));
        } else {
            debug('saving template %s to cache', file.rel);
            compileTemplate(file.abs).then((meta) => {
                cacheInstance.set(cacheKey, meta);
                defer.resolve(meta);
            });
        }
    } else {
        compileTemplate(file.abs).then((meta) => {
            defer.resolve(meta);
        })
    }

    return defer.promise;
}

module.exports.init = (options) => {
    debug('begin to init handlebars engine...')
    if (!engine) engine = handlebars.create();

    if (options.helpers) regHelpers(options.helpers);

    if (options.cache) {
        debug('caching enabled with lru-cache');
        cacheInstance = new LruCache({
            max: 100
        });
    }

    regPartials(options.partialPath).then();
}

function findView(template, options) {
    const defer = Q.defer();

    const body = options.body;
    if (!body) return findTemplate(template);

    defer.resolve(body);
    return defer.promise;
}

function findLayout(layoutId) {
    return findTemplate(layoutId);
}

module.exports.render = (template, locals, options) => {
    const o = options;

    locals = Object.assign({}, locals);
    options = Object.assign({}, o, options);
    debug("rendering %s template", template);

    const layoutId = typeof locals.layout === 'undefined' ? o.defaultLayout : locals.layout;
    delete locals.layout;

    const defer = Q.defer();
    Q.all([findLayout(layoutId), findView(template, options)]).done(results => {
        let layout = results[0];
        let view = results[1];

        options.view = template;
        if (layoutId) options.layout = layoutId;

        if (layout) { //compile view with layout
            debug('rendering with layout %s', layoutId);

            //@body===> replace with view content
            options.data.body = body || view.render(locals, options);
            defer.resolve(layout.render(locals, options));
        } else { //without layout
            defer.resolve(body || view.render(locals, options));
        }
    });

    return defer.promise;
}
