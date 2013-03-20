var Connection = require('ssh2'),
  fs = require('fs');

var winston = null;

var conf = {};
var connecting = false;
var sftp = false;

module.exports.connected = false;

module.exports.setLogger = function(logger) {
  winston = logger;
}

module.exports.configure = function(options) {
  conf = options;
}

var c = new Connection();

module.exports.connection = c;

module.exports.connect = function() {
  if (!connecting) {
    c.connect(conf);
  }
}

// Wrap the event binding to allow calling code to bind to our events.
module.exports.on = function() {
  c.on.apply(c, arguments);
}

var createServerString = function() {
  return conf.username + '@' + conf.host + ':' + conf.port;
};

c.on('connect', function() {
  winston.info('SSH connecting to ' + createServerString());
});
c.on('ready', function() {
  // TODO: What if the sftp connection drops?
  c.sftp(function(error, sftpConnection) {
    if (error) {
      sftpConnection.end();
      return;
    }
    sftp = sftpConnection;
    connecting = false;
    module.exports.connected = true;
  });
  winston.info('SSH connection established with ' + createServerString());
});
c.on('error', function(error) {
  winston.error('SSH connection with ' + createServerString() + ' encountered an error.', error);
});
c.on('end', function() {
  module.exports.connected = false;
  sftp = false;
});
c.on('close', function(had_error) {
  winston.error('SSH connection with ' + createServerString() + ' closed.');
  module.exports.connected = false;
  sftp = false;
});

module.exports.transferFile = function(localPath, remotePath, next) {
  var readStream = fs.createReadStream(localPath);
  var writeStream = sftp.createWriteStream(remotePath);
  winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' started.');
  writeStream.on('close', function() {
    winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' complete.');
    next(null);
  });
  readStream.on('end', function() {
    readStream.destroy()
    writeStream.destroySoon();
  });
  readStream.pipe(writeStream);
}

module.exports.rmdir = function(remotePath, next) {
  sftp.rmdir(remotePath, function(error) {
    if (error) {
      if (error.message == 'No such file') {
        winston.warn('Remote directory `' + remotePath + '` could not be removed from ' + createServerString() + ' because it did not exist.', error);
      }
      else {
        winston.error('Remote directory `' + remotePath + '` failed to be removed from server ' + createServerString(), error);
        next();
      }
      return;
    }
    winston.info('Remote directory `' + remotePath + '` removed from server ' + createServerString());
    next();
  });
}

module.exports.delete = function(remotePath, next) {
  sftp.unlink(remotePath, function(error) {
    if (error) {
      if (error.message == 'No such file') {
        winston.warn('Deleting path `' + remotePath + '` from server ' + createServerString() + ' was not possible because the file did not exist.', error);
        next();
      }
      else {
        winston.error('Deleting path `' + remotePath + '` from server ' + createServerString() + ' failed.', error);
        // TODO: Deal with no such file error.
        console.dir(error);
        next();
      }
      return;
    }
    winston.info('Path `' + remotePath + '` on server ' + createServerString() + ' deleted.');
    next();
  });
}

module.exports.exec = function(command, next) {
  c.exec(command, function(error, stream) {
    if (error) {
      winston.error('Execution of `' + command + '` failed.', error);
      next(error, null);
      return;
    }
    stream.on('exit', function(code, signal) {
      if (code != 0) {
        winston.error('Something went wrong executing `' + command + '`.');
        next(new Error(command), -1);
      }
      next(null, signal);
    });
  });
};

