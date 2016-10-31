'use strict';

var Model = require('nodee-model'),
    object = require('nodee-utils').object,
    fsExt = require('nodee-utils').fsExt,
    usersPlugin = require('./plugins/users.js');

/*
 * Config definition
 */

// init AdminConfig model
require('./models/AdminConfig.js');

// path format to /mypath/
function unifyPath(path){
    if(path[0] !== '/') path = '/' + path;
    if(path[ path.length-1 ] !== '/') path += '/';
    return path;
}

var basePath = unifyPath( framework.config['admin-base-path'] || '/admin/' );

/*
 * Admin module
 */

var admin = module.exports = {
    // module info
    name: 'nodee-admin',
    // version: '0.7.0', - moved to nodee-admin.package.json
    
    basePath: basePath,
    
    // admin instance
    title: 'ADMIN',
    
    // languages used in administration area
    languages: {
        'en-us':{
            // 'text to translate':'translated text'
        }
    },
    
    languageMerge: function(langId, langObj){
        this.languages[langId] = object.extend(true, this.languages[langId] || {}, langObj);
    },
    
    // admin/application config
    config:{
        items:{
            language:{
                name: 'Language',
                description: 'Administration Area Language Settings',
                templateUrl: basePath + 'views/config-language.html',
                icon: 'fa-language',
                array: false, // will be validated as array of Models
                keyValue: false, // will be validated as key - Model
                defaultValue:{ defaultLanguage:'en-us' },
                Model: Model.define({
                    defaultLanguage:{ required:true, isString:true }
                })
            },
            mailers:{
                name: 'Mailers',
                description: 'Outgoing Mail Servers',
                templateUrl: basePath + 'views/config-mailer.html',
                icon: 'fa-envelope-o',
                array: false, // will be validated as array of Models
                keyValue: true, // will be validated as key - Model
                defaultValue:{},
                Model: Model.define({
                    id:{ required:true, isString:true },
                    from: { required:true, isEmail:true },
                    name: { isString:true },
                    host:{ required:true, isString:true },
                    port:{ required:true, isInteger:true },
                    secure: { isBoolean:true },
                    useTLS:{ isBoolean:true },
                    tls: {}, // ciphers:'SSLv3'
                    user: { isString:true },
                    password:{ isString:true },
                    timeout:{ isInteger:true }
                })
            },
            forgotpass:{
                name: 'Forgot Pass. Email',
                description: 'Forgot Password Email Settings',
                templateUrl: basePath + 'views/config-forgotpass.html',
                icon: 'fa-envelope',
                array: false, // will be validated as array of Models
                keyValue: false, // will be validated as key - Model
                defaultValue: { 
                    emailSubject: 'Password Changed',
                    emailTemplate: '<p>\nDear User,\n</p>\n<p>\nYour password was changed to: <strong>[[new_password]]</strong>\n</p>\n<p>\n<strong>We strongly recommend to change your password after login</strong>\n</p>\n<p>\nThank you\n</p>'
                },
                Model: Model.define({
                    emailSubject:{ required:true, isString:true },
                    emailTemplate:{ required:true, isString:true },
                    mailer:{ isString:true }
                })
            },
        },
        
        // gets default config item data
        getDefault: function(id){
            return (CONFIG.hasOwnProperty(id) || admin.config.items[id]) ? 
                (typeof admin.config.items[id].defaultValue === 'function' ? 
                  admin.config.items[id].defaultValue() : 
                  admin.config.items[id].defaultValue) : undefined;
        },
        
        // gets config item data
        get: function(id, cb){ // cb(err, config)
            if(!CONFIG.hasOwnProperty(id) && !admin.config.items[id]) return cb(new Error('Admin Config: cannot get value of item "'+id+'", not found'));
            
            Model('AdminConfig').collection().findId(id).cache().one(function(err, config){
                if(err) cb(err);
                else if(config) cb(null, config.value);
                else cb(null, typeof admin.config.items[id].defaultValue === 'function' ? admin.config.items[id].defaultValue() : admin.config.items[id].defaultValue);
            });
        },
        
        // gets config item data
        set: function(id, cfg, cb){ // cb(err, data)
            var citem = admin.config.items[ id ];
            if(!citem && cb) return cb(new Error('Admin Config: cannot set value of item "'+id+'", not found'));
            if(!citem && !cb) throw new Error('Admin Config: cannot set value of item "'+id+'", not found');
            
            // validate config
            if(citem.array || citem.isArray){
                if(!Array.isArray(cfg)) {
                    if(cb) return cb(new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:{ config:['isArray'] } }));
                    else throw new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:{ config:['isArray'] } });
                }
                if(citem.Model) for(var i=0;i<cfg.length;i++){
                    cfg[i] = citem.Model.new(cfg[i]).validate();
                    if(!cfg[i].isValid()) {
                        if(cb) return cb(new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg[i].validErrs() }));
                        else throw new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg[i].validErrs() });
                    }
                    cfg[i] = cfg[i].getData();
                }
            }
            else if(citem.keyValue){
                if(!object.isObject(cfg)) {
                    if(cb) return cb(new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:{ config:['isObject'] } }));
                    else throw new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:{ config:['isObject'] } });
                }
                if(citem.Model) for(var key in cfg){
                    cfg[key] = citem.Model.new(cfg[key]).validate();
                    if(!cfg[key].isValid()) {
                        if(cb) return cb(new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg[key].validErrs() }));
                        else throw new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg[key].validErrs() });
                    }
                    cfg[key] = cfg[key].getData();
                }
            }
            else if(citem.Model){
                cfg = citem.Model.new(cfg).validate();
                if(!cfg.isValid()) {
                    if(cb) return cb(new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg.validErrs() }));
                    else throw new Error('Admin Config: INVALID').details({ code:'INVALID', validErrs:cfg.validErrs() });
                }
                cfg = cfg.getData();
            }
            
            // create or update configuration
            Model('AdminConfig').collection().findId(id).exists(function(err, exists){
                if(err) {
                    if(cb) return cb(err);
                    else throw err;
                }
                
                Model('AdminConfig').new({ id:id, value:cfg })[ exists ? 'update' : 'create' ](function(err,cfg){
                    if(cb) cb(err, cfg.value);
                    else if(err) throw err;
                });
            });
        }
    },
    
    // admin menu
    menu: {
        logo:{
            link:'http://nodee.io',
            tooltip:'NODEE'
        },
        items:[
            {
                id:'account',
                name:'My Account', icon:'fa fa-user', href:'#/account',
                children:[
                    { id:'account-profile', name:'Profile', icon:'fa fa-fw fa-user', href:'#/account/profile' },
                    { id:'account-changepass', name:'Change Password', icon:'fa fa-fw fa-lock', href:'#/account/changepass' },
                    { id:'account-changeemail', name:'Change Email', icon:'fa fa-fw fa-at', href:'#/account/changeemail' },
                    { id:'account-logout', name:'Logout', icon:'fa fa-fw fa-sign-out', href:'logout' }
                ],
                common:true
            },
            {
                id:'config',
                name:'Application Configuration',
                icon:'fa fa-wrench',
                href:'#/config',
                allowRoles:['admin'],
                common:true
            },
            //{
            //    id:'logout',
            //    name:'Logout',
            //    icon:'fa fa-fw fa-sign-out',
            //    href:'logout',
            //    css:'nav-logout',
            //    common:true
            //}
            
            // other menu examples examples
            //{
            //    name:'Dashboard', icon:'fa fa-pencil', css:'divided border small', href:'#/pencil',
            //    children:[
            //        { name:'sub item 1', href:'#/pencil/1' },
            //        { name:'sub item 1', href:'#/pencil/2' }
            //    ]
            //},
            // { id:'cms', allowRoles:['admin','cms'], denyRoles:['admin','cms'], name:'Content Management', icon:'fa fa-sitemap', href:'#/cms' },
            //{ id:'users', name:'Users Management', icon:'fa fa-users', href:'#/users' },
            //{
            //    id:'account',
            //    name:'My Account', icon:'fa fa-user', css:'divided border small', href:'#/profile',
            //    divider:'divider divider-lg divider-border',
            //    children:[
            //        { name:'Profile', icon:'fa fa-user', href:'#/profile' },
            //        { name:'Change Password', icon:'fa fa-lock', href:'#/changepass' },
            //        { name:'Logout', icon:'fa fa-sign-out', href:'logout' }
            //    ]
            //},
            
        ],
        add: function(item){
            this.items.push(item);
        },
        append: function(item){
            this.items.push(item);
        },
        prepend: function(item){
            this.items.unshift(item);
        },
        extend: function(id, item){
            var menuItem = this.get(id);
            if(menuItem) object.extend(true, menuItem, item);
        },
        get: function(id){
            var menu = this;
            for(var i=0;i<menu.items.length;i++) {
                if(menu.items[i].id===id) return menu.items[i];
            }
        },
        indexOf: function(id){
            return this.items.indexOf( this.get(id) );
        },
        addBefore: function(id, item){
            var index = this.indexOf(id);
            if(index === -1) this.push(item);
            else this.items.splice(index ,0, item);
            return index;
        },
        addAfter: function(id, item){
            var index = this.indexOf(id);
            if(index === -1) this.push(item);
            else this.items.splice(index+1 ,0, item);
            return index;
        }
    },
    
    // admin module dependencies
    modules: [
        'neAdmin',
        
        'ngRoute',
        'ngCookies',
        'ui.bootstrap',
        'ui.bootstrap.ext',
        'oc.lazyLoad',
        'textAngular',
        'textAngular.ext',
        
        'neDirectives',
        'neContentEditors',
        'neDragdrop',
        'neObject',
        'neLoading',
        'neNotifications',
        'neRest',
        'neGrid',
        'neTree',
        'neModals',
        'neLocal',
        'neQuery',
        'neState',
        'neMenu'
    ],

    // admin routes
    routes: {
        '/intro':{
            templateUrl: basePath + 'views/intro.html'
        },
        '/account/changepass': {
            templateUrl: basePath + 'views/changepass.html',
            controller: 'ChangePasswordCtrl',
            // load:{ name:'admin.cms', files:[ 'cms.js' ] } - lazy load module and 3rd party libs
        },
        '/account/changeemail': {
            templateUrl: basePath + 'views/changeemail.html',
            controller: 'ChangeEmailCtrl',
            // load:{ name:'admin.cms', files:[ 'cms.js' ] } - lazy load module and 3rd party libs
        },
        '/account/profile': {
            templateUrl: basePath + 'views/profile.html',
            controller: 'ProfileCtrl',
            // load:{ name:'admin.cms', files:[ 'cms.js' ] } - lazy load module and 3rd party libs
        }
    },
    
    //templates: [
    //    not implemented
    //],
    
    styles: [
        // 3rd-party
        framework.isDebug ? '/3rd-party/font-awesome/css/font-awesome.css' : '//maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css',
        
        // admin theme
        basePath + 'theme/ne-theme.css'
    ],
    
    // 3rd-party tools & libs, such as ase editor, or jquery, ...
    libs: [
        framework.isDebug ? '/3rd-party/angular/angular.min.js' : '//ajax.googleapis.com/ajax/libs/angularjs/1.5.8/angular.min.js',
        framework.isDebug ? '/3rd-party/angular/angular-route.min.js' : '//ajax.googleapis.com/ajax/libs/angularjs/1.5.8/angular-route.min.js',
        framework.isDebug ? '/3rd-party/angular/angular-cookies.min.js' : '//ajax.googleapis.com/ajax/libs/angularjs/1.5.8/angular-cookies.min.js'
    ],
    
    // admin scripts, will be loaded
    scripts: [
        basePath + 'ne-admin-app.js'
    ],
    
    // angular locale scripts, if localised
    localeScripts:[],
    
    // admin globals object - helps with settings as language, user defined constants, etc...
    globals: {},
    
    defaultRedirect: '/intro',
    _viewMode: 'admin',

    generateAppScript: function(user, langCfg){
        var admin = this;
        var version = framework.isDebug ? new Date().getTime() : framework.config.version;
        user = user || {};
        
        var userLang = (user.profile || {}).language;
        if(!userLang || userLang==='default') userLang = langCfg.defaultLanguage;
        admin.usedLanguages = {};
        for(var lang in admin.languages){
            if(lang === userLang) admin.usedLanguages[lang] = admin.languages[lang].common || {};
            else admin.usedLanguages[lang] = false;
        }
        
        // set correct angular locale script
        admin.localeScripts = (admin.languages[userLang] || {}).angular_locale;
        admin.localeScripts = admin.localeScripts ? [admin.localeScripts] : [];
        
        function appendVersion(key, value){
            if(key==='files' && value && value.length){
                for(var i=0;i<value.length;i++){
                    value[i] += (value[i].indexOf('?') > -1 ? '&_v='+version : '?_v='+version);
                }
            }
            return value;
        }
        
        admin.appScript = admin.appScript || 'angular.module("neApp",["' +admin.modules.join('","')+ '"])' +
            '.constant("version","' + version + '")' +
            '.constant("basePath","' + basePath + '")' +
            //register an http interceptor to transform template urls
            '.config(["$httpProvider", "version", function($httpProvider, version){'+
                '$httpProvider.interceptors.push(function(){'+
                    'return {'+
                        'request: function(config){'+
                            'if(!config.cached && config.url.substring(config.url.length-5, config.url.length) === ".html"){'+
                                'config.url += "?_v=" + version;'+
                            '}'+
                            'return config;'+
                        '}'+
                    '};'+
                '});'+
            '}])'+
            '.config(["$routeProvider", function($routeProvider){' +
            
            (function(routes){
                var result = '';
                for(var path in routes){
                    result = result || '$routeProvider';
                    result += '.when("' +path+ '",{';
                    result += 'resolve:{ resolveLanguage:["$q","neAdmin",function($q,admin){return admin.resolveLanguage($q);}],';
                    if(routes[path].load) result += 'loadModule:["$ocLazyLoad",function($ocLazyLoad){return $ocLazyLoad.load(' +JSON.stringify(routes[path].load, appendVersion)+ ')' + 
                        //(routes[path].load.name ? '.inject(' +JSON.stringify(routes[path].load.name)+ ');' : ';' )+ 
                    ' }]';
                    result+='},';
                    for(var key in routes[path]){
                        if(key!=='load' && key!=='resolve') result += key+':'+JSON.stringify(routes[path][key])+',';
                    }
                    result += '})';
                }
                result += (admin.defaultRedirect ? '.otherwise({redirectTo: "' +admin.defaultRedirect+ '"});' : '');
                return result ? result+';' : '';
            })(admin.routes) + '}]);';
        
        admin.globalsArray = [];
        for(var key in admin.globals) {
            admin.globalsArray.push({ key:key+'', value:JSON.stringify(admin.globals[key]) });
        }
    }
};

