const search = {};

const SEARCH_SOURCES = [
  {id: 'proxifly', label: 'proxifly SOCKS5', url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt'},
  {id: 'monosans', label: 'monosans SOCKS5', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt'}
];

function getLastErrorMessage() {
  try {
    const le = (typeof chrome !== 'undefined' && chrome && chrome.runtime) ? chrome.runtime.lastError : null;
    if (!le) {
      return null;
    }
    return (le && le.message) || String(le);
  }
  catch (e) {
    return null;
  }
}

search.setProxy = config => new Promise((resolve, reject) => {
  try {
    chrome.proxy.settings.set(config, () => {
      const msg = getLastErrorMessage();
      if (msg) {
        reject(Error(msg));
      }
      else {
        resolve();
      }
    });
  }
  catch (e) {
    reject(e);
  }
});

search.parseEntry = str => {
  if (str === null || typeof str === 'undefined') {
    return null;
  }
  let entry = String(str).trim();
  if (!entry || entry.startsWith('#')) {
    return null;
  }
  if (entry.startsWith('socks5://')) {
    entry = entry.slice('socks5://'.length);
  }
  if (!entry || entry.includes('@')) {
    return null;
  }
  const match = entry.match(/^(.+):(\d+)$/);
  if (!match) {
    return null;
  }
  let host = match[1].trim();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1).trim();
  }
  const port = Number(match[2]);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }
  return {host, port};
};

search.formatHostPort = info => {
  if (!info || !info.host) {
    return '';
  }
  const port = info.port;
  return info.host.includes(':') ? `[${info.host}]:${port}` : `${info.host}:${port}`;
};

search.parseList = text => {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) {
      return;
    }
    let cleaned = entry;
    if (cleaned.startsWith('socks5://')) {
      cleaned = cleaned.slice('socks5://'.length);
    }
    if (cleaned.includes('@')) {
      return;
    }
    if (search.parseEntry(cleaned)) {
      out.push(cleaned);
    }
  });
  return out;
};

search.shuffle = list => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
};

search.fetchSource = source => fetch(source.url).then(r => {
  if (!r.ok) {
    return Promise.reject(Error('HTTP ' + r.status));
  }
  return r.text().then(text => {
    const list = search.parseList(text);
    if (!list.length) {
      return Promise.reject(Error('empty list'));
    }
    return {source, list};
  });
});

search.convert = str => {
  const parsed = search.parseEntry(str);
  if (!parsed) {
    throw Error(`malformed proxy entry: ${str}`);
  }
  const {host, port} = parsed;

  const proxy = {
    host,
    port,
    scheme: 'socks5'
  };
  return {
    info: {host, port},
    proxy: {
      value: {
        mode: 'fixed_servers',
        rules: {
          proxyForFtp: proxy,
          proxyForHttp: proxy,
          proxyForHttps: proxy
        }
      }
    }
  };
};

search.ping = href => new Promise((resolve, reject) => {
  const timer = setTimeout(reject, 5000, 'timeout');
  fetch(href, {
    method: 'HEAD'
  }).then(resolve, reject).finally(() => clearTimeout(timer));
});
search.verify = (proxy, logFn) => search.setProxy(proxy).then(() => {
  const track = (href, label) => search.ping(href).then(
    () => {
      if (logFn) logFn(label + ' ok');
      return true;
    },
    e => {
      if (logFn) logFn(label + ' failed (' + ((e && e.message) || e) + ')');
      return false;
    }
  );
  return Promise.all([
    track('https://raw.githubusercontent.com/rNeomy/proxy-switcher/master/LICENSE', 'ping LICENSE'),
    track('https://raw.githubusercontent.com/rNeomy/proxy-switcher/master/README.md', 'ping README')
  ]).then(results => {
    if (results.some(r => r)) {
      return;
    }
    throw Error('Ping failed');
  });
}, err => {
  if (logFn) logFn('set proxy failed (' + ((err && err.message) || err) + ')');
  throw err;
});

