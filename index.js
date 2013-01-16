var config, options, request, watchr, winston;

var fs = require('fs'),
  watchr = require('watchr'),
  winston = require('winston'),
  async = require('async');

var connection = require('./lib/ssh-connection');

// A queue of operations that need to be synchronized with the remote.
var queue = [];
// Are we currently in the process of running the queue?
var queueProcessing = false;
// Watchers currently watching files.
var watchers = [];

connection.configure({
  host: '33.33.33.115',
  port: 22,
  username: 'vagrant',
  privateKey: require('fs').readFileSync('/Users/howard/Documents/Code/Node.js/rsync-watch/id_rsa')
});
connection.setLogger(winston);

// Just requiring this allows us to use a yaml config
// file rather than JSON via require calls.
require('js-yaml');

// Load our configuration from the yaml file.
var config = require('./config');

// A local cache of directories that should be in a known-existent state.
var directoriesEnsured = [];

/**
 * Gets a flat array of configured paths to watch.
 */
var getPathsToWatchArray = function(config) {
  var paths = [];
  for (path in config.pathsToWatch) {
    paths.push(path);
  }
  return paths;
}

// The returned local path should include the leading slash.
var getLocalPath = function(filePath, conf) {
  var conf = findOptionDefinition(filePath);
  return filePath.substring(conf.localPath.length);
};

var findDirectoryPath = function(filePath, fileCurrentStat) {
  if (fileCurrentStat !== null && !fileCurrentStat.isDirectory()) {
    directoryToEnsure = filePath.split('/');
    directoryToEnsure.pop();
    directoryToEnsure = directoryToEnsure.join('/');
  }
  else {
    directoryToEnsure = filePath;
  }
  return directoryToEnsure
};

var createDirectory = function(changeType, filePath, fileCurrentStat, conf, done) {
  directoryToEnsure = findDirectoryPath(filePath, fileCurrentStat);
  directoryToEnsure = getLocalPath(directoryToEnsure);
  if (directoriesEnsured.indexOf(directoryToEnsure) === -1) {
    winston.info('Trying to ensure `' + directoryToEnsure + '` exists.');
    // fileCurrentStat could be null because this is a deletion.
    var command = 'mkdir -p ' + conf.remotePath + directoryToEnsure;
    directoriesEnsured.push(directoryToEnsure);
    // TODO: Should we do this over sftp rather than exec?
    connection.exec(command, function(error, exitCode) {
      if (error) {
        console.log(error);
      }
      done(error, true);
    });
  }
  else {
    done(null, true);
  }
};

var syncFile = function(conf, changeType, filePath, fileCurrentStat, done) {
  buildSyncCommand(conf, changeType, filePath, conf);
  done(null, true);
};

var buildSyncCommand = function(conf, changeType, filePath, conf) {
  var options = conf.commandOptions.join(' ');
  var remoteSystem = conf.remoteUser + '@' + conf.remoteHost + ':' + conf.remotePort;
  command = conf.command + ' ' + options + ' ' + filePath + ' ' + remoteSystem + getRemotePath(filePath, conf);
  connection.transferFile(filePath, getRemotePath(filePath, conf), function(error, success) {
    if (error) {
      winston.error('File `' + filePath + '` failed to sync and was readded to the queue.');
      enqueueCommand(buildSyncCommand, arguments);
    }
  });
};

var enqueueCommand = function(command, arguments) {
  queue.push([command, arguments]);
  if (!queueProcessing) {
    processQueue();
  }
}

/**
 * Process events waiting in the queue.
 */
var processQueue = function() {
  queueProcessing = true;
  while (item = queue.shift()) {
    if (connection.connected) {
      item[0].apply(this, item[1] || []);
    }
    // If we have no connection, pop this back in the queue,
    // restart the connection and exit. When the connection is
    // ready the queue should try to process itself.
    else {
      queue.unshift(item);
      connection.connect();
      break;
    }
  }
  queueProcessing = false;
}

/**
 * Locate the option definition appropriate to this path.
 */
var findOptionDefinition = function(filePath) {
  var match = '';
  for (path in config.pathsToWatch) {
    searchPattern = '';
    if (filePath.search(searchPattern) == 0 && path.length > match) {
      match = path;
    }
  }
  if (match == '') {
    throw new Error('Invalid change path');
  }
  conf = config.pathsToWatch[match];
  conf.localPath = match;
  return conf;
};


var createOrUpdateHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat, conf) {
  winston.info(changeType, filePath);
  createDirectory(changeType, filePath, fileCurrentStat, conf, function(error, success) {
    if (error) {
      winston.error('Synchronization for ' + filePath + ' not completed because ensuring the directory exists was not possible.');
      return;
    }
    else if (!fileCurrentStat.isDirectory()) {
      syncFile(conf, changeType, filePath, fileCurrentStat, function(error, success) {
        winston.info('Synchronization complete');
      });
    }
  });
};

var changeHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat) {
  winston.info(filePath + ' ' + changeType + 'd.');
  var conf = findOptionDefinition(filePath);
  if (changeType == 'create' || changeType == 'update') {
    enqueueCommand(createOrUpdateHandler, [changeType, filePath, fileCurrentStat, filePreviousStat, conf]);
  }
  else if (changeType == 'delete') {
    // deleteHandler(changeType, filePath, fileCurrentStat, filePreviousStat, conf);
    enqueueCommand(deleteHandler, [changeType, filePath, fileCurrentStat, filePreviousStat, conf]);
  }
  else {
    throw new Error('Invalid change type `' + changeType + '` on file `' + filePath + '`.');
  }
};

var getRemotePath = function(filePath, conf) {
  var remotePath = conf.remotePath;
  return remotePath + getLocalPath(filePath);
}

var deleteHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat, conf) {
  var localPath = getLocalPath(filePath);
  if (directoriesEnsured.indexOf(localPath) != -1) {
    directoriesEnsured.splice(directoriesEnsured.indexOf(localPath), 1);
  }
  if (filePreviousStat.isDirectory()) {
    connection.rmdir(getRemotePath(filePath, conf), function(error) {
      if (error) {
        enqueueCommand(deleteHandler, arguments);
      }
    });
  }
  else {
    connection.delete(getRemotePath(filePath, conf), function(error) {
      if (error) {
        enqueueCommand(deleteHandler, arguments);
      }
    });
  }
};

watchr.watch({
  paths: getPathsToWatchArray(config),
  ignoreHiddenFiles: config.ignoreHiddenFiles,
  ignoreCommonPatterns: true,
  listeners: {
    change: changeHandler,
    watching: function(error, watcherInstance, isWatching) {
      watchers.push(watcherInstance);
      console.log('watchers ' + watchers.length);
    },
  },
  next: function(err, fileWatchers) {
    watchers = fileWatchers;
    return winston.info(getPathsToWatchArray(config).join(', ') + " now watched for changes.");
  }
});

connection.on('ready', function() {
  processQueue();
});
connection.connect();
