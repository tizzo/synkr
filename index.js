var DirectoryWatcher = require('./lib/DirectoryWatcher');
var colors = require('colors');
var _ = require('underscore');
watcher = new DirectoryWatcher('/home/vagrant/test');
watcher.on('log', function(data) {
  if (data.level != 'error') {
    logger = console.log;
  }
  else {
    logger = console.error;
  }
  if (data.object != undefined) {
    logger(data.message, data.object);
  }
  else {
    logger(data.message);
  }
});
watcher.on('ready', function() {
  console.log('watching totally started.'.green);
});
watcher.on('watchAdded', function(watch) {
  var message = 'Currently there are ' + _.keys(watcher.watchList).length + ' watchers.';
  self.info(message.green);
});
watcher.on('fileDeletion', function(path) {
  console.log('deleted: ' + path);
});
watcher.on('fileChange', function(path) {
  console.log('changed: ' + path);
});
watcher.watch(function() {
  console.log('watching totally started.'.cyan);
});
