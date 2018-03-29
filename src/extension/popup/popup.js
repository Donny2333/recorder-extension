var login = document.getElementById('login')

login.addEventListener('click', function() {
  chrome.tabs.create({ url: 'http://localhost:4000' })
})
