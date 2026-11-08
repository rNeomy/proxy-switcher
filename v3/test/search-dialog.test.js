'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeListenerHost() {
  const listeners = {};
  return {
    listeners,
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
    },
    count(type) {
      return (listeners[type] || []).length;
    }
  };
}

function makeBtn(value, hidden = false) {
  const host = makeListenerHost();
  return {
    value,
    hidden,
    addEventListener: host.addEventListener,
    removeEventListener: host.removeEventListener,
    click: () => host.dispatch('click', {}),
    focus: () => {},
    _host: host
  };
}

function createElementMocks() {
  const dialogHost = makeListenerHost();
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() {
      if (!this.open) return;
      this.open = false;
      dialogHost.dispatch('close', {});
    },
    addEventListener: dialogHost.addEventListener,
    removeEventListener: dialogHost.removeEventListener,
    backdropClick() { dialogHost.dispatch('click', {target: dialog}); },
    _host: dialogHost
  };
  const consentHost = makeListenerHost();
  const consentDialog = {
    open: false,
    showModal() { this.open = true; },
    close() {
      if (!this.open) return;
      this.open = false;
      consentHost.dispatch('close', {});
    },
    addEventListener: consentHost.addEventListener,
    removeEventListener: consentHost.removeEventListener,
    backdropClick() { consentHost.dispatch('click', {target: consentDialog}); },
    _host: consentHost
  };

  let children = [];
  const logEl = {
    scrollTop: 1000,
    get clientHeight() { return 100; },
    get scrollHeight() { return children.length * 10; },
    get children() { return children; },
    get textContent() { return children.map(c => c.textContent).join('\n'); },
    set textContent(v) { if (v === '') children = []; },
    appendChild(c) { children.push(c); },
    removeChild(c) {
      const i = children.indexOf(c);
      if (i !== -1) children.splice(i, 1);
    },
    get firstChild() { return children[0]; }
  };

  const toggleBtn = makeBtn('Start');
  const closeBtn = makeBtn('Close');
  const consentTarget = {textContent: ''};
  const consentApplyBtn = makeBtn('Apply this');
  const consentFindBtn = makeBtn('Find new one');
  const consentAbortBtn = makeBtn('Abort');

  return {
    dialog,
    'consent-dialog': consentDialog,
    'search-log': logEl,
    'consent-target': consentTarget,
    'consent-apply': consentApplyBtn,
    'consent-find': consentFindBtn,
    'consent-abort': consentAbortBtn,
    'search-toggle': toggleBtn,
    'search-close': closeBtn
  };
}

function loadSearchDialog(context) {
  const code = fs.readFileSync(path.join(__dirname, '../data/panel/components/search-dialog.js'), 'utf8');
  const transformed = code.replace(/export\s*\{search,\s*SearchDialog\};?/, '');
  vm.createContext(context);
  vm.runInContext(transformed + '\n;globalThis.__SearchDialog = SearchDialog; globalThis.__search = search;', context);
  if (!context.__SearchDialog) {
    throw new Error('SearchDialog was not defined');
  }
  return context.__SearchDialog;
}

