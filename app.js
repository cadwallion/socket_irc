
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , nib = require('nib')
  , sio = require('socket.io')
  , irc = require('./irc');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'your secret here' }));
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));

  function compile (str, path) {
    return stylus(str)
      .set('filename', path)
      .use(nib());
  };
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'CadIrc'
  });
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

/**
 * Socket.IO server
 */

var io = sio.listen(app),
    redis = require('redis').createClient();

/**
 * Connect to IRC.
 */

var client = new irc.Client('irc.mmoirc.com', 6667);
//client.connect('socketio\\test\\' + String(Math.random()).substr(-3));
client.connect('cadclient');
client.on('001', function () {
  this.send('JOIN', '#coding');
});
client.on('PART', function (prefix) {
  io.sockets.emit('announcement', irc.user(prefix) + ' left the channel');
});
client.on('JOIN', function (prefix) {
  io.sockets.emit('announcement', irc.user(prefix) + ' joined the channel');
});

client.on('PRIVMSG', function (prefix, channel, text) {
  val = irc.user(prefix) + " " + text;
  redis.lpush("messages:" + channel, val);
  redis.ltrim("messages:" + channel, 0, 1500);
  io.sockets.emit('irc message', irc.user(prefix), text);
});

io.sockets.on('connection', function(socket) { 
  socket.on('reqPrevMessages', function(channel) {
    redis.lrange("messages:" + channel, 0, 1500, function(err, messages){ 
      socket.emit('resPrevMessages', messages);
    });
  });

  socket.on('send message', function(data) {
    client.sendMessage(data.message);
    val = "cadclient " + data.message;
    redis.lpush("messages:#coding", val);
    redis.ltrim("messages:#coding", 0, 1500);
    socket.emit('irc message', 'cadclient', data.message);
  })
});
