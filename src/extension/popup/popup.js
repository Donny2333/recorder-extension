document.getElementById('login').addEventListener('click', function () {
  // chrome.tabs.create({url: 'http://localhost:4000'})

  chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {greeting: "hello"}, function (response) {
      console.log(response)
    })
  })
})
