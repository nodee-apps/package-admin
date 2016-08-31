'use strict';

var Model = require('nodee-model'),
    datasource = framework.config['admin-config-datasource'] || 'MongoDataSource';

var AdminConfig = Model.define( 'AdminConfig', [ datasource ], {
    id:{ required:true },
    value:{} // config value
});

var connection = {
    indexes: {}
};

for(var cfgKey in framework.config){
    var propName = cfgKey.match(/^admin\-config\-datasource\-(.+)/);

    if(propName){
        connection[ propName[1] ] = framework.config[cfgKey];
    }
}

// mongo default settings
connection.host = connection.host || framework.config['datasource-primary-host'];
connection.port = connection.port || framework.config['datasource-primary-port'];
connection.username = connection.username || framework.config['datasource-primary-username'];
connection.password = connection.password || framework.config['datasource-primary-password'];
connection.database = connection.database || framework.config['datasource-primary-database'] || framework.config.name;
connection.collection = connection.collection || 'admin_configs';

var configCacheDuration = framework.config['admin-config-caching'];
if(configCacheDuration === true) configCacheDuration = 1*60*1000; // default 1 minute

AdminConfig.extendDefaults({
    connection: connection,
    cache:{
        duration: configCacheDuration || 0
    },
    options:{
        sort:{ createdDT:1 },
        optimisticLock: false
    }
});

AdminConfig.on('beforeCreate', function(next){
    var cfg = this;
    cfg.clearCache();
    next();
});

AdminConfig.on('beforeUpdate', function(next){
    var cfg = this;
    cfg.clearCache();
    next();
});

AdminConfig.on('beforeRemove', function(next){
    var cfg = this;
    cfg.clearCache();
    next();
});

// helper for clearing cached user - useful when logout, or update
AdminConfig.prototype.clearCache = function(){
    var cfg = this;
    cfg.constructor.collection().findId(cfg.id).clearCache('one');
};

// init in index.js
// AdminConfig.init();