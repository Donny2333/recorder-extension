/*
*  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

'use strict'

const DEBUG = true
const audioElement = document.querySelector('audio#audio')
const audioInputSelect = document.querySelector('select#audioSource')
const audioOutputSelect = document.querySelector('select#audioOutput')
const startRecording = document.querySelector('button#start-recording')
const pauseRecording = document.querySelector('button#pause-recording')
const stopRecording = document.querySelector('button#stop-recording')
const audioPreview = document.querySelector('#audio-preview')
const audioCtx = new (window.AudioContext || webkitAudioContext)();
const canvas = document.querySelector('canvas#visualizer');

let selectors = [audioInputSelect, audioOutputSelect]
let mediaRecorder
let recordedBlobs = []

const socketio = io()

socketio.on('connect', function () {
  startRecording.disabled = false
})

audioOutputSelect.disabled = !('sinkId' in HTMLMediaElement.prototype)

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(function (select) {
    return select.value
  })
  selectors.forEach(function (select) {
    while (select.firstChild) {
      select.removeChild(select.firstChild)
    }
  })
  for (let i = 0; i !== deviceInfos.length; ++i) {
    let deviceInfo = deviceInfos[i]
    const option = document.createElement('option')
    option.value = deviceInfo.deviceId
    if (deviceInfo.kind === 'audioinput') {
      option.text = deviceInfo.label || 'microphone ' + (audioInputSelect.length + 1)
      audioInputSelect.appendChild(option)
    } else if (deviceInfo.kind === 'audiooutput') {
      option.text = deviceInfo.label || 'speaker ' + (audioOutputSelect.length + 1)
      audioOutputSelect.appendChild(option)
    } else {
      if (deviceInfo.kind != 'videoinput') {
        console.log('Some other kind of source/device: ', deviceInfo)
      }
    }
  }
  selectors.forEach(function (select, selectorIndex) {
    if (
      Array.prototype.slice.call(select.childNodes).some(function (n) {
        return n.value === values[selectorIndex]
      })
    ) {
      select.value = values[selectorIndex]
    }
  })
}

// Attach audio output device to video element using device/sink ID.
function attachSinkId(element, sinkId) {
  if (typeof element.sinkId !== 'undefined') {
    element
    .setSinkId(sinkId)
    .then(function () {
      console.log('Success, audio output device attached: ' + sinkId)
    })
    .catch(function (error) {
      let errorMessage = error
      if (error.name === 'SecurityError') {
        errorMessage =
          'You need to use HTTPS for selecting audio output ' +
          'device: ' +
          error
      }
      console.error(errorMessage)
      // Jump back to first output device in the list as it's the default.
      audioOutputSelect.selectedIndex = 0
    })
  } else {
    console.warn('Browser does not support output device selection.')
  }
}

function changeAudioDestination() {
  const audioDestination = audioOutputSelect.value
  attachSinkId(audioOutputSelect, audioDestination)
}

function gotStream(stream) {
  window.stream = stream
  // make stream available to console
  /*audioElement.srcObject = stream
  DEBUG && console.log(stream)
  audioElement.muted = true
  audioElement.controls = true
  audioElement.play = false*/

  // audion visualization
  visualize(stream)

  // Refresh button list in case labels have become available
  return navigator.mediaDevices.enumerateDevices()
}

function visualize(stream) {
  var canvasCtx = canvas.getContext('2d');
  var source = audioCtx.createMediaStreamSource(stream);

  var analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  var bufferLength = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLength);

  source.connect(analyser);
  //analyser.connect(audioCtx.destination);

  draw()

  function draw() {
    var WIDTH = canvas.width
    var HEIGHT = canvas.height;

    requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = 'rgb(200, 200, 200)';
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

    canvasCtx.beginPath();

    var sliceWidth = WIDTH * 1.0 / bufferLength;
    var x = 0;

    for (var i = 0; i < bufferLength; i++) {
      var v = dataArray[i] / 128.0;
      var y = v * HEIGHT / 2;
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }
}

function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data)

    let arrayBuffer
    const fileReader = new FileReader()
    fileReader.readAsArrayBuffer(event.data)
    fileReader.onload = function () {
      arrayBuffer = new Uint8Array(this.result)
      DEBUG && console.log(arrayBuffer)
      socketio.emit('startTransfer', arrayBuffer)
    }
  }
}

function handleStop(event) {
  console.log('Recorder stopped: ', event)

  const supperBlob = new Blob(recordedBlobs, {type: 'audio/webm'})

  audioPreview.src = URL.createObjectURL(supperBlob)
  // audioPreview.play()
  audioPreview.muted = false
  audioPreview.controls = true
}

startRecording.onclick = function () {
  startRecording.disabled = true
  pauseRecording.disabled = false
  stopRecording.disabled = false
  socketio.emit('startRecord')

  recordedBlobs = []

  // record stream
  let options = {mimeType: 'video/webm;codecs=vp9'}
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    console.log(options.mimeType + ' is not Supported')
    options = {mimeType: 'video/webm;codecs=vp8'}
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log(options.mimeType + ' is not Supported')
      options = {mimeType: 'video/webm'}
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(options.mimeType + ' is not Supported')
        options = {mimeType: ''}
      }
    }
  }

  try {
    mediaRecorder = new MediaRecorder(window.stream, options)
  } catch (e) {
    console.error('Exception while creating MediaRecorder: ' + e)
    alert('Exception while creating MediaRecorder: ' + e + '. mimeType: ' + options.mimeType)
    return
  }
  console.log('Created MediaRecorder', mediaRecorder, 'with options', options)

  mediaRecorder.onstop = handleStop
  mediaRecorder.ondataavailable = handleDataAvailable
  mediaRecorder.start(10) // collect 10ms of data

  console.log('MediaRecorder started', mediaRecorder)
}

stopRecording.onclick = function () {
  startRecording.disabled = false
  pauseRecording.disabled = true
  stopRecording.disabled = true

  mediaRecorder.stop()

  socketio.emit('stopRecord')
}

function start() {
  if (window.stream) {
    window.stream.getTracks().forEach(function (track) {
      track.stop()
    })
  }
  const audioSource = audioInputSelect.value
  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined}
  }
  navigator.mediaDevices
           .getUserMedia(constraints)
           .then(gotStream)
           .then(gotDevices)
           .catch(handleError)
}

audioInputSelect.onchange = start
audioOutputSelect.onchange = changeAudioDestination

start()

function handleError(error) {
  console.log('navigator.getUserMedia error: ', error)
}
