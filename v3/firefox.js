// Firefox compatibility shim for chrome.proxy.
// Firefox does not implement the Chrome proxy API. It exposes browser.proxy
// with a completely different shape (proxy.settings + proxy.onRequest).
// This file installs a chrome.proxy that speaks the Chrome shape and
// translates to/from the Firefox shape, so existing code needs no changes.
// Detection is by shape (onProxyError vs onRequest): in Chrome the native
// chrome.proxy exists so this file is a no-op, in Firefox chrome === browser
// and chrome.proxy already exists but with the Firefox shape, so it is
// replaced by the shim. Load this file FIRST in every extension context.
(() => {
  'use strict';

  // Already patched (idempotent on double load).
  if (typeof chrome === 'undefined') {
    return;
  }
  if (chrome.proxy && chrome.proxy.__isFirefoxPolyfill) {
    return;
  }

  // Discriminate Chrome vs Firefox by shape, not mere existence:
  // In Firefox chrome === browser, so chrome.proxy already exists but
  // speaks the Firefox shape. The shapes differ structurally:
  //   Chrome:  proxy.settings + proxy.onProxyError (no onRequest)
  //   Firefox: proxy.settings + proxy.onRequest + proxy.onError
  // Only skip when this is the native Chrome API.
  if (chrome.proxy && chrome.proxy.onProxyError && !chrome.proxy.onRequest && chrome.proxy.settings) {
    return;
  }

  // Capture the native Firefox API before we overwrite chrome.proxy.
  // In Firefox chrome === browser, so after assigning chrome.proxy the
  // native object must only be reached through this captured reference.
  const nativeRoot = (typeof browser !== 'undefined' && browser.proxy) || null;
  if (!nativeRoot || !nativeRoot.settings) {
    return;
  }
  const nativeSettings = nativeRoot.settings;

  // --- helpers ---

  function parseHostPort(str) {
    if (typeof str !== 'string' || !str) {
      return null;
    }
    let host;
    let port;
    if (str.startsWith('[')) {
      const end = str.indexOf(']');
      if (end !== -1) {
        host = str.slice(1, end);
        const rest = str.slice(end + 1);
        if (rest.startsWith(':')) {
          const n = parseInt(rest.slice(1), 10);
          if (!isNaN(n)) {
            port = n;
          }
        }
      }
      else {
        host = str;
      }
    }
    else if (/:\d+$/.test(str)) {
      const idx = str.lastIndexOf(':');
      host = str.slice(0, idx);
      const n = parseInt(str.slice(idx + 1), 10);
      if (!isNaN(n)) {
        port = n;
      }
    }
    else {
      host = str;
    }
    const out = {host};
    if (port !== undefined) {
      out.port = port;
    }
    return out;
  }

  function toHostPortString(server) {
    if (!server || !server.host) {
      return undefined;
    }
    let host = String(server.host);
    // Bracket bare IPv6 literals for the Firefox host:port format.
    if (host.includes(':') && !host.startsWith('[')) {
      host = '[' + host + ']';
    }
    if (server.port != null && server.port !== '') {
      return host + ':' + Number(server.port);
    }
    return host;
  }

  function schemeOf(server) {
    return (server && server.scheme) || 'http';
  }

  function isSocks(server) {
    const s = schemeOf(server);
    return s === 'socks4' || s === 'socks5';
  }

  function bypassToPassthrough(list) {
    if (!Array.isArray(list)) {
      return undefined;
    }
    const out = list.map(entry => {
      let s = String(entry).trim();
      if (!s) {
        return '';
      }
      if (s === '<local>') {
        return s;
      }
      // Chrome patterns may carry a scheme prefix, Firefox passthrough does not.
      s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
      if (s.startsWith('*.')) {
        s = '.' + s.slice(2);
      }
      else if (s.startsWith('*')) {
        s = s.slice(1);
      }
      return s;
    }).filter(Boolean);
    return out.length ? out.join(',') : undefined;
  }

  function pacDataToUrl(data) {
    if (typeof data !== 'string' || !data) {
      return undefined;
    }
    if (data.startsWith('data:')) {
      return data;
    }
    return 'data:application/x-ns-proxy-autoconfig,' + encodeURIComponent(data);
  }

  function pacUrlToData(url) {
    if (typeof url !== 'string' || !url.startsWith('data:')) {
      return null;
    }
    try {
      const comma = url.indexOf(',');
      if (comma === -1) {
        return url;
      }
      const meta = url.slice(0, comma);
      const payload = url.slice(comma + 1);
      if (meta.includes('base64')) {
        // Decode base64 bytes as UTF-8 for the PAC text.
        const bin = atob(payload);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      }
      return decodeURIComponent(payload);
    }
    catch (e) {
      return url;
    }
  }

  // Chrome ProxyConfig -> Firefox proxy.settings value
  function chromeToFirefox(value) {
    const mode = value && value.mode;
    switch (mode) {
      case 'direct':
        return {proxyType: 'none'};
      case 'auto_detect':
        return {proxyType: 'autoDetect'};
      case 'system':
        return {proxyType: 'system'};
      case 'pac_script': {
        const ps = (value && value.pacScript) || {};
        let url;
        if (ps.url) {
          url = ps.url;
        }
        else if (ps.data) {
          url = pacDataToUrl(ps.data);
        }
        const out = {proxyType: 'autoConfig'};
        if (url) {
          out.autoConfigUrl = url;
        }
        if (value && typeof value.noPrompt === 'boolean') {
          out.autoLogin = value.noPrompt;
        }
        return out;
      }
      case 'fixed_servers': {
        const rules = (value && value.rules) || {};
        const single = rules.singleProxy;
        const httpS = rules.proxyForHttp || single;
        const httpsS = rules.proxyForHttps || single;
        const ftpS = rules.proxyForFtp || single;
        const fallbackS = rules.fallbackProxy;
        // Fallback fills any missing per-protocol slot (Chrome fallback semantics).
        const effHttp = httpS || fallbackS;
        const effHttps = httpsS || fallbackS;
        const effFtp = ftpS || fallbackS;
        // SOCKS slot: first SOCKS rule wins (the UI enforces a uniform scheme).
        const effSocks =
          [fallbackS, httpS, httpsS, ftpS, single].find(s => s && s.host && isSocks(s)) || null;
        const out = {proxyType: 'manual'};

        // HTTP-family slots only accept http/https-scheme servers here;
        // SOCKS-scheme servers go to the socks slot below.
        if (effHttp && !isSocks(effHttp)) {
          const v = toHostPortString(effHttp);
          if (v) {
            out.http = v;
          }
        }
        if (effHttps && !isSocks(effHttps)) {
          const v = toHostPortString(effHttps);
          if (v) {
            out.ssl = v;
          }
        }
        if (effFtp && !isSocks(effFtp)) {
          const v = toHostPortString(effFtp);
          if (v) {
            out.ftp = v;
          }
        }
        if (effSocks) {
          const v = toHostPortString(effSocks);
          if (v) {
            out.socks = v;
            out.socksVersion = schemeOf(effSocks) === 'socks4' ? 4 : 5;
          }
        }
        // If only a single non-SOCKS server was given, one HTTP proxy serves all.
        if (single && !isSocks(single) && !rules.proxyForHttps && !rules.proxyForFtp) {
          out.httpProxyAll = true;
        }
        else if (out.http && out.http === out.ssl && out.http === out.ftp && !out.socks) {
          // Uniform http-family hosts: keep proxy-all so Firefox matches Chrome.
          if (effHttp && effHttps && effFtp) {
            out.httpProxyAll = true;
          }
        }
        else {
          out.httpProxyAll = false;
        }
        const passthrough = bypassToPassthrough(rules.bypassList);
        if (passthrough) {
          out.passthrough = passthrough;
        }
        if (value && typeof value.remoteDNS === 'boolean') {
          out.proxyDNS = value.remoteDNS;
        }
        else if (effSocks) {
          // Mirror Firefox defaults (SOCKS5 proxies DNS by default).
          out.proxyDNS = schemeOf(effSocks) !== 'socks4';
        }
        if (value && typeof value.noPrompt === 'boolean') {
          out.autoLogin = value.noPrompt;
        }
        else {
          out.autoLogin = false;
        }
        return out;
      }
      default: {
        // Unknown shape: fall back to system rather than throwing.
        if (value && value.proxyType) {
          return value;
        }
        return {proxyType: 'system'};
      }
    }
  }

  // Firefox proxy.settings value -> Chrome ProxyConfig
  function firefoxToChrome(value) {
    const type = value && value.proxyType;
    switch (type) {
      case 'none':
        return {mode: 'direct'};
      case 'autoDetect':
        return {mode: 'auto_detect'};
      case 'system':
        return {mode: 'system'};
      case 'autoConfig': {
        const url = value.autoConfigUrl;
        if (typeof url === 'string' && url.startsWith('data:')) {
          return {mode: 'pac_script', pacScript: {data: pacUrlToData(url), mandatory: true}};
        }
        return {mode: 'pac_script', pacScript: {url, mandatory: true}};
      }
      case 'manual': {
        const rules = {};
        const http = parseHostPort(value.http);
        const ssl = parseHostPort(value.ssl);
        const ftp = parseHostPort(value.ftp);
        const socks = parseHostPort(value.socks);
        const socksScheme = value.socksVersion === 4 ? 'socks4' : 'socks5';
        const count = [value.http, value.ssl, value.ftp, value.socks].filter(Boolean).length;

        const makeServer = (parsed, scheme) => {
          if (!parsed || !parsed.host) {
            return null;
          }
          const s = {host: parsed.host, scheme};
          if (parsed.port !== undefined) {
            s.port = parsed.port;
          }
          return s;
        };

        if (count === 1 || value.httpProxyAll) {
          let server = null;
          if (value.httpProxyAll && http) {
            server = makeServer(http, 'http');
          }
          else if (value.socks) {
            server = makeServer(socks, socksScheme);
          }
          else if (value.http) {
            server = makeServer(http, 'http');
          }
          else if (value.ssl) {
            server = makeServer(ssl, 'http');
          }
          else if (value.ftp) {
            server = makeServer(ftp, 'http');
          }
          if (server) {
            // Expand to per-protocol rules so the panel UI and profile
            // comparison see the same shape Chrome's proxy.manual() builds.
            rules.proxyForHttp = {...server};
            rules.proxyForHttps = {...server};
            rules.proxyForFtp = {...server};
          }
        }
        else {
          const h = makeServer(http, 'http');
          const hs = makeServer(ssl, 'http');
          const f = makeServer(ftp, 'http');
          const sk = makeServer(socks, socksScheme);
          if (h) {
            rules.proxyForHttp = h;
          }
          if (hs) {
            rules.proxyForHttps = hs;
          }
          if (f) {
            rules.proxyForFtp = f;
          }
          if (sk) {
            rules.fallbackProxy = sk;
          }
        }
        if (value.passthrough) {
          const list = String(value.passthrough).split(',').map(s => s.trim()).filter(Boolean);
          if (list.length) {
            rules.bypassList = list;
          }
        }
        const out = {mode: 'fixed_servers', rules};
        if (typeof value.proxyDNS === 'boolean') {
          out.remoteDNS = value.proxyDNS;
        }
        if (typeof value.autoLogin === 'boolean') {
          out.noPrompt = value.autoLogin;
        }
        return out;
      }
      default: {
        if (value && value.mode) {
          return value;
        }
        return {mode: 'system'};
      }
    }
  }

  // --- listener plumbing ---

  const changeListeners = new Set();
  const errorListeners = new Set();

  function makeEvent(listeners) {
    return {
      addListener(fn) {
        if (typeof fn === 'function') {
          listeners.add(fn);
        }
      },
      removeListener(fn) {
        listeners.delete(fn);
      },
      hasListener(fn) {
        return listeners.has(fn);
      }
    };
  }

  // Forward native changes to shim listeners (Chrome shape).
  if (nativeSettings.onChange && typeof nativeSettings.onChange.addListener === 'function') {
    nativeSettings.onChange.addListener(details => {
      const config = {
        value: firefoxToChrome(details && details.value),
        levelOfControl: details && details.levelOfControl
      };
      changeListeners.forEach(fn => {
        try {
          fn(config);
        }
        catch (e) {
          console.error(e);
        }
      });
    });
  }
  if (nativeRoot.onError && typeof nativeRoot.onError.addListener === 'function') {
    nativeRoot.onError.addListener(err => {
      const message = (err && err.message) || String(err);
      const config = {error: message, details: message, fatal: false};
      errorListeners.forEach(fn => {
        try {
          fn(config);
        }
        catch (e) {
          console.error(e);
        }
      });
    });
  }

  // --- chrome.runtime.lastError emulation ---

  function setLastError(err) {
    try {
      Object.defineProperty(chrome.runtime, 'lastError', {
        value: err,
        configurable: true
      });
    }
    catch (e) {
      try {
        chrome.runtime.lastError = err;
      }
      catch (_) {
        // Ignore: some contexts expose lastError as read-only.
      }
    }
  }

  function clearLastError() {
    setLastError(undefined);
  }

  // --- chrome.proxy.settings shim ---

  function shimGet(details, callback) {
    const cb = typeof callback === 'function' ? callback : null;
    const promise = (async () => {
      try {
        const result = await nativeSettings.get({});
        const config = {
          value: firefoxToChrome(result && result.value),
          levelOfControl: result && result.levelOfControl
        };
        clearLastError();
        if (cb) {
          cb(config);
        }
        return config;
      }
      catch (e) {
        setLastError(e);
        if (cb) {
          cb(undefined);
          return undefined;
        }
        throw e;
      }
    })();
    return promise;
  }

  function shimSet(details, callback) {
    const cb = typeof callback === 'function' ? callback : null;
    const promise = (async () => {
      try {
        const firefoxValue = chromeToFirefox(details && details.value);
        const changed = await nativeSettings.set({value: firefoxValue});
        if (changed === false) {
          // levelOfControl says we do not control the setting (locked or
          // controlled by a higher-precedence extension).
          throw new Error('Proxy setting is not controllable by this extension');
        }
        clearLastError();
        if (cb) {
          cb();
        }
        return changed;
      }
      catch (e) {
        setLastError(e);
        if (cb) {
          cb();
          return undefined;
        }
        throw e;
      }
    })();
    return promise;
  }

  function shimClear(details, callback) {
    const cb = typeof callback === 'function' ? callback : null;
    const promise = (async () => {
      try {
        if (nativeSettings.clear) {
          await nativeSettings.clear({});
        }
        else {
          await nativeSettings.set({value: {proxyType: 'system'}});
        }
        clearLastError();
        if (cb) {
          cb();
        }
        return undefined;
      }
      catch (e) {
        setLastError(e);
        if (cb) {
          cb();
          return undefined;
        }
        throw e;
      }
    })();
    return promise;
  }

  const shim = {
    __isFirefoxPolyfill: true,
    settings: {
      get: shimGet,
      set: shimSet,
      clear: shimClear,
      onChange: makeEvent(changeListeners)
    },
    onProxyError: makeEvent(errorListeners)
  };

  // Install. In Firefox chrome === browser, so this also replaces
  // browser.proxy; callers above only use the captured native reference.
  chrome.proxy = shim;
  try {
    if (typeof browser !== 'undefined') {
      browser.proxy = shim;
    }
  }
  catch (e) {
    // browser.proxy may be read-only in some builds; chrome.proxy is enough.
  }
})();
