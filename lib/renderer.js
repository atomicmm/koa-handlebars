'use strict';

const LruCache = require("lru-cache");
const handlebars = require('handlebars');
const debug = require('debug')('koa-handlebars');
const fs = require('fs');
const path = require('path');
const readDir = require('recursive-readdir');

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
    debug('begin to reg ViewHelpers...');
    if (!engine) {
        return Promise.reject(new Error('the handlebars engine must be initial first'));
    }

    let result = 0;
    if (helpers) {
        engine.registerPartial(helpers);
        result = Object.keys(helpers).length;
    }

    return Promise.resolve(result);
}

function regPartials(partialPath) {
    return new Promise((resolve, reject) => {

        if (!engine) {
            reject(new Error('the handlebars engine must be initial first'))
            return
        }

        const o = globalOptions;
        debug('begin to scan partialPath with[ %s ]', o.partialPath)
        const extension = o.extension
        const dir = path.resolve(o.root, o.partialPath)
        const cacheKey = `partials:list:${dir}`

        // dir not exist
        if (!fs.existsSync(dir)) {
            reject(new Error('the partials path doesnot exist!'))
            return
        }

        readDir(dir, (err, result) => {
            if (err) {
                reject(err)
                return
            }

            const partials = result
                .filter(file => extension.indexOf(path.extname(file)) > -1)
                .map(file => compilePartial(file))

            debug('[%s] partials found, begin to compile', partials.length)

            Promise.all(partials).then(templates => {
                if (o.cache && templates.length > 0) cacheInstance.set(cacheKey, templates)

                templates
                    .map(item => Object.assign(item, {
                        name: path.basename(item.name, o.extension)
                    }))
                    .forEach(item => {
                        debug(`begin to registerPartial[${item.name}] with [${item.body}]`)
                        engine.registerPartial(item.name, item.body)
                    })

                resolve(templates.length)
            })
        })
    })
}

function compilePartial(file) {
    debug('compiling partials  %s', file);

    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, str) => {
            if (err) reject(err);
            else resolve({
                name: file,
                body: str.replace(/^\uFEFF/, '')
            })
        })
    })
}

function compileTemplate(file) {
    debug('pre-compiling template %s', file);

    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, str) => {
            if (err || !str) {
                reject(err)
                return
            }

            let meta = {}

            // remove extraneous utf8 BOM marker
            if (str) meta.body = str.replace(/^\uFEFF/, '')
            meta.fn = engine.compile(meta.body)
            meta.render = function(locals, options) {
                return this.fn(locals, options)
            }

            resolve(meta)
        })

    })
}

function findTemplate(file) {
    const o = globalOptions
    const cacheKey = `template:${file.abs}`

    return new Promise((resolve, reject) => {
        if (o.cache) {
            if (cacheInstance.peek(cacheKey)) {
                debug(`template [${file.name}] cache hitted`)

                resolve(cacheInstance.get(cacheKey))
            } else {
                compileTemplate(file.abs)
                    .then((meta) => {
                        debug(`saving template [${file.name}] to cache`)

                        cacheInstance.set(cacheKey, meta)
                        resolve(meta)
                    })
            }
        } else {
            compileTemplate(file.abs)
                .then((meta) => {
                    resolve(meta)
                })
        }
    })
}

module.exports.init = (options) => {
    debug('begin to init handlebars engine...')
    if (!engine) engine = handlebars.create()

    globalOptions = Object.assign(globalOptions, options)

    if (globalOptions.cache) {
        debug('caching enabled with lru-cache')
        cacheInstance = new LruCache({
            max: 100
        })
    }

    Promise.all([regHelpers(globalOptions.helpers), regPartials(globalOptions.partialPath)])
        .then(([helpers, partials]) => {
            debug(`[${helpers}] helpers,[${partials}] partials compiled`)
        })
}

function findView(template, options) {

    const body = options.body;
    if (!body) return findTemplate(template);

    return Promise.resolve(body)
}

function findLayout(layout) {
    return findTemplate(layout);
}

module.exports.render = (viewId, locals, options) => {

    const opts = Object.assign({
        data: {}
    }, globalOptions, options)
    const template = resolveViewPath(viewId, opts)
    const layoutId = typeof locals.layout === 'undefined' ? opts.defaultLayout : locals.layout
    const layout = resolveLayoutPath(layoutId, opts)
    const body = opts.body

    debug("begin to render [ %s ] template with layout [ %s  ]", template.name, layoutId)
    delete locals.layout

    return new Promise((resolve, reject) => {
        Promise.all([findLayout(layout), findView(template, opts)]).then(([layout, view]) => {

            opts.view = template.name
            if (layoutId) opts.layout = layoutId

            if (layout) { //compile view with layout
                if (!opts.body) {
                    opts.data.body = view.render(locals, opts)
                }
                resolve(layout.render(locals, opts))
            } else { //without layout
                resolve(opts.body || view.render(locals, opts))
            }

        })
    })
}
