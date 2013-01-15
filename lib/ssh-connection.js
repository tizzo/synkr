var Connection = require('ssh2');
var fs = require('fs');
var async = require('async');

var winston = null;

var conf = {};
var connected = false;

module.exports.setLogger = function(logger) {
  winston = logger;
}

module.exports.configure = function(options) {
  conf = options;
}

var c = new Connection();

module.exports.connection = c;

module.exports.connect = function() {
  c.connect(conf);
}

var createServerString = function() {
  return conf.username + '@' + conf.host + ':' + conf.port;
};

c.on('connect', function() {
  winston.info('SSH connecting to ' + createServerString());
});
c.on('ready', function() {
  connected = true;
  winston.info('SSH connection established with ' + createServerString());
});
c.on('error', function(error) {
  winston.error('SSH connection with ' + createServerString() + ' encountered an error.', error);
});
c.on('end', function() {
  connected = false;
});
c.on('close', function(had_error) {
  console.log('Connection :: close');
  connected = false;
});

module.exports.transferFile = function(localPath, remotePath, next) {
  c.sftp(function(error, sftp) {
    if (error) throw error;
    var readStream = fs.createReadStream(localPath);
    var writeStream = sftp.createWriteStream(remotePath);
    winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' started.');
    writeStream.on('close', function() {
      winston.info('Transferring file ' + localPath + ' to ' + remotePath + ' on ' + createServerString() + ' complete.');
    });
    readStream.on('end', function() {
      // readStream.destroySoon();
      stream.destroy()
      writeStream.destroySoon();
      next();
    });
    readStream.pipe(writeStream);
  });
}

var sendCommand = function(command, callback) {
  c.exec(command, function(err, stream) {
    if (err) throw err;
    stream.on('data', function(data, extended) {
      console.log(command + ' ' + (extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ')
                  + data);
    });
    stream.on('end', function() {
      console.log(command + ' Stream :: EOF');
    });
    stream.on('close', function() {
      console.log(command + ' Stream :: close');
    });
    stream.on('exit', function(code, signal) {
      console.log(command + ' Stream :: exit :: code: ' + code + ', signal: ' + signal);
      callback();
    });
  });
}
