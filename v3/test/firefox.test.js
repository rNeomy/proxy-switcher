'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadShim({nativeValue = {proxyType: 'system'}, levelOfControl = 'controlled', warns = []} = {}) {
  const code = fs.readFileSync(path.join(__dirname, '../firefox.js'), 'utf8');
  let native = nativeValue;
  const changeHandlers = [];
  const nativeSettings = {
    async get() {
      return {value: JSON.parse(JSON.stringify(native)), levelOfControl};
    },
    async set({value}) {
      native = JSON.parse(JSON.stringify(value));
      changeHandlers.slice().forEach(fn => {
        try {
          fn({value: JSON.parse(JSON.stringify(native)), levelOfControl});
        }
        catch (e) {}
      });
      return true;
    },
    async clear() {
      native = {proxyType: 'system'};
      return true;
    },
    onChange: {
      addListener(fn) {
        changeHandlers.push(fn);
      }
    }
  };
  const nativeRoot = {
    settings: nativeSettings,
    onRequest: {},
    onError: {
      addListener() {}
    }
  };
  // Firefox shape: chrome.proxy exists but has onRequest/onError, no onProxyError.
  const chrome = {runtime: {}, proxy: nativeRoot};
  const browser = {proxy: nativeRoot};
  const sandboxConsole = {
    warn(msg) {
      warns.push(String(msg));
    },
    error() {},
    log() {},
    info() {}
  };
  const context = {
    chrome,
    browser,
    console: sandboxConsole,
    atob: global.atob,
    btoa: global.btoa,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    JSON,
    Number,
    String,
    Math
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  if (!chrome.proxy || !chrome.proxy.__isFirefoxPolyfill) {
    throw new Error('firefox.js did not install the shim');
  }
  return {
    chrome,
    warns,
    getNative: () => JSON.parse(JSON.stringify(native)),
    setNative: v => {
      native = JSON.parse(JSON.stringify(v));
    },
    async get() {
      const cfg = await chrome.proxy.settings.get({});
      return cfg.value;
    },
    async set(value) {
      return chrome.proxy.settings.set({value});
    }
  };
}

describe('firefox shim — https scheme preservation', () => {
  it('round-trips https-scheme singleProxy as https (not http)', async () => {
    const h = loadShim();
    await h.set({mode: 'fixed_servers', rules: {singleProxy: {host: '10.0.0.1', port: 8443, scheme: 'https'}}});
    const value = await h.get();
    assert.equal(value.rules.singleProxy.scheme, 'https');
    assert.equal(value.rules.singleProxy.host, '10.0.0.1');
    assert.equal(value.rules.singleProxy.port, 8443);
  });

  it('round-trips https per-protocol slots', async () => {
    const h = loadShim();
    await h.set({
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'https'},
        proxyForHttps: {host: '10.0.0.2', port: 8443, scheme: 'https'},
        proxyForFtp: {host: '10.0.0.3', port: 21, scheme: 'https'}
      }
    });
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.scheme, 'https');
    assert.equal(value.rules.proxyForHttps.scheme, 'https');
    assert.equal(value.rules.proxyForFtp.scheme, 'https');
  });

  it('parses https:// prefix in native values', async () => {
    const h = loadShim({nativeValue: {proxyType: 'manual', http: 'https://10.0.0.1:8443', httpProxyAll: false}});
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.scheme, 'https');
    assert.equal(value.rules.proxyForHttp.host, '10.0.0.1');
    assert.equal(value.rules.proxyForHttp.port, 8443);
  });
});

