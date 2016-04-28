'use strict';

const debug = require('debug')('koa-handlebars');
const defaults = require('@f/defaults');
const dirname = require('path').dirname;
const extname = require('path').extname;
const join = require('path').join;
const resolve = require('path').resolve;
const _stat = require('fs').stat;

const renderer = require('./lib/renderer');

/**
 * Check if `ext` is html.
 * @return {Boolean}
 */
const isHtml = (ext) => ext === 'html'

/**
 * File formatter.
 */
const toFile = (fileName, ext) => `${fileName}.${ext}`

/**
 * `fs.stat` promisfied.
 */
const stat = (path) => {
    return new Promise((resolve, reject) => {
        _stat(path, (err, stats) => {
            if (err) reject(err)
            resolve(stats)
        })
    })
}

/**
 * Get the right path, respecting `index.[ext]`.
 * @param  {String} abs absolute path
 * @param  {String} rel relative path
 * @param  {String} ext File extension
 * @return {Object} tuple of { abs, rel }
 */
function getPaths(abs, rel, ext) {
    return stat(join(abs, rel)).then((stats) => {
            if (stats.isDirectory()) {
                // a directory
                return {
                    rel: join(rel, toFile('index', ext)),
                    abs: join(abs, dirname(rel), rel)
                }
            }

            // a file
            return {
                rel,
                abs
            }
        })
        .catch((e) => {
            // not a valid file/directory
            if (!extname(rel)) {
                // Template file has been provided without extension
                // so append to it to try another lookup
                return getPaths(abs, `${rel}.${ext}`, ext)
            }

            throw e
        })
}

module.exports = (path, opts) => {
    opts = defaults(opts || {}, {
        extension: 'html', // 默认后缀
        viewPath: '', //视图目录
        layoutPath: '', //布局视图目录
        partialPath: '', //局部视图目录
        defaultLayout: 'main.html' //默认布局视图名字
    })

    debug('options: %j', opts)

    return function config(ctx, next) {
        if (ctx.render) {
            return next();
        }

        /**
         * Render `view` with `locals` and `koa.ctx.state and handlebar opts`.
         *
         * @param {String} view
         * @param {Object} locals
         * @param {Object} opts
         */
        ctx.render = function(relPath, locals, opts) {
            if (locals == null) {
                locals = {}
            }

            let ext = (extname(relPath) || '.' + opts.extension).slice(1)

            return getPaths(path, relPath, ext).then((path) => {
                const state = ctx.state ? Object.assign(locals, ctx.state) : locals
                debug('render `%s` with %j', paths.rel, state)

                ctx.type = 'text/html'

                return renderer.render(resolve(paths.abs, paths.rel), state).then((html) => {
                    ctx.body = html;
                })
            });
        }

        return next();
    }
}
