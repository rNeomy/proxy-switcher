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

function loadPac() {
  let code = fs.readFileSync(path.join(__dirname, '../data/panel/components/pac-view.js'), 'utf8');
  code = code.replace(/^import .*$/m, '');
  let captured = null;
  const calls = {emit: [], storageSet: []};
  const context = {
    console,
    clearTimeout,
    setTimeout,
    navigator: {userAgent: ''},
    document: {
      createElement: () => ({})
    },
    app: {
      emit: (...args) => calls.emit.push(args),
      storage: defaults => Promise.resolve(defaults || {})
    },
    chrome: {
      storage: {
        local: {
          set: obj => calls.storageSet.push(obj)
        }
      }
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
