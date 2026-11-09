'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeInput() {
  return {
    value: '',
    checked: false,
    dataset: {value: ''},
    dispatchEvent() {},
    focus() {}
  };
}

function loadManual() {
  const code = fs.readFileSync(path.join(__dirname, '../data/panel/components/manual-view.js'), 'utf8');
  let captured = null;
  const context = {
    console,
    HTMLElement: class {},
    Event: class {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options || {});
      }
    },
    app: {},
    proxy: {},
    window: {
      customElements: {
        define(name, ctor) {
          captured = ctor;
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  if (!captured) {
    throw new Error('manual-view constructor was not captured');
  }
  return captured;
}

function createManualFake(Ctor) {
  const elements = {};
  const radios = ['http', 'https', 'socks4', 'socks5'].map(value => ({
    value,
    checked: false,
    dispatched: null,
    dispatchEvent(e) {
      this.dispatched = e;
    }
  }));
  const shadowRoot = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = fakeInput();
      }
      return elements[id];
    },
    querySelector(selector) {
      const match = /\[value="([^"]+)"\]/.exec(selector);
      if (match) {
        return radios.find(r => r.value === match[1]) || null;
      }
      if (selector.includes(':checked')) {
        return radios.find(r => r.checked) || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const fake = Object.create(Ctor.prototype);
  fake.shadowRoot = shadowRoot;
  fake.reset = () => {};
  fake.buttons = () => {};
  return {fake, elements, radios};
}

function loadPac(options = {}) {
  let code = fs.readFileSync(path.join(__dirname, '../data/panel/components/pac-view.js'), 'utf8');
  code = code.replace(/^import .*$/m, '');
  let captured = null;
  const calls = {emit: [], storageSet: [], permissionRequests: [], fetches: []};
  const context = {
    console,
    clearTimeout,
    setTimeout,
    navigator: {userAgent: options.userAgent || ''},
    document: {
      createElement: () => ({appendChild() {}})
    },
    app: {
      emit: (...args) => calls.emit.push(args),
      storage: defaults => Promise.resolve(defaults || {})
    },
    chrome: {
      proxy: options.firefox ? {__isFirefoxPolyfill: true} : undefined,
      permissions: {
        request: async ({origins}) => {
          calls.permissionRequests.push(origins);
          return options.granted !== false;
        }
      },
      storage: {
        local: {
          set: (obj, cb) => {
            calls.storageSet.push(obj);
            if (typeof cb === 'function') {
              cb();
            }
          }
        }
      }
    },
    fetch: async url => {
      calls.fetches.push(url);
      return {
        ok: options.fetchOk !== false,
        text: async () => options.fetchText || 'function FindProxyForURL(url, host) { return "DIRECT"; }'
      };
    },
    HTMLElement: class {},
    Event: class {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options || {});
      }
    },
    window: {
      customElements: {
        define(name, ctor) {
          captured = ctor;
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  if (!captured) {
    throw new Error('pac-view constructor was not captured');
  }
  captured.testCalls = calls;
  return captured;
}

function createPacFake(Ctor) {
  const elements = {};
  let changeHandler = null;
  const makeEl = id => {
    const listeners = {};
    const el = {
      id,
      value: '',
      dataset: {value: ''},
      disabled: false,
      checked: false,
      textContent: '',
      listeners,
      addEventListener(type, cb) {
        (listeners[type] = listeners[type] || []).push(cb);
      },
      dispatchEvent() {},
      focus() {},
      click() {},
      appendChild() {}
    };
    return el;
  };
  const editor = makeEl('editor');
  editor.editor = {
    on(type, cb) {
      if (type === 'change') {
        changeHandler = cb;
      }
    }
  };
  editor.focus = () => {};
  elements['editor'] = editor;
  elements['apply-script'] = makeEl('apply-script');
  elements['apply-script'].disabled = true;
  const fake = Object.create(Ctor.prototype);
  fake.shadowRoot = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = makeEl(id);
      }
      return elements[id];
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return {
    fake,
    elements,
    getChangeHandler: () => changeHandler
  };
}

describe('manual-view update null guards (P0-5)', () => {
  it('does not throw when profile.rules is missing', () => {
    const Ctor = loadManual();
    const {fake, radios} = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(fake, {mode: 'fixed_servers'}));
    assert.equal(radios.find(r => r.value === 'http').checked, true);
  });

  it('does not throw when profile is null or undefined', () => {
    const Ctor = loadManual();
    for (const profile of [null, undefined]) {
      const {fake, radios} = createManualFake(Ctor);
      assert.doesNotThrow(() => Ctor.prototype.update.call(fake, profile));
      assert.equal(radios.find(r => r.value === 'http').checked, true);
    }
  });

  it('does not throw when rules is null or a rule entry is null', () => {
    const Ctor = loadManual();
    const first = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(first.fake, {rules: null}));
    const second = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(second.fake, {
      rules: {
        proxyForHttp: null,
        fallbackProxy: {host: '10.0.0.3', port: 3128, scheme: 'socks4'}
      }
    }));
    assert.equal(second.radios.find(r => r.value === 'socks4').checked, true);
    assert.equal(second.elements['fallback-host'].value, '10.0.0.3');
    assert.equal(second.elements['http-host'].value, '');
  });

  it('does not throw on unknown scheme and falls back to http', () => {
    const Ctor = loadManual();
    const {fake, elements, radios} = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(fake, {
      rules: {proxyForHttp: {host: '1.2.3.4', port: 8080, scheme: 'quic'}}
    }));
    assert.equal(radios.find(r => r.value === 'http').checked, true);
    assert.equal(elements['http-host'].value, '1.2.3.4');
    assert.equal(elements['http-port'].value, 8080);
  });

  it('does not throw on quote-injected scheme and falls back to http', () => {
    const Ctor = loadManual();
    const {fake, radios} = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(fake, {
      rules: {proxyForHttp: {host: '1.2.3.4', port: 8080, scheme: 'http"]][value="socks5'}}
    }));
    assert.equal(radios.find(r => r.value === 'http').checked, true);
    assert.equal(radios.find(r => r.value === 'socks5').checked, false);
  });

  it('does not throw when bypassList is not an array', () => {
    const Ctor = loadManual();
    const {fake, elements} = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(fake, {
      rules: {bypassList: 'localhost'}
    }));
    assert.equal(elements['bypass-list'].value, '');
  });

  it('preserves behaviour for a valid profile', () => {
    const Ctor = loadManual();
    const {fake, elements, radios} = createManualFake(Ctor);
    assert.doesNotThrow(() => Ctor.prototype.update.call(fake, {
      rules: {
        proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'socks5'},
        fallbackProxy: {host: '10.0.0.3', port: 3128, scheme: 'socks5'},
        bypassList: ['localhost', '127.0.0.1']
      },
      remoteDNS: true,
      noPrompt: false
    }, 'My Profile'));
    assert.equal(radios.find(r => r.value === 'socks5').checked, true);
    assert.equal(elements['http-host'].value, '10.0.0.1');
    assert.equal(elements['fallback-host'].value, '10.0.0.3');
    assert.equal(elements['bypass-list'].value, 'localhost, 127.0.0.1');
    assert.equal(elements['profile'].value, 'My Profile');
  });

  it('scheme getter falls back to http when no radio is checked', () => {
    const Ctor = loadManual();
    const {fake} = createManualFake(Ctor);
    assert.equal(fake.scheme, 'http');
  });
});

