'use strict';

var Model = require('nodee-model');

var Translation = Model.define('AdminTranslation', ['MongoDataSource'], {
    text:{ isString:true },
    textFT:{ valueFrom:'text', fullText:true, hidden:true },
    sections:{ isArray:true }, // section tags, mark in which section will be phrase used
    translations:{
        values: { isString:true }
    }
});

Translation.extendDefaults({
    connection:{
        host: framework.config['admin-config-datasource-host'] || framework.config['datasource-primary-host'],
        port: framework.config['admin-config-datasource-port'] || framework.config['datasource-primary-port'],
        username: framework.config['admin-config-datasource-username'] || framework.config['datasource-primary-username'],
        password: framework.config['admin-config-datasource-password'] || framework.config['datasource-primary-password'],
        database: framework.config['admin-config-datasource-database'] || framework.config['datasource-primary-database'] || framework.config.name,
        collection: 'admin_translations',
        indexes: {
            text:{ 'text':1 },
            textFT:{ 'textFT':1 },
            modifiedDT: { 'modifiedDT':1 },
            sections: { 'sections':1 }
        }
    },
    cache:{
        duration: framework.config['admin-translations-caching'] || 0
    },
    options:{
        softRemove: false,
        sort:{ text:1 }
    }
});

/*
 * Ensure Indexes
 */

// init in index.js
//Translation.init();


/*
 * Constructor methods / properties
 */


/*
 * Prototype methods
 */

/*
 * Collection methods
 */

/*
 * collection().translations(langId, callback) - callback(err, translationsObj) result is object of key:value translations
 * if nothing found returns empty object
 */
Translation.Collection.addMethod('translations', { cacheable:true, fetch:false }, function(langId, cb){ // cb(err, docs)
    var query = this,
        defaults = this._defaults,
        ModelCnst = this.getModelConstructor();
    
    var fields = { text: true };
    fields[ 'translations.'+langId ] = true;
    
    ModelCnst.collection().fields(fields).all(function(err, ts){
        if(err) return cb(err);

        var tsObj = {};
        for(var i=0;i<ts.length;i++){
            tsObj[ ts[i].text ] = (ts[i].translations||{})[langId];
        }

        cb(null, tsObj);
    });
});