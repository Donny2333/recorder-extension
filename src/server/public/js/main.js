/*
*  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

'use strict'

const audioInputSelect = document.querySelector('select#audioSource')
const audioOutputSelect = document.querySelector('select#audioOutput')
const videoSelect = document.querySelector('select#videoSource')
const startRecording = document.querySelector('button#start-recording')
const stopRecording = document.querySelector('button#stop-recording')
const videoElement = document.querySelector('#video')
const cameraPreview = document.querySelector('#camera-preview')

let selectors = [audioInputSelect, audioOutputSelect, videoSelect]
let mediaRecorder
let recordedBlobs = []

const socketio = io()

socketio.on('connect', _ => {
  startRecording.disabled = false
})

socketio.on('merged', fileName => {
  let href = (location.href.split('/').pop().length ? location.href.replace(location.href.split('/').pop(),
    '') : location.href)

  href = href + 'uploads/' + fileName

  console.log('Got file ' + href)

  cameraPreview.src = href
  cameraPreview.play()
  cameraPreview.muted = false
  cameraPreview.controls = true
})

socketio.on('disconnect', _ => {
  socketio.close()
  console.log('Socket disconnected')
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

  // visualization stream
  source = audioCtx.createMediaStreamSource(stream)
  source.connect(analyser)
  analyser.connect(distortion)
  distortion.connect(biquadFilter)
  biquadFilter.connect(convolver)
  convolver.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  visualize()
  voiceChange()

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
    // const files = {
    //   audio: {
    //     type: 'audio/wav',
    //     dataURL: 'data:audio/wav;base64,' + _arrayBufferToBase64(this.result)
    //   }
    //   // video: {
    //   //     type: recordVideo.getBlob().type || 'video/webm',
    //   //     dataURL: videoDataURL
    //   // }
    // }
    // socketio.emit('message', files)
    socketio.emit('stopRecorded')
  }
}

// function _arrayBufferToBase64(buffer) {
//   let binary = ''
//   let bytes = new Uint8Array(buffer)
//   let len = bytes.byteLength
//   for (let i = 0; i < len; i++) {
//     binary += String.fromCharCode(bytes[i])
//   }
//   return window.btoa(binary)
// }

function start() {
  if (window.stream) {
    window.stream.getTracks().forEach(function (track) {
      track.stop()
    })
  }
  const audioSource = audioInputSelect.value
  // const videoSource = videoSelect.value
  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined}
    // video: {deviceId: videoSource ? {exact: videoSource} : undefined}
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

// set up canvas context for visualizer
const canvas = document.querySelector('.visualizer')
const canvasCtx = canvas.getContext("2d")

const intendedWidth = document.querySelector('.wrapper').clientWidth
canvas.setAttribute('width', intendedWidth)

const visualSelect = document.getElementById("visual")

let drawVisual, WIDTH, HEIGHT

const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
const voiceSelect = document.getElementById("voice")
let source

const analyser = audioCtx.createAnalyser()
analyser.minDecibels = -90
analyser.maxDecibels = -10
analyser.smoothingTimeConstant = 0.85

const distortion = audioCtx.createWaveShaper()
const gainNode = audioCtx.createGain()
const biquadFilter = audioCtx.createBiquadFilter()
const convolver = audioCtx.createConvolver()

function visualize() {
  WIDTH = canvas.width
  HEIGHT = canvas.height

  const visualSetting = visualSelect.value
  console.log(visualSetting)

  if (visualSetting === "sinewave") {
    analyser.fftSize = 2048
    const bufferLength = analyser.fftSize
    console.log(bufferLength)
    const dataArray = new Uint8Array(bufferLength)

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT)

    const draw = function () {

      drawVisual = requestAnimationFrame(draw)

      analyser.getByteTimeDomainData(dataArray)

      canvasCtx.fillStyle = 'rgb(200, 200, 200)'
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

      canvasCtx.lineWidth = 2
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)'

      canvasCtx.beginPath()

      const sliceWidth = WIDTH * 1.0 / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {

        const v = dataArray[i] / 128.0
        const y = v * HEIGHT / 2

        if (i === 0) {
          canvasCtx.moveTo(x, y)
        } else {
          canvasCtx.lineTo(x, y)
        }

        x += sliceWidth
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2)
      canvasCtx.stroke()
    }

    draw()

  } else if (visualSetting === "frequencybars") {
    analyser.fftSize = 256
    const bufferLengthAlt = analyser.frequencyBinCount
    console.log(bufferLengthAlt)
    const dataArrayAlt = new Uint8Array(bufferLengthAlt)

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT)

    const drawAlt = function () {
      drawVisual = requestAnimationFrame(drawAlt)

      analyser.getByteFrequencyData(dataArrayAlt)

      canvasCtx.fillStyle = 'rgb(0, 0, 0)'
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

      const barWidth = (WIDTH / bufferLengthAlt) * 2.5
      let barHeight
      let x = 0

      for (let i = 0; i < bufferLengthAlt; i++) {
        barHeight = dataArrayAlt[i]

        canvasCtx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)'
        canvasCtx.fillRect(x, HEIGHT - barHeight / 2, barWidth, barHeight / 2)

        x += barWidth + 1
      }
    }

    drawAlt()

  } else if (visualSetting === "off") {
    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT)
    canvasCtx.fillStyle = "red"
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)
  }

}

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180
  let i = 0,
    x
  for (; i < n_samples; ++i) {
    x = i * 2 / n_samples - 1
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x))
  }
  return curve
}

function voiceChange() {

  distortion.oversample = '4x'
  biquadFilter.gain.setTargetAtTime(0, audioCtx.currentTime, 0)
  convolver.buffer = undefined

  const voiceSetting = voiceSelect.value

  if (voiceSetting === "distortion") {
    distortion.curve = makeDistortionCurve(400)
  } else if (voiceSetting === "biquad") {
    biquadFilter.type = "lowshelf"
    biquadFilter.frequency.setTargetAtTime(1000, audioCtx.currentTime, 0)
    biquadFilter.gain.setTargetAtTime(25, audioCtx.currentTime, 0)
  } else if (voiceSetting === "off") {
    console.log("Voice settings turned off")
  }

}

// event listeners to change visualize and voice settings

visualSelect.onchange = function () {
  window.cancelAnimationFrame(drawVisual)
  visualize()
}

voiceSelect.onchange = function () {
  voiceChange()
}
