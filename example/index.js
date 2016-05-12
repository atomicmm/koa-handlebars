const Koa = require('koa');
const router = require('koa-router')();

const handlebars = require('../index.js');

const app = new Koa();

app.use(handlebars({
    helpers: {
        add: (num1, num2) => num1 + num2,
        sub: (num1, num2) => num1 - num2
    }
}));

app.use(router.routes());
app.use(router.allowedMethods());

router.get('/', (ctx, netx) => {
    console.log('begin to render view');

    return ctx.render('index', {
        name: 'Atomic'
    });
});

app.listen(3000);
