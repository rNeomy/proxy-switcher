'use strict';

var app = {};
app.callbacks = {};

app.on = (id, callback) => {
  app.callbacks[id] = app.callbacks[id] || [];
  app.callbacks[id].push(callback);
};

app.emit = (id, value) => {
  (app.callbacks[id] || []).forEach(c => c(value));
};

var _ = chrome.i18n.getMessage;