describe('pac-view null guards (P0-5)', () => {
  it('mode getter falls back to href when no radio is checked', () => {
    const Ctor = loadPac();
    const fake = Object.create(Ctor.prototype);
    fake.shadowRoot = {
      querySelector: () => null,
      getElementById: () => null
    };
    assert.equal(fake.mode, 'href');
    assert.equal(fake.get('href'), 'http://example.com/sample.pac');
    assert.equal(fake.get('script'), undefined);
    assert.doesNotThrow(() => fake.set('href', 'http://example.com/x.pac', true));
    assert.doesNotThrow(() => fake.set('script', 'function FindProxyForURL() {}', true));
  });

  it('mode getter returns the checked radio value', () => {
    const Ctor = loadPac();
    const fake = Object.create(Ctor.prototype);
    fake.shadowRoot = {
      querySelector: () => ({value: 'script'}),
      getElementById: () => null
    };
    assert.equal(fake.mode, 'script');
  });

  it('applyScript does not throw when editor is missing', () => {
    const Ctor = loadPac();
    const fake = Object.create(Ctor.prototype);
    fake.shadowRoot = {
      querySelector: () => null,
      getElementById: () => null
    };
    assert.doesNotThrow(() => fake.applyScript());
    assert.deepEqual(Ctor.testCalls.emit, []);
    assert.deepEqual(Ctor.testCalls.storageSet, []);
  });
});

