/* badge */

const badge = d => {
  console.log(d);
};

badge.install = () => {
  chrome.webRequest.onCompleted.addListener(badge.events.onCompleted, {urls: ['*://*/*']});
  chrome.webRequest.onErrorOccurred.addListener(badge.events.onErrorOccurred, {urls: ['*://*/*']});
  chrome.tabs.onRemoved.addListener(badge.events.onRemoved);
};
badge.uninstall = () => {
  chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.action.setBadgeText({
    tabId: tab.id,
    text: ''
  })));
  chrome.tabs.onRemoved.removeListener(badge.events.onRemoved);
  if (chrome.webRequest) {
    chrome.webRequest.onCompleted.removeListener(badge.events.onCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(badge.events.onErrorOccurred);
  }
};
badge.events = {
  onCompleted: d => {
    const bol = (d.statusCode < 200 || d.statusCode >= 400) && d.statusCode !== 101;
    if (bol) {
      badge(d);
    }
  },
  onErrorOccurred: d => {
    console.log(d);
    if (
      d.error !== 'net::ERR_BLOCKED_BY_CLIENT' &&
      d.error !== 'NS_ERROR_ABORT'
    ) {
      badge(d);
    }
  },
  onRemoved: tabId => chrome.sessions.remove(tabId + '')
};

// init
{
  const startup = () => chrome.storage.local.get({
    'counter': false
  }, prefs => {
    if (prefs.counter) {
      badge.install();
    }
  });
  chrome.runtime.onInstalled.addListener(startup);
  chrome.runtime.onStartup.addListener(startup);
}


/* messaging */
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'fails') {
    console.log(request);
  }
});

/* pref changes */
chrome.storage.onChanged.addListener(ps => {
  if (ps.counter) {
    badge.uninstall();
    if (ps.counter.newValue) {
      badge.install();
    }
  }
});
