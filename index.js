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

connection.setLogger(winston);

// Just requiring this allows us to use a yaml config
// file rather than JSON via require calls.
require('js-yaml');

// Load our configuration from the yaml file.
var config = require('./config');

connection.configure({
  host: config.remoteHost,
  port: config.remotePort,
  username: config.remoteUser,
  privateKey: require('fs').readFileSync(config.privateKeyPath)
});

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

var syncFile = function(conf, changeType, filePath, fileCurrentStat, done) {
  connection.transferFile(filePath, getRemotePath(filePath, conf), function(error, success) {
    if (error) {
      winston.error('File `' + filePath + '` failed to sync and was readded to the queue.');
      enqueueCommand(syncFile, arguments);
      done(error);
    }
    else {
      done(null);
    }
  });
};

var enqueueCommand = function(command, arguments) {
  queue.push([command, arguments]);
  if (!queueProcessing) {
    processQueue();
  }
}


var processQueue = function() {
  winston.info('Processing Queue');
  if (queue.length > 0 && queueProcessing == false) {
    queueProcessing = true;
    winston.info('Processing Queue Item');
    processQueueItem(function() {
    });
  }
  else {
    winston.info('Queue was empty.');
    queueProcessing = false;
  }
}

/**
 * Process events waiting in the queue.
 */
var processQueueItem = function(done) {
  winston.info('There are currently ' + queue.length + ' items in the queue!');
  if (queue.length > 0) {
    if (queue.length > 1) {
      var nextCallback = processQueueItem;
    }
    else {
      winston.info('Last item in the queue!');
      var nextCallback = function() {
        winston.info('Queue processing is done!');
        queueProcessing = false;
        processQueue();
      };
    }
    item = queue.shift()
    if (connection.connected) {
      item[1].push(nextCallback);
      item[0].apply(this, item[1] || []);
    }
    // If we have no connection, pop this back in the queue,
    // restart the connection and exit. When the connection is
    // ready the queue should try to process itself.
    else {
      item[1].pop();
      queue.unshift(item);
      // The connect event fires queue processing.
      connection.connect();
      done(new Error('Lost connection to SSH.'));
    }
  }
  else {
    winston.info('Queue empty.')
    done(null);
  }
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


var createOrUpdateHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat, conf, next) {
  winston.info(changeType, filePath);
  createDirectory(changeType, filePath, fileCurrentStat, conf, function(error, success) {
    if (error) {
      winston.error('Synchronization for ' + filePath + ' not completed because ensuring the directory exists was not possible.');
      next(error);
      return;
    }
    else if (!fileCurrentStat.isDirectory()) {
      syncFile(conf, changeType, filePath, fileCurrentStat, function(error, success) {
        next(null);
      });
    }
    else {
      winston.info('Direcotry ' + filePath + ' successfully created');
      if (typeof next != 'function') {
        winston.info('****************** Bad next operation encountered ! ******************');
        console.log(next);
      }
      else {
        next(null);
      }
    }
  });
};

var createDirectory = function(changeType, filePath, fileCurrentStat, conf, done) {
  directoryToEnsure = findDirectoryPath(filePath, fileCurrentStat);
  directoryToEnsure = getLocalPath(directoryToEnsure, conf);
  if (directoriesEnsured.indexOf(directoryToEnsure) === -1) {
    winston.info('Trying to ensure `' + directoryToEnsure + '` exists.');
    // fileCurrentStat could be null because this is a deletion.
    var command = 'mkdir -p ' + conf.remotePath + directoryToEnsure;
    directoriesEnsured.push(directoryToEnsure);
    // TODO: Should we do this over sftp rather than exec?
    connection.exec(command, function(error, exitCode) {
      if (error) {
        winston.error('This is an error of some kind', error);
      }
      done(error, true);
    });
  }
  else {
    done(null, true);
  }
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
  return remotePath + getLocalPath(filePath, conf);
}

var deleteHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat, conf, next) {
  var localPath = getLocalPath(filePath, conf);
  if (directoriesEnsured.indexOf(localPath) != -1) {
    directoriesEnsured.splice(directoriesEnsured.indexOf(localPath), 1);
  }
  if (filePreviousStat.isDirectory()) {
    connection.rmdir(getRemotePath(filePath, conf), function(error) {
      if (error) {
        enqueueCommand(deleteHandler, arguments);
        next(error);
      }
      else {
        next(null);
      }
    });
  }
  else {
    connection.delete(getRemotePath(filePath, conf), function(error) {
      if (error) {
        enqueueCommand(deleteHandler, arguments);
        next(error);
      }
      else {
        next(null);
      }
    });
  }
};

var getPatterns = function(config) {
  patterns = [];
  for (i in config.fileTypesToExclude) {
    // patterns.push(new RegExp('.*\.' + config.fileTypesToExclude[i]));
  }
  for (i in config.patternsToExclude) {
    // patterns.push(new RegExp(config.patternsToExclude[i]));
  }
  // console.log(patterns);
  // return patterns;
  return new RegExp('fdsa')
}

var getPathsToIgnore = function(config) {
  paths = [];
  pathsToWatch = getPathsToWatchArray(config);
  for (i in pathsToWatch) {
    for (j in config.ignorePaths) {
      paths.push(pathsToWatch[i] + '/' + config.ignorePaths[j]);
    }
  }
  return paths;
}

watchr.watch({
  paths: getPathsToWatchArray(config),
  ignoreHiddenFiles: config.ignoreHiddenFiles,
  ignoreCommonPatterns: config.ignoreCommonPatterns,
  ignoreCustomPatterns: getPatterns(config),
  ignorePaths: getPathsToIgnore(config),
  listeners: {
    change: changeHandler,
    watching: function(error, watcherInstance, isWatching) {
      watchers.push(watcherInstance);
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
