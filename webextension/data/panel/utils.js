'use strict';

var app = {};
var _ = chrome.i18n.getMessage;

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
  message: e.message || e,
}, callback);

app.compare = (a, b) => {
  let ka = Object.keys(a).filter(s => s !== 'remoteDNS' && s !== 'noPrompt');
  let kb = Object.keys(b).filter(s => s !== 'remoteDNS' && s !== 'noPrompt');
  // remove empty array; bypassList = []
  ka = ka.filter(k => (Array.isArray(a[k]) ? a[k].length : true));
  kb = kb.filter(k => (Array.isArray(b[k]) ? b[k].length : true));

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