class SearchDialog extends HTMLElement {
  constructor() {
    super();
    this._running = false;
    this._cancelled = false;
    this._explicitClose = false;
    this._phase = 'idle';
    this._needsRestore = false;
    this._succeeded = false;
    this._original = null;
    this._consentResolve = null;
    this._port = null;
    this._closePopup = false;

    const shadow = this.attachShadow({mode: 'open'});
    this._shadow = shadow;
    shadow.innerHTML = `
      <style>
        dialog {
          width: min(480px, calc(100vw - 40px));
          max-width: calc(100vw - 40px);
          max-height: calc(100vh - 40px);
          padding: 12px;
          border: solid 1px #f9e8c5;
          background: #fcf7df;
          color: #7f6256;
          box-sizing: border-box;
        }
        dialog::backdrop {
          background: rgba(0, 0, 0, 0.5);
        }
        [hidden] {
          display: none !important;
        }
        #search-log {
          display: block;
          width: 100%;
          box-sizing: border-box;
          height: 220px;
          max-height: 320px;
          overflow-y: auto;
          white-space: pre-wrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          line-height: 16px;
          background: #fff;
          border: solid 1px #ddd;
          padding: 6px;
        }
        #search-log > div:nth-child(odd) {
          background: #f3f6fb;
        }
        #search-text {
          white-space: normal;
          margin: 8px 0 0 0;
        }
        #consent-dialog {
          width: min(420px, calc(100vw - 48px));
          max-width: calc(100vw - 48px);
          max-height: calc(100vh - 48px);
          padding: 16px;
          border: solid 1px #d9b45a;
          background: #fff8e1;
          color: #4d3b00;
          box-sizing: border-box;
        }
        #consent-dialog::backdrop {
          background: rgba(0, 0, 0, 0.65);
        }
        #consent-text {
          white-space: normal;
          margin: 0;
        }
        #consent-target {
          font-weight: 700;
        }
        .actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        input[type=button] {
          border: none;
          cursor: pointer;
          padding: 6px 10px;
          white-space: nowrap;
        }
        input[type=button]:disabled {
          opacity: 0.5;
          cursor: default;
        }
      </style>
      <dialog id="dialog">
        <div id="search-log" tabindex="0" aria-label="Search log"></div>
        <div class="actions">
          <input type="button" id="search-toggle" value="Start" autofocus>
          <input type="button" id="search-close" value="Close">
        </div>
      </dialog>
      <dialog id="consent-dialog">
        <p id="consent-text">Route all traffic through an untrusted free proxy <strong id="consent-target"></strong> (SOCKS5)? Free proxy was briefly used to test connectivity. The operator could see traffic. Continue only if you trust it.</p>
        <div class="actions">
          <input type="button" id="consent-apply" value="Apply this" autofocus>
          <input type="button" id="consent-find" value="Find new one">
          <input type="button" id="consent-abort" value="Abort">
        </div>
      </dialog>
    `;
    this._dialog = shadow.getElementById('dialog');
    this._consentDialog = shadow.getElementById('consent-dialog');
    this._logEl = shadow.getElementById('search-log');
    this._textEl = shadow.getElementById('search-text');
    this._toggleBtn = shadow.getElementById('search-toggle');
    this._cancelBtn = shadow.getElementById('search-toggle');
    this._closeBtn = shadow.getElementById('search-close');
    this._confirmBtn = null;
    this._applyBtn = null;
    this._consentTargetEl = shadow.getElementById('consent-target');
    this._consentApplyBtn = shadow.getElementById('consent-apply');
    this._consentFindBtn = shadow.getElementById('consent-find');
    this._consentAbortBtn = shadow.getElementById('consent-abort');

    if (this._toggleBtn) {
      this._toggleBtn.addEventListener('click', () => this._onToggle());
    }
    if (this._closeBtn) {
      this._closeBtn.addEventListener('click', () => this._onCloseBtn());
    }
    if (this._consentApplyBtn) {
      this._consentApplyBtn.addEventListener('click', () => this._onConsentApply());
    }
    if (this._consentFindBtn) {
      this._consentFindBtn.addEventListener('click', () => this._onConsentFind());
    }
    if (this._consentAbortBtn) {
      this._consentAbortBtn.addEventListener('click', () => this._onConsentAbort());
    }
    if (this._dialog) {
      this._dialog.addEventListener('click', e => this._onDialogClick(e));
      this._dialog.addEventListener('close', () => this._onClose());
    }
    if (this._consentDialog) {
      this._consentDialog.addEventListener('click', e => this._onConsentDialogClick(e));
      this._consentDialog.addEventListener('close', () => this._onConsentClose());
    }
  }

