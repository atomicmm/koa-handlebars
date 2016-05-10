'use strict';

const LruCache = require("lru-cache");
const handlebars = require('handlebars');
const debug = require('debug')('koa-handlebars');
const fs = require('fs');
const path = require('path');
const readDir = require('recursive-readdir');
const Q = require('q');

let engine; //handlebars engine
let globalOptions = {}; //global options
let cacheInstance; //lru-cache instance

const resolveViewPath = (viewId, opts) => {
    return {
        name: viewId,
        abs: path.resolve(opts.root, opts.viewPath, `${viewId}${opts.extension}`)
    }
}

const resolveLayoutPath = (layoutId, opts) => {
    return {
        name: layoutId,
        abs: path.resolve(opts.root, opts.layoutPath, `${layoutId}${opts.extension}`)
    }
}

function regHelpers(helpers) {

}

function regPartials(partialPath) {
    const defer = Q.defer();

    if (!engine) {
        defer.reject(new Error('the handlebars engine must be initial first'));
        return defer.promise;
    }

    const o = globalOptions;
    debug('begin to scan partialPath with[ %s ]', o.partialPath);
    const extension = o.extension;
    const dir = path.resolve(o.root, o.partialPath);
    const cacheKey = `partials:list:${dir}`;

    // dir not exist
    if (!fs.existsSync(dir)) {
        defer.reject(new Error('the partials path doesnot exist!'));
        return defer.promise;
    }

    //cached
    //if (o.cache && cacheInstance.peek(cacheKey)) {
    //defer.resolve(cacheInstance.get(cacheKey));

    //return defer.promise;
    //}

    readDir(dir, (err, result) => {
        if (err) {
            defer.reject(err);
            return defer.promise;
        }
        const partials = result
            .filter(file => extension.indexOf(path.extname(file)) > -1)
            .map(file => compilePartial(file));

        debug('[%s] partials found, begin to compile', partials.length);

        Q.all(partials).done(templates => {
            if (o.cache && templates.length > 0) cacheInstance.set(cacheKey, templates);

            templates
                .map(item => Object.assign(item, {
                    name: path.basename(item.name, o.extension)
                })).forEach(item => {
                    debug(`begin to registerPartial[${item.name}] with [${item.body}]`);
                    engine.registerPartial(item.name, item.body);
                });

            defer.resolve(templates.length);
        });
    });

    return defer.promise;
}

function compilePartial(file) {
    debug('compiling partials  %s', file);

    const defer = Q.defer();
    fs.readFile(file, 'utf8', (err, str) => {
        if (err) defer.reject(err);
        else
            defer.resolve({
                name: file,
                body: str.replace(/^\uFEFF/, '')
            });
    });

    return defer.promise;
}

function compileTemplate(file) {
    debug('pre-compiling template %s', file);

    const defer = Q.defer();

    fs.readFile(file, 'utf8', (err, str) => {
        if (err) defer.reject(err);

        let meta = {};
        // remove extraneous utf8 BOM marker
        meta.body = str.replace(/^\uFEFF/, '');
        meta.fn = engine.compile(meta.body);
        meta.render = function(locals, options) {
            return this.fn(locals, options);
        }

        defer.resolve(meta);
    });

    return defer.promise;
}

function findTemplate(file) {
    const o = globalOptions;
    const cacheKey = `template:${file.abs}`;

    const defer = Q.defer();
    if (o.cache) {
        if (cacheInstance.peek(cacheKey)) {
            debug(`template [${file.name}] cache hitted`);

            defer.resolve(cacheInstance.get(cacheKey));
        } else {
            compileTemplate(file.abs).then((meta) => {
                debug(`saving template [${file.name}] to cache`);

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

    globalOptions = Object.assign(globalOptions, options);

    if (globalOptions.helpers) regHelpers(globalOptions.helpers);

    if (globalOptions.cache) {
        debug('caching enabled with lru-cache');
        cacheInstance = new LruCache({
            max: 100
        });
    }

    regPartials(globalOptions.partialPath)
        .then((result) => debug(`[ ${result} ] partials compiled`));
}

function findView(template, options) {
    const defer = Q.defer();

    const body = options.body;
    if (!body) return findTemplate(template);

    defer.resolve(body);
    return defer.promise;
}

function findLayout(layout) {
    return findTemplate(layout);
}

module.exports.render = (viewId, locals, options) => {

    const opts = Object.assign({
        data: {}
    }, globalOptions, options);
    const template = resolveViewPath(viewId, opts);
    const layoutId = typeof locals.layout === 'undefined' ? opts.defaultLayout : locals.layout;
    const layout = resolveLayoutPath(layoutId, opts);
    const body = opts.body;

    debug("begin to render [ %s ] template with layout [ %s  ]", template.name, layoutId);
    delete locals.layout;

    const defer = Q.defer();
    Q.all([findLayout(layout), findView(template, opts)]).done(results => {
        let [layout, view] = results;

        opts.view = template.name;
        if (layoutId) opts.layout = layoutId;

        if (layout) { //compile view with layout
            if (!opts.body) {
                opts.data.body = view.render(locals, opts);
            }
            defer.resolve(layout.render(locals, opts));
        } else { //without layout
            defer.resolve(opts.body || view.render(locals, opts));
        }

    });
    return defer.promise;
}
