#!/usr/bin/env node

/**
 * Module dependencies.
 */
const app = require('../app')
const http = require('http')
const https = require('https')
const fs = require('fs')
const config = require('../config')

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || '4000')
app.set('port', port)

/**
 * Create server.
 */
const server = process.env.NODE_ENV === 'production' ?
  https.createServer({
    key: fs.readFileSync(config.key_path),
    cert: fs.readFileSync(config.cert_path)
  }, app) : http.createServer(app)

/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port)
server.on('error', onError)
server.on('listening', onListening)

/**
 * Init sockets
 */
const io = require('socket.io').listen(server)
const path = require('path')
const uuid = require('node-uuid')

function walkDir(path) {
  var dirList = fs.readdirSync(path), fileList = [];

  dirList.forEach(function (item) {
    if (fs.statSync(path + '/' + item).isFile() && 0 !== item.indexOf('.')) {
      fileList.push(path + '/' + item);
    }
  });

  dirList.forEach(function (item) {
    if (fs.statSync(path + '/' + item).isDirectory()) {
      walkDir(path + '/' + item);
    }
  });

  return fileList;
}

/**
 * extend fs for move function
 * @param oldPath
 * @param newPath
 * @param callback
 */
function move(oldPath, newPath, callback) {
  fs.rename(oldPath, newPath, function (err) {
    if (err) {
      if (err.code === 'EXDEV') {
        copy();
      } else {
        callback(err);
      }
      return;
    }
    callback();
  });

  function copy() {
    var readStream = fs.createReadStream(oldPath);
    var writeStream = fs.createWriteStream(newPath);

    readStream.on('error', callback);
    writeStream.on('error', callback);

    readStream.on('close', function () {
      fs.unlink(oldPath, callback);
    });

    readStream.pipe(writeStream);
  }
}

io.sockets.on('connection', function (client) {
  var file, uploadDir = process.cwd() + '/src/server/public/uploads'
  var tmpDir = uploadDir + '/tmp/1'
  var userDir = uploadDir + '/user/1'

  client.on('startRecord', function () {
    var tmpDirFileList = walkDir(tmpDir);
    if (tmpDirFileList.length) {
      file = tmpDirFileList[0]
    } else {
      var userDirFileList = walkDir(userDir)
      if (userDirFileList.length) {
        userDirFileList = userDirFileList.sort(function(a, b) {
          a = parseInt(a.split('.').shift().split('/').pop())
          b = parseInt(b.split('.').shift().split('/').pop())
          return a - b;
        })
        var lastNum = userDirFileList.pop().split('.').shift().split('/').pop()
        file = tmpDir + '/' + (parseInt(lastNum) + 1) + '.wav'
      } else {
        file = tmpDir + '/1.wav'
      }
    }
  })

  client.on('startTransfer', (data) => {
    fs.appendFileSync(file, new Buffer(Object.values(data)), (err) => {
      if (err) {
        console.error(err)
      }
    })
  })

  client.on('stopRecord', function () {
    var fileName = file.split('/').pop()
    move(file, userDir + '/' + fileName, (err) => {
      if (err) {
        console.error(err)
      }
    })

    console.log(walkDir(tmpDir))
  })
})

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  const port = parseInt(val, 10)

  if (isNaN(port)) {
    // named pipe
    return val
  }

  if (port >= 0) {
    // port number
    return port
  }

  return false
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges')
      process.exit(1)
    case 'EADDRINUSE':
      console.error(bind + ' is already in use')
      process.exit(1)
    default:
      throw error
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
  const addr = server.address()
  const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
  console.log('Listening on ' + bind)
}