  disconnectedCallback() {
    this._cancelled = true;
    if (this._port) {
      try {
        this._port.disconnect();
      }
      catch (e) {}
      this._port = null;
    }
    this._closeConsentDialog();
    if (this._dialog && this._dialog.open) {
      try {
        this._dialog.close();
      }
      catch (e) {}
    }
  }

  _connectGuard() {
    try {
      if (!chrome.runtime || typeof chrome.runtime.connect !== 'function') {
        this.log('guard port unavailable (chrome.runtime.connect missing)');
        this._port = null;
        return;
      }
      const port = chrome.runtime.connect({name: 'search-guard'});
      this._port = port;
      port.postMessage({type: 'search-start', value: this._original});
      this.log(`guard port connected (search-guard), mode=${this._original && this._original.mode}`);
    }
    catch (e) {
      this.log('guard port connect failed (' + ((e && e.message) || e) + ')');
      this._port = null;
    }
  }

  _disconnectGuard() {
    if (!this._port) {
      return;
    }
    try {
      this._port.postMessage({type: 'search-complete', succeeded: this._succeeded});
      this._port.disconnect();
      this.log('guard port disconnected');
    }
    catch (e) {}
    this._port = null;
  }

  async _setDirect() {
    this.log('switching to direct before fetching proxies...');
    try {
      await search.setProxy({value: {mode: 'direct'}});
    }
    catch (e) {
      this.log('switch to direct failed (' + ((e && e.message) || e) + ')');
      return false;
    }
    this.log('switched to direct (mode=direct)');
    return true;
  }

  log(message) {
    const el = this._logEl;
    if (!el) {
      return;
    }
    const time = (new Date()).toTimeString().split(' ')[0];
    const pinned = !((el.scrollHeight - el.scrollTop - el.clientHeight) >= 24);
    const doc = (typeof document !== 'undefined' && document.createElement) ? document : null;
    let entry = null;
    if (doc) {
      entry = doc.createElement('div');
    }
    if (!entry) {
      entry = {textContent: ''};
    }
    entry.textContent = time + ': ' + message;
    el.appendChild(entry);
    while (el.children && el.children.length > 400) {
      try {
        el.removeChild(el.children[0]);
      }
      catch (e) {
        break;
      }
      if (!el.children || !el.children.length) {
        break;
      }
    }
    if (pinned && typeof el.scrollTop !== 'undefined' && typeof el.scrollHeight !== 'undefined') {
      el.scrollTop = el.scrollHeight;
    }
  }

