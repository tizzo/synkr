var DirectoryWatcher = require('./lib/DirectoryWatcher');
var colors = require('colors');
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
watcher.watch(function() {
  console.log('watching totally started.'.cyan);
});
