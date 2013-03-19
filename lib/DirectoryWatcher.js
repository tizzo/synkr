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
DirectoryWatcher.prototype.debug = function(message, object) {
  this.log('debug', message, object);
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
  self.debug('Now watching `' + path + '`.');
  fs.readdir(path, function(err, files) {
    var fileProcessor = function (item, done) {
      var innerPath = path + '/' + item;
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
              watcher.recursiveWatch(innerItem, watchList, depth + 1, function(error) {
                done(error);
              });
            }
            else {
              done();
            }
          }
        }
        fs.stat
      }
      console.log(path);
      fs.stat(innerPath, callbackMaker(innerPath));
    };
    async.each(files, fileProcessor, function(error) {
      console.log(path);
      self.watcher = fs.watch(path, self.changeHandler)
      watchList[path] = this;
      self.emit('watchAdded', self.watch);
      self.info('depth is now: '.blue + depth);
      if (next) {
        next(null);
      }
    });
  });
}
DirectoryWatcher.prototype.watch = function(next) {
  self = this;
  this.recursiveWatch(this.path, this.watchList, 1, function(error) {
    if (error) {
      self.error('An error has occurred.', error);
    }
    else {
      self.emit('ready', true);
    }
    if (next) {
      next(error);
    }
  });
};
DirectoryWatcher.prototype.changeHandler = function(change, file) {
  self = this;
  var path = self.path + '/' + file;
  self.info('temp>> ' + path + ': ' + change);
  // Rename is called on file creation or rename.
  if (change == 'rename') {
    fs.stat(path, function(error, stat) {
      if (error && error.errno == 34) {
        // TODO: Clean up watcher.
        self.emit('fileDeletion', path);
      }
      else {
        if (stat.isDirectory()) {
          self.recursiveWatch(path, self.watchList);
        }
      }
    });
  }
  if (change == 'change') {
    self.emit('fileChange', path);
  }
};

module.exports = DirectoryWatcher;