describe('firefox shim — mixed SOCKS collapse is explicit', () => {
  it('keeps a deterministic SOCKS winner and warns instead of silently dropping', async () => {
    const warns = [];
    const h = loadShim({warns});
    await h.set({
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: {host: '10.0.0.1', port: 1080, scheme: 'socks5'},
        proxyForHttps: {host: '10.0.0.2', port: 1080, scheme: 'socks5'},
        fallbackProxy: {host: '10.0.0.3', port: 1080, scheme: 'socks4'}
      }
    });
    assert.ok(warns.some(w => /multiple distinct SOCKS/.test(w)), 'should warn about mixed SOCKS, warns: ' + warns.join('\n'));
    const native = h.getNative();
    // fallback wins (first in precedence) — single socks slot
    assert.equal(native.socks, '10.0.0.3:1080');
    assert.equal(native.socksVersion, 4);
    const value = await h.get();
    // Input shape was per-protocol, so socks-only reads back per-protocol.
    assert.equal(value.rules.proxyForHttp.host, '10.0.0.3');
    assert.equal(value.rules.proxyForHttp.scheme, 'socks4');
  });

  it('mixed http + socks is representable without dropping the http slot', async () => {
    const h = loadShim({warns: []});
    await h.set({
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'http'},
        proxyForHttps: {host: '10.0.0.2', port: 1080, scheme: 'socks5'}
      }
    });
    const native = h.getNative();
    assert.equal(native.http, '10.0.0.1:8080');
    assert.equal(native.socks, '10.0.0.2:1080');
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.host, '10.0.0.1');
    assert.equal(value.rules.fallbackProxy.host, '10.0.0.2');
  });
});

describe('firefox shim — single-proxy round-trip identity', () => {
  it('singleProxy round-trips as singleProxy, not three rules', async () => {
    const h = loadShim();
    const input = {mode: 'fixed_servers', rules: {singleProxy: {host: '10.0.0.1', port: 8080, scheme: 'http'}}};
    await h.set(input);
    assert.equal(h.getNative().httpProxyAll, true);
    const value = await h.get();
    assert.deepEqual(JSON.parse(JSON.stringify(value.rules)), JSON.parse(JSON.stringify(input.rules)));
    assert.equal(value.rules.proxyForHttp, undefined);
  });

  it('sparse proxyForHttp-only stays sparse', async () => {
    const h = loadShim();
    const input = {mode: 'fixed_servers', rules: {proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'http'}}};
    await h.set(input);
    const native = h.getNative();
    assert.equal(native.httpProxyAll, false);
    assert.equal(native.http, '10.0.0.1:8080');
    const value = await h.get();
    assert.deepEqual(JSON.parse(JSON.stringify(value.rules)), JSON.parse(JSON.stringify(input.rules)));
  });

  it('explicit three-protocol shape survives (not collapsed to singleProxy)', async () => {
    const h = loadShim();
    const input = {
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'http'},
        proxyForHttps: {host: '10.0.0.1', port: 8080, scheme: 'http'},
        proxyForFtp: {host: '10.0.0.1', port: 8080, scheme: 'http'}
      }
    };
    await h.set(input);
    assert.equal(h.getNative().httpProxyAll, false, 'uniform hosts must not flip to httpProxyAll');
    assert.equal(h.getNative().ssl, '10.0.0.1:8080');
    const value = await h.get();
    assert.deepEqual(JSON.parse(JSON.stringify(value.rules)), JSON.parse(JSON.stringify(input.rules)));
  });

  it('fallback-only http reads back as singleProxy (semantic twin), fallback-only socks as fallbackProxy', async () => {
    const h1 = loadShim();
    await h1.set({mode: 'fixed_servers', rules: {fallbackProxy: {host: '10.0.0.9', port: 3128, scheme: 'http'}}});
    const v1 = await h1.get();
    assert.equal(v1.rules.singleProxy.host, '10.0.0.9');
    const h2 = loadShim();
    await h2.set({mode: 'fixed_servers', rules: {fallbackProxy: {host: '10.0.0.9', port: 1080, scheme: 'socks5'}}});
    const v2 = await h2.get();
    assert.equal(v2.rules.fallbackProxy.host, '10.0.0.9');
    assert.equal(v2.rules.fallbackProxy.scheme, 'socks5');
  });

  it('explicit three-equal SOCKS (search.convert shape) round-trips as three, not fallback', async () => {
    const h = loadShim();
    const socks = {host: '10.0.0.5', port: 1080, scheme: 'socks5'};
    await h.set({mode: 'fixed_servers', rules: {proxyForHttp: {...socks}, proxyForHttps: {...socks}, proxyForFtp: {...socks}}});
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.host, '10.0.0.5');
    assert.equal(value.rules.proxyForHttps.host, '10.0.0.5');
    assert.equal(value.rules.proxyForFtp.host, '10.0.0.5');
    assert.equal(value.rules.fallbackProxy, undefined);
  });
});

