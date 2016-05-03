// TODO:
// email duplicity check if JSON data store
// refresh users grid, after new user created

angular.module('neAdmin.users', [])
.controller('UsersCtrl', [ '$scope', 'NeGrid', 'NeQuery', 'neModals','neNotifications', 'NeRestResource', 'neLocal', 'neAdmin', function($scope, Grid, Query, modals, notify, Resource, local, admin){

    admin.state.register('admin.users', {
        store:{ sync:true }
    });
    
    $scope.grid = new Grid({
        id: 'admin.users',
        resource: admin.users,
        autoLoad: false,
        limit: 10,
        onQueryChange: function(query){
            admin.state.change(this.id, query);
        }
    });

    $scope.query = new Query([
        { field: 'email', type: 'string' },
        { field: 'roles', type: 'string' },
        { field: 'nickname', type: 'string' },
        { field: 'firstname', type: 'string' },
        { field: 'lastname', type: 'string' },
        { field: 'disabled', type: 'boolean' },
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

    $scope.createUserModal = function(){
        modals.create({
            id: 'users.create',
            title: 'Create User',
            templateUrl: 'views/users-create-modal.html',
            createUser: function (user) {
                if(this.useDefaultRoles) delete user.roles;
                
                admin.users.create(user, function (data) {
                    modals.get('users.create').hide();
                    $scope.grid.load();
                });
            },
            useDefaultRoles: true,
            newUser: {
                roles: ['user']
            },
            checkEmailDuplicity: function (email) {
                var newUser = this.newUser;
                if (email) {
                    admin.users.exists({
                        email: email
                    }, function (data) {
                        if (data === false) newUser.$dupliciteEmail = false;
                        else newUser.$dupliciteEmail = true;
                    }, function () {
                        newUser.$dupliciteEmail = true;
                    });
                }
            }
        });
    };

    $scope.resetPassModal = function (user) {
        modals.create({
            id: 'users.resetPass',
            title: 'Reset User Password',
            templateUrl: 'views/resetpass-modal.html',
            user: user,
            resetPass: function (user) {
                admin.users.resetPass(user.id, JSON.stringify(user.password), function (data) {
                    user.modifiedDT = data.modifiedDT;
                    notify.success('Password Changed');
                    modals.get('users.resetPass').hide();
                });
            }
        });
    };

    $scope.removeModal = function (item) {
        modals.create({
            id: 'users.remove',
            title: 'Remove User',
            text: 'This will permanently remove user, and may cause data integrity malfunction, if there are data associated with user. Are you sure ?',
            buttons: [
                {
                    text: 'Cancel',
                    css: 'btn btn-default',
                    disabled: false,
                    click: function () {
                        modals.get('users.remove').hide();
                    }
                },
                {
                    text: 'Delete',
                    css: 'btn btn-danger',
                    disabled: false,
                    click: function () {
                        $scope.grid.removeItem(item, function () {
                            modals.get('users.remove').hide();
                        });
                    }
              }
          ]
        });
    };
}]);