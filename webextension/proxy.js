'use strict';

if (/Firefox/.test(navigator.userAgent)) {
  const register = browser.proxy.register || browser.proxy.registerProxyScript;

  chrome.proxy = {
    callbacks: []
  };
  chrome.storage.onChanged.addListener(ps => {
    if (ps['ffcurent']) {
      chrome.proxy.callbacks.forEach(c => c(ps['ffcurent'].newValue));
    }
  });

  chrome.proxy.settings = {};
  chrome.proxy.settings.get = (prop, callback) => {
    chrome.storage.local.get({
      'ffcurent': {
        value: {
          mode: 'system'
        }
      }
    }, prefs => callback(prefs['ffcurent']));
  };
  chrome.proxy.settings.onChange = {
    addListener: c => chrome.proxy.callbacks.push(c)
  };

  chrome.proxy.settings.set = (config, callback = function() {}) => {
    if (config.value.mode === 'system') {
      browser.proxy.unregister().then(() => {
        chrome.storage.local.set({
          'ffcurent': {
            value: {
              mode: 'system'
            }
          }
        }, callback);
      });
    }
    else {
      register('/data/pac.js').then(() => browser.runtime.sendMessage({
        method: 'register-proxy',
        config
      }, {toProxyScript: true}, () => {
        chrome.storage.local.set({
          'ffcurent': config
        }, callback);
      }));
    }
  };
  chrome.proxy.settings.get({}, chrome.proxy.settings.set);
}
/*
browser.proxy.onProxyError.addListener(error => {
  console.error(`Proxy error: ${error.message}`);
});
*/
//chrome.runtime.onMessage.addListener(r => console.log(r))
