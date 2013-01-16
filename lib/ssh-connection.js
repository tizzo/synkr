var Connection = require('ssh2'),
  fs = require('fs');

var winston = null;

var conf = {};
var connecting = false;

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
  module.exports.connected = true;
  connecting = false;
  winston.info('SSH connection established with ' + createServerString());
});
c.on('error', function(error) {
  winston.error('SSH connection with ' + createServerString() + ' encountered an error.', error);
});
c.on('end', function() {
  module.exports.connected = false;
});
c.on('close', function(had_error) {
  console.log('Connection :: close');
  module.exports.connected = false;
});

module.exports.transferFile = function(localPath, remotePath, next) {
  c.sftp(function(error, sftp) {
    if (error) {
      next(error);
      sftp.end();
      return;
    }
    var readStream = fs.createReadStream(localPath);
    var writeStream = sftp.createWriteStream(remotePath);
    winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' started.');
    writeStream.on('close', function() {
      winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' complete.');
      sftp.end();
      next(null);
    });
    readStream.on('end', function() {
      readStream.destroy()
      writeStream.destroySoon();
    });
    readStream.pipe(writeStream);
  });
}

module.exports.rmdir = function(remotePath, next) {
  c.sftp(function(error, sftp) {
    sftp.rmdir(remotePath, function(error) {
      if (error) {
        winston.error('Remote path `' + remotePath + '` failed to be removed from server ' + createServerString(), error);
        sftp.end();
        next(error);
        return;
      }
      winston.info('Remote path `' + remotePath + '` removed from server ' + createServerString());
      sftp.end();
      next(null);
    });
  });
}

module.exports.delete = function(remotePath, next) {
  c.sftp(function(error, sftp) {
    if (error) {
      winston.error('Creating sftp object for `' + remotePath + '` on server ' + createServerString() + ' failed.');
      next(error);
      return;
    }
    sftp.unlink(remotePath, function(error) {
      if (error) {
        winston.error('Deleting path `' + remotePath + '` from server ' + createServerString() + ' failed.');
        sftp.end();
        next(error)
        return;
      }
      winston.info('Path `' + remotePath + '` from server ' + createServerString() + ' deleted.');
      sftp.end();
      next(null);
    });
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

