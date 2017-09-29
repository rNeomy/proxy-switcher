'use strict';

var mode = 'direct'; // direct or fixed_servers

var proxy = {
  bypassList: []
};

const shExpMatch = (url, pattern) => {
  let pCharCode;
  let isAggressive = false;
  let pIndex;
  let urlIndex = 0;
  let lastIndex;
  const patternLength = pattern.length;
  const urlLength = url.length;
  for (pIndex = 0; pIndex < patternLength; pIndex += 1) {
    pCharCode = pattern.charCodeAt(pIndex); // use charCodeAt for performance, see http://jsperf.com/charat-charcodeat-brackets
    if (pCharCode === 63) { // use if instead of switch for performance, see http://jsperf.com/switch-if
      if (isAggressive) {
        urlIndex += 1;
      }
      isAggressive = false;
      urlIndex += 1;
    }
    else if (pCharCode === 42) {
      if (pIndex === patternLength - 1) {
        return urlIndex <= urlLength;
      }
      else {
        isAggressive = true;
      }
    }
    else {
      if (isAggressive) {
        lastIndex = urlIndex;
        urlIndex = url.indexOf(String.fromCharCode(pCharCode), lastIndex + 1);
        if (urlIndex < 0) {
          if (url.charCodeAt(lastIndex) !== pCharCode) {
            return false;
          }
          urlIndex = lastIndex;
        }
        isAggressive = false;
      }
      else {
        if (urlIndex >= urlLength || url.charCodeAt(urlIndex) !== pCharCode) {
          return false;
        }
      }
      urlIndex += 1;
    }
  }
  return urlIndex === urlLength;
};

function FindProxyForURL(url, host) { //eslint-disable-line no-unused-vars
  //browser.runtime.sendMessage({mode, url});
  if (mode === 'direct') {
    return 'DIRECT';
  }
  else {
    if (proxy.bypassList.some(s => shExpMatch(host, s))) {
      return 'DIRECT';
    }

    if (url.startsWith('https')) {
      return proxy.https;
    }
    else if (url.startsWith('http')) {
      return proxy.http;
    }
    else if (url.startsWith('ftp')) {
      return proxy.ftp;
    }
    else {
      return proxy.other;
    }
  }
}

function o2o(config, name) {
  const rules = config.value.rules;
  let obj = rules[name];
  let useFallback = true;
  if (!obj && rules.fallbackProxy) {
    obj = rules.fallbackProxy;
    useFallback = false;
  }
  if (!obj) {
    return 'direct';
  }
  const rtn = {
    type: obj.scheme.replace('socks5', 'socks'),
    host: obj.host,
    port: obj.port
  };
  rtn.proxyDNS = Boolean(config.value.remoteDNS);
  if (rules.fallbackProxy && name !== 'fallbackProxy' && useFallback) {
    rtn.failover = rules.fallbackProxy;
    rtn.failover.proxyDNS = Boolean(config.value.remoteDNS);
  }
  return [rtn];
}

browser.runtime.onMessage.addListener(({method, config}) => {
  if (method === 'register-proxy') {
    mode = config.value.mode;
    if (mode === 'fixed_servers') {
      const rules = config.value.rules;
      proxy.bypassList = rules.bypassList || [];

      proxy.http = o2o(config, 'proxyForHttp');
      proxy.https = o2o(config, 'proxyForHttps');
      proxy.ftp = o2o(config, 'proxyForFtp');
      proxy.other = o2o(config, 'fallbackProxy');

      //browser.runtime.sendMessage(proxy);
    }
    else {
      mode = 'direct';
    }
  }
});