module.exports.id = 'nodee-admin';
module.exports.name = 'nodee-admin';
// module.exports.version = '0.6.0'; - moved to nodee-admin.package.json
module.exports.dependencies = ['nodee-total'];
module.exports.install = install;

function install(){
    
    // 3rd-pary libs and styles
    framework.mapping('/3rd-party/angular/','@nodee-admin/app/3rd-party/angular/');
    framework.mapping('/3rd-party/font-awesome/','@nodee-admin/app/3rd-party/font-awesome/');
    
    // admin javascripts
    framework.merge(basePath + 'ne-admin-app.js',
                    '@nodee-admin/app/ne-admin.js',
                    '@nodee-admin/app/ne-admin-users.js',
                    '@nodee-admin/app/angular-modules/ne-modules-all.js');
    
                    //'@nodee-admin/app/angular-modules/ne-directives.js',
                    //'@nodee-admin/app/angular-modules/ne-content-editors.js',
                    //'@nodee-admin/app/angular-modules/ne-dragdrop.js',
                    //'@nodee-admin/app/angular-modules/ne-object.js',
                    //'@nodee-admin/app/angular-modules/ne-loading.js',
                    //'@nodee-admin/app/angular-modules/ne-notifications.js',
                    //'@nodee-admin/app/angular-modules/ne-rest.js',
                    //'@nodee-admin/app/angular-modules/ne-grid.js',
                    //'@nodee-admin/app/angular-modules/ne-tree.js',
                    //'@nodee-admin/app/angular-modules/ne-modals.js',
                    //'@nodee-admin/app/angular-modules/ne-local.js',
                    //'@nodee-admin/app/angular-modules/ne-query.js',
                    //'@nodee-admin/app/angular-modules/ne-state.js',
                    //'@nodee-admin/app/angular-modules/ne-menu.js',
                    //'@nodee-admin/app/angular-modules/oc-lazyload.js',
                    //'@nodee-admin/app/angular-modules/ui-bootstrap-tpls-0.14.2.js',
                    //'@nodee-admin/app/angular-modules/ui-bootstrap-tpls-ext.js');
    
    // modules javascripts - usefull outside of admin area
    framework.merge('/ne-modules-all.js', '@nodee-admin/app/angular-modules/ne-modules-all.js');
    framework.merge('/ne-modules-ui.js', '@nodee-admin/app/angular-modules/ne-modules-ui.js');
    framework.merge('/ne-modules.js', '@nodee-admin/app/angular-modules/ne-modules.js');
    
    // admin angular views
    framework.mapping(basePath + 'views/login-form.html', '@nodee-admin/app/views/login-form.html');
    framework.mapping(basePath + 'views/login-modal.html', '@nodee-admin/app/views/login-modal.html');
    framework.mapping(basePath + 'views/register-form.html', '@nodee-admin/app/views/register-form.html');
    framework.mapping(basePath + 'views/changepass.html', '@nodee-admin/app/views/changepass.html');
    framework.mapping(basePath + 'views/changeemail.html', '@nodee-admin/app/views/changeemail.html');
    framework.mapping(basePath + 'views/forgotpass.html', '@nodee-admin/app/views/forgotpass.html');
    framework.mapping(basePath + 'views/profile.html', '@nodee-admin/app/views/profile.html');
    framework.mapping(basePath + 'views/profile-form.html', '@nodee-admin/app/views/profile-form.html');
    
    // users angular views
    framework.mapping(basePath + 'views/resetpass-modal.html', '@nodee-admin/app/views/resetpass-modal.html');
    framework.mapping(basePath + 'views/users.html', '@nodee-admin/app/views/users.html');
    framework.mapping(basePath + 'views/users-create-modal.html', '@nodee-admin/app/views/users-create-modal.html');
    
    // config angular views
    framework.mapping(basePath + 'views/config.html', '@nodee-admin/app/views/config.html');
    framework.mapping(basePath + 'views/config-mailer.html', '@nodee-admin/app/views/config-mailer.html');
    framework.mapping(basePath + 'views/config-language.html', '@nodee-admin/app/views/config-language.html');
    framework.mapping(basePath + 'views/config-forgotpass.html', '@nodee-admin/app/views/config-forgotpass.html');
    
    // admin styles
    framework.mapping(basePath + 'theme/ne-theme.css', '@nodee-admin/app/theme/ne-theme.css');
    framework.mapping(basePath + 'images/favicon.ico', '@nodee-admin/app/images/favicon.ico');
    
    // intro
    framework.mapping(basePath + 'views/intro.html', '@nodee-admin/app/views/intro.html');
    
    // load "nodee-total" module
    var nodee = MODULE('nodee-total');
    
    // notify nodee-total, that this package is starting
    nodee.setReady('nodee-admin', false);
    nodee.setHealthy('nodee-admin', true);
    
    var modelsCount = 2, modelsInited = 0;
    function checkReadyness(){
        modelsInited++;
        
        // notify nodee-total, that this package is ready
        if(modelsInited === modelsCount) nodee.setReady('nodee-admin', true);
    }
    
    Model('AdminConfig').init(checkReadyness);
    
    // use local vairables, because of async config loading
    var _mailersCfg, _forgotpassCfg;
    
    // create auth
    var auth = admin.auth = new nodee.Auth({
        basePath: basePath,
        loginTemplate: 'ne: @nodee-admin/views/login',
        registerTemplate: 'ne: @nodee-admin/views/register',
        mailer: function(){ 
            var mailerId = _forgotpassCfg.mailer;
            return mailerId ? _mailersCfg[mailerId] : undefined;
        },
        forgotPassSubject: function(){ return _forgotpassCfg.emailSubject; },
        forgotPassEmail: function(){ return _forgotpassCfg.emailTemplate; }
    }, checkReadyness);
    
    var _forgotpass = auth.forgotpass;
    auth.forgotpass = function(){
        var ctrl = this;
        admin.config.get('mailers', function(err, mailersCfg){
            if(err) return ctrl.view500(err);
            _mailersCfg = mailersCfg;
            
            admin.config.get('forgotpass', function(err, forgotpassCfg){
                if(err) return ctrl.view500(err);
                _forgotpassCfg = forgotpassCfg;
                _forgotpass.call(ctrl);
            });
        });
    };
    
    auth.viewRegister = function(data){
        var ctrl = this;
        if(ctrl.xhr) return ctrl.json({ data:data });
        
        admin.config.get('language', function(err, langCfg){
            if(err) return ctrl.view500(err);
            // refresh admin app init script
            admin.generateAppScript(ctrl.user, langCfg);
            ctrl.view(auth.registerTemplate, admin);
        });
    };
    
    auth.viewLogin = function(loginFailed){
        var ctrl = this;
        if(ctrl.xhr) {
            if(loginFailed) ctrl.status = 400;
            return ctrl.json({ data:{ loginFailed:loginFailed } });
        }
        
        admin.config.get('language', function(err, langCfg){
            if(err) return ctrl.view500(err);
            // refresh admin app init script
            admin.generateAppScript(ctrl.user, langCfg);
            admin.loginFailed = loginFailed;
            ctrl.view(auth.loginTemplate, admin);
        });
    };
    
    auth.registerSuccess = function(user){
        var self = this;
        
        if(auth.hasAdminUser) self.redirect(basePath + 'login');
        else Model('User').collection().limit(2).fields({ id:1 }).all(function(err, users){
            if(err) self.view500(err);
            else if(users.length===1){ // this is first user, give him "admin" role
                user.roles = ['user','admin'];
                user.update(function(err, user){
                    if(err) self.view500(err);
                    else {
                        auth.hasAdminUser = true;
                        if(self.xhr) self.json({ data:user });
                        else self.redirect(basePath + 'login');
                    }
                });
            }
            else if(self.xhr) self.json({ data:user });
            else self.redirect(basePath + 'login');
        });
    };
    
    // generate auth routes such as "/admin/login"...
    auth.generateRoutes();
    
    // admin base route
    framework.route(basePath, index, ['authorize','!admin','!adminarea']);
    
    // allow checking if email exists when registering new user, or changing user email
    framework.route(basePath + 'users/exists', framework.rest.collectionAction('User', { method:'exists', filter: onlyEmail }), ['get']);
    
    // disable searching by other props than email
    function onlyEmail(ctx, next){
        ctx.query.$find = { email: ctx.query.$find.email };
        next();
    }
    
    /*
     * Config
     */
    
    // expose config list as globals
    admin.globals.appConfig = admin.config.items;
    
    // admin route
    admin.routes[ '/config' ] = { templateUrl: basePath + 'views/config.html', controller:'ConfigCtrl' };
    
    // get default config item settings
    framework.route(basePath + 'config/{id}/default', getDefaultConfig, ['authorize','!admin','!adminarea']);
    function getDefaultConfig(id){
        var ctrl = this;
        ctrl.json({ data: admin.config.getDefault(id) });
    }
    
    // get config item settings
    framework.route(basePath + 'config/{id}', getConfig, ['authorize','!admin','!adminarea']);
    function getConfig(id){
        var ctrl = this;
        admin.config.get(id, function(err, cfg){
            if(err)return ctrl.view500(err);
            ctrl.json({ data: cfg });
        });
    }
    
    // set config item settings
    framework.route(basePath + 'config/{id}', setConfig, ['put','json','authorize','!admin','!adminarea']);
    function setConfig(id){
        var ctrl = this;
        
        admin.config.set(id, ctrl.body, function(err, cfg){
            if(err) framework.rest.handleResponse(ctrl)(err);
            else ctrl.json({ data: cfg });
        });
    }
    
    // get locals for screen
    framework.route(basePath + 'languages/{langId}', getLanguage, ['authorize','!admin','!adminarea']);
    function getLanguage(langId){
        var ctrl = this;
        var lang = admin.languages[langId] || {};
        var langProp = ctrl.query.property || ctrl.query.path;
        ctrl.json({ data: langProp ? lang[langProp] : lang });
    }
    
    // mailer test
    framework.route(basePath + 'mailers/test', testMailer, ['post','json','authorize','!admin','!adminarea',30000]); // timeout 30 seconds
    function testMailer(){
        var ctrl = this;
        
        framework.sendMail({
            to: ctrl.user.email,
            //cc: '',
            //bcc: '',
            subject: ctrl.body.subject,
            // model: doc,
            body: ctrl.body.body,
            config: ctrl.body.mailer

        }, function(err){
            if(err) ctrl.status = 400;
            ctrl.json({ data: (err||{}).message });
        });
    }
    
    // add usersPlugin
    usersPlugin.install(admin);
}

function index() {
    var ctrl = this;
    
    // generate admin app init script
    admin.config.get('language', function(err, langCfg){
        if(err) return ctrl.view500(err);
        admin.generateAppScript(ctrl.user, langCfg);
        ctrl.view('ne: @nodee-admin/views/index', admin);
    });
}