'use strict';

const debug = require('debug')('koa-handlebars');
const defaults = require('@f/defaults');
const dirname = require('path').dirname;
const extname = require('path').extname;
const join = require('path').join;
const resolve = require('path').resolve;
const _stat = require('fs').stat;
const Q = require('q');

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

module.exports = (path, opts) => {
    opts = defaults(opts || {}, {
        extension: 'html', // 默认后缀
        viewPath: 'views', //视图目录
        layoutPath: 'layouts', //布局视图目录
        partialPath: 'partials', //局部视图目录
        defaultLayout: 'main.html' //默认布局视图名字
    })

    debug('options: %j', opts)

    return function config(ctx, next) {
        if (ctx.render) {
            return next();
        }

        renderer.init(opts); // init the renderer;

        /**
         * Render `view` with `locals` and `koa.ctx.state and handlebar opts`.
         *
         * @param {String} view
         * @param {Object} locals
         * @param {Object} opts
         */
        ctx.render = function(view, locals, opts) {
            if (locals == null) {
                locals = {}
            }

            debug('render `%s` with %j', paths.rel, state)
            const state = ctx.state ? Object.assign(locals, ctx.state) : locals
            ctx.type = 'text/html';

            return renderer.render(view,state,opts).then(html =>{
                ctx.body = html;
            });

        }

        return next();
    }
}
