'use strict';

const isFirefox = /Firefox/.test(navigator.userAgent);
const app = {};

app.storage = prefs => new Promise(resolve => chrome.storage.local.get(prefs, resolve));

app.callbacks = {
  on: {},
  once: {}
};
app.onces = {};

app.on = (id, callback) => {
  app.callbacks.on[id] = app.callbacks.on[id] || [];
  app.callbacks.on[id].push(callback);
};

app.once = (id, callback) => {
  app.callbacks.once[id] = app.callbacks.once[id] || [];
  app.callbacks.once[id].push(callback);
};
app.emit = (id, value) => {
  (app.callbacks.on[id] || []).forEach(c => c(value));
  (app.callbacks.once[id] || []).forEach(c => c(value));
  app.callbacks.once[id] = [];
};

app.notify = (e, callback) => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
}, callback);

app.compare = (a, b) => {
  const ignore = ['remoteDNS', 'noPrompt', 'levelOfControl'];
  if (isFirefox) {
    ignore.push('fallbackProxy');
  }
  let ka = Object.keys(a).filter(s => ignore.indexOf(s) === -1);
  let kb = Object.keys(b).filter(s => ignore.indexOf(s) === -1);

  // remove empty array; bypassList = []
  ka = ka.filter(k => (Array.isArray(a[k]) ? a[k].length : true));
  kb = kb.filter(k => (Array.isArray(b[k]) ? b[k].length : true));

  // remove empty objects; see https://github.com/rNeomy/proxy-switcher/issues/70
  ka = ka.filter(k => {
    if (typeof a[k] === 'object' && 'host' in a[k] && 'port' in a[k]) {
      if (!a[k].host && !a[k].port) {
        return false;
      }
    }
    return true;
  });
  kb = kb.filter(k => {
    if (typeof b[k] === 'object' && 'host' in b[k] && 'port' in b[k]) {
      if (!b[k].host && !b[k].port) {
        return false;
      }
    }
    return true;
  });
  if (ka.length !== kb.length) {
    return false;
  }
  for (const key of ka) {
    if (typeof a[key] === 'string' || typeof a[key] === 'boolean' || typeof a[key] === 'number') {
      if (a[key] !== b[key]) {
        return false;
      }
    }
    else if (Array.isArray(a[key])) {
      if (a[key].some(s => b[key].indexOf(s) === -1)) {
        return false;
      }
    }
    else {
      return app.compare(a[key], b[key]);
    }
  }
  return true;
};
