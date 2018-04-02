#!/usr/bin/env node

/**
 * Module dependencies.
 */

const app = require('../app')
// force https
const https = require('https')

var options = {
  key: fs.readFileSync('/etc/letsencrypt/live/bwg.bingzhe.wang/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/bwg.bingzhe.wang/fullchain.pem')
}

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || '4430')
app.set('port', port)

/**
 * Create HTTPS server.
 */

const server = https.createServer(options, app)

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
const fs = require("fs")
const uuid = require('node-uuid')


io.sockets.on('connection', function (socket) {
  socket.on('message', function (data) {
    const fileName = uuid.v4()

    socket.emit('ffmpeg-output', 0)

    console.log(data)

    writeToDisk(data.audio.dataURL, fileName + '.wav')

    // if it is chrome
    if (data.video) {
      writeToDisk(data.video.dataURL, fileName + '.webm')
      merge(socket, fileName)
    } else
    // if it is firefox or if user is recording only audio
      socket.emit('merged', fileName + '.wav')
  })
})

function writeToDisk(dataURL, fileName) {
  let fileExtension = fileName.split('.').pop(),
    fileRootNameWithBase = '../public/uploads/' + fileName,
    filePath = fileRootNameWithBase,
    fileID = 2,
    fileBuffer

  // @todo return the new filename to client
  while (fs.existsSync(filePath)) {
    filePath = fileRootNameWithBase + '(' + fileID + ').' + fileExtension
    fileID += 1
  }

  dataURL = dataURL.split(',').pop()
  fileBuffer = new Buffer(dataURL, 'base64')
  fs.writeFileSync(filePath, fileBuffer)

  console.log('filePath', filePath)
}

function merge(socket, fileName) {
  const FFmpeg = require('fluent-ffmpeg')

  const audioFile = path.join(__dirname, 'uploads', fileName + '.wav'),
    videoFile = path.join(__dirname, 'uploads', fileName + '.webm'),
    mergedFile = path.join(__dirname, 'uploads', fileName + '-merged.webm')

  new FFmpeg({
    source: videoFile
  })
    .addInput(audioFile)
    .on('error', function (err) {
      socket.emit('ffmpeg-error', 'ffmpeg : An error occurred: ' + err.message)
    })
    .on('progress', function (progress) {
      socket.emit('ffmpeg-output', Math.round(progress.percent))
    })
    .on('end', function () {
      socket.emit('merged', fileName + '-merged.webm')
      console.log('Merging finished !')

      // removing audio/video files
      fs.unlink(audioFile)
      fs.unlink(videoFile)
    })
    .saveToFile(mergedFile)
}

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
