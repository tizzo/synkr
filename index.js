// Generated by CoffeeScript 1.4.0
var config, options, request, watchr, winston;

var fs = require('fs'),
  watchr = require('watchr'),
  winston = require('winston');

require('./lib/ssh-connection')

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

var processChange = function(changeType, filePath, fileCurrentStat) {
  var conf = findOptionDefinition(filePath);
  winston.info(changeType, filePath);
  createDirectory(conf, changeType, filePath, fileCurrentStat, function(error, success) {
    if (error) {
      winston.error('Synchronization for ' +  filePath + ' not completed because ensuring the directory exists was not possible.');
    }
    else {
      syncFile(conf, changeType, filePath, fileCurrentStat, function(error, success) {
        winston.info('Synchronization complete');
      });
    }
  });
};

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

var createDirectory = function(conf, changeType, filePath, fileCurrentStat, done) {
  directoryToEnsure = findDirectoryPath(filePath, fileCurrentStat);
  directoryToEnsure = getLocalPath(directoryToEnsure);
  winston.info('trying to ensure ' + directoryToEnsure);
  if (directoriesEnsured.indexOf(directoryToEnsure) === -1) {
    // fileCurrentStat could be null because this is a deletion.
    var command = 'mkdir -p ' + conf.remotePath + directoryToEnsure;
    directoriesEnsured.push(directoryToEnsure);
    winston.info(command);
  }
  done(null, true);
};

var syncFile = function(conf, changeType, filePath, fileCurrentStat, done) {
  buildSyncCommand(conf, changeType, filePath, conf);
  done(null, true);
};

var buildSyncCommand = function(conf, changeType, filePath, conf) {
  // TODO: Wihtout using -r (which we don't want to do because this is
  // targetted) we'll need to separately do a mkdir -p
  var options = conf.commandOptions.join(' ');
  var remoteSystem = conf.remoteUser + '@' + conf.remoteHost + ':' + conf.remotePort;
  var remotePath = conf.remotePath;
  command = conf.command + ' ' + options + ' ' + filePath + ' ' + remoteSystem + remotePath;
  console.log(command);
};

var runSyncCommand = function() {

};

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


var changeHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat) {
  if (changeType == 'create' || changeType == 'update') {
    createOrUpdateHandler(changeType, filePath, fileCurrentStat, filePreviousStat);
  }
  else if (changeType == 'delete') {
    deleteHandler(changeType, filePath, fileCurrentStat, filePreviousStat);
  }
  else {
    throw new Error('Invalid change type `' + changeType + '` on file `' + filePath + '`.');
  }
};

var deleteHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat) {
  var localPath = getLocalPath(filePath);
  console.log('delete handler triggered');
  if (directoriesEnsured.indexOf(localPath) != -1) {
    directoriesEnsured.splice(directoriesEnsured.indexOf(localPath), 1);
  }
};

var createOrUpdateHandler = function(changeType, filePath, fileCurrentStat, filePreviousStat) {

  var skip, type, i;
  skip = false;
  for (i = 0; i < config.fileTypesToExclude.length; i++) {
    type = config.fileTypesToExclude[i];
    if (filePath.search("." + type) !== -1) {
      skip = true;
      console.log('extension');
    }
    if (config.ignoreHiddenFiles && filePath.search(/\./) === 0) {
      skip = true;
    }
  }
  if (!skip) {
    processChange(changeType, filePath, fileCurrentStat);
    winston.info(filePath + " " + changeType + "d.");
  }
};

watchr.watch({
  paths: getPathsToWatchArray(config),
  listeners: {
    change: changeHandler
  },
  next: function(err, watchers) {
    return winston.info(getPathsToWatchArray(config).join(', ') + " now watched for changes.");
  }
});
