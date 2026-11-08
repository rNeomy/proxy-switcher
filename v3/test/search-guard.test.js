'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeListenerHost() {
  const listeners = {};
  return {
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const index = list.indexOf(fn);
      if (index !== -1) {
        list.splice(index, 1);
      }
    },
    dispatch(type, event) {
      (listeners[type] || []).slice().forEach(fn => fn(event));
    }
  };
}

function createHarness() {
  const setCalls = [];
  const connectListeners = [];
  const chromeMock = {
    i18n: {getMessage: () => ''},
    storage: {
      local: {
        get: async () => ({}),
        set: () => {}
      },
      onChanged: {addListener: () => {}}
    },
    action: {
      setBadgeText: () => {},
      setIcon: () => {},
      setTitle: (_opts, cb) => { if (cb) cb(); },
      setBadgeBackgroundColor: () => {}
    },
    proxy: {
      settings: {
        get(_query, callback) { callback({value: {mode: 'direct'}}); },
        set(config, callback) {
          setCalls.push(JSON.parse(JSON.stringify(config)));
          if (callback) callback();
        },
        onChange: {addListener: () => {}}
      }
    },
    runtime: {
      lastError: undefined,
      getManifest: () => ({name: 'test', version: '1', homepage_url: ''}),
      onInstalled: {addListener: () => {}},
      onStartup: {addListener: () => {}},
      onMessage: {addListener: () => {}},
      onConnect: {
        addListener(fn) { connectListeners.push(fn); }
      },
      setUninstallURL: () => {}
    },
    management: {getSelf: cb => cb({installType: 'normal'})}
  };

  const selfObj = {};
  const context = {
    console,
    self: selfObj,
    navigator: {webdriver: true},
    chrome: chromeMock,
    OffscreenCanvas: class { getContext() { return {fillRect: () => {}, getImageData: () => ({})}; } },
    Path2D: class {},
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Promise
  };
  const code = fs.readFileSync(path.join(__dirname, '../worker.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(code, context);

  function connect(name) {
    const messageHost = makeListenerHost();
    const disconnectHost = makeListenerHost();
    const port = {
      name,
      postMessage(msg) { messageHost.dispatch('message', msg); },
      addMessageListener(fn) { messageHost.addEventListener('message', fn); },
      // chrome Port uses onMessage.addListener; expose same shape as worker expects.
      onMessage: {addListener: fn => messageHost.addEventListener('message', fn)},
      onDisconnect: {addListener: fn => disconnectHost.addEventListener('disconnect', fn)},
      disconnect() { disconnectHost.dispatch('disconnect', {}); }
    };
    // Worker calls port.onMessage.addListener, so port.postMessage must reach it:
    // route through the same host the worker subscribed to.
    connectListeners.forEach(fn => fn({
      name: port.name,
      onMessage: port.onMessage,
      onDisconnect: port.onDisconnect
    }));
    return port;
  }

  return {setCalls, connect};
}

describe('search guard worker restore', () => {
  it('restores the pre-search value when the port disconnects without complete', async () => {
    const harness = createHarness();
    const original = {mode: 'fixed_servers', rules: {proxyForHttp: {host: '9.9.9.9', port: 8080, scheme: 'http'}}};
    const port = harness.connect('search-guard');
    port.postMessage({type: 'search-start', value: original});
    // Simulate mid-search global change.
    harness.setCalls.length = 0;
    port.disconnect();
    assert.equal(harness.setCalls.length, 1);
    assert.deepEqual(harness.setCalls[0].value, original);
  });

  it('does not restore after search-complete disconnect', async () => {
    const harness = createHarness();
    const original = {mode: 'fixed_servers', rules: {proxyForHttp: {host: '9.9.9.9', port: 8080, scheme: 'http'}}};
    const port = harness.connect('search-guard');
    port.postMessage({type: 'search-start', value: original});
    port.postMessage({type: 'search-complete', succeeded: true});
    harness.setCalls.length = 0;
    port.disconnect();
    assert.equal(harness.setCalls.length, 0);
  });

  it('ignores ports without the search-guard name', async () => {
    const harness = createHarness();
    const port = harness.connect('other-port');
    port.postMessage({type: 'search-start', value: {mode: 'direct'}});
    harness.setCalls.length = 0;
    port.disconnect();
    assert.equal(harness.setCalls.length, 0);
  });
});
