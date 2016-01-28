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

    function translateValidations(errArray){
        errArray = Array.isArray(errArray) ? errArray : [errArray];

        var text = '';
        for(var i=0;i<errArray.length;i++){
            text+= (i>0 ? ', ' : '') + local.translate(errArray[i]);
        }
        return text;
    }

    RestResource.defaults.responseErrors = {
        '400': function (data, status, headers) {
            var text = data;
            if (angular.isObject(data)) {
                text = '';
                var first = true;
                for (var key in data) {
                    text += (first ? '' : '<br>') + '<strong>'+local.translate(key) + '</strong> ' + local.translate('must be') + ': ' + translateValidations(data[key]);
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
                url: '/{id}/'
            }
        }
    });
    
    admin.mailers = new RestResource({ 
        baseUrl: 'mailers',
        commands:{
            test:{
                url:'test',
                method:'POST',
            }
        }
    });
    
    admin.configs = new RestResource({ 
        baseUrl: 'config'
    });
    
    
    admin.languages = new RestResource({
        baseUrl:'languages',
        commands:{
            one:{
                url:'/{id}?path={path}'
            }
        }
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
                    title:'Generate New Password',
                    include:'views/forgotpass.html',
                    sendPass: function(email){
                        admin.users.forgotPass({ email:email }, function(data){
                            notify.success('New password was sent to your email');
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
.controller('ChangePasswordCtrl',['$scope','neAdmin','neNotifications', function($scope, admin, notify){
    
    $scope.changePass = function(oldPass, newPass){
        admin.users.changePass({ oldPass:oldPass, newPass:newPass }, function(data){
            $scope.user.modifiedDT = data.modifiedDT;
            notify.success('Password Changed');
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
    
    $scope.loadConfig = function(id, item){
        admin.configs.one(id, function(data){
            item.loaded = true;
            item.config = data;
        });
    };
    
    $scope.updateConfig = function(id, item){
        admin.configs.update(id, item.config, function(data){
            item.config = data;
            notify.success('Configuration Updated');
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
}]);