  _clearLog() {
    if (this._logEl) {
      this._logEl.textContent = '';
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _ensureOpen() {
    if (this._dialog && !this._dialog.open) {
      try {
        this._dialog.showModal();
      }
      catch (e) {}
    }
  }

  _closeDialog() {
    if (this._dialog && this._dialog.open) {
      try {
        this._dialog.close();
      }
      catch (e) {}
    }
  }

  _closeConsentDialog() {
    if (this._consentDialog && this._consentDialog.open) {
      try {
        this._consentDialog.close();
      }
      catch (e) {}
    }
  }

  _updateToggle() {
    if (this._toggleBtn) {
      this._toggleBtn.value = this._running ? 'Stop' : 'Start';
    }
  }

  _showSearching() {
    if (this._textEl) {
      this._textEl.hidden = true;
    }
    if (this._confirmBtn) {
      this._confirmBtn.hidden = true;
    }
    this._phase = 'searching';
    this._updateToggle();
  }

  _showIdle() {
    if (this._textEl) {
      this._textEl.hidden = true;
    }
    if (this._confirmBtn) {
      this._confirmBtn.hidden = true;
    }
    this._phase = 'idle';
    this._updateToggle();
  }

  openDialog() {
    if (this._running) {
      return;
    }
    this._showIdle();
    this._ensureOpen();
    this.log('dialog opened (idle, press Start)');
  }

  _showConsent(info) {
    if (this._consentTargetEl) {
      this._consentTargetEl.textContent = search.formatHostPort(info);
    }
    this._phase = 'consent';
    this._updateToggle();
    if (this._consentDialog && !this._consentDialog.open) {
      try {
        this._consentDialog.showModal();
      }
      catch (e) {}
    }
  }

  _resolveConsent(value) {
    if (!this._consentResolve) {
      return;
    }
    const resolve = this._consentResolve;
    this._consentResolve = null;
    resolve(value);
  }

  _onConsentApply() {
    this.log('apply this clicked');
    this._resolveConsent('apply');
    this._closeConsentDialog();
  }

  _onConsentFind() {
    this.log('find new one clicked');
    this._resolveConsent('next');
    this._closeConsentDialog();
  }

  _onConsentAbort() {
    this.log('abort clicked');
    this._resolveConsent('abort');
    this._closeConsentDialog();
  }

  _onConsentDialogClick(event) {
    if (event && event.target === this._consentDialog) {
      this.log('consent backdrop click -> find new one');
      this._resolveConsent('next');
      this._closeConsentDialog();
    }
  }

  _onConsentClose() {
    if (!this._consentResolve) {
      return;
    }
    this.log('consent dialog closed -> find new one');
    this._resolveConsent('next');
  }

  _onToggle() {
    if (this._running) {
      this.log('stop clicked');
      this._cancelled = true;
      if (this._phase === 'consent' && this._consentResolve) {
        this._resolveConsent('abort');
      }
      return;
    }
    this.log('start clicked');
    this.start();
  }

  _onCancel() {
    this._onToggle();
  }

  _onCloseBtn() {
    this.log('close clicked');
    this._cancelled = true;
    this._explicitClose = true;
    if (this._phase === 'consent' && this._consentResolve) {
      this._resolveConsent('abort');
    }
    this._closeConsentDialog();
    this._closeDialog();
  }

  _onConfirm() {
    this._onConsentApply();
  }

  _onDialogClick(event) {
    if (event && event.target === this._dialog) {
      this.log('backdrop click dismiss (target is dialog)');
      this._cancelled = true;
      this._explicitClose = true;
      if (this._phase === 'consent' && this._consentResolve) {
        this._resolveConsent('abort');
      }
      this._closeConsentDialog();
      this._closeDialog();
    }
  }

  _onClose() {
    if (!this._running || this._succeeded || this._cancelled) {
      return;
    }
    this.log('dialog close event dismiss');
    this._cancelled = true;
    if (this._phase === 'consent' && this._consentResolve) {
      this._resolveConsent('abort');
    }
  }

  async _restore() {
    if (!this._needsRestore) {
      return true;
    }
    if (!this._original) {
      this.log('restore requested (original unknown, clearing proxy control)');
      if (chrome.proxy.settings.clear) {
        try {
          await new Promise((resolve, reject) => {
            try {
              chrome.proxy.settings.clear({}, () => {
                const msg = getLastErrorMessage();
                if (msg) {
                  reject(Error(msg));
                }
                else {
                  resolve();
                }
              });
            }
            catch (e) {
              reject(e);
            }
          });
        }
        catch (e) {
          this.log('restore failed (' + ((e && e.message) || e) + ')');
          return false;
        }
        this._needsRestore = false;
        this.log('restore complete (cleared proxy control)');
        return true;
      }
      try {
        await search.setProxy({value: {mode: 'direct'}});
      }
      catch (e) {
        this.log('restore failed (' + ((e && e.message) || e) + ')');
        return false;
      }
      this._needsRestore = false;
      this.log('restore complete (mode=direct, fallback for unknown original)');
      return true;
    }
    this.log(`restore requested (mode=${this._original.mode})`);
    try {
      await search.setProxy({value: this._original});
    }
    catch (e) {
      this.log('restore failed (' + ((e && e.message) || e) + ')');
      return false;
    }
    this._needsRestore = false;
    this.log(`restore complete (mode=${this._original.mode})`);
    return true;
  }

  async _applyCandidate(proxy) {
    this.log('apply candidate requested');
    try {
      await search.setProxy(proxy);
    }
    catch (e) {
      this.log('apply candidate failed (' + ((e && e.message) || e) + ')');
      return false;
    }
    this.log('candidate applied');
    return true;
  }

  _waitConsent(info, source) {
    return new Promise(resolve => {
      this._showConsent(info);
      const label = source && source.label ? ` from ${source.label}` : '';
      this.log(`valid proxy found${label}, consent shown for ${search.formatHostPort(info)}`);
      this._consentResolve = value => {
        this._consentResolve = null;
        resolve(value);
      };
      if (this._consentApplyBtn && typeof this._consentApplyBtn.focus === 'function') {
        try {
          this._consentApplyBtn.focus();
        }
        catch (e) {}
      }
    });
  }

  async _loadSources() {
    this._needsRestore = true;
    const directOk = await this._setDirect();
    let queues = null;
    try {
      if (!directOk) {
        this.log('fetch aborted: switch to direct failed');
        queues = null;
        return queues;
      }
      this.log(`fetching ${SEARCH_SOURCES.length} proxy sources...`);
      const settled = await Promise.allSettled(SEARCH_SOURCES.map(source => {
        this.log(`fetching ${source.label}...`);
        return search.fetchSource(source).then(
          ({list}) => {
            this.log(`source ${source.label}: fetched ${list.length} proxies`);
            return {source, list, ok: true};
          },
          e => {
            this.log(`source ${source.label}: fetch failed (${(e && e.message) || e})`);
            return {source, list: [], ok: false};
          }
        );
      }));
      const built = new Map();
      settled.forEach(result => {
        if (result.status === 'fulfilled' && result.value.ok) {
          const {source, list} = result.value;
          built.set(source.id, {source, queue: search.shuffle(list)});
        }
      });
      if (!built.size) {
        this.log('all sources failed');
        queues = null;
      }
      else {
        const summary = SEARCH_SOURCES.filter(s => built.has(s.id)).map(s => `${s.id}=${built.get(s.id).queue.length}`).join(' ');
        this.log(`sources ready: ${summary} (shuffled)`);
        queues = built;
      }
    }
    finally {
      await this._restore();
    }
    return queues;
  }

  async start() {
    if (this._running) {
      this.log('search already running');
      return null;
    }
    this._running = true;
    this._cancelled = false;
    this._explicitClose = false;
    this._closePopup = false;
    this._phase = 'searching';
    this._needsRestore = false;
    this._succeeded = false;
    this._original = null;
    this._consentResolve = null;
    this._updateToggle();
    try {
      if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.searching = 'true';
      }
    }
    catch (e) {}
    this._clearLog();
    this.log('search started');

    try {
      const original = await new Promise(resolve => {
        try {
          chrome.proxy.settings.get({}, result => {
            const msg = getLastErrorMessage();
            if (msg) {
              this.log('original read failed (' + msg + ')');
              resolve(null);
              return;
            }
            const value = result && result.value ? result.value : null;
            resolve(value ? JSON.parse(JSON.stringify(value)) : value);
          });
        }
        catch (e) {
          this.log('original read failed (' + ((e && e.message) || e) + ')');
          resolve(null);
        }
      });
      this._original = original;
      this.log(`original mode=${original && original.mode || 'unknown'}`);

      this._connectGuard();

      this._showSearching();
      this._ensureOpen();
      this.log('dialog opened (searching)');

      let queues = await this._loadSources();
      if (!queues) {
        this.log('search cancelled');
        return null;
      }
      if (this._cancelled) {
        this.log('search cancelled');
        await this._restore();
        return null;
      }

      let attempt = 0;
      let valid = null;
      let decision = null;
      const tried = new Set();
      while (!this._cancelled) {
        valid = null;
        while (!this._cancelled && !valid) {
          attempt += 1;
          let candidateEntry = null;
          let candidateSource = null;
          for (let k = 0; k < SEARCH_SOURCES.length; k += 1) {
            const source = SEARCH_SOURCES[(attempt - 1 + k) % SEARCH_SOURCES.length];
            const holder = queues.get(source.id);
            if (!holder) {
              continue;
            }
            while (holder.queue.length) {
              const entry = holder.queue.shift();
              if (tried.has(entry)) {
                this.log(`skipping duplicate ${entry} (already tried)`);
                continue;
              }
              candidateEntry = entry;
              candidateSource = source;
              break;
            }
            if (candidateEntry) {
              break;
            }
          }
          if (!candidateEntry) {
            this.log('all queues empty, refetching...');
            const fresh = await this._loadSources();
            if (!fresh) {
              this.log('search cancelled');
              return null;
            }
            queues = fresh;
            if (this._cancelled) {
              break;
            }
            await this._delay(800);
            continue;
          }
          tried.add(candidateEntry);
          if (this._cancelled) {
            break;
          }
          this.log(`attempt ${attempt}: source ${candidateSource.label} trying ${candidateEntry}`);
          let candidate = null;
          try {
            candidate = search.convert(candidateEntry);
          }
          catch (e) {
            this.log(`attempt ${attempt}: skipping malformed entry ${candidateEntry} (${(e && e.message) || e})`);
            if (this._cancelled) {
              break;
            }
            await this._delay(800);
            continue;
          }
          candidate.source = candidateSource;
          this.log(`attempt ${attempt}: source ${candidateSource.label} candidate ${search.formatHostPort(candidate.info)}`);
          this.log(`attempt ${attempt}: transient verify start for ${search.formatHostPort(candidate.info)}`);
          this._needsRestore = true;
          let ok = false;
          try {
            await search.verify(candidate.proxy, m => this.log(m));
            ok = true;
            this.log(`attempt ${attempt}: verify ok`);
          }
          catch (e) {
            this.log(`attempt ${attempt}: verify failed (${(e && e.message) || e}) trying another...`);
          }
          await this._restore();
          if (ok) {
            valid = candidate;
            break;
          }
          if (this._cancelled) {
            break;
          }
          this.log(`attempt ${attempt}: candidate invalid, trying another...`);
          await this._delay(800);
        }
        if (this._cancelled || !valid) {
          break;
        }
        decision = await this._waitConsent(valid.info, valid.source);
        if (decision === 'apply') {
          break;
        }
        if (decision === 'abort') {
          this._cancelled = true;
          this._explicitClose = true;
          break;
        }
        // Find new one: discard the consented candidate and keep searching.
        this.log('find new one requested, continuing search...');
        this._showSearching();
        valid = null;
      }

      if (decision === 'abort') {
        this.log('abort: restoring original and closing panel');
        this._needsRestore = true;
        await this._restore();
        this._closePopup = true;
        return null;
      }
      if (this._cancelled) {
        this.log('search cancelled');
        await this._restore();
        return null;
      }
      if (!valid) {
        this.log('search ended, no valid proxy');
        return null;
      }

      this.log('apply applied, applying candidate');
      this._needsRestore = true;
      const applied = await this._applyCandidate(valid.proxy);
      if (!applied) {
        this.log('final apply failed, restoring original');
        await this._restore();
        this._succeeded = false;
        return null;
      }
      this._succeeded = true;
      this._needsRestore = false;
      this.log('search completed, candidate kept');
      try {
        if (typeof CustomEvent !== 'undefined' && typeof this.dispatchEvent === 'function') {
          this.dispatchEvent(new CustomEvent('search-validated', {detail: valid, bubbles: true, composed: true}));
        }
      }
      catch (e) {}
      return valid;
    }
    catch (e) {
      this.log('error: ' + ((e && e.message) || e));
      await this._restore();
      return null;
    }
    finally {
      this._phase = 'idle';
      try {
        if (typeof document !== 'undefined' && document.body) {
          document.body.dataset.searching = 'false';
        }
      }
      catch (e) {}
      // The final set() (or any restore) fired onChange while searching was
      // 'true', so proxy.js update() swallowed it and the panel never
      // re-synced (e.g. the selected tab stayed off Manual after a
      // successful search). Re-sync once now that the guard is cleared.
      try {
        if (typeof globalThis !== 'undefined' && typeof globalThis.update === 'function') {
          globalThis.update();
        }
      }
      catch (e) {}
      this._disconnectGuard();
      this._running = false;
      this._updateToggle();
      if (this._succeeded || this._explicitClose || this._closePopup) {
        this._closeConsentDialog();
        this._closeDialog();
        this.log('dialog closed');
      }
      else if (this._dialog && this._dialog.open) {
        this.log('dialog kept open for log review (press Close to dismiss)');
      }
      if (this._closePopup) {
        this.log('abort: closing panel');
        try {
          if (typeof window !== 'undefined' && window && typeof window.close === 'function') {
            window.close();
          }
        }
        catch (e) {}
      }
    }
  }
}

if (typeof customElements !== 'undefined' && customElements.define) {
  customElements.define('search-dialog', SearchDialog);
}

export {search, SearchDialog};
