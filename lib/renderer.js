'use strict';

const Cache = require("lru-cache");
const handlebars = require('handlebars');
const debug = require("debug")("koa-handlebars");

let engine ;
let options = {};

function regHelpers(helpers){

}

function loadPartials(partialPath){

}

module.exports.init = (options) =>{
    debug('begin to init handlebars engine...')
    if(!engine){
        engine = handlebars.create();
    }

    if (options.helpers){
        regHelpers(options.helpers);
    }

    loadPartials(options.partialPath);


}

module.exports.render = (template,locals,options) =>{

}