describe('pac-view apply changes button', () => {
  it('applyScript stores and emits the script and marks it clean', () => {
    const Ctor = loadPac();
    const {fake, elements} = createPacFake(Ctor);
    const editor = elements['editor'];
    const btn = elements['apply-script'];
    editor.value = 'function FindProxyForURL() { return "DIRECT"; }';
    editor.dataset.value = 'old script';
    btn.disabled = false;
    fake.applyScript();
    assert.equal(Ctor.testCalls.emit.length, 1);
    assert.equal(Ctor.testCalls.emit[0][0], 'change-proxy');
    assert.equal(Ctor.testCalls.emit[0][1], 'pac_script');
    assert.equal(Ctor.testCalls.storageSet.length, 1);
    assert.equal(Ctor.testCalls.storageSet[0].script, editor.value);
    assert.equal(editor.dataset.value, editor.value);
    assert.equal(btn.disabled, true);
  });

  it('set(script) marks the loaded script as clean', () => {
    const Ctor = loadPac();
    const {fake, elements} = createPacFake(Ctor);
    const editor = elements['editor'];
    const btn = elements['apply-script'];
    btn.disabled = false;
    fake.set('script', 'function FindProxyForURL() {}', false);
    assert.equal(editor.value, 'function FindProxyForURL() {}');
    assert.equal(editor.dataset.value, 'function FindProxyForURL() {}');
    assert.equal(btn.disabled, true);
    assert.deepEqual(Ctor.testCalls.emit, []);
    assert.deepEqual(Ctor.testCalls.storageSet, []);
  });

  it('typing does not apply the script; only the button does', () => {
    const Ctor = loadPac();
    const {fake, elements, getChangeHandler} = createPacFake(Ctor);
    fake.connectedCallback();
    const editor = elements['editor'];
    const btn = elements['apply-script'];
    const changeHandler = getChangeHandler();
    assert.ok(changeHandler, 'editor change handler was registered');
    // clean state: button disabled, change with no edits keeps it disabled
    assert.equal(btn.disabled, true);
    changeHandler();
    assert.equal(btn.disabled, true);
    // dirty state: editing enables the button without emitting/storing
    editor.value += '\n// edited';
    changeHandler();
    assert.equal(btn.disabled, false);
    assert.deepEqual(Ctor.testCalls.emit, []);
    assert.deepEqual(Ctor.testCalls.storageSet, []);
    // clicking Apply Changes stores + emits and marks clean
    const clickListeners = btn.listeners['click'] || [];
    assert.equal(clickListeners.length, 1);
    clickListeners[0]();
    assert.equal(Ctor.testCalls.emit.length, 1);
    assert.equal(Ctor.testCalls.emit[0][0], 'change-proxy');
    assert.equal(Ctor.testCalls.emit[0][1], 'pac_script');
    assert.equal(Ctor.testCalls.storageSet.length, 1);
    assert.equal(Ctor.testCalls.storageSet[0].script, editor.value);
    assert.equal(btn.disabled, true);
    // typing back to the applied value disables the button again
    editor.value += '\n// more';
    changeHandler();
    assert.equal(btn.disabled, false);
    editor.value = editor.dataset.value;
    changeHandler();
    assert.equal(btn.disabled, true);
  });
});

