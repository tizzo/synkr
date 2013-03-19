var DirectoryWatcher = require('./lib/DirectoryWatcher');


watcher = new DirectoryWatcher('/home/vagrant/test');
//watcher = new DirectoryWatcher('/var/lib/templeton_backups');
watcher.watch();
