'use strict';


const debug = require('debug')('koa-handlebars');
const Q = require('q');

const renderer = require('./lib/renderer');


module.exports = (opts) => {
    opts = Object.assign({}, opts, {
        root: process.cwd(),
        extension: '.html', // 默认后缀
        cache: true,
        viewPath: 'views', //视图目录
        layoutPath: 'layouts', //布局视图目录
        partialPath: 'partials', //局部视图目录
        defaultLayout: 'main' //默认布局视图名字
    })

    debug('template started with options: %j', opts)
    renderer.init(opts); // init the renderer;

    return function config(ctx, next) {
        if (ctx.render) {
            return next();
        }


        /**
         * Render `view` with `locals` and `koa.ctx.state and handlebar opts`.
         *
         * @param {String} view the view name from root
         * @param {Object} locals
         * @param {Object} opts
         */
        ctx.render = function(view, locals, opts) {
            if (locals == null) {
                locals = {}
            }

            const state = ctx.state ? Object.assign(locals, ctx.state) : locals
            ctx.type = 'text/html';

            return renderer
                .render(view, state, Object.assign({}, opts))
                .then(html => ctx.body = html);
        }

        return next();
    }
}
