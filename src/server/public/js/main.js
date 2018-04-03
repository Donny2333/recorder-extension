/*
*  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

'use strict'

const videoElement = document.querySelector('video#video')
const audioInputSelect = document.querySelector('select#audioSource')
const audioOutputSelect = document.querySelector('select#audioOutput')
const videoSelect = document.querySelector('select#videoSource')
const startRecording = document.querySelector('button#start-recording')
const stopRecording = document.querySelector('button#stop-recording')
const cameraPreview = document.querySelector('#camera-preview')

let selectors = [audioInputSelect, audioOutputSelect, videoSelect]
let mediaRecorder
let recordedBlobs = []

const socketio = io()

socketio.on('connect', function () {
  startRecording.disabled = false
})

socketio.on('merged', function (fileName) {
  let href = (location.href.split('/').pop().length ? location.href.replace(location.href.split('/').pop(),
    '') : location.href)

  href = href + 'uploads/' + fileName

  console.log('got file ' + href)

  cameraPreview.src = href
  cameraPreview.play()
  cameraPreview.muted = false
  cameraPreview.controls = true
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
    } else if (deviceInfo.kind === 'videoinput') {
      option.text = deviceInfo.label || 'camera ' + (videoSelect.length + 1)
      videoSelect.appendChild(option)
    } else {
      console.log('Some other kind of source/device: ', deviceInfo)
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

navigator.mediaDevices
  .enumerateDevices()
  .then(gotDevices)
  .catch(handleError)

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
  attachSinkId(videoElement, audioDestination)
}

function gotStream(stream) {
  window.stream = stream // make stream available to console
  videoElement.srcObject = stream
  videoElement.muted = true

  // Refresh button list in case labels have become available
  return navigator.mediaDevices.enumerateDevices()
}

function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data)

    let arrayBuffer
    const fileReader = new FileReader()
    fileReader.onload = function () {
      arrayBuffer = new Uint8Array(this.result)
      socketio.emit('recordedBlobs', arrayBuffer)
    }
    fileReader.readAsArrayBuffer(event.data)
  }
}

function handleStop(event) {
  console.log('Recorder stopped: ', event)
}

startRecording.onclick = function () {
  startRecording.disabled = true
  stopRecording.disabled = false

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
  stopRecording.disabled = true

  mediaRecorder.stop()

  const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'})

  const reader = new FileReader()
  reader.readAsArrayBuffer(superBuffer)
  reader.onloadend = function () {
    const files = {
      audio: {
        type: 'audio/wav',
        dataURL: 'data:audio/wav;base64,' + _arrayBufferToBase64(this.result)
      }
      // video: {
      //     type: recordVideo.getBlob().type || 'video/webm',
      //     dataURL: videoDataURL
      // }
    }

    // socketio.emit('message', files)
    socketio.emit('stopRecorded')
  }
}

function _arrayBufferToBase64(buffer) {
  let binary = ''
  let bytes = new Uint8Array(buffer)
  let len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function start() {
  if (window.stream) {
    window.stream.getTracks().forEach(function (track) {
      track.stop()
    })
  }
  const audioSource = audioInputSelect.value
  const videoSource = videoSelect.value
  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {deviceId: videoSource ? {exact: videoSource} : undefined}
  }
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .then(gotDevices)
    .catch(handleError)
}

audioInputSelect.onchange = start
audioOutputSelect.onchange = changeAudioDestination
videoSelect.onchange = start

start()

function handleError(error) {
  console.log('navigator.getUserMedia error: ', error)
}
