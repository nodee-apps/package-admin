angular.module('neAdmin',['neDirectives',
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
                          'neMenu'])
//.config(['uibDatepickerPopupConfig', function(uibDatepickerPopupConfig){
//    
//    //uibDatepickerPopupConfig.showButtonBar = false;
//    uibDatepickerPopupConfig.datepickerPopup = 'dd.MM.yyyy'; // (UTCZ)
//    //uibDatepickerPopupConfig.currentText = 'Dnes';
//    //uibDatepickerPopupConfig.clearText = 'Vymazať';
//    //uibDatepickerPopupConfig.closeText = 'Zavrieť';
//    
//}])
.config(['$locationProvider', function($locationProvider){
    $locationProvider.hashPrefix(''); // fallback - from angular 1.6 $location.hashPrefix is "!", and all hash links in app are not working
}])
.service('neAdmin.lazyLoad', ['$ocLazyLoad', function($ocLazyLoad){
    // wrap lazyLoader, for possible replacing it in future
    return $ocLazyLoad;
}])
.run(['$rootScope', '$location', '$window', 'NeMenu', 'neLocal',  function($rootScope, $location, $window, Menu, local){
    // replace time zone, include DST difference and offset
    Date.prototype.changeZone = function(newOffset){
        newOffset = newOffset || 0;
        if(this.hasOwnProperty('_zone') && this._zone === newOffset) return this;
        else this._zone = newOffset+0;
        
        var dstDiff = this.getTimezoneOffset() - new Date().getTimezoneOffset();
        var localOffset = this.getTimezoneOffset();
        var offset = localOffset*60*1000 + newOffset*60*60*1000 - dstDiff*60*1000 + this.isDSTinEffect()*60*60*1000;
        var newTime = this.getTime() + offset;
        
        this.setTime(newTime);
        return this;
    };
    
    // return time in zone, include DST difference
    Date.prototype.toZone = function(newOffset){
        return new Date(this.getTime()).changeZone(newOffset);
    };
    
    // synchronize dst when past / future timing is set
    Date.prototype.syncDST = function() {
        var diff = this.getTimezoneOffset() - new Date().getTimezoneOffset();
        if(diff) {
            this.setTime(this.getTime() - diff*60*1000);
        }
        return this;
    };
    
    // synchronize dst when past / future timing is set
    Date.prototype.toSyncDST = function() {
        return new Date(this.getTime()).syncDST();
    };
    
    // TODO: implement zone changes between 2-3 oclock AM, when time is moving +-1 hour
    Date.prototype.isDSTinEffect = function(){
        var d = new Date(), lSoM, lSoO;
    
        // Loop over the 31 days of March for the current year
        for(var i=31; i>0; i--){
            var tmp = new Date(d.getFullYear(), 2, i);
            
            // If it's Sunday
            if(tmp.getDay() === 0){
                // last Sunday of March
                lSoM = tmp;
                break;
            }
        }
    
        // Loop over the 31 days of October for the current year
        for(var i=31; i>0; i--){
            var tmp = new Date(d.getFullYear(), 9, i);
            
            // If it's Sunday
            if(tmp.getDay() === 0){
                // last Sunday of October
                lSoO = tmp;
                break;
            }
        }
    
        // 0 = DST off (UTC)
        // 1 = DST on  (BST)
        if(d < lSoM || d > lSoO) return 0;
        else return 1;
    };

    $rootScope.menu = new Menu('main').set('onTop', false);
    // $rootScope.menu.items = [];
    $rootScope.menu.tooltipPlacement = function(){
        return this.onTop ? 'bottom' : 'right';
    };
    $rootScope.menu.sortCommonItems = function(){
        var menu = this;
        for(var i=0;i<menu.items.length;i++){
            if(menu.items[i].common) {
                $rootScope.menuCommon.items.push(menu.items[i]);
                menu.items.splice(i,1);
                i--;
            }
        }
    };

    $rootScope.menuCommon = new Menu('common');
    // $rootScope.menuCommon.items = [];

    $rootScope.setPath = function(path){
        $window.location = path || '';
    };

    $rootScope.escape = function(string){
        return encodeURIComponent(string);
    };

    $rootScope.$on('$routeChangeStart', function(evt, absNewUrl, absOldUrl){
        $window.scrollTo(0,0);
        if($rootScope.menu.mobilenav) $rootScope.menu.mobilenav = false;
    });

    //$rootScope.$on('$routeUpdate', function(evt, absNewUrl, absOldUrl){
    //    $window.scrollTo(0,0);
    //});

    function checkRoles(defaultResult){
        return function(roles){
            if(!$rootScope.user) return false;
            if(!roles) return true;
            roles = Array.isArray(roles) ? roles : arguments;

            if(roles.length === 0) return true;
            else for(var i=0;i<roles.length;i++){
                if(($rootScope.user.roles || []).indexOf(roles[i])!==-1) return defaultResult;
            }
            return !defaultResult;
        };
    }

    $rootScope.roles =
    $rootScope.role = checkRoles(true);

    $rootScope.rolesNot =
    $rootScope.roles.not = checkRoles(false);
    
    // fill localisation 
    $rootScope.fillLanguages = function(){
        for(var langId in $rootScope.languages){
            if($rootScope.languages[ langId ]) {
                local.set(langId, $rootScope.languages[ langId ]);
                local.language(langId); // set language
            }
        }
    };
}])
.run(['neAdmin', function(admin){
    // force load neAdmin module first
}])
.factory('neAdmin',['NeRestResource','neNotifications','NeStateService','neModals','neLocal', function(RestResource, notify, StateService, modals, local){
    
    var admin = this;
    
    admin.state = new StateService();

    admin.loginModal = modals.create({
        id:'login',
        title: 'Login',
        include:'views/login-modal.html',
        showAfterCreate: false,
        destroyOnClose: false
    });
    
    RestResource.defaults.queryKey = '$q'; // if there is query Key, whole query will be stringified into one query string key
    RestResource.defaults.commands.remove.url = '/{id}?modifiedDT={modifiedDT}'; // allways send modifiedDT when DELETE, because of optimistic locks

    function translateValidations(key, value){
        var errArray = Array.isArray(value) ? value : [value];

        var text = '';
        for(var i=0;i<errArray.length;i++){
            text += (i>0 ? ', ' : '') + local.translate(errArray[i]);
        }
        return text;
    }
    
    function translateKeys(keys){
        if(!Array.isArray(keys)) return local.translate(keys);
        var result = '';
        for(var i=0;i<keys.length;i++) result += (i > 0 ? '.' : '') + local.translate(keys[i]);
        return result;
    }
    
    function flatErrValues(obj, parentKeys, hasNestedParent){
        parentKeys = parentKeys || [];
        var parentKey = parentKeys.length ? parentKeys.join('.') : '';
        var result = {}; // [ { keys:[], errs:[] } ]

        var key, subresult, isStringArray = Array.isArray(obj), isNested = Array.isArray(obj) && obj.length===1 && Array.isArray(obj[0]);        
        if(isStringArray) for(var i=0;i<obj.length;i++) if(typeof obj[i] !== 'string') {
            isStringArray = false;
            break;
        }

        if(isStringArray) {
            result[ parentKey ] = obj;
            result[ parentKey ].keys = parentKeys;
            return result;
        }

        for(key in obj) {
            if(obj.hasOwnProperty(key)){
                subresult = flatErrValues(obj[key], (isNested || (!hasNestedParent && obj.length === 1)) ? parentKeys : parentKeys.concat([ key ]), isNested);
                for(var subKey in subresult) result[ subKey ] = subresult[ subKey ];
            }
        }
        return result;
    }

    RestResource.defaults.responseErrors = {
        '400': function (data, status, headers) {
            var text = data;
            if (angular.isObject(data)) {
                data = flatErrValues(data);
                text = '';
                var first = true;
                for (var key in data) {
                    text += (first ? '' : '<br>') + '<strong>'+ translateKeys(data[key].keys) + '</strong> ' + local.translate('must be') + ': ' + translateValidations(key, data[key]);
                    first = false;
                }
            }
            notify.error('Validation Failed', text);
        },
        '401': function (data, status, headers){
            admin.loginModal.show();
        },
        '403': function (data, status, headers) {
            notify.error('Access Denied', 'Try logout and login again, or contact administrator');
        },
        '404': function (data, status, headers) {
            notify.error('Document or his version not found', 'Try refresh page, please');
        },
        '409': function (data, status, headers) {
            notify.error(data);
        },
        '500': function (data, status, headers) {
            notify.error('Undocumented server error', 'Contact your administrator, please');
        },
        'default': function (data, status, headers) {
            notify.error('Connection Failed', 'Try later, please');
        }
    };
    
    angular.merge(RestResource.defaults.commands, {
        create: {
            onSuccess: function (status, data) {
                notify.success('Created', 'successfully');
            }
        },
        update: {
            onSuccess: function (status, data) {
                notify.success('Updated', 'successfully');
            }
        },
        remove: {
            onSuccess: function (status, data) {
                notify.success('Removed', 'successfully');
            }
        }
    });
    
    admin.users = new RestResource({
        baseUrl: 'users',
        commands:{
            exists:{
                url:'exists'
            },
            login:{
                baseUrl:'',
                method:'POST',
                url:'login'
            },
            register:{
                baseUrl:'',
                method:'POST',
                url:'register'
            },
            changePass:{ 
                baseUrl:'',
                method:'POST',
                url:'changepass'
            },
            forgotPass:{
                baseUrl:'',
                method:'POST',
                url:'forgotpass'
            },
            resetPass:{ 
                method:'POST',
                url: '/{id}/resetpass'
            }
        }
    });
    
    admin.mailers = new RestResource({ 
        baseUrl: 'mailers',
        commands:{
            test:{
                url:'test',
                method:'POST',
            },
            testEmail:{
                url:'test-email',
                method:'POST',
            },
            testEmailTemplate:{
                url:'test-email-template',
                method:'POST',
            }
        }
    });
    
    admin.configs = new RestResource({ 
        baseUrl: 'config',
        commands:{
            default:{
                url:'/{id}/default',
                method:'GET',
            }
        }
    });
    
    admin.languages = new RestResource({
        baseUrl:'languages',
        commands:{
            one:{
                url:'/{id}?path={path}'
            }
        }
    });

    admin.translations = new RestResource({ 
        baseUrl: 'translations'
    });
    
    var loadeLangPaths = {};
    admin.resolveLanguage = function($q){
        var currentLangId = local.getLanguageId();
        var currentLangPath = local.getLanguagePath();
        
        if(!loadeLangPaths[ currentLangId +'_'+ currentLangPath ]) {
            loadeLangPaths[ currentLangId +'_'+ currentLangPath ] = true;
            var langLoading = $q.defer();
            
            admin.languages.one({
                id: currentLangId,
                path: currentLangPath,
            }, function(data){
                local.set(currentLangId, currentLangPath, data);
                langLoading.resolve();
            });
            
            return langLoading.promise;
        }
    };
    
    return admin;
}])
.directive('neLoginForm',['$window','neAdmin','neNotifications','neModals', function($window, admin, notify, modals){
    return {
        scope:{ redirectAfterLogin:'=neLoginFormRedirect', reloadAfterLogin:'=neLoginFormReload', canRegister:'=neLoginFormRegister' },
        templateUrl: 'views/login-form.html',
        link: function(scope, elm, attrs){
            
            function getParameterByName(name) {
                name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
                var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                    results = regex.exec($window.location.search);
                return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
            }
            
            var redirectUrl = getParameterByName('redirect') || './';
            
            scope.forgotPassModal = function(email){
                modals.create({
                    id:'login.forgotPassword',
                    title:'Request Password Change',
                    include:'views/forgotpass.html',
                    sendPass: function(email){
                        admin.users.forgotPass({ email:email }, function(data){
                            notify.success('Password change request was sent to your email');
                            modals.get('login.forgotPassword').hide();
                        });
                    },
                    email:email
                });
            };

            scope.login = function(email, pass){
                admin.users.login({ 
                    email:email, 
                    password:pass
                }, 
                function(data){
                    admin.loginModal.hide();
                    if(scope.redirectAfterLogin) $window.location.href = redirectUrl;
                    else if(scope.reloadAfterLogin) $window.location.reload();
                }, 
                function(data, status){
                    if(status === 400){
                        scope.loginFailed = true;
                        return true;
                    }
                });
            };
        }
    };
}])
.directive('neRegisterForm', ['neAdmin', function(admin){
    return {
        templateUrl:'views/register-form.html',
        link: function(scope, elm, attrs){
            scope.checkEmailDuplicity = function(email){
                if(email) {
                    admin.users.exists({ email: email }, function(data){
                        if(data===false) scope.dupliciteEmail = false;
                        else scope.dupliciteEmail = true;
                    }, function(){
                        scope.dupliciteEmail = true;
                    });
                }
            };

            scope.register = function(email, pass){
                admin.users.register({ 
                    email:email, 
                    password:pass
                }, 
                function(data){
                    scope.registerSuccess = true;
                });
            };
        }
    };
}])
.directive('neForgotpassForm', ['neAdmin', '$window', function(admin, $window){
    return {
        templateUrl:'views/forgotpass-form.html',
        link: function(scope, elm, attrs){

            var qs = ($window.location.search || '?').slice(1);
            var queryParams = {};
            
            qs.split('&').forEach(function(part){
                var part = part.split('=');
                queryParams[ part[0] ] = (part[1] ? decodeURIComponent(part[1].replace(/\+/g,' ')) : part[1]) || '';
            });

            scope.changePass = function(newPass){
                admin.users.changePass({ email: queryParams.email, token:queryParams.token, newPass:newPass }, function(data){
                    scope.forgotPassSuccess = true;
                },
                function(data){
                    scope.forgotPassFailed = true;
                });
            };
        }
    };
}])
.controller('ChangePasswordCtrl',['$scope','neAdmin','neNotifications', function($scope, admin, notify){
    
    $scope.changePass = function(oldPass, newPass){
        admin.users.changePass({ oldPass:oldPass, newPass:newPass }, function(data){
            $scope.user.modifiedDT = data.modifiedDT;
            notify.success('Password Changed');
        });
    };
    
}])
.controller('ChangeEmailCtrl',['$scope', 'neAdmin', 'neNotifications','neModals', function($scope, admin, notify, modals){

    $scope.checkEmailDuplicity = function(email){
        if(email) {
            admin.users.exists({ email: email }, function(data){
                $scope.dupliciteEmail = data;
            }, function(){
                $scope.dupliciteEmail = true;
            });
        }
    };
    
    $scope.changeEmail = function(newEmail){     
        var newUser = angular.copy($scope.user);
        newUser.email = newEmail;
        
        admin.users.update(newUser, function(data){
            $scope.user.modifiedDT = data.modifiedDT;
            $scope.user.email = data.email;
            notify.success('Email Changed');
        });
    };

}])
.controller('ConfigCtrl',['$scope','neAdmin','neNotifications', function($scope, admin, notify){
    $scope.configItems = angular.copy($scope.appConfig);
    
    $scope.getConfig = function(id, item){
        admin.configs.one(id, function(data){
            item[ '$'+id ] = data;
        });
    };
    
    $scope.resetConfig = function(id, item){
        admin.configs.default(id, function(data){
            item.loaded = true;
            item.config = data;
        });
    };
    
    $scope.loadConfig = function(id, item){
        admin.configs.one(id, function(data){
            item.loaded = true;
            item.config = data;
        });
    };
    
    $scope.updateConfig = function(id, item, cb){
        admin.configs.update(id, item.config, function(data){
            item.config = data;
            if(cb) cb();
        });
    };
    
    $scope.deleteKey = function(key, obj){
        if(obj) delete obj[ key ];
    };
    
    // TODO: move to another controller
    $scope.sendEmail = function(mailer, subject, body){
        admin.mailers.test({
            mailer: mailer,
            subject: subject,
            body: body
        }, function(data){
            notify.success('Email Sent');
            return true;
        }, function(data, status){
            if(status === 408) notify.error('Email Sending Error', 'Timeout');
            else notify.error('Email Sending Error', data);
            return true;
        });
    };

    $scope.testEmailTemplate = function(item, mailer, subject, body, cb){
        admin.mailers.testEmailTemplate({
            to: '@user.email',
            subject: subject,
            body: body
        }, function(data){
            item.$validErrs = {};
            item.$valid = true;
            if(cb) cb(mailer, subject, body);
        }, function(data){
            item.$validErrs = data;
            item.$valid = false;
            return true;
        });
    };
}])
.controller('ProfileCtrl',['$scope','neAdmin','neNotifications', function($scope, admin, notify){
    $scope.updateProfile = function(){
        admin.users.update($scope.user, function(data){
            $scope.user = data;
            notify.success('Profile Updated');
        });
    };
}])
.directive('neUserProfile', ['$rootScope', 'neLocal', function($rootScope, local){
    return {
        scope:{
            profile:'=neUserProfile',
            update:'&neUserProfileUpdate',
            rollback:'&neUserProfileRollback'
        },
        templateUrl:'views/profile-form.html',
        link: function(scope, elm, attrs){
            scope.languages = Object.keys($rootScope.languages);
            scope.languages.unshift(local.translate('default'));
        }
    };
}])
.controller('AdminTranslationsCtrl', [ '$scope', 'NeGrid', 'NeQuery', 'neModals','neNotifications', 'NeRestResource', 'neLocal', 'neAdmin', function($scope, Grid, Query, modals, notify, Resource, local, admin){

    admin.state.register('admin.translations', {
        store:{ sync:true }
    });
    
    $scope.grid = new Grid({
        id: 'admin.translations',
        resource: admin.translations,
        autoLoad: false,
        limit: 10,
        onQueryChange: function(query){
            admin.state.change(this.id, query);
        }
    });

    $scope.query = new Query([
        { name:'text', field: 'textFT', type: 'string' },
        { field: 'translations', type: 'string' },
        { field: 'createdDT', type: 'date' },
        { field: 'modifiedDT', type: 'date' },
        { field: 'lastLoginDT', type: 'datetime' }
    ]);
    
    function gridStateWatch(newState, oldState){
        $scope.query.fill(newState);
        $scope.grid.setQuerySilent(newState).load();
    }

    admin.state.watch($scope.grid.id, gridStateWatch);
    $scope.$on('$destroy', function(){ admin.state.destroy($scope.grid.id); });

    $scope.languages = [];
    admin.configs.one('translations', function(data){
        $scope.languages = data;
    });

    $scope.createText = function(item){
        admin.translations.create(item, function(data){
            item.id = data.id;
            item.modifiedDT = data.modifiedDT;
            item.createdDT = data.createdDT;
        });
    };
}])
.factory('NeUploadHandler',['neNotifications', function(notify){

    function Upload(resourceUploadMethod, resourceUploadQuery, resourceUploadBody){
        this.files = [];
        this.resourceUploadMethod = resourceUploadMethod;
        if(resourceUploadQuery) this.resourceUploadQuery = resourceUploadQuery;
        if(resourceUploadBody) this.resourceUploadBody = resourceUploadBody;

        this.id = 'NeUploadHandler-' + new Date();

        return this;
    }

    Upload.prototype.getNames = function(){
        var names = '';
        for(var i=0;i<(this.files||[]).length;i++) {
            names += this.files[i].name+(this.files.length>i+1 ? ' ,' : '');
        }
        return names;
    };

    Upload.prototype.onUpload = null;
    Upload.prototype.onComplete = null;

    Upload.prototype.onError = function(fileName, parsedError, status, headers){
        notify.show('error', status===431 ? 'File Too Large' : 'Uploading File Failed', fileName, 'fa fa-upload fa-2x');
        return true; // disable global resource error handler
    };

    Upload.prototype.onProgress = function(isUploading, progress, fileName, fileIndex, filesCount){
        var updateOpts;

        if(isUploading){
            this.notification = this.notification || notify.show({
                id: this.id,
                type: 'info',
                icon: 'fa fa-upload fa-2x',
                timeout: false,
                include:'NeUploadHandler/notification.html'
            });

            if(fileName) updateOpts = {
                fileName: fileName,
                progressSingle: progress,
                progressTotal: Math.round(100*fileIndex/filesCount),
                fileIndex: fileIndex,
                filesCount: filesCount
            };
            else if(progress !== undefined) updateOpts = { progressSingle: progress };

            if(updateOpts) this.notification.update(updateOpts);
        }
        else {
            this.notification.hide();
            this.notification = null;
        }
    };

    Upload.prototype.start = function(filesToUpload){
        var files = filesToUpload || this.files || [], filesCount = files.length;
        var resourceUploadMethod = this.resourceUploadMethod;
        var resourceUploadQuery = this.resourceUploadQuery;
        var resourceUploadBody = this.resourceUploadBody;
        var onProgress = this.onProgress;
        var onError = this.onError;
        var onUpload = this.onUpload;
        var onComplete = this.onComplete;

        if(!files.length) return;
        filesCount = files.length;

        (function uploadFile(skip){
            skip = skip || 0;
            var fileIndex = filesCount - files.length - (skip+1);

            // notify progress
            onProgress(true, 0, files[skip].name, fileIndex, filesCount);

            var query = typeof resourceUploadQuery === 'function' ? resourceUploadQuery(files[skip].name, files[skip], fileIndex, filesCount) : (resourceUploadQuery || {});
            var body = typeof resourceUploadBody === 'function' ? resourceUploadBody(files[skip].name, files[skip], fileIndex, filesCount) : (resourceUploadBody || { file:files[skip] });

            resourceUploadMethod(query, body, function(data){ // on success
                files.splice(skip,1);
                if(files.length > skip) {
                    if(onUpload) onUpload(data);
                    uploadFile(skip);
                }
                else {
                    if(onComplete) onComplete(data);
                    onProgress(false);
                }

            }, function(parsedError, status, headers){ // on error
                skip++;
                if(files.length > skip) uploadFile(skip);
                else {
                    if(onComplete) onComplete();
                    onProgress(false);
                }
                if(onError) return onError(files[skip-1].name, parsedError, status, headers);

            }, function(progressPercent){ // on progress
                onProgress(true, progressPercent);
            });
        })();
    };

    return Upload;
}])
.run(['$templateCache', function($templateCache){
    $templateCache.put('NeUploadHandler/notification.html',
                       '<div>'+
                       '    <div style="margin-bottom:5px">{{n.fileName}}</div>'+
                       '    <div class="progress" style="margin-bottom:5px;background-color:#fff;">'+
                       '        <div class="progress-bar progress-bar-striped" style="width:{{n.progressSingle}}%;">'+
                       '            {{n.progressSingle}}%'+
                       '        </div>'+
                       '    </div>'+
                       '    <div class="progress" style="margin-bottom:5px;background-color:#fff;">'+
                       '        <div class="progress-bar progress-bar-striped" style="width:{{n.progressTotal}}%;">'+
                       '            {{n.fileIndex}} / {{n.filesCount}}'+
                       '        </div>'+
                       '    </div>'+
                       '</div>');
}])
.service('neJsonHelpers', [function(){
    this.isValid = function(json){
        try { JSON.parse(json); return true; }
        catch(err){ return false; }
    };

    this.parse = function(json){
        try { return JSON.parse(json); }
        catch(err){ return {}; }
    };

    this.stringify = function(obj, replaceDollars){
        try { return JSON.stringify(obj, replaceDollars ? function(key, value){ return key[0]!=='$' ? value : undefined; } : null, 4); }
        catch(err){ return '{}'; }
    };

    this.prettyString = this.pretty = function(obj, replaceDollars){
        return JSON.stringify(obj, replaceDollars ? function(key, value){ return key[0]!=='$' ? value : undefined; } : null, 4);
        //return angular.toJson(obj, true);
    };

    return this;
}])
.factory('neColorPalette256',[function(){
    return [
        '#400000', '#400000', '#400900', '#234000', '#004000', '#004000', '#004000',
        '#000d40', '#000040', '#000040', '#000040', '#000040', '#280040', '#400003',
        '#400000', '#000000', '#540000', '#540000', '#541d00', '#375400', '#005400',
        '#005400', '#005402', '#002154', '#000054', '#000054', '#000054', '#000054',
        '#3c0054', '#540017', '#540000', '#0d0d0d', '#680000', '#680000', '#683100',
        '#4b6800', '#006800', '#006800', '#006816', '#003568', '#001168', '#000068',
        '#000068', '#000068', '#500068', '#68002b', '#680000', '#212121', '#7c0000',
        '#7c0000', '#7c4500', '#5f7c00', '#0b7c00', '#007c00', '#007c2a', '#00497c',
        '#00257c', '#00007c', '#00007c', '#10007c', '#64007c', '#7c003f', '#7c0000',
        '#353535', '#900000', '#900400', '#905900', '#739000', '#1f9000', '#009000',
        '#00903e', '#005d90', '#003990', '#000090', '#000090', '#240090', '#780090',
        '#900053', '#900000', '#494949', '#a40000', '#a41800', '#a46d00', '#87a400',
        '#33a400', '#00a400', '#00a452', '#0071a4', '#004da4', '#0000a4', '#0000a4',
        '#3800a4', '#8c00a4', '#a40067', '#a40013', '#5d5d5d', '#b80000', '#b82c00',
        '#b88100', '#9bb800', '#47b800', '#00b800', '#00b866', '#0085b8', '#0061b8',
        '#000db8', '#0000b8', '#4c00b8', '#a000b8', '#b8007b', '#b80027', '#717171',
        '#cc0000', '#cc4000', '#cc9500', '#afcc00', '#5bcc00', '#06cc00', '#00cc7a',
        '#0099cc', '#0075cc', '#0021cc', '#0c00cc', '#6000cc', '#b400cc', '#cc008f',
        '#cc003b', '#858585', '#e00000', '#e05400', '#e0a900', '#c3e000', '#6fe000',
        '#1ae000', '#00e08e', '#00ade0', '#0089e0', '#0035e0', '#2000e0', '#7400e0',
        '#c800e0', '#e000a3', '#e0004f', '#999999', '#f41414', '#f46814', '#f4bd14',
        '#d7f414', '#83f414', '#2ef414', '#14f4a2', '#14c1f4', '#149df4', '#1449f4',
        '#3414f4', '#8814f4', '#dc14f4', '#f414b7', '#f41463', '#adadad', '#ff2828',
        '#ff7c28', '#ffd128', '#ebff28', '#97ff28', '#42ff28', '#28ffb6', '#28d5ff',
        '#28b1ff', '#285dff', '#4828ff', '#9c28ff', '#f028ff', '#ff28cb', '#ff2877',
        '#c1c1c1', '#ff3c3c', '#ff903c', '#ffe53c', '#ffff3c', '#abff3c', '#56ff3c',
        '#3cffca', '#3ce9ff', '#3cc5ff', '#3c71ff', '#5c3cff', '#b03cff', '#ff3cff',
        '#ff3cdf', '#ff3c8b', '#d5d5d5', '#ff5050', '#ffa450', '#fff950', '#ffff50',
        '#bfff50', '#6aff50', '#50ffde', '#50fdff', '#50d9ff', '#5085ff', '#7050ff',
        '#c450ff', '#ff50ff', '#ff50f3', '#ff509f', '#e9e9e9', '#ff6464', '#ffb864',
        '#ffff64', '#ffff64', '#d3ff64', '#7eff64', '#64fff2', '#64ffff', '#64edff',
        '#6499ff', '#8464ff', '#d864ff', '#ff64ff', '#ff64ff', '#ff64b3', '#fdfdfd',
        '#ff7878', '#ffcc78', '#ffff78', '#ffff78', '#e7ff78', '#92ff78', '#78ffff',
        '#78ffff', '#78ffff', '#78adff', '#9878ff', '#ec78ff', '#ff78ff', '#ff78ff',
        '#ff78c7', '#ffffff', '#ff8c8c', '#ffe08c', '#ffff8c', '#ffff8c', '#fbff8c',
        '#a6ff8c', '#8cffff', '#8cffff', '#8cffff', '#8cc1ff', '#ac8cff', '#ff8cff',
        '#ff8cff', '#ff8cff', '#ff8cdb', '#ffffff'
    ];
}])
.factory('neColorPalette16',[function(){
    return [
        '#00ffff',
        '#000000',
        '#0000ff',
        '#ff00ff',
        '#808080',
        '#008000',
        '#00ff00',
        '#800000',
        '#000080',
        '#808000',
        '#800080',
        '#ff0000',
        '#c0c0c0',
        '#008080',
        '#ffffff',
        '#ffff00'
    ];
}])
.directive('neColorContrast',['$window', function($window){
    return {
        restrict: 'A',
        scope:{ watchModel:'=neColorContrast' },
        link: function(scope, elm, attrs){
            var origColor = $window.getComputedStyle(elm[0]).color;
            var origColorLum = lum(origColor);

            if(attrs.neColorContrast) scope.$watch('watchModel', checkColor);
            else checkColor();

            function checkColor(bgcolor){
                var bgcolorLum = lum( bgcolor || elm.css('background-color') || $window.getComputedStyle(elm[0])['background-color'] );
                if(isNaN(bgcolorLum) || bgcolorLum > (origColorLum+25)) elm.css('color', origColor);
                else { // change to white
                    elm.css('color', '#fff');
                }
            }

            function lum(color){
                if(!color) return;
                var rgb,r,g,b;

                if(color[0] === '#') {
                    var c = color.substring(1);  // strip #
                    rgb = parseInt(c, 16);   // convert rrggbb to decimal
                    r = (rgb >> 16) & 0xff;  // extract red
                    g = (rgb >>  8) & 0xff;  // extract green
                    b = (rgb >>  0) & 0xff;  // extract blue
                }
                else {
                    rgb = color.match(/(\d+)/g);
                    if(!rgb) return;
                    r = rgb[0];  // extract red
                    g = rgb[1];  // extract green
                    b = rgb[2];  // extract blue
                }

                return 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
            }
        }
    };
}])
.factory('neFontAwesomeIcons',[function(){
    // fa version 4.3
    return {
        '$array':null,
        '$toArray': function(){
            if(this.$array) return this.$array;
            this.$array = [];
            for(var key in this){
                if(key[0] !== '$') this.$array.push({ icon:key, name:this[key] });
            }
            return this.$array;
        },
        'fa-adjust' :'Adjust',
        'fa-adn' :'Adn',
        'fa-align-center' :'Align Center',
        'fa-align-justify' :'Align Justify',
        'fa-align-left' :'Align Left',
        'fa-align-right' :'Align Right',
        'fa-ambulance' :'Ambulance',
        'fa-anchor' :'Anchor',
        'fa-android' :'Android',
        'fa-angle-double-down' :'Angle Double Down',
        'fa-angle-double-left' :'Angle Double Left',
        'fa-angle-double-right' :'Angle Double Right',
        'fa-angle-double-up' :'Angle Double Up',
        'fa-angle-down' :'Angle Down',
        'fa-angle-left' :'Angle Left',
        'fa-angle-right' :'Angle Right',
        'fa-angle-up' :'Angle Up',
        'fa-apple' :'Apple',
        'fa-archive' :'Archive',
        'fa-arrow-circle-down' :'Arrow Circle Down',
        'fa-arrow-circle-left' :'Arrow Circle Left',
        'fa-arrow-circle-o-down' :'Arrow Circle O Down',
        'fa-arrow-circle-o-left' :'Arrow Circle O Left',
        'fa-arrow-circle-o-right' :'Arrow Circle O Right',
        'fa-arrow-circle-o-up' :'Arrow Circle O Up',
        'fa-arrow-circle-right' :'Arrow Circle Right',
        'fa-arrow-circle-up' :'Arrow Circle Up',
        'fa-arrow-down' :'Arrow Down',
        'fa-arrow-left' :'Arrow Left',
        'fa-arrow-right' :'Arrow Right',
        'fa-arrows' :'Arrows',
        'fa-arrows-alt' :'Arrows Alt',
        'fa-arrows-h' :'Arrows H',
        'fa-arrows-v' :'Arrows V',
        'fa-arrow-up' :'Arrow Up',
        'fa-asterisk' :'Asterisk',
        'fa-automobile' :'Automobile',
        'fa-backward' :'Backward',
        'fa-ban' :'Ban',
        'fa-bank' :'Bank',
        'fa-bar-chart-o' :'Bar Chart O',
        'fa-barcode' :'Barcode',
        'fa-bars' :'Bars',
        'fa-bed' :'Bed',
        'fa-bed' :'Hotel',
        'fa-beer' :'Beer',
        'fa-behance' :'Behance',
        'fa-behance-square' :'Behance Square',
        'fa-bell' :'Bell',
        'fa-bell-o' :'Bell O',
        'fa-bitbucket' :'Bitbucket',
        'fa-bitbucket-square' :'Bitbucket Square',
        'fa-bitcoin' :'Bitcoin',
        'fa-bold' :'Bold',
        'fa-bolt' :'Bolt',
        'fa-bomb' :'Bomb',
        'fa-book' :'Book',
        'fa-bookmark' :'Bookmark',
        'fa-bookmark-o' :'Bookmark O',
        'fa-briefcase' :'Briefcase',
        'fa-btc' :'Btc',
        'fa-bug' :'Bug',
        'fa-building' :'Building',
        'fa-building-o' :'Building O',
        'fa-bullhorn' :'Bullhorn',
        'fa-bullseye' :'Bullseye',
        'fa-buysellads' :'Buysellads',
        'fa-cab' :'Cab',
        'fa-calendar' :'Calendar',
        'fa-calendar-o' :'Calendar O',
        'fa-camera' :'Camera',
        'fa-camera-retro' :'Camera Retro',
        'fa-car' :'Car',
        'fa-caret-down' :'Caret Down',
        'fa-caret-left' :'Caret Left',
        'fa-caret-right' :'Caret Right',
        'fa-caret-square-o-down' :'Caret Square O Down',
        'fa-caret-square-o-left' :'Caret Square O Left',
        'fa-caret-square-o-right' :'Caret Square O Right',
        'fa-caret-square-o-up' :'Caret Square O Up',
        'fa-caret-up' :'Caret Up',
        'fa-cart-arrow-down' :'Cart Arrow Down',
        'fa-cart-plus' :'Cart Plus',
        'fa-certificate' :'Certificate',
        'fa-chain' :'Chain',
        'fa-chain-broken' :'Chain Broken',
        'fa-check' :'Check',
        'fa-check-circle' :'Check Circle',
        'fa-check-circle-o' :'Check Circle O',
        'fa-check-square' :'Check Square',
        'fa-check-square-o' :'Check Square O',
        'fa-chevron-circle-down' :'Chevron Circle Down',
        'fa-chevron-circle-left' :'Chevron Circle Left',
        'fa-chevron-circle-right' :'Chevron Circle Right',
        'fa-chevron-circle-up' :'Chevron Circle Up',
        'fa-chevron-down' :'Chevron Down',
        'fa-chevron-left' :'Chevron Left',
        'fa-chevron-right' :'Chevron Right',
        'fa-chevron-up' :'Chevron Up',
        'fa-child' :'Child',
        'fa-circle' :'Circle',
        'fa-circle-o' :'Circle O',
        'fa-circle-o-notch' :'Circle O Notch',
        'fa-circle-thin' :'Circle Thin',
        'fa-clipboard' :'Clipboard',
        'fa-clock-o' :'Clock O',
        'fa-cloud' :'Cloud',
        'fa-cloud-download' :'Cloud Download',
        'fa-cloud-upload' :'Cloud Upload',
        'fa-cny' :'Cny',
        'fa-code' :'Code',
        'fa-code-fork' :'Code Fork',
        'fa-codepen' :'Codepen',
        'fa-coffee' :'Coffee',
        'fa-cog' :'Cog',
        'fa-cogs' :'Cogs',
        'fa-columns' :'Columns',
        'fa-comment' :'Comment',
        'fa-comment-o' :'Comment O',
        'fa-comments' :'Comments',
        'fa-comments-o' :'Comments O',
        'fa-compass' :'Compass',
        'fa-compress' :'Compress',
        'fa-connectdevelop' :'Connectdevelop',
        'fa-copy' :'Copy',
        'fa-credit-card' :'Credit Card',
        'fa-crop' :'Crop',
        'fa-crosshairs' :'Crosshairs',
        'fa-css3' :'Css3',
        'fa-cube' :'Cube',
        'fa-cubes' :'Cubes',
        'fa-cut' :'Cut',
        'fa-cutlery' :'Cutlery',
        'fa-dashboard' :'Dashboard',
        'fa-dashcube' :'Dashcube',
        'fa-database' :'Database',
        'fa-dedent' :'Dedent',
        'fa-delicious' :'Delicious',
        'fa-desktop' :'Desktop',
        'fa-deviantart' :'Deviantart',
        'fa-diamond' :'Diamond',
        'fa-digg' :'Digg',
        'fa-dollar' :'Dollar',
        'fa-dot-circle-o' :'Dot Circle O',
        'fa-download' :'Download',
        'fa-dribbble' :'Dribbble',
        'fa-dropbox' :'Dropbox',
        'fa-drupal' :'Drupal',
        'fa-edit' :'Edit',
        'fa-eject' :'Eject',
        'fa-ellipsis-h' :'Ellipsis H',
        'fa-ellipsis-v' :'Ellipsis V',
        'fa-empire' :'Empire',
        'fa-envelope' :'Envelope',
        'fa-envelope-o' :'Envelope O',
        'fa-envelope-square' :'Envelope Square',
        'fa-eraser' :'Eraser',
        'fa-eur' :'Eur',
        'fa-euro' :'Euro',
        'fa-exchange' :'Exchange',
        'fa-exclamation' :'Exclamation',
        'fa-exclamation-circle' :'Exclamation Circle',
        'fa-exclamation-triangle' :'Exclamation Triangle',
        'fa-expand' :'Expand',
        'fa-external-link' :'External Link',
        'fa-external-link-square' :'External Link Square',
        'fa-eye' :'Eye',
        'fa-eye-slash' :'Eye Slash',
        'fa-facebook' :'Facebook',
        'fa-facebook-official' :'Facebook Official',
        'fa-facebook-square' :'Facebook Square',
        'fa-fast-backward' :'Fast Backward',
        'fa-fast-forward' :'Fast Forward',
        'fa-fax' :'Fax',
        'fa-female' :'Female',
        'fa-fighter-jet' :'Fighter Jet',
        'fa-file' :'File',
        'fa-file-archive-o' :'File Archive O',
        'fa-file-audio-o' :'File Audio O',
        'fa-file-code-o' :'File Code O',
        'fa-file-excel-o' :'File Excel O',
        'fa-file-image-o' :'File Image O',
        'fa-file-movie-o' :'File Movie O',
        'fa-file-o' :'File O',
        'fa-file-pdf-o' :'File Pdf O',
        'fa-file-photo-o' :'File Photo O',
        'fa-file-picture-o' :'File Picture O',
        'fa-file-powerpoint-o' :'File Powerpoint O',
        'fa-files-o' :'Files O',
        'fa-file-sound-o' :'File Sound O',
        'fa-file-text' :'File Text',
        'fa-file-text-o' :'File Text O',
        'fa-file-video-o' :'File Video O',
        'fa-file-word-o' :'File Word O',
        'fa-file-zip-o' :'File Zip O',
        'fa-film' :'Film',
        'fa-filter' :'Filter',
        'fa-fire' :'Fire',
        'fa-fire-extinguisher' :'Fire Extinguisher',
        'fa-flag' :'Flag',
        'fa-flag-checkered' :'Flag Checkered',
        'fa-flag-o' :'Flag O',
        'fa-flash' :'Flash',
        'fa-flask' :'Flask',
        'fa-flickr' :'Flickr',
        'fa-floppy-o' :'Floppy O',
        'fa-folder' :'Folder',
        'fa-folder-o' :'Folder O',
        'fa-folder-open' :'Folder Open',
        'fa-folder-open-o' :'Folder Open O',
        'fa-font' :'Font',
        'fa-forumbee' :'Forumbee',
        'fa-forward' :'Forward',
        'fa-foursquare' :'Foursquare',
        'fa-frown-o' :'Frown O',
        'fa-gamepad' :'Gamepad',
        'fa-gavel' :'Gavel',
        'fa-gbp' :'Gbp',
        'fa-ge' :'Ge',
        'fa-gear' :'Gear',
        'fa-gears' :'Gears',
        'fa-gift' :'Gift',
        'fa-git' :'Git',
        'fa-github' :'Github',
        'fa-github-alt' :'Github Alt',
        'fa-github-square' :'Github Square',
        'fa-git-square' :'Git Square',
        'fa-gittip' :'Gittip',
        'fa-glass' :'Glass',
        'fa-globe' :'Globe',
        'fa-google' :'Google',
        'fa-google-plus' :'Google Plus',
        'fa-google-plus-square' :'Google Plus Square',
        'fa-graduation-cap' :'Graduation Cap',
        'fa-group' :'Group',
        'fa-hacker-news' :'Hacker News',
        'fa-hand-o-down' :'Hand O Down',
        'fa-hand-o-left' :'Hand O Left',
        'fa-hand-o-right' :'Hand O Right',
        'fa-hand-o-up' :'Hand O Up',
        'fa-hdd-o' :'Hdd O',
        'fa-header' :'Header',
        'fa-headphones' :'Headphones',
        'fa-heart' :'Heart',
        'fa-heartbeat' :'Heartbeat',
        'fa-heart-o' :'Heart O',
        'fa-history' :'History',
        'fa-home' :'Home',
        'fa-hospital-o' :'Hospital O',
        'fa-h-square' :'H Square',
        'fa-html5' :'Html5',
        'fa-image' :'Image',
        'fa-inbox' :'Inbox',
        'fa-indent' :'Indent',
        'fa-info' :'Info',
        'fa-info-circle' :'Info Circle',
        'fa-inr' :'Inr',
        'fa-instagram' :'Instagram',
        'fa-institution' :'Institution',
        'fa-italic' :'Italic',
        'fa-joomla' :'Joomla',
        'fa-jpy' :'Jpy',
        'fa-jsfiddle' :'Jsfiddle',
        'fa-key' :'Key',
        'fa-keyboard-o' :'Keyboard O',
        'fa-krw' :'Krw',
        'fa-language' :'Language',
        'fa-laptop' :'Laptop',
        'fa-leaf' :'Leaf',
        'fa-leanpub' :'Leanpub',
        'fa-legal' :'Legal',
        'fa-lemon-o' :'Lemon O',
        'fa-level-down' :'Level Down',
        'fa-level-up' :'Level Up',
        'fa-life-bouy' :'Life Bouy',
        'fa-life-ring' :'Life Ring',
        'fa-life-saver' :'Life Saver',
        'fa-lightbulb-o' :'Lightbulb O',
        'fa-link' :'Link',
        'fa-linkedin' :'Linkedin',
        'fa-linkedin-square' :'Linkedin Square',
        'fa-linux' :'Linux',
        'fa-list' :'List',
        'fa-list-alt' :'List Alt',
        'fa-list-ol' :'List Ol',
        'fa-list-ul' :'List Ul',
        'fa-location-arrow' :'Location Arrow',
        'fa-lock' :'Lock',
        'fa-long-arrow-down' :'Long Arrow Down',
        'fa-long-arrow-left' :'Long Arrow Left',
        'fa-long-arrow-right' :'Long Arrow Right',
        'fa-long-arrow-up' :'Long Arrow Up',
        'fa-magic' :'Magic',
        'fa-magnet' :'Magnet',
        'fa-mail-forward' :'Mail Forward',
        'fa-mail-reply' :'Mail Reply',
        'fa-mail-reply-all' :'Mail Reply All',
        'fa-male' :'Male',
        'fa-map-marker' :'Map Marker',
        'fa-mars' :'Mars',
        'fa-mars-double' :'Mars Double',
        'fa-mars-stroke' :'Mars Stroke',
        'fa-mars-stroke-h' :'Mars Stroke H',
        'fa-mars-stroke-v' :'Mars Stroke V',
        'fa-maxcdn' :'Maxcdn',
        'fa-medium' :'Medium',
        'fa-medkit' :'Medkit',
        'fa-meh-o' :'Meh O',
        'fa-mercury' :'Mercury',
        'fa-microphone' :'Microphone',
        'fa-microphone-slash' :'Microphone Slash',
        'fa-minus' :'Minus',
        'fa-minus-circle' :'Minus Circle',
        'fa-minus-square' :'Minus Square',
        'fa-minus-square-o' :'Minus Square O',
        'fa-mobile' :'Mobile',
        'fa-mobile-phone' :'Mobile Phone',
        'fa-money' :'Money',
        'fa-moon-o' :'Moon O',
        'fa-mortar-board' :'Mortar Board',
        'fa-motorcycle' :'Motorcycle',
        'fa-music' :'Music',
        'fa-navicon' :'Navicon',
        'fa-neuter' :'Fa Neuter',
        'fa-openid' :'Openid',
        'fa-outdent' :'Outdent',
        'fa-pagelines' :'Pagelines',
        'fa-paperclip' :'Paperclip',
        'fa-paper-plane' :'Paper Plane',
        'fa-paper-plane-o' :'Paper Plane O',
        'fa-paragraph' :'Paragraph',
        'fa-paste' :'Paste',
        'fa-pause' :'Pause',
        'fa-paw' :'Paw',
        'fa-pencil' :'Pencil',
        'fa-pencil-square' :'Pencil Square',
        'fa-pencil-square-o' :'Pencil Square O',
        'fa-phone' :'Phone',
        'fa-phone-square' :'Phone Square',
        'fa-photo' :'Photo',
        'fa-picture-o' :'Picture O',
        'fa-pied-piper' :'Pied Piper',
        'fa-pied-piper-alt' :'Pied Piper Alt',
        'fa-pied-piper-square' :'Pied Piper Square',
        'fa-pinterest' :'Pinterest',
        'fa-pinterest-p' :'Pinterest P',
        'fa-pinterest-square' :'Pinterest Square',
        'fa-plane' :'Plane',
        'fa-play' :'Play',
        'fa-play-circle' :'Play Circle',
        'fa-play-circle-o' :'Play Circle O',
        'fa-plus' :'Plus',
        'fa-plus-circle' :'Plus Circle',
        'fa-plus-square' :'Plus Square',
        'fa-plus-square-o' :'Plus Square O',
        'fa-power-off' :'Power Off',
        'fa-print' :'Print',
        'fa-puzzle-piece' :'Puzzle Piece',
        'fa-qq' :'Qq',
        'fa-qrcode' :'Qrcode',
        'fa-question' :'Question',
        'fa-question-circle' :'Question Circle',
        'fa-quote-left' :'Quote Left',
        'fa-quote-right' :'Quote Right',
        'fa-ra' :'Ra',
        'fa-random' :'Random',
        'fa-rebel' :'Rebel',
        'fa-recycle' :'Recycle',
        'fa-reddit' :'Reddit',
        'fa-reddit-square' :'Reddit Square',
        'fa-refresh' :'Refresh',
        'fa-renren' :'Renren',
        'fa-reorder' :'Reorder',
        'fa-repeat' :'Repeat',
        'fa-reply' :'Reply',
        'fa-reply-all' :'Reply All',
        'fa-retweet' :'Retweet',
        'fa-rmb' :'Rmb',
        'fa-road' :'Road',
        'fa-rocket' :'Rocket',
        'fa-rotate-left' :'Rotate Left',
        'fa-rotate-right' :'Rotate Right',
        'fa-rouble' :'Rouble',
        'fa-rss' :'Rss',
        'fa-rss-square' :'Rss Square',
        'fa-rub' :'Rub',
        'fa-ruble' :'Ruble',
        'fa-rupee' :'Rupee',
        'fa-save' :'Save',
        'fa-scissors' :'Scissors',
        'fa-search' :'Search',
        'fa-search-minus' :'Search Minus',
        'fa-search-plus' :'Search Plus',
        'fa-sellsy' :'Sellsy',
        'fa-send' :'Send',
        'fa-send-o' :'Send O',
        'fa-server' :'Fa Server',
        'fa-share' :'Share',
        'fa-share-alt' :'Share Alt',
        'fa-share-alt-square' :'Share Alt Square',
        'fa-share-square' :'Share Square',
        'fa-share-square-o' :'Share Square O',
        'fa-shield' :'Shield',
        'fa-ship' :'Ship',
        'fa-shirtsinbulk' :'Shirtsinbulk',
        'fa-shopping-cart' :'Shopping Cart',
        'fa-signal' :'Signal',
        'fa-sign-in' :'Sign In',
        'fa-sign-out' :'Sign Out',
        'fa-simplybuilt' :'Simplybuilt',
        'fa-sitemap' :'Sitemap',
        'fa-skyatlas' :'Skyatlas',
        'fa-skype' :'Skype',
        'fa-slack' :'Slack',
        'fa-sliders' :'Sliders',
        'fa-smile-o' :'Smile O',
        'fa-sort' :'Sort',
        'fa-sort-alpha-asc' :'Sort Alpha Asc',
        'fa-sort-alpha-desc' :'Sort Alpha Desc',
        'fa-sort-amount-asc' :'Sort Amount Asc',
        'fa-sort-amount-desc' :'Sort Amount Desc',
        'fa-sort-asc' :'Sort Asc',
        'fa-sort-desc' :'Sort Desc',
        'fa-sort-down' :'Sort Down',
        'fa-sort-numeric-asc' :'Sort Numeric Asc',
        'fa-sort-numeric-desc' :'Sort Numeric Desc',
        'fa-sort-up' :'Sort Up',
        'fa-soundcloud' :'Soundcloud',
        'fa-space-shuttle' :'Space Shuttle',
        'fa-spinner' :'Spinner',
        'fa-spoon' :'Spoon',
        'fa-spotify' :'Spotify',
        'fa-square' :'Square',
        'fa-square-o' :'Square O',
        'fa-stack-exchange' :'Stack Exchange',
        'fa-stack-overflow' :'Stack Overflow',
        'fa-star' :'Star',
        'fa-star-half' :'Star Half',
        'fa-star-half-empty' :'Star Half Empty',
        'fa-star-half-full' :'Star Half Full',
        'fa-star-half-o' :'Star Half O',
        'fa-star-o' :'Star O',
        'fa-steam' :'Steam',
        'fa-steam-square' :'Steam Square',
        'fa-step-backward' :'Step Backward',
        'fa-step-forward' :'Step Forward',
        'fa-stethoscope' :'Stethoscope',
        'fa-stop' :'Stop',
        'fa-street-view' :'Street View',
        'fa-strikethrough' :'Strikethrough',
        'fa-stumbleupon' :'Stumbleupon',
        'fa-stumbleupon-circle' :'Stumbleupon Circle',
        'fa-subscript' :'Subscript',
        'fa-subway' :'Fa Subway',
        'fa-suitcase' :'Suitcase',
        'fa-sun-o' :'Sun O',
        'fa-superscript' :'Superscript',
        'fa-support' :'Support',
        'fa-table' :'Table',
        'fa-tablet' :'Tablet',
        'fa-tachometer' :'Tachometer',
        'fa-tag' :'Tag',
        'fa-tags' :'Tags',
        'fa-tasks' :'Tasks',
        'fa-taxi' :'Taxi',
        'fa-tencent-weibo' :'Tencent Weibo',
        'fa-terminal' :'Terminal',
        'fa-text-height' :'Text Height',
        'fa-text-width' :'Text Width',
        'fa-th' :'Th',
        'fa-th-large' :'Th Large',
        'fa-th-list' :'Th List',
        'fa-thumbs-down' :'Thumbs Down',
        'fa-thumbs-o-down' :'Thumbs O Down',
        'fa-thumbs-o-up' :'Thumbs O Up',
        'fa-thumbs-up' :'Thumbs Up',
        'fa-thumb-tack' :'Thumb Tack',
        'fa-ticket' :'Ticket',
        'fa-times' :'Times',
        'fa-times-circle' :'Times Circle',
        'fa-times-circle-o' :'Times Circle O',
        'fa-tint' :'Tint',
        'fa-toggle-down' :'Toggle Down',
        'fa-toggle-left' :'Toggle Left',
        'fa-toggle-right' :'Toggle Right',
        'fa-toggle-up' :'Toggle Up',
        'fa-train' :'Train',
        'fa-transgender' :'Transgender',
        'fa-transgender-alt' :'Transgender Alt',
        'fa-trash-o' :'Trash O',
        'fa-tree' :'Tree',
        'fa-trello' :'Trello',
        'fa-trophy' :'Trophy',
        'fa-truck' :'Truck',
        'fa-try' :'Try',
        'fa-tumblr' :'Tumblr',
        'fa-tumblr-square' :'Tumblr Square',
        'fa-turkish-lira' :'Turkish Lira',
        'fa-twitter' :'Twitter',
        'fa-twitter-square' :'Twitter Square',
        'fa-umbrella' :'Umbrella',
        'fa-underline' :'Underline',
        'fa-undo' :'Undo',
        'fa-university' :'University',
        'fa-unlink' :'Unlink',
        'fa-unlock' :'Unlock',
        'fa-unlock-alt' :'Unlock Alt',
        'fa-unsorted' :'Unsorted',
        'fa-upload' :'Upload',
        'fa-usd' :'Usd',
        'fa-user' :'User',
        'fa-user-md' :'User Md',
        'fa-user-plus' :'User Plus',
        'fa-users' :'Users',
        'fa-user-secret' :'User Secret',
        'fa-user-times' :'User Times',
        'fa-venus' :'Venus',
        'fa-venus-double' :'Venus Double',
        'fa-venus-mars' :'Venus Mars',
        'fa-viacoin' :'Viacoin',
        'fa-video-camera' :'Video Camera',
        'fa-vimeo-square' :'Vimeo Square',
        'fa-vine' :'Vine',
        'fa-vk' :'Vk',
        'fa-volume-down' :'Volume Down',
        'fa-volume-off' :'Volume Off',
        'fa-volume-up' :'Volume Up',
        'fa-warning' :'Warning',
        'fa-wechat' :'Wechat',
        'fa-weibo' :'Weibo',
        'fa-weixin' :'Weixin',
        'fa-whatsapp' :'Whatsapp',
        'fa-wheelchair' :'Wheelchair',
        'fa-windows' :'Windows',
        'fa-won' :'Won',
        'fa-wordpress' :'Wordpress',
        'fa-wrench' :'Wrench',
        'fa-xing' :'Xing',
        'fa-xing-square' :'Xing Square',
        'fa-yahoo' :'Yahoo',
        'fa-yen' :'Yen',
        'fa-youtube' :'Youtube',
        'fa-youtube-play' :'Youtube Play',
        'fa-youtube-square' :'Youtube Square'
    };
}]);
