var fs = require('fs');
var async = require('async');
var _ = require('underscore');
var color = require('colors');
var EventEmitter2 = require('eventemitter2').EventEmitter2;

var DirectoryWatcher = function(path, emitter) {
  this.path = path;
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
  _.bindAll(this);
}
// The path this watcher object watches, the absolute path to a folder.
DirectoryWatcher.prototype.path = '';
// The watcher object bound to this watch.
DirectoryWatcher.prototype.watcher = {};
// The event emitter used by this object.
DirectoryWatcher.prototype.emitter = {};
// An array of watch objects spawned by fs::watch().
DirectoryWatcher.prototype.watchList = [];
// The amount of time to delay an event before processing it to prevent duplicates.
DirectoryWatcher.prototype.eventDelay = 500;
// To prevent duplicate events from firing this is an array of events in the form event:path.
DirectoryWatcher.prototype.delayedEvents = [];
// Whether to print debug information.
DirectoryWatcher.prototype.debugMode = false;
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
  if (this.debugMode) {
    this.log('debug', message, object);
  }
}
DirectoryWatcher.prototype.info = function(message, object) {
  this.log('info', message, object);
}
DirectoryWatcher.prototype.error = function(message, object) {
  this.log('error', message, object);
}
DirectoryWatcher.prototype.recursiveWatch = function(path, depth, next) {
  if (!depth) {
    depth = 0;
  }
  var self = this;
  self.debug('Now watching `' + path + '`.');
  fs.readdir(path, function(error, files) {
    if (error) {
      self.error(err);
    }
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
            if (stat.isDirectory() && self.watchList[innerItem] == undefined) {
              self.debug('Starting a recurisve watch on ' + innerItem);
              var watcher =  new DirectoryWatcher(innerItem, self.emitter);
              watcher.recursiveWatch(innerItem, depth + 1, function(error) {
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
      fs.stat(innerPath, callbackMaker(innerPath));
    };
    async.each(files, fileProcessor, function(error) {
      self.watcher = fs.watch(path, self.changeHandler)
      self.watchList[self.path] = self;
      self.emit('watchAdded', self);
      self.debug('folder depth for '.blue + path + ' is: '.blue + depth);
      if (next) {
        next(null);
      }
    });
  });
}
DirectoryWatcher.prototype.watch = function(next) {
  self = this;
  this.recursiveWatch(this.path, 1, function(error) {
    if (error) {
      self.error('An error has occurred.', error);
      self.emit('error', error);
    }
    else {
      self.emit('ready', true);
    }
    if (next) {
      next(error);
    }
  });
};
DirectoryWatcher.prototype.destroy = function() {
  self = this;
  var path = self.path;
  if (self.watcher.close) {
    self.watcher.close();
  }
  delete self.watchList[self.path];
  self.emit('watchDeleted', path);
}
DirectoryWatcher.prototype.changeHandler = function(change, file) {
  self = this;
  var path = self.path + '/' + file;
  var events = self.delayedEvents;
  var eventString = path;
  var timer = function(change, path) {
    self.delayedEvents.splice(events.indexOf(eventString), 1);
    self.eventIssuer(change, path);
  }
  if (events.indexOf(eventString) == -1) {
    self.delayedEvents.push(eventString);
    setTimeout(timer, self.eventDelay, change, path);
  }
};
DirectoryWatcher.prototype.eventIssuer = function(change, path) {
  // Rename is called on file creation, rename, and delete.
  fs.stat(path, function(error, stat) {
    if (change == 'rename') {
      if (error && error.errno == 34) {
        self.emit('fileDeletion', path);
        if (self.watchList[path]) {
          self.watchList[path].destroy();
        }
      }
      else {
        if (stat.isDirectory() && self.watchList.indexOf(path) == -1) {
          var watcher = new DirectoryWatcher(path, self.emitter);
          watcher.recursiveWatch(path);
        }
        else {
          self.emit('fileChange', path, stat);
        }
      }
    }
    // Change is called on file modification and creation.
    if (change == 'change') {
      // Don't worry about changes to directories that already exist.
      if (!stat.isDirectory()) {
        self.emit('fileChange', path, stat);
      }
    }
  });
};

module.exports = DirectoryWatcher;
