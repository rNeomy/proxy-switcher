'use strict';

const app = {};

app.storage = prefs => chrome.storage.local.get(prefs);

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
