var Connection = require('ssh2');
var async = require('async');
var c = new Connection();
c.on('connect', function() {
  console.log('Connection :: connect');
});
c.on('ready', function() {
  console.log('Connection :: ready');
  async.forEach(['pwd', 'uptime', 'users', 'top'], sendCommand, function() {
    console.log('all commands have run');
    c.end();
  });
});
c.on('error', function(err) {
  console.log('Connection :: error :: ' + err);
});
c.on('end', function() {
  console.log('Connection :: end');
});
c.on('close', function(had_error) {
  console.log('Connection :: close');
});
c.connect({
  host: '33.33.33.115',
  port: 22,
  username: 'vagrant',
  privateKey: require('fs').readFileSync('/Users/howard/Documents/Code/Node.js/rsync-watch/id_rsa')
});


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
