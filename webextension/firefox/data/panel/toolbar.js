/* globals app */
'use strict';

(function() {
  let tabId;

  document.addEventListener('click', ({target}) => {
    const cmd = target.dataset.cmd;
    if (cmd === 'open-failed-resources') {
      chrome.tabs.create({
        url: chrome.runtime.getURL('data/log/index.html?id=' + tabId)
      });
    }
  });
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    if (tabs.length) {
      tabId = tabs[0].id;
      chrome.runtime.sendMessage({
        cmd: 'fails',
        tabId
      }, a => {
        if (a && a.length) {
          document.querySelector('#tabs>div input').classList.remove('hide');
        }
      });
    }
  });
})();

app.on('update-description', desc => Object.assign(document.querySelector('#toolbar span'), {
  title: desc,
  textContent: desc
}));
