/* globals require */
'use strict';

var unload = require('sdk/system/unload');
var tabs = require('sdk/tabs');
var utils = require('sdk/tabs/utils');
var self = require('sdk/self');
var tabs = require('sdk/tabs');
var pageMod = require('sdk/page-mod');
var {WebRequest} = require('resource://gre/modules/WebRequest.jsm', {});

var button = require('./firefox/firefox').button._obj;
var on = require('./firefox/firefox').on;
var cache = {};

function update (id) {
  let tab = utils.getTabForId(cache[id].tabId);

  let num = cache[id].errors.length;
  button.state(tab, {
    badge: num || ''
  });
}

function observe (d) {
  if (d.statusCode < 200 || d.statusCode >= 400) {
    if (d.statusCode === 101) { // https://github.com/rNeomy/proxy-switcher/issues/30#issuecomment-322780831
      return;
    }
    let windowId = d.browser._outerWindowID || (d.parentWindowId === -1 ? d.windowId : d.parentWindowId);
    if (cache[windowId]) {
      cache[windowId].errors.push({
        method: d.method,
        url: d.url,
        statusLine: d.statusLine,
        ip: d.ip,
        type: d.type
      });
    }
    else {
      let id = utils.getTabId(utils.getTabForBrowser(d.browser));
      cache[windowId] = {
        errors: [{
          method: d.method,
          url: d.url,
          statusLine: d.statusLine,
          ip: d.ip,
          type: d.type
        }],
        tabId: id
      };
    }
    update(windowId);
  }
}

tabs.on('close', tab => {
  Object.keys(cache).forEach(id => {
    if (cache[id].tabId === tab.id) {
      delete cache[id];
    }
  });
});
tabs.on('ready', tab => {
  Object.keys(cache).forEach(id => {
    if (cache[id].tabId === tab.id) {
      cache[id].errors = [];
      update(id);
    }
  });
});

WebRequest.onCompleted.addListener(observe);
unload.when((e) => {
  WebRequest.onCompleted.removeListener(observe);
  if (e === 'shutdown') {
    return;
  }
  for (let tab of tabs) {
    if (tab && tab.url && tab.url.startsWith(self.data.url(''))) {
      tab.close();
    }
  }
});

on('open-log', () => {
  tabs.open(self.data.url('log/index.html?id=') + tabs.activeTab.id);
});

// inject
pageMod.PageMod({
  include: self.data.url('log/index.html?id=*'),
  contentScriptFile: self.data.url('log/index.js'),
  onAttach: function (worker) {
    worker.port.on('fails', (id) => {
      Object.keys(cache).forEach(name => {
        if (cache[name].tabId === id) {
          worker.port.emit('response', cache[name].errors);
        }
      });
    });
  }
});
