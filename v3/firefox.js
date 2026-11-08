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

  // PAC size guards. Firefox autoConfigUrl is a URL string with practical
  // length limits; unbounded inline PACs OOM the string path. Cap raw PAC.
  const MAX_PAC_DATA_BYTES = 64 * 1024;
  const MAX_PAC_URL_BYTES = 132 * 1024;
  // Firefox proxy.settings has no scheme field (only socksVersion), so
  // scheme:'https' (TLS-to-proxy) has no native representation. Remember
  // what this shim last set so same-session round-trips stay faithful.
  // After a restart or external edit, https falls back to http.
  const httpsLedger = new Map();
  // Socks-only native value is ambiguous: fallback-only vs explicit
  // per-protocol socks (search.convert / mirrored UI) both collapse to one
  // socks slot. Remember which shape this shim last wrote.
  const socksShapeLedger = new Map();
  const warnedOnce = new Set();

  function warnOnce(key, message) {
    if (warnedOnce.has(key)) {
      return;
    }
    warnedOnce.add(key);
    console.warn(message);
  }

  function normalizeKey(host, port) {
    return String(host || '').toLowerCase() + ':' + Number(port || 0);
  }

  function registerHttpsScheme(server) {
    if (!server || !server.host) {
      return;
    }
    const scheme = schemeOf(server);
    if (scheme === 'https') {
      httpsLedger.set(normalizeKey(server.host, server.port), 'https');
    }
    else if (scheme === 'quic') {
      warnOnce('quic', '[firefox.js] scheme quic has no Firefox representation; degrading to http');
    }
  }

  function lookupHttpsScheme(host, port) {
    if (!host) {
      return undefined;
    }
    return httpsLedger.get(normalizeKey(host, port));
  }

  function byteLength(str) {
    try {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str).length;
      }
    }
    catch (e) {
      // Fall through to length estimate.
    }
    return String(str).length;
  }

  // Strip a leading scheme:// prefix. Returns {scheme, rest}.
  function splitSchemePrefix(s) {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(s);
    if (!m) {
      return {scheme: undefined, rest: s};
    }
    return {scheme: m[1].toLowerCase(), rest: s.slice(m[0].length)};
  }

  // Strip userinfo (user:pass@) from host:port text. Chrome ProxyServer and
  // Firefox proxy.settings have no embedded-credentials field; auth goes via
  // autoLogin + browser prompt. Warn once and drop credentials.
  function stripUserinfo(hostPort) {
    const atIdx = hostPort.lastIndexOf('@');
    if (atIdx === -1) {
      return hostPort;
    }
    const bracketIdx = hostPort.indexOf('[');
    // For IPv6, '@' must precede '[' to be userinfo. If the only '@' is
    // after ']', it is not userinfo; treat as invalid and leave as-is
    // (validation below will reject it).
    if (bracketIdx !== -1 && atIdx > bracketIdx) {
      // '@' after '[' without preceding userinfo -> not userinfo.
      // e.g. "[::1]:8080@foo" is malformed; leave unchanged.
      if (hostPort.startsWith('[')) {
        return hostPort;
      }
      // "[..." after userinfo is handled below: atIdx before bracket.
    }
    // If string starts with '[', '@' must be before it to be userinfo.
    if (hostPort.startsWith('[') && atIdx > hostPort.indexOf(']')) {
      return hostPort;
    }
    warnOnce('userinfo', '[firefox.js] stripping embedded proxy credentials (user:pass@) — not representable in proxy settings');
    return hostPort.slice(atIdx + 1);
  }

  function parseHostPort(str) {
    if (typeof str !== 'string' || !str.trim()) {
      return null;
    }
    let s = str.trim();
    // Tolerate whitespace / newlines from pasted lists.
    if (/[\r\n]/.test(s)) {
      return null;
    }
    const {scheme, rest} = splitSchemePrefix(s);
    let hostPort = stripUserinfo(rest);
    if (!hostPort) {
      return null;
    }
    // Reject URLs / paths left after userinfo strip.
    if (hostPort.includes('/') || /[\s]/.test(hostPort)) {
      return null;
    }
    let host;
    let port;
    if (hostPort.startsWith('[')) {
      const end = hostPort.indexOf(']');
      if (end === -1) {
        return null;
      }
      host = hostPort.slice(1, end);
      const trailer = hostPort.slice(end + 1);
      if (trailer) {
        if (!trailer.startsWith(':') || !/^\d+$/.test(trailer.slice(1))) {
          return null;
        }
        const n = Number(trailer.slice(1));
        if (n >= 1 && n <= 65535) {
          port = n;
        }
      }
    }
    else if (/:\d+$/.test(hostPort)) {
      const idx = hostPort.lastIndexOf(':');
      host = hostPort.slice(0, idx);
      const n = Number(hostPort.slice(idx + 1));
      if (n >= 1 && n <= 65535) {
        port = n;
      }
      else {
        // Out-of-range port: keep host, drop invalid port.
        warnOnce('invalid-port', '[firefox.js] dropping out-of-range proxy port: ' + hostPort);
      }
    }
    else if (hostPort.includes(':')) {
      // Bare IPv6 without brackets, no port (e.g. "2001:db8::1").
      // Only plausible if it contains >=2 colons and no bracket.
      // Treat whole string as host.
      const colons = (hostPort.match(/:/g) || []).length;
      if (colons >= 2) {
        host = hostPort;
      }
      else {
        // Single colon but non-numeric suffix, e.g. "host:http" -> invalid.
        return null;
      }
    }
    else {
      host = hostPort;
    }
    if (!host || host.includes('@') || host.includes('/') || /\s/.test(host)) {
      return null;
    }
    // Bare IPv6 with trailing port was already handled via /:\d+$/ above
    // only for single-colon hosts; for bare IPv6 with port we cannot
    // distinguish host colons from port. That form is ambiguous; require
    // brackets for IPv6+port (standard). Bare IPv6 without port stays host.
    const out = {host};
    if (port !== undefined) {
      out.port = port;
    }
    if (scheme) {
      out.scheme = scheme;
    }
    return out;
  }

  function toHostPortString(server) {
    if (!server || !server.host) {
      return undefined;
    }
    let host = String(server.host).trim();
    if (!host) {
      return undefined;
    }
    host = splitSchemePrefix(host).rest;
    host = stripUserinfo(host);
    if (!host || host.includes('/') || /\s/.test(host)) {
      return undefined;
    }
    let formatted;
    if (host.startsWith('[')) {
      const end = host.indexOf(']');
      if (end === -1) {
        return undefined;
      }
      // Already bracketed; if port info embedded, ignore it (port lives in
      // server.port). Re-emit bracketed host.
      formatted = host.slice(0, end + 1);
      if (formatted === '[]') {
        return undefined;
      }
    }
    else {
      // Bracket bare IPv6 literals for the Firefox host:port format.
      if (host.includes(':')) {
        host = '[' + host + ']';
      }
      formatted = host;
    }
    if (server.port != null && server.port !== '') {
      const n = Number(server.port);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        warnOnce('invalid-port-out', '[firefox.js] dropping out-of-range proxy port: ' + server.port);
        return formatted;
      }
      return formatted + ':' + n;
    }
    return formatted;
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
      if (data.length > MAX_PAC_URL_BYTES) {
        throw new Error('PAC data URL too large (' + data.length + ' bytes, limit ' + MAX_PAC_URL_BYTES + ')');
      }
      return data;
    }
    const bytes = byteLength(data);
    if (bytes > MAX_PAC_DATA_BYTES) {
      throw new Error('PAC script too large (' + bytes + ' bytes, limit ' + MAX_PAC_DATA_BYTES + ')');
    }
    return 'data:application/x-ns-proxy-autoconfig,' + encodeURIComponent(data);
  }

  function pacUrlToData(url) {
    if (typeof url !== 'string' || !url.startsWith('data:')) {
      return null;
    }
    if (url.length > MAX_PAC_URL_BYTES) {
      warnOnce('pac-url-too-large', '[firefox.js] ignoring oversized PAC data URL (' + url.length + ' bytes)');
      return null;
    }
    try {
      const comma = url.indexOf(',');
      if (comma === -1) {
        return null;
      }
      const meta = url.slice(0, comma);
      const payload = url.slice(comma + 1);
      let decoded;
      if (meta.includes('base64')) {
        // Decode base64 bytes as UTF-8 for the PAC text.
        const bin = atob(payload);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        decoded = new TextDecoder('utf-8').decode(bytes);
      }
      else {
        decoded = decodeURIComponent(payload);
      }
      if (byteLength(decoded) > MAX_PAC_DATA_BYTES) {
        warnOnce('pac-data-too-large', '[firefox.js] ignoring oversized PAC script data');
        return null;
      }
      return decoded;
    }
    catch (e) {
      // Never leak the raw data-URL back as script text (it would
      // double-encode on the next set). Caller falls back to URL form.
      warnOnce('pac-decode-failed', '[firefox.js] failed to decode PAC data URL: ' + (e && e.message || e));
      return null;
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
          if (typeof ps.url === 'string' && ps.url.startsWith('data:') && ps.url.length > MAX_PAC_URL_BYTES) {
            throw new Error('PAC data URL too large (' + ps.url.length + ' bytes, limit ' + MAX_PAC_URL_BYTES + ')');
          }
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
        const hasPerProtocol = Boolean(rules.proxyForHttp || rules.proxyForHttps || rules.proxyForFtp);
        // Fallback fills any missing per-protocol slot (Chrome fallback semantics).
        const effHttp = httpS || fallbackS;
        const effHttps = httpsS || fallbackS;
        const effFtp = ftpS || fallbackS;
        // Remember https schemes so same-session read-back stays faithful
        // (Firefox has no https field). Fallback-only http counts as lone
        // below, so remember it too.
        for (const s of [single, httpS, httpsS, ftpS, fallbackS]) {
          registerHttpsScheme(s);
        }
        // SOCKS slot: single winner. If several distinct SOCKS servers are
        // configured, Firefox can only hold one; pick deterministically and
        // make the loss visible instead of silent.
        const socksKeys = new Set();
        const distinctSocks = [];
        for (const s of [fallbackS, httpS, httpsS, ftpS, single]) {
          if (s && s.host && isSocks(s)) {
            const key = normalizeKey(s.host, s.port) + ':' + schemeOf(s);
            if (!socksKeys.has(key)) {
              socksKeys.add(key);
              distinctSocks.push(s);
            }
          }
        }
        if (distinctSocks.length > 1) {
          warnOnce('mixed-socks', '[firefox.js] multiple distinct SOCKS proxies configured; Firefox holds one socks slot, keeping ' + (toHostPortString(distinctSocks[0]) || '') + ' and dropping the rest');
        }
        const effSocks = distinctSocks[0] || null;
        if (effSocks) {
          const shape = (!hasPerProtocol && (single || fallbackS)) ? 'fallback' : 'per-protocol';
          socksShapeLedger.set(normalizeKey(effSocks.host, effSocks.port), shape);
        }
        const out = {proxyType: 'manual'};

        // Lone-server shape (singleProxy alone, or fallbackProxy alone) is
        // encoded as http-only + httpProxyAll so firefoxToChrome can tell it
        // apart from explicit per-protocol slots. Per-protocol shapes keep
        // explicit http/ssl/ftp with httpProxyAll=false — do not infer
        // proxy-all from uniform hosts (that was the round-trip expansion bug).
        const lone = (!hasPerProtocol && (single || fallbackS)) ? (single || fallbackS) : null;
        if (lone) {
          if (isSocks(lone)) {
            const v = toHostPortString(lone);
            if (v) {
              out.socks = v;
              out.socksVersion = schemeOf(lone) === 'socks4' ? 4 : 5;
            }
            out.httpProxyAll = false;
          }
          else {
            const v = toHostPortString(lone);
            if (v) {
              out.http = v;
            }
            out.httpProxyAll = true;
            // Keep a distinct fallback SOCKS alongside? Only if fallback is
            // a different SOCKS server than lone — otherwise socks is empty.
            if (fallbackS && isSocks(fallbackS) && fallbackS !== lone) {
              const sv = toHostPortString(fallbackS);
              if (sv && sv !== out.http) {
                out.socks = sv;
                out.socksVersion = schemeOf(fallbackS) === 'socks4' ? 4 : 5;
              }
            }
          }
        }
        else {
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
          // Explicit per-protocol: never claim proxy-all. Uniform hosts are
          // still explicit per-protocol slots so read-back preserves them.
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
          const data = pacUrlToData(url);
          if (data != null) {
            return {mode: 'pac_script', pacScript: {data, mandatory: true}};
          }
          // Oversized / undecodable inline PAC: keep URL form so get() does
          // not report the data-URL string itself as script data.
          return {mode: 'pac_script', pacScript: {url, mandatory: true}};
        }
        return {mode: 'pac_script', pacScript: {url, mandatory: true}};
      }
      case 'manual': {
        const rules = {};
        const http = parseHostPort(value.http);
        const ssl = parseHostPort(value.ssl);
        const ftp = parseHostPort(value.ftp);
        const socks = parseHostPort(value.socks);
        const socksSchemeFallback = value.socksVersion === 4 ? 'socks4' : 'socks5';
        const count = [http, ssl, ftp, socks].filter(Boolean).length;

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
        // Scheme precedence: explicit prefix in native value (https://...)
        // > shim ledger (same-session set) > http. SOCKS uses its prefix or
        // socksVersion.
        const httpScheme = (http && http.scheme) || lookupHttpsScheme(http && http.host, http && http.port) || 'http';
        const sslScheme = (ssl && ssl.scheme) || lookupHttpsScheme(ssl && ssl.host, ssl && ssl.port) || 'http';
        const ftpScheme = (ftp && ftp.scheme) || lookupHttpsScheme(ftp && ftp.host, ftp && ftp.port) || 'http';
        const socksScheme = (socks && socks.scheme && (socks.scheme === 'socks4' || socks.scheme === 'socks5'))
          ? socks.scheme : socksSchemeFallback;
        if (httpScheme === 'quic' || sslScheme === 'quic' || ftpScheme === 'quic') {
          warnOnce('quic-read', '[firefox.js] scheme quic has no Firefox representation; degrading to http');
        }
        const httpServer = makeServer(http, httpScheme === 'quic' ? 'http' : httpScheme);
        const sslServer = makeServer(ssl, sslScheme === 'quic' ? 'http' : sslScheme);
        const ftpServer = makeServer(ftp, ftpScheme === 'quic' ? 'http' : ftpScheme);
        const socksServer = makeServer(socks, socksScheme);

        if (value.httpProxyAll && (http || socks)) {
          // httpProxyAll means the http server (fallback socks) serves all
          // protocols. That is exactly Chrome's singleProxy shape. Do NOT
          // expand to proxyForHttp/Https/Ftp: expansion breaks profile
          // identity for singleProxy / lone-fallback saves.
          let server = null;
          if (http) {
            server = httpServer;
            if ((ssl && ssl.host !== http.host) || (ftp && ftp.host !== http.host) || socks) {
              // httpProxyAll ignores ssl/ftp/socks slots; warn once if they
              // disagree since they will be dropped on read-back.
              warnOnce('httpproxyall-mismatch', '[firefox.js] httpProxyAll set but ssl/ftp/socks slots differ; using http slot for singleProxy');
            }
          }
          else {
            server = socksServer;
          }
          if (server) {
            rules.singleProxy = {...server};
          }
          // Preserve an accompanying SOCKS as fallbackProxy so a
          // lone-http + fallback-socks shape round-trips instead of warning.
          if (http && socksServer && (socks.host !== http.host || socks.port !== http.port)) {
            rules.fallbackProxy = {...socksServer};
            // socks alongside singleProxy is not a mismatch by itself.
          }
        }
        else if (count === 1) {
          // Sparse single slot: preserve shape. Do not invent the other
          // protocols. SOCKS-only is ambiguous (fallback-only vs explicit
          // per-protocol socks); resolve via socksShapeLedger, defaulting
          // to per-protocol (search.convert / mirrored UI shape).
          if (http) {
            rules.proxyForHttp = httpServer;
          }
          else if (ssl) {
            rules.proxyForHttps = sslServer;
          }
          else if (ftp) {
            rules.proxyForFtp = ftpServer;
          }
          else if (socks) {
            const shape = socksShapeLedger.get(normalizeKey(socks.host, socks.port));
            if (shape === 'fallback') {
              rules.fallbackProxy = socksServer;
            }
            else {
              rules.proxyForHttp = {...socksServer};
              rules.proxyForHttps = {...socksServer};
              rules.proxyForFtp = {...socksServer};
            }
          }
        }
        else {
          if (httpServer) {
            rules.proxyForHttp = httpServer;
          }
          if (sslServer) {
            rules.proxyForHttps = sslServer;
          }
          if (ftpServer) {
            rules.proxyForFtp = ftpServer;
          }
          if (socksServer) {
            rules.fallbackProxy = socksServer;
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
          // MDN: set() resolves false when the setting was not changed,
          // which covers both "not controllable" (locked / lower
          // precedence) and "already at the requested value" (no-op).
          // Read back and compare in Chrome shape: if the current value
          // already equals the requested one, treat it as success with
          // the callback invoked after the native set resolved.
          try {
            const current = await nativeSettings.get({});
            const currentChrome = firefoxToChrome(current && current.value);
            const intendedChrome = firefoxToChrome(firefoxValue);
            if (JSON.stringify(currentChrome) === JSON.stringify(intendedChrome)) {
              clearLastError();
              if (cb) {
                cb();
              }
              return changed;
            }
          }
          catch (e) {
            // Read-back best-effort; fall through to the not-controllable error.
          }
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
