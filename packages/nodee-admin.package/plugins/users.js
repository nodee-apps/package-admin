'use strict';

module.exports.install = function(admin){
    
    admin.menu.addBefore('account', {
        id:'users',
        name:'User Management',
        icon:'fa fa-users',
        href:'#/users',
        allowRoles:['admin']
    });
        
    // admin angular module dependencies
    admin.modules.push('neAdmin.users');
    
    // admin routes
    admin.routes[ '/users' ] = { templateUrl: admin.basePath + 'views/users.html', controller:'UsersCtrl', reloadOnSearch:false };
    
    // include styles
    // admin.styles.push('css/mystyle.css');
        
    // 3rd-party tools & libs, such as ase editor, or jquery, ...
    // admin.libs.push('js/somelibrary.js');
    
    // admin scripts, will be loaded
    // admin.scripts.push('controllers/users-ctrl.js');
    
    framework.rest(admin.basePath + 'users', 'User', [
        { route:'/', collection:'all', flags:[ 'get' ], count:true },
        { route:'/exists', collection:'exists', flags:['get'] },
        { route:'/{id}', collection:'one', flags:[ 'get' ] },
        { route:'/', instance:'create', flags:[ 'post', 'json' ] },
        { route:'/{id}', instance:'create', flags:[ 'post', 'json' ] },
        { route:'/{id}', instance:'update', before:disableSelfDisable, flags:[ 'put', 'json' ] },
        { route:'/{id}', instance:'remove', before:disableSelfRemove, flags:[ 'delete' ] },
        
        { route:'/{id}/resetpass', instance:'resetPass', flags:[ 'post', 'json' ] },
        
    ], ['authorize','!admin']);

    function disableSelfRemove(ctx, next){
        if(ctx.params.id === this.user.id){
            this.status = 400;
            this.json({ data:{ id:['selfRemove'] } });
        }
        else next();
    }
    
    function disableSelfDisable(ctx, next){
        if(ctx.body.disabled && ctx.params.id === this.user.id){
            this.status = 400;
            this.json({ data:{ id:['selfDisable'] } });
        }
        else next();
    }
};