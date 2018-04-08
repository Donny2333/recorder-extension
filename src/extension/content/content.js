chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    console.log(sender.tab ? "from a content script:" + sender.tab.url : "from the extension")
    if (request.greeting === "hello") {
      sendResponse({farewell: "goodbye"})

      const circle = document.createElement('div')
      circle.id = 'yellow-circle'
      circle.style.position = 'fixed'
      circle.style.left = '100px'
      circle.style.bottom = '100px'
      circle.style.height = '200px'
      circle.style.width = '200px'
      circle.style.borderRadius = '100px'
      circle.style.backgroundColor = 'black'
      circle.style.overflow = 'hidden'
      document.body.appendChild(circle)

      const videoElement = document.createElement('video')
      videoElement.id = 'video'
      videoElement.style.height = '300px'
      videoElement.style.width = '300px'
      videoElement.style.position = 'absolute'
      videoElement.style.top = '-50px'
      videoElement.style.left = '-50px'

      function gotStream(stream) {
        window.stream = stream // make stream available to console
        videoElement.srcObject = stream
        videoElement.muted = true
        videoElement.setAttribute("autoplay", true)
        circle.appendChild(videoElement)
      }

      function handleError(error) {
        console.log('navigator.getUserMedia error: ', error)
      }

      function start() {
        if (window.stream) {
          window.stream.getTracks().forEach(function (track) {
            track.stop()
          })
        }

        navigator.mediaDevices
          .getUserMedia({
            audio: true,
            video: true
          })
          .then(gotStream)
          .catch(handleError)
      }

      start()
    }
  }
)