describe('firefox shim — user:pass@host:port parsing', () => {
  it('parses user:pass@host:port native values to clean host/port', async () => {
    const h = loadShim({nativeValue: {proxyType: 'manual', http: 'user:pass@10.0.0.1:8080', httpProxyAll: false}});
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.host, '10.0.0.1');
    assert.equal(value.rules.proxyForHttp.port, 8080);
  });

  it('parses user:pass@[IPv6]:port', async () => {
    const h = loadShim({nativeValue: {proxyType: 'manual', http: 'user:p%40ss@[2001:db8::1]:1080', httpProxyAll: false}});
    const value = await h.get();
    assert.equal(value.rules.proxyForHttp.host, '2001:db8::1');
    assert.equal(value.rules.proxyForHttp.port, 1080);
  });

  it('strips credentials on write (Chrome host never carries userinfo to Firefox)', async () => {
    const h = loadShim({warns: []});
    await h.set({mode: 'fixed_servers', rules: {proxyForHttp: {host: 'user:pass@10.0.0.1', port: 8080, scheme: 'http'}}});
    assert.equal(h.getNative().http, '10.0.0.1:8080');
  });
});

describe('firefox shim — large inline PAC guards', () => {
  it('rejects oversized inline PAC on set via lastError', async () => {
    const h = loadShim();
    const big = 'function FindProxyForURL() { return "PROXY 10.0.0.1:8080"; }' + '/*' + 'x'.repeat(70 * 1024) + '*/';
    await assert.rejects(
      h.chrome.proxy.settings.set({value: {mode: 'pac_script', pacScript: {data: big}}}),
      /too large/
    );
    assert.match(String(h.chrome.runtime.lastError && h.chrome.runtime.lastError.message || ''), /too large/);
  });

  it('small inline PAC round-trips as data', async () => {
    const h = loadShim();
    const pac = 'function FindProxyForURL(url, host) { return "DIRECT"; }';
    await h.set({mode: 'pac_script', pacScript: {data: pac}});
    const value = await h.get();
    assert.equal(value.pacScript.data, pac);
  });

  it('file:// PAC URL passes through as autoConfigUrl and reads back as url', async () => {
    const h = loadShim();
    await h.set({mode: 'pac_script', pacScript: {url: 'file:///Users/me/.firefox.pac'}});
    assert.equal(h.getNative().proxyType, 'autoConfig');
    assert.equal(h.getNative().autoConfigUrl, 'file:///Users/me/.firefox.pac');
    const value = await h.get();
    assert.equal(value.pacScript.url, 'file:///Users/me/.firefox.pac');
    assert.equal(value.pacScript.data, undefined);
  });

  it('oversized data-URL on read falls back to url form, never raw url as data', async () => {
    const big = 'x'.repeat(70 * 1024);
    const url = 'data:application/x-ns-proxy-autoconfig,' + encodeURIComponent(big);
    const h = loadShim({nativeValue: {proxyType: 'autoConfig', autoConfigUrl: url}});
    const value = await h.get();
    assert.equal(value.pacScript.url, url);
    assert.equal(value.pacScript.data, undefined);
  });

  it('undecodable data-URL falls back to url form', async () => {
    const bad = 'data:application/x-ns-proxy-autoconfig,%ZZZ';
    const h = loadShim({nativeValue: {proxyType: 'autoConfig', autoConfigUrl: bad}});
    const value = await h.get();
    assert.equal(value.pacScript.url, bad);
    assert.equal(value.pacScript.data, undefined);
  });
});

describe('firefox shim — unaffected modes still work', () => {
  it('direct/system round-trip', async () => {
    const h = loadShim();
    await h.set({mode: 'direct'});
    assert.equal((await h.get()).mode, 'direct');
    await h.set({mode: 'system'});
    assert.equal((await h.get()).mode, 'system');
  });
});
