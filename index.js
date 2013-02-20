var fs = require('fs');
var async = require('async');
var _ = require('underscore');

var DirectoryWatcher = function(path) {
  this.path = path;
  _.bindAll(this);
}
DirectoryWatcher.prototype.path = '';
DirectoryWatcher.prototype.watches = {};
DirectoryWatcher.prototype.watcher = {};
DirectoryWatcher.prototype.watchList = [];
DirectoryWatcher.prototype.setPath = function(path) {
  this.path = path;
};
DirectoryWatcher.prototype.getStat = function(path, next) {
  fs.stat(this.path + '/' + path, function (error, stat){
    next(error, stat);
  });
};
DirectoryWatcher.prototype.recursiveWatch = function(path, watchList, depth, next) {
  console.log('called upon to log ' + path);
  self = this;
  fs.readdir(path, function(err, files) {
    for (file in files) {
      var item = files[file];
      var callbackMaker = function(item) {
        var innerItem = item;
        return function(error, stat) {
          if (error) {
            console.error('Deal with me! - ', innerItem);
          }
          else {
            if (stat.isDirectory()) {
              console.log('Diving into ' + innerItem);
              var watcher = watchList[innerItem] = new DirectoryWatcher(innerItem);
              watcher.recursiveWatch(innerItem, watchList, depth + 1);
            }
          }
        }
      }
      var innerPath = path + '/' + item;
      fs.stat(innerPath, callbackMaker(innerPath));
    }
  });
  self.watcher = fs.watch(path, self.changeHandler)
  watchList.push(this);
  console.log(depth);
  if (next && next) {
    console.log('**************here');
    next(null);
  }
}
DirectoryWatcher.prototype.watch = function() {
  self = this;
  this.recursiveWatch(this.path, this.watchList, 1, function(error) {
    console.log(error);
  });
};
DirectoryWatcher.prototype.changeHandler = function(change, file) {
  console.log(change);
  this.getStat(file, function(error, stat) {
    if (error) {
      console.log('may have been deleted', error);
    }
    else {
      console.log('may be a directory?', stat.isDirectory());
    }
  });
};


watcher = new DirectoryWatcher('/root/test');
watcher.watch();
