'use strict';

if (/Firefox/.test(navigator.userAgent)) {
  chrome.proxy = {
    callbacks: [],
    errors: []
  };
  chrome.storage.onChanged.addListener(ps => {
    if (ps['ffcurent']) {
      chrome.proxy.callbacks.forEach(c => c(ps['ffcurent'].newValue));
    }
  });

  chrome.proxy.onProxyError = {
    addListener: c => chrome.proxy.errors.push(c)
  };
  chrome.proxy.settings = {};
  chrome.proxy.settings.get = (prop, callback) => chrome.storage.local.get({
    'ffcurent': {
      value: {
        mode: 'system'
      }
    }
  }, prefs => callback(prefs['ffcurent']));

  chrome.proxy.settings.onChange = {
    addListener: c => chrome.proxy.callbacks.push(c)
  };

  chrome.proxy.settings.set = (config, callback = function() {}) => {
    const proxySettings = {};

    if (config.value.mode === 'direct') {
      proxySettings.proxyType = 'none';
    }
    else if (config.value.mode === 'system') {
      proxySettings.proxyType = 'system';
    }
    else if (config.value.mode === 'auto_detect') {
      proxySettings.proxyType = 'autoDetect';
    }
    else if (config.value.mode === 'fixed_servers') {
      const rules = config.value.rules;
      proxySettings.proxyType = 'manual';

      if (rules.proxyForHttp.scheme.startsWith('socks')) {
        proxySettings.socks = rules.proxyForHttps.host + ':' + rules.proxyForHttps.port;
        proxySettings.socksVersion = rules.proxyForHttp.scheme === 'socks5' ? 5 : 4;
      }
      else {
        proxySettings.ftp = rules.proxyForFtp.scheme + '://' +
          rules.proxyForFtp.host + ':' + rules.proxyForFtp.port;
        proxySettings.http = rules.proxyForHttp.scheme + '://' +
          rules.proxyForHttp.host + ':' + rules.proxyForHttp.port;
        proxySettings.ssl = rules.proxyForHttps.scheme + '://' +
          rules.proxyForHttps.host + ':' + rules.proxyForHttps.port;
      }
      if (config.value.remoteDNS) {
        proxySettings.proxyDNS = true;
      }
      if (config.value.noPrompt) {
        proxySettings.autoLogin = true;
      }
      if (rules.bypassList.length) {
        proxySettings.passthrough = rules.bypassList.join(', ');
      }
    }
    else if (config.value.mode === 'pac_script') {
      proxySettings.proxyType = 'autoConfig';
      proxySettings.autoConfigUrl = config.value.pacScript.url;
    }
    browser.browserSettings.proxyConfig.set({value: proxySettings}, () => {
      const lastError = chrome.runtime.lastError;
      if (chrome.runtime.lastError) {
        chrome.proxy.errors.forEach(c => c(lastError));
      }
    });

    chrome.storage.local.set({
      'ffcurent': {
        value: config.value
      }
    }, callback);
  };
  chrome.proxy.settings.get(null, chrome.proxy.settings.set);
}

//browser.proxy.onProxyError.addListener(error => {
//  console.error(`Proxy error: ${error.message}`);
//});

//chrome.runtime.onMessage.addListener(r => console.log(r))