describe('pac-view Firefox inline + file:// support', () => {
  const FFM_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';
  const flush = () => new Promise(resolve => setImmediate(resolve));

  it('in Firefox, file:// apply passes the URL through without fetching', async () => {
    const Ctor = loadPac({
      userAgent: FFM_UA,
      firefox: true,
      fetchText: 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.1:8080"; }'
    });
    const {fake, elements} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    await fake.apply();
    await flush();
    // Firefox extensions cannot fetch file:// URLs; the PAC loader
    // consumes the URL directly, so no permission or fetch happens.
    assert.deepEqual(Ctor.testCalls.permissionRequests, []);
    assert.deepEqual(Ctor.testCalls.fetches, []);
    assert.equal(elements['editor'].value, '');
    assert.ok(!elements['pac-2'] || !elements['pac-2'].checked);
    const lastPacSet = Ctor.testCalls.storageSet.find(s => s['last-pac']);
    assert.ok(lastPacSet, 'last-pac should be stored');
    assert.equal(lastPacSet['last-pac'], 'file:///Users/me/.firefox.pac');
    assert.equal(lastPacSet['pac-type'], 'url');
    assert.ok(Ctor.testCalls.emit.some(([name, val]) => name === 'change-proxy' && val === 'pac_script'));
    assert.ok(!Ctor.testCalls.emit.some(([name]) => name === 'notify'));
  });

  it('in Chrome, file:// apply fetches the file and applies it inline', async () => {
    const Ctor = loadPac({
      fetchText: 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.1:8080"; }'
    });
    const {fake, elements} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    await fake.apply();
    await flush();
    assert.equal(Ctor.testCalls.permissionRequests.length, 1);
    assert.equal(Ctor.testCalls.permissionRequests[0][0], 'file:///Users/me/.firefox.pac');
    assert.deepEqual(Ctor.testCalls.fetches, ['file:///Users/me/.firefox.pac']);
    assert.equal(elements['editor'].value, 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.1:8080"; }');
    assert.equal(elements['pac-2'].checked, true);
    const lastPacSet = Ctor.testCalls.storageSet.find(s => s['last-pac']);
    assert.ok(lastPacSet, 'last-pac should be stored');
    assert.equal(lastPacSet['last-pac'], 'file:///Users/me/.firefox.pac');
    assert.equal(lastPacSet['pac-type'], 'data');
    assert.ok(Ctor.testCalls.emit.some(([name, val]) => name === 'change-proxy' && val === 'pac_script'));
  });

  it('in Chrome, file:// apply with denied permission notifies and does not apply', async () => {
    const Ctor = loadPac({granted: false});
    const {fake} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    await fake.apply();
    await flush();
    assert.ok(Ctor.testCalls.emit.some(([name, msg]) => name === 'notify' && String(msg) === 'Permission denied'));
    assert.ok(!Ctor.testCalls.emit.some(([name]) => name === 'change-proxy'));
    assert.ok(!Ctor.testCalls.storageSet.some(s => s['last-pac']));
  });

  it('in Firefox, convert fetches an http PAC and switches to inline', async () => {
    const Ctor = loadPac({
      userAgent: FFM_UA,
      firefox: true,
      fetchText: 'function FindProxyForURL(url, host) { return "DIRECT"; }'
    });
    const {fake, elements} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'http://example.com/proxy.pac';
    await fake.convert();
    await flush();
    assert.deepEqual(Ctor.testCalls.fetches, ['http://example.com/proxy.pac']);
    assert.equal(elements['editor'].value, 'function FindProxyForURL(url, host) { return "DIRECT"; }');
    assert.equal(elements['pac-2'].checked, true);
    assert.ok(!Ctor.testCalls.emit.some(([name]) => name === 'notify'));
  });

  it('set(script, select) selects inline in Firefox', () => {
    const Ctor = loadPac({userAgent: FFM_UA, firefox: true});
    const {fake, elements} = createPacFake(Ctor);
    fake.set('script', 'function FindProxyForURL() {}', true);
    assert.equal(elements['pac-2'].checked, true);
    assert.ok(!elements['pac-1'] || !elements['pac-1'].checked);
  });

  it('in Firefox, reload for file:// uses the dummy swap without fetching', async () => {
    const Ctor = loadPac({
      userAgent: FFM_UA,
      firefox: true,
      fetchText: 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.2:8080"; }'
    });
    const {fake, elements} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    elements['editor'].value = 'old script';
    await fake.reload();
    await flush();
    // No fetch in Firefox; the dummy swap forces the PAC loader to
    // re-read the file, and the field is restored afterwards.
    assert.deepEqual(Ctor.testCalls.fetches, []);
    assert.deepEqual(Ctor.testCalls.permissionRequests, []);
    assert.equal(elements['editor'].value, 'old script');
    assert.equal(href.value, 'file:///Users/me/.firefox.pac');
    assert.equal(Ctor.testCalls.emit.filter(([name]) => name === 'change-proxy').length, 2);
  });

  it('in Chrome, reload for file:// re-reads the file and never leaves dummy.pac', async () => {
    const Ctor = loadPac({
      fetchText: 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.2:8080"; }'
    });
    const {fake, elements} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    elements['editor'].value = 'old script';
    await fake.reload();
    await flush();
    assert.deepEqual(Ctor.testCalls.fetches, ['file:///Users/me/.firefox.pac']);
    assert.equal(elements['editor'].value, 'function FindProxyForURL(url, host) { return "PROXY 10.0.0.2:8080"; }');
    assert.equal(href.value, 'file:///Users/me/.firefox.pac');
    assert.equal(Ctor.testCalls.emit.filter(([name]) => name === 'change-proxy').length, 1);
  });

  it('in Firefox, convert with a file:// URL does not fetch', async () => {
    const Ctor = loadPac({userAgent: FFM_UA, firefox: true});
    const {fake} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'file:///Users/me/.firefox.pac';
    await fake.convert();
    await flush();
    assert.deepEqual(Ctor.testCalls.fetches, []);
    assert.deepEqual(Ctor.testCalls.permissionRequests, []);
    assert.ok(Ctor.testCalls.emit.some(([name, msg]) => name === 'notify' && String(msg).includes('loaded directly')));
  });

  it('reload for an http URL still uses the dummy cache-buster transiently', async () => {
    const Ctor = loadPac({userAgent: FFM_UA, firefox: true});
    const {fake} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'http://example.com/proxy.pac';
    await fake.reload();
    assert.equal(href.value, 'http://example.com/proxy.pac');
    assert.equal(Ctor.testCalls.emit.filter(([name]) => name === 'change-proxy').length, 2);
  });

  it('pac tab layout fits the popup without scrolling', () => {
    const pacCode = fs.readFileSync(path.join(__dirname, '../data/panel/components/pac-view.js'), 'utf8');
    const panelCss = fs.readFileSync(path.join(__dirname, '../data/panel/index.css'), 'utf8');
    // Horizontal: grid children must be able to shrink below intrinsic
    // width so the URL row fits 600px in Firefox as well as Chrome.
    assert.ok(pacCode.includes('min-width: 0'), 'pac grid children need min-width: 0');
    assert.ok(panelCss.includes('box-sizing: border-box'), '.body needs border-box so padding fits 600px');
    assert.ok(panelCss.includes('width: 600px'), 'body must keep its fixed popup width');
    // vw/overflow guards collapse popup intrinsic sizing to min-content.
    assert.ok(!panelCss.includes('max-width: 100vw'), 'body must not cap width by vw in a popup');
    assert.ok(!panelCss.includes('overflow-x: hidden'), 'body must not hide overflow; it collapses popup width');
    // Vertical: the editor must leave the whole popup under its max
    // height; 300px pushed it over and caused a popup scrollbar.
    assert.ok(!pacCode.includes('height: 300px'), 'editor height must fit the popup without scrolling');
  });

  it('reload for an inline script emits once without the dummy URL', async () => {
    const Ctor = loadPac({userAgent: FFM_UA, firefox: true});
    const {fake} = createPacFake(Ctor);
    const href = fake.shadowRoot.getElementById('href');
    href.value = 'http://example.com/proxy.pac';
    fake.shadowRoot.querySelector = () => ({value: 'script'});
    await fake.reload();
    assert.equal(href.value, 'http://example.com/proxy.pac');
    assert.equal(Ctor.testCalls.emit.filter(([name]) => name === 'change-proxy').length, 1);
    assert.deepEqual(Ctor.testCalls.fetches, []);
  });
});