function createHarness({
  proxifly = ['1.2.3.4:1080'],
  monosans = ['5.6.7.8:1080'],
  outcomeByHost = {},
  pingDelay = 0,
  proxiflyFail = false,
  monosansFail = false
} = {}) {
  const events = [];
  const setCalls = [];
  const ports = [];
  const original = {mode: 'fixed_servers', rules: {proxyForHttp: {host: '9.9.9.9', port: 8080, scheme: 'http'}}};

  const windowHost = makeListenerHost();
  const fakeWindow = {
    addEventListener: windowHost.addEventListener,
    removeEventListener: windowHost.removeEventListener,
    dispatchBeforeUnload: () => windowHost.dispatch('beforeunload', {}),
    listenerCount: () => windowHost.count('beforeunload'),
    closed: false,
    close() { this.closed = true; }
  };

  const chromeMock = {
    proxy: {
      settings: {
        get(_query, callback) {
          callback({value: original});
        },
        set(config, callback) {
          const snapshot = JSON.parse(JSON.stringify(config));
          setCalls.push(snapshot);
          const label = `set:${snapshot.value.mode}:${snapshot.value.rules && snapshot.value.rules.proxyForHttp ? snapshot.value.rules.proxyForHttp.host : ''}`;
          events.push(`${label}:start`);
          const done = () => {
            events.push(`${label}:complete`);
            if (callback) callback();
          };
          setTimeout(done, 1);
        }
      }
    },
    runtime: {
      lastError: undefined,
      connect(opts) {
        const port = {
          name: opts && opts.name,
          messages: [],
          disconnected: false,
          postMessage(msg) { port.messages.push(msg); },
          disconnect() { port.disconnected = true; }
        };
        ports.push(port);
        return port;
      }
    }
  };

  function lastCandidateHost() {
    for (let i = setCalls.length - 1; i >= 0; i -= 1) {
      const host = setCalls[i].value.rules && setCalls[i].value.rules.proxyForHttp && setCalls[i].value.rules.proxyForHttp.host;
      if (host && host !== original.rules.proxyForHttp.host) {
        return host;
      }
    }
    return null;
  }

  const fetchMock = url => {
    const href = String(url);
    if (href.includes('proxifly')) {
      if (proxiflyFail) return Promise.reject(new Error('network down'));
      return Promise.resolve({ok: true, text: async () => proxifly.map(p => `socks5://${p}`).join('\n')});
    }
    if (href.includes('monosans')) {
      if (monosansFail) return Promise.reject(new Error('network down'));
      return Promise.resolve({ok: true, text: async () => monosans.join('\n')});
    }
    const host = lastCandidateHost();
    const outcome = outcomeByHost[host] || 'success';
    if (pingDelay > 0) {
      return new Promise((resolve, reject) => setTimeout(() => {
        if (outcome === 'fail') reject(new Error('ping failed'));
        else resolve({ok: true});
      }, pingDelay));
    }
    if (outcome === 'fail') {
      return Promise.reject(new Error('ping failed'));
    }
    return Promise.resolve({ok: true});
  };

  const fakeDocument = {
    body: {dataset: {}},
    createElement: () => ({textContent: ''}),
    getElementById: () => null
  };

  let lastElements = null;
  class MockHTMLElement {
    attachShadow() {
      const elements = createElementMocks();
      lastElements = elements;
      const shadow = {
        innerHTML: '',
        getElementById(id) { return elements[id] || null; }
      };
      this.shadowRoot = shadow;
      this.__elements = elements;
      return shadow;
    }
  }

  const registry = {};
  const fakeCustomElements = {
    define(tag, cls) { registry[tag] = cls; }
  };

  const context = {
    console,
    chrome: chromeMock,
    fetch: fetchMock,
    window: fakeWindow,
    document: fakeDocument,
    HTMLElement: MockHTMLElement,
    customElements: fakeCustomElements,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Promise,
    Error,
    Math: {floor: Math.floor, random: () => 0.999}
  };
  const SearchDialog = loadSearchDialog(context);
  assert.equal(registry['search-dialog'], SearchDialog, 'component should register as search-dialog');
  const el = new SearchDialog();
  const elements = lastElements;
  const logEl = elements['search-log'];
  const dialog = elements.dialog;
  const consentDialog = elements['consent-dialog'];
  const consentTarget = elements['consent-target'];
  const toggleBtn = elements['search-toggle'];
  const closeBtn = elements['search-close'];
  const consentApplyBtn = elements['consent-apply'];
  const consentFindBtn = elements['consent-find'];
  const consentAbortBtn = elements['consent-abort'];

  return {
    el, dialog, consentDialog, consentTarget, consentApplyBtn, consentFindBtn, consentAbortBtn,
    logEl, toggleBtn, closeBtn, fakeDocument,
    cancelBtn: toggleBtn, confirmBtn: consentApplyBtn, applyBtn: consentApplyBtn,
    setCalls, events, original, window: fakeWindow, ports,
    get port() { return ports[ports.length - 1] || null; },
    logText: () => logEl.textContent,
    candidate(host) {
      return setCalls.some(config => config.value.rules && config.value.rules.proxyForHttp && config.value.rules.proxyForHttp.host === host);
    },
    restored() {
      return setCalls.some(config => JSON.stringify(config.value) === JSON.stringify(original));
    },
    hasDirect() {
      return setCalls.some(config => config.value.mode === 'direct');
    },
    async waitFor(condition, timeout = 8000) {
      const start = Date.now();
      while (!condition()) {
        if (Date.now() - start > timeout) {
          throw new Error(`waitFor timed out, events: ${events.join(', ')}, log: ${logEl.textContent}`);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
  };
}

describe('search-dialog component', () => {
  it('loops transient verify until valid, restores between attempts, then stacked consent apply keeps candidate', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080', '2.2.2.2:1080'],
      monosans: ['3.3.3.3:1080'],
      outcomeByHost: {'1.1.1.1': 'fail', '2.2.2.2': 'fail', '3.3.3.3': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.dialog.open === true);
    await harness.waitFor(() => harness.logText().includes('attempt 1: transient verify'));
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.equal(harness.consentTarget.textContent, '3.3.3.3:1080', 'bold target should be ip:port');
    assert.ok(harness.candidate('3.3.3.3'));
    assert.ok(harness.restored());
    assert.equal(harness.hasDirect(), true, 'search switches to direct before fetching sources');
    assert.match(harness.logText(), /sources ready: proxifly=2 monosans=1 \(shuffled\)/);

    harness.consentApplyBtn.click();
    const result = await started;
    assert.ok(result, 'apply should resolve with the valid proxy');
    assert.equal(result.info.host, '3.3.3.3');
    const lastSet = harness.setCalls[harness.setCalls.length - 1];
    assert.equal(lastSet.value.rules.proxyForHttp.host, '3.3.3.3');
    assert.match(harness.logText(), /valid proxy found from monosans SOCKS5/);
    assert.match(harness.logText(), /candidate kept/);
    assert.equal(harness.consentDialog.open, false);
    assert.equal(harness.dialog.open, false);
    assert.equal(harness.window.listenerCount(), 0);
    assert.ok(harness.port && harness.port.disconnected);
    assert.equal(harness.port.messages[harness.port.messages.length - 1].type, 'search-complete');
  });

  it('round-robins sources and logs the source per attempt', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080'],
      monosans: ['2.2.2.2:1080'],
      outcomeByHost: {'1.1.1.1': 'fail', '2.2.2.2': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.match(harness.logText(), /attempt 1: source (proxifly|monosans) SOCKS5 trying/);
    assert.match(harness.logText(), /attempt 2: source (proxifly|monosans) SOCKS5 trying/);
    harness.consentAbortBtn.click();
    const result = await started;
    assert.equal(result, null);
  });

  it('skips duplicates already tried from another source', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080'],
      monosans: ['1.1.1.1:1080', '4.4.4.4:1080'],
      outcomeByHost: {'1.1.1.1': 'fail', '4.4.4.4': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.match(harness.logText(), /skipping duplicate 1\.1\.1\.1:1080/);
    harness.consentAbortBtn.click();
    await started;
  });

  it('find new one discards valid and continues to next valid', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080', '2.2.2.2:1080'],
      monosans: [],
      outcomeByHost: {'1.1.1.1': 'success', '2.2.2.2': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.equal(harness.consentTarget.textContent, '1.1.1.1:1080');
    harness.consentFindBtn.click();
    await harness.waitFor(() => harness.consentDialog.open === true && harness.consentTarget.textContent === '2.2.2.2:1080', 8000);
    assert.match(harness.logText(), /find new one requested/);
    assert.equal(harness.dialog.open, true, 'underlying dialog stays open while consent stacked');
    harness.consentApplyBtn.click();
    const result = await started;
    assert.equal(result.info.host, '2.2.2.2');
  });

  it('abort restores original, closes both dialogs and closes window', async () => {
    const harness = createHarness({proxifly: ['1.2.3.4:1080'], monosans: [], outcomeByHost: {'1.2.3.4': 'success'}});
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    const setsBefore = harness.setCalls.length;
    harness.consentAbortBtn.click();
    const result = await started;
    assert.equal(result, null);
    assert.match(harness.logText(), /abort clicked/);
    assert.match(harness.logText(), /abort: restoring original/);
    assert.ok(harness.restored());
    assert.equal(harness.consentDialog.open, false);
    assert.equal(harness.dialog.open, false);
    assert.equal(harness.window.closed, true, 'abort should close the popup window');
    assert.ok(harness.port && harness.port.disconnected);
  });

  it('stop during searching aborts the loop and keeps dialog open for log review', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080'],
      monosans: ['2.2.2.2:1080'],
      outcomeByHost: {'1.1.1.1': 'fail', '2.2.2.2': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.logText().includes('attempt 1: transient verify'));
    await harness.waitFor(() => harness.logText().includes('candidate invalid'));
    assert.equal(harness.toggleBtn.value, 'Stop');
    harness.toggleBtn.click();
    const result = await started;
    assert.equal(result, null);
    assert.match(harness.logText(), /stop clicked/);
    assert.equal(harness.dialog.open, true);
    assert.equal(harness.toggleBtn.value, 'Start');
    assert.ok(harness.port && harness.port.disconnected);
    harness.closeBtn.click();
    assert.equal(harness.dialog.open, false);
    assert.match(harness.logText(), /close clicked/);
  });

  it('consent backdrop dismiss finds a new one and keeps searching', async () => {
    const harness = createHarness({
      proxifly: ['1.2.3.4:1080', '5.6.7.8:1080'],
      monosans: [],
      outcomeByHost: {'1.2.3.4': 'success', '5.6.7.8': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.equal(harness.consentTarget.textContent, '1.2.3.4:1080');
    harness.consentDialog.backdropClick();
    await harness.waitFor(() => harness.consentDialog.open === true && harness.consentTarget.textContent === '5.6.7.8:1080', 8000);
    assert.match(harness.logText(), /consent backdrop click/);
    harness.consentAbortBtn.click();
    const result = await started;
    assert.equal(result, null);
    assert.equal(harness.window.closed, true);
  });

  it('consent escape close finds a new one', async () => {
    const harness = createHarness({
      proxifly: ['1.2.3.4:1080', '5.6.7.8:1080'],
      monosans: [],
      outcomeByHost: {'1.2.3.4': 'success', '5.6.7.8': 'success'}
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    harness.consentDialog.close();
    await harness.waitFor(() => harness.consentTarget.textContent === '5.6.7.8:1080' && harness.consentDialog.open === true, 8000);
    assert.match(harness.logText(), /consent dialog closed/);
    harness.consentAbortBtn.click();
    await started;
  });

  it('one source failing still searches via the other', async () => {
    const harness = createHarness({
      proxifly: ['1.1.1.1:1080'],
      monosans: ['2.2.2.2:1080'],
      outcomeByHost: {'2.2.2.2': 'success'},
      proxiflyFail: true
    });
    const started = harness.el.start();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.match(harness.logText(), /source proxifly SOCKS5: fetch failed/);
    assert.match(harness.logText(), /source monosans SOCKS5: fetched 1 proxies/);
    harness.consentAbortBtn.click();
    await started;
  });

  it('all sources failing returns null without applying', async () => {
    const harness = createHarness({proxiflyFail: true, monosansFail: true});
    const result = await harness.el.start();
    assert.equal(result, null);
    assert.match(harness.logText(), /all sources failed/);
    assert.equal(harness.candidate('1.2.3.4'), false);
  });

  it('guard port connects with search-start before direct fetch', async () => {
    const harness = createHarness({proxifly: ['1.2.3.4:1080'], monosans: [], pingDelay: 80});
    harness.el.start();
    await harness.waitFor(() => harness.candidate('1.2.3.4'));
    assert.ok(harness.port);
    assert.equal(harness.port.name, 'search-guard');
    assert.equal(harness.port.messages[0].type, 'search-start');
    assert.deepEqual(harness.port.messages[0].value, harness.original);
    assert.equal(harness.port.disconnected, false);
    assert.match(harness.logText(), /guard port connected/);
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    harness.consentAbortBtn.click();
    await harness.waitFor(() => harness.port && harness.port.disconnected);
  });

  it('log is an append-only scrollable history capped at 400 entries', async () => {
    const harness = createHarness({});
    for (let i = 0; i < 410; i += 1) {
      harness.el.log(`entry ${i}`);
    }
    assert.equal(harness.logEl.children.length, 400);
    assert.match(harness.logText(), /entry 409/);
    assert.doesNotMatch(harness.logText(), /entry 0/);
  });

  it('odd log lines have zebra styling', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../data/panel/components/search-dialog.js'), 'utf8');
    assert.match(code, /#search-log > div:nth-child\(odd\)/);
    assert.match(code, /#consent-target/);
    assert.match(code, /Apply this/);
  });

  it('close during searching stops and closes the dialog', async () => {
    const harness = createHarness({proxifly: ['1.1.1.1:1080'], monosans: ['2.2.2.2:1080'], outcomeByHost: {'1.1.1.1': 'fail'}});
    const started = harness.el.start();
    await harness.waitFor(() => harness.dialog.open === true);
    harness.closeBtn.click();
    const result = await started;
    assert.equal(result, null);
    assert.equal(harness.dialog.open, false);
    assert.match(harness.logText(), /close clicked/);
  });

  it('openDialog opens idle without starting search; Start button begins search', async () => {
    const harness = createHarness({proxifly: ['1.2.3.4:1080'], monosans: []});
    harness.el.openDialog();
    assert.equal(harness.dialog.open, true);
    assert.equal(harness.toggleBtn.value, 'Start');
    assert.equal(harness.setCalls.length, 0);
    assert.equal(harness.ports.length, 0);
    assert.match(harness.logText(), /dialog opened \(idle, press Start\)/);
    harness.toggleBtn.click();
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    assert.match(harness.logText(), /search started/);
    harness.consentAbortBtn.click();
    await harness.waitFor(() => harness.window.closed === true, 8000);
  });

  it('sets searching flag during search and clears it after', async () => {
    const harness = createHarness({proxifly: ['1.2.3.4:1080'], monosans: [], pingDelay: 40});
    harness.el.openDialog();
    assert.notEqual(harness.fakeDocument.body.dataset.searching, 'true');
    const started = harness.el.start();
    await harness.waitFor(() => harness.logText().includes('attempt 1: transient verify'));
    assert.equal(harness.fakeDocument.body.dataset.searching, 'true');
    await harness.waitFor(() => harness.consentDialog.open === true, 8000);
    harness.toggleBtn.click();
    await started;
    assert.equal(harness.fakeDocument.body.dataset.searching, 'false');
  });

  it('button label renamed to Find Free Socks Proxy and UI suppress predicates exist', async () => {
    const manual = fs.readFileSync(path.join(__dirname, '../data/panel/components/manual-view.js'), 'utf8');
    assert.match(manual, /value="Find Free Socks Proxy" id="search"/);
    assert.match(manual, /<span>Search<\/span>/);
    const ui = fs.readFileSync(path.join(__dirname, '../data/panel/ui.js'), 'utf8');
    assert.match(ui, /dataset\.searching/);
    const proxy = fs.readFileSync(path.join(__dirname, '../data/panel/proxy.js'), 'utf8');
    assert.match(proxy, /dataset\.searching/);
  });
});
