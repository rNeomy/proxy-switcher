'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCompare() {
  const code = fs.readFileSync(path.join(__dirname, '../data/panel/compare.js'), 'utf8');
  const context = {app: {}, console};
  vm.createContext(context);
  vm.runInContext(code, context);
  if (typeof context.app.compare !== 'function') {
    throw new Error('app.compare was not defined by compare.js');
  }
  return context.app.compare.bind(context.app);
}

const compare = loadCompare();

const baseProfile = () => ({
  value: {
    mode: 'fixed_servers',
    rules: {
      proxyForHttp: {host: '10.0.0.1', port: 8080, scheme: 'http'},
      proxyForHttps: {host: '10.0.0.1', port: 8443, scheme: 'http'},
      proxyForFtp: {host: '10.0.0.2', port: 21, scheme: 'http'},
      fallbackProxy: {host: '10.0.0.3', port: 3128, scheme: 'http'},
      bypassList: ['localhost', '127.0.0.1']
    },
    remoteDNS: true,
    noPrompt: false
  }
});

describe('app.compare', () => {
  it('returns true for equal profiles', () => {
    assert.equal(compare(baseProfile(), baseProfile()), true);
  });

  it('returns false when only a later nested rule differs (no early return)', () => {
    const a = baseProfile();
    const b = baseProfile();
    b.value.rules.proxyForFtp.port = 9999;
    assert.equal(compare(a, b), false);
  });

  it('returns false when only fallback differs (not first key)', () => {
    const a = baseProfile();
    const b = baseProfile();
    b.value.rules.fallbackProxy.host = '10.9.9.9';
    assert.equal(compare(a, b), false);
  });

  it('returns false for same length but different keys', () => {
    assert.equal(compare({a: 1, b: 2}, {a: 1, c: 2}), false);
    assert.equal(compare({a: 1, b: 2}, {a: 1, b: 2, c: 2}), false);
  });

  it('uses exact-length array comparison (subset vs superset are unequal)', () => {
    assert.equal(compare({bypassList: ['localhost']}, {bypassList: ['localhost', '127.0.0.1']}), false);
    assert.equal(compare({bypassList: ['localhost', '127.0.0.1']}, {bypassList: ['localhost']}), false);
    assert.equal(compare({bypassList: ['localhost', '127.0.0.1']}, {bypassList: ['localhost', '127.0.0.1']}), true);
  });

  it('is order-sensitive for arrays', () => {
    assert.equal(compare({bypassList: ['a', 'b']}, {bypassList: ['b', 'a']}), false);
  });

  it('does not throw on missing/null keys and values', () => {
    assert.equal(compare(null, {}), false);
    assert.equal(compare({}, null), false);
    assert.equal(compare(null, null), true);
    assert.equal(compare(undefined, {}), false);
    assert.equal(compare({a: null}, {a: {}}), false);
    assert.equal(compare({a: {}}, {a: null}), false);
    assert.equal(compare({value: {rules: null}}, {value: {rules: {}}}), false);
    assert.equal(compare({value: {}}, {value: {rules: {}}}), false);
  });

  it('guards type mismatches', () => {
    assert.equal(compare({a: {}}, {a: []}), false);
    assert.equal(compare({a: 'x'}, {a: 1}), false);
    assert.equal(compare({a: 1}, {a: 'x'}), false);
    assert.equal(compare({a: []}, {bypassList: []}), false);
  });

  it('ignores remoteDNS, noPrompt, levelOfControl at any depth', () => {
    assert.equal(compare({remoteDNS: true, noPrompt: true, levelOfControl: 'controlled', a: 1}, {a: 1}), true);
    const a = baseProfile();
    const b = baseProfile();
    b.value.remoteDNS = false;
    b.value.noPrompt = true;
    b.levelOfControl = 'controlled';
    assert.equal(compare(a, b), true);
    const c = baseProfile();
    c.value.rules.remoteDNS = 'ignored-at-depth';
    assert.equal(compare(a, c), true);
  });

  it('normalizes numeric strings for ports', () => {
    assert.equal(compare({port: 8080}, {port: '8080'}), true);
    assert.equal(compare({port: '8080'}, {port: 8080}), true);
    assert.equal(compare({port: 8080}, {port: '8081'}), false);
    const a = baseProfile();
    const b = baseProfile();
    b.value.rules.proxyForHttp.port = '8080';
    assert.equal(compare(a, b), true);
  });

  it('treats empty array / empty host-port as distinct per strict spec', () => {
    assert.equal(compare({bypassList: []}, {}), false);
    assert.equal(compare({}, {bypassList: []}), false);
    assert.equal(compare({proxyForHttp: {host: '', port: ''}}, {}), false);
  });
});
