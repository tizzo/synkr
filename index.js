var fs = require('fs');
var async = require('async');
var _ = require('underscore');
var color = require('colors');

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
DirectoryWatcher.prototype.recursiveWatch = function(path, watchList, depth, next) {
  if (!depth) {
    depth = 0;
  }
  console.log('called upon to log ' + path);
  var self = this;
  fs.readdir(path, function(err, files) {
    for (i in files) {
      var item = files[i];
      var callbackMaker = function(item) {
        var innerItem = item;
        return function(error, stat) {
          if (error) {
            console.error('Deal with me! - '.red, innerItem);
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
  watchList[path] = this;
  var message = 'Currently there are ' + _.keys(watchList).length + ' watchers.';
  console.log(message.green);
  console.log('depth is now: '.blue + depth);
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
  self = this;
  var path = self.path + '/' + file;
  console.log(path + ': ' + change);
  fs.stat(path, function(error, stat) {
    if (error) {
      console.log(path, 'may have been deleted', error);
    }
    else {
      if (stat.isDirectory()) {
        self.recursiveWatch(path, self.watchList);
      }
      console.log('may be a directory?', stat.isDirectory());
    }
  });
};


watcher = new DirectoryWatcher('/root/test');
//watcher = new DirectoryWatcher('/var/lib/templeton_backups');
watcher.watch();
