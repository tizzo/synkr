var fs = require('fs');
var async = require('async');
var _ = require('underscore');
var color = require('colors');
var EventEmitter2 = require('eventemitter2').EventEmitter2;

var DirectoryWatcher = function(path, emitter) {
  this.path = path;
  _.bindAll(this);
  if (emitter == undefined) {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '::',
      newListener: false,
      maxListeners: 20,
    });
  }
  else {
    this.emitter = emitter;
  }
  _.extend(this, this.emitter);
}
DirectoryWatcher.prototype.path = '';
DirectoryWatcher.prototype.watches = {};
DirectoryWatcher.prototype.watcher = {};
DirectoryWatcher.prototype.emitter = {};
DirectoryWatcher.prototype.watchList = [];
DirectoryWatcher.prototype.setPath = function(path) {
  this.path = path;
};
DirectoryWatcher.prototype.log = function(level, message, object) {
  data = {
    level: level,
    message: message,
    object: object
  };
  this.emit('log', data);
}
DirectoryWatcher.prototype.info = function(message, object) {
  this.log('info', message, object);
}
DirectoryWatcher.prototype.error = function(message, object) {
  this.log('error', message, object);
}
DirectoryWatcher.prototype.recursiveWatch = function(path, watchList, depth, next) {
  if (!depth) {
    depth = 0;
  }
  var self = this;
  self.info('called upon to log ' + path);
  fs.readdir(path, function(err, files) {
    for (i in files) {
      var item = files[i];
      // Here we have a closure factory to ensure that we
      // know what item we were operating on once our async
      // callback is fired.
      var callbackMaker = function(item) {
        var innerItem = item;
        return function(error, stat) {
          if (error) {
            self.error('Deal with me! - '.red, innerItem);
          }
          else {
            if (stat.isDirectory()) {
              self.info('Diving into ' + innerItem);
              var watcher = watchList[innerItem] = new DirectoryWatcher(innerItem, self.emitter);
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
  self.info(message.green);
  self.info('depth is now: '.blue + depth);
  if (next && next) {
    self.info('**************logging done');
    next(null);
  }
}
DirectoryWatcher.prototype.watch = function() {
  self = this;
  this.recursiveWatch(this.path, this.watchList, 1, function(error) {
    self.error(error);
  });
};
DirectoryWatcher.prototype.changeHandler = function(change, file) {
  self = this;
  var path = self.path + '/' + file;
  self.info(path + ': ' + change);
  fs.stat(path, function(error, stat) {
    if (error) {
      self.info(path, 'may have been deleted', error);
    }
    else {
      if (stat.isDirectory()) {
        self.recursiveWatch(path, self.watchList);
      }
      self.info('may be a directory?', stat.isDirectory());
    }
  });
};

module.exports = DirectoryWatcher;
