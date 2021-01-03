/* global app, proxy */

import {search} from './manual-view-search.js'

class ManualView extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({
      mode: 'open'
    });
    shadow.innerHTML = `
      <style>
        .grid {
          display: grid;
          grid-template-columns: min-content 1fr min-content min-content;
          grid-gap: 10px;
          white-space: nowrap;
        }
        .box {
          grid-column: 2/5;
          display: grid;
          grid-template-columns: 1fr 30px 40px 40px;
        }
        .type {
          display: flex;
          grid-column: 2/4;
          align-items: start;
        }
        .type label {
          display: flex;
          align-items: center;
          margin-right: 5px;
          cursor: pointer;
        }
        .dns {
          display: grid;
          grid-template-columns: min-content 1fr;
          align-items: center;
          user-select: none;
        }
        select {
          border: none;
          outline: none;
          cursor: pointer;
          appearance: none;
          background: #f0f0f0 url(images/arrow.svg) center center no-repeat;
          background-size: 10px;
          text-indent: 100px;
        }
        input[type=radio] {
          margin: 2px;
        }
        input[type=button] {
          border: none;
        }
        input[type=text],
        input[type=number] {
          background-color: #f0f0f0;
          border: none;
          padding: 8px 5px;
          outline: none;
        }
        input[type=text]:focus,
        input[type=number]:focus {
          background-color: #c0e7ff;
        }
        input[type=number] {
          width: 90px;
        }
        #apply {
          background: #52af52 url(images/ok.svg) center center no-repeat;
          background-size: 14px;
        }
        #remove {
          background: #eea345 url(images/no.svg) center center no-repeat;
          background-size: 22px;
        }
        input[type=button] {
          cursor: pointer;
        }
        input:disabled {
          opacity: 0.2;
          cursor: default;
        }
        #bypass-list {
          grid-column: 2/5;
        }
        #search {
          grid-column: 3/5;
          padding: 8px 5px;
        }
        #search-log {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        input::-webkit-calendar-picker-indicator {
          display: none;
        }
        .disabled {
          opacity: 0.4;
          pointer-events: none;
        }
      </style>
      <div class="grid">
        <span>Profile Name:</span>
        <div class="box">
          <input type="text" id="profile" list="profiles" placeholder="mandatory" data-value=""/>
          <select id="selector"></select>
          <input type="button" id="apply" disabled title="Delete this profile">
          <input type="button" id="remove" disabled title="Save as a new profile&#013;&#013;To have multiple profiles, just change the profile name and press on this save button">
        </div>
        <span>HTTP Proxy:</span>
        <input type="text" placeholder="0.0.0.0" value="127.0.0.1" data-value="127.0.0.1" id="http-host">
        <span>Port</span>
        <input type="number" value="8888" data-value="8888" id="http-port">

        <span>SSL Proxy:</span>
        <input type="text" placeholder="0.0.0.0" value="127.0.0.1" data-value="127.0.0.1" id="ssl-host">
        <span>Port</span>
        <input type="number" value="8888" data-value="8888" id="ssl-port">
        <span>FTP Proxy:</span>
        <input type="text" placeholder="0.0.0.0" value="127.0.0.1" data-value="127.0.0.1" id="ftp-host">
        <span>Port</span>
        <input type="number" value="8888" data-value="8888" id="ftp-port">
        <span>Fallback Proxy:</span>
        <input type="text" placeholder="0.0.0.0" value="" data-value="" id="fallback-host" class="chrome">
        <span>Port</span>
        <input type="number" value="" data-value="" id="fallback-port" class="chrome">
        <span>Server Type:</span>
        <div class="type">
          <label><input type="radio" name="socks" value="http" data-value="false">HTTP</label>
          <label class="chrome"><input type="radio" name="socks" value="https" data-value="false">HTTPS</label>
          <label><input type="radio" name="socks" value="socks4" data-value="false">SOCKS v4</label>
          <label><input type="radio" name="socks" value="socks5" checked data-value="true">SOCKS v5</label>
        </div>
        <div class="dns">
          <input type="checkbox" id="remote-dns" data-value="false">
          <label for="remote-dns" title="Proxy DNS when using SOCKS v5">Remote DNS</label>
          <input type="checkbox" id="no-prompt" data-value="false">
          <label for="no-prompt" title="Do not prompt for authentication if password is saved">No Prompt</label>
        </div>
        <td>Direct:</td>
        <input type="text" id="bypass-list" placeholder="comma separated list of IPs" data-value="localhost, 127.0.0.1, 192.168.8.0" value="localhost, 127.0.0.1, 192.168.8.0">
        <span>Search</span>
        <span id="search-log">Find a free proxy server</span>
        <input type="button" value="Search" id="search">
      </div>
      <datalist id="profiles"></datalist>
    `;
  }
  reset() {
    [...this.shadowRoot.querySelectorAll('[data-value]')].forEach(e => {
      if (e.type === 'radio' || e.type === 'checkbox') {
        e.dataset.value = e.checked;
      }
      else {
        e.dataset.value = e.value;
      }
    });
  }
  update(profile, name) {
    if (name) {
      this.name = name;
      this.active = name;
      this.shadowRoot.getElementById('selector').value = name;
    }

    const rules = profile.rules;

    if (rules.fallbackProxy) {
      this.shadowRoot.getElementById('fallback-host').value = rules.fallbackProxy.host;
      this.shadowRoot.getElementById('fallback-port').value = rules.fallbackProxy.port;
    }
    else {
      this.shadowRoot.getElementById('fallback-host').value =
      this.shadowRoot.getElementById('fallback-port').value = '';
    }
    if (rules.proxyForHttp) {
      this.shadowRoot.getElementById('http-host').value = rules.proxyForHttp.host;
      this.shadowRoot.getElementById('http-port').value = rules.proxyForHttp.port;
    }
    else {
      this.shadowRoot.getElementById('http-host').value =
      this.shadowRoot.getElementById('http-port').value = '';
    }
    if (rules.proxyForHttps) {
      this.shadowRoot.getElementById('ssl-host').value = rules.proxyForHttps.host;
      this.shadowRoot.getElementById('ssl-port').value = rules.proxyForHttps.port;
    }
    else {
      this.shadowRoot.getElementById('ssl-host').value =
      this.shadowRoot.getElementById('ssl-port').value = '';
    }
    if (rules.proxyForFtp) {
      this.shadowRoot.getElementById('ftp-host').value = rules.proxyForFtp.host;
      this.shadowRoot.getElementById('ftp-port').value = rules.proxyForFtp.port;
    }
    else {
      this.shadowRoot.getElementById('ftp-host').value =
      this.shadowRoot.getElementById('ftp-port').value = '';
    }
    this.shadowRoot.getElementById('bypass-list').value =
      profile.rules.bypassList ? profile.rules.bypassList.join(', ') : '';

    this.shadowRoot.getElementById('remote-dns').checked = profile.remoteDNS;
    this.shadowRoot.getElementById('no-prompt').checked = profile.noPrompt;

    const scheme = Object.keys(profile.rules)
      .filter(s => ['proxyForHttp', 'proxyForHttps', 'proxyForFtp', 'fallbackProxy'].indexOf(s) !== -1)
      .sort()
      .reverse()
      .reduce((p, c) => p || profile.rules[c].scheme, '') || 'http';

    const s = this.shadowRoot.querySelector(`.type [value="${scheme}"]`);
    s.checked = true;
    s.dispatchEvent(new Event('change', {
      bubbles: true
    }));

    // update states
    this.reset();
    this.buttons();
  }
  buttons() {
    const parent = this.shadowRoot;
    // updating delete button status
    app.storage({
      profiles: []
    }).then(prefs => {
      const profile = parent.getElementById('profile');
      const exist = prefs.profiles.indexOf(profile.value) !== -1;
      parent.getElementById('remove').disabled = !exist;
    });
    // updating apply button
    let changed = [
      ...parent.querySelectorAll('[type=text]'),
      ...parent.querySelectorAll('[type=number]')
    ].reduce((p, c) => p || c.dataset.value !== c.value, false);
    changed = changed || [
      ...parent.querySelectorAll('[type=radio]'),
      ...parent.querySelectorAll('[type=checkbox]')
    ].reduce((p, c) => p || String(c.checked) !== c.dataset.value, false);

    const profile = parent.getElementById('profile');
    if (changed === false && this.active !== profile.value) {
      changed = true;
    }
    // profile name is mandatory
    changed = changed && Boolean(profile.value);

    parent.getElementById('apply').disabled = !changed;
  }
  connectedCallback() {
    if (/Firefox/.test(navigator.userAgent)) {
      [...this.shadowRoot.querySelectorAll('.chrome')].forEach(e => e.classList.add('disabled'));
    }
    // mirroring HTTP
    this.shadowRoot.getElementById('http-host').addEventListener('input', ({target}) => {
      this.shadowRoot.getElementById('ssl-host').value =
      this.shadowRoot.getElementById('ftp-host').value = target.value;
    });
    this.shadowRoot.getElementById('http-port').addEventListener('input', ({target}) => {
      this.shadowRoot.getElementById('ssl-port').value =
      this.shadowRoot.getElementById('ftp-port').value = target.value;
    });
    // searching profiles
    const profile = this.shadowRoot.getElementById('profile');
    profile.addEventListener('input', ({target}) => {
      const value = target.value;
      if (value) {
        app.storage('profile.' + value).then(prefs => {
          const profile = prefs['profile.' + value];
          if (profile) {
            this.update(profile.value);
          }
        });
      }
    });
    this.shadowRoot.getElementById('selector').addEventListener('input', e => {
      e.stopPropagation();
      profile.value = e.target.value;
      profile.dispatchEvent(new Event('input'));
    });
    // on change
    this.shadowRoot.querySelector('.type').addEventListener('change', () => {
      const scheme = this.shadowRoot.querySelector('.type :checked').value;
      if (!scheme.startsWith('socks')) {
        this.shadowRoot.getElementById('remote-dns').checked = false;
      }
      // remote DNS
      if (scheme === 'socks5' && /Firefox/.test(navigator.userAgent)) {
        this.shadowRoot.getElementById('remote-dns').parentNode.classList.remove('disabled');
      }
      else {
        this.shadowRoot.getElementById('remote-dns').parentNode.classList.add('disabled');
      }
    });

    this.shadowRoot.addEventListener('input', () => this.buttons());

    this.shadowRoot.getElementById('apply').onclick = () => this.apply();
    this.shadowRoot.getElementById('remove').onclick = () => this.remove();

    // plug-ins
    search.attach(
      this.shadowRoot.getElementById('search'),
      this.shadowRoot.getElementById('search-log'),
      (proxy, name) => {
        this.update(proxy.value, '');
        this.shadowRoot.getElementById('profile').value = name;
      }
    )
  }
  remove() {
    const profile = this.shadowRoot.getElementById('profile');
    const name = profile.value;
    chrome.storage.local.remove('profile.' + name);
    app.storage({
      profiles: []
    }).then(prefs => {
      const index = prefs.profiles.indexOf(name);
      if (index !== -1) {
        prefs.profiles.splice(index, 1);
        chrome.storage.local.set(prefs, () => {
          // updating list
          this.profiles();
          // updating buttons status
          profile.dataset.value = '';
          this.buttons();
        });
      }
    });
  }
  apply() {
    const profile = this.shadowRoot.getElementById('profile');
    app.storage({
      profiles: []
    }).then(prefs => {
      const name = profile.value;
      prefs.profiles.push(name);
      prefs.profiles = prefs.profiles.filter((n, i, l) => n && l.indexOf(n) === i);
      prefs['profile.' + name] = proxy.manual();

      app.emit('change-proxy', 'fixed_servers');

      chrome.storage.local.set(prefs, () => {
        this.profiles(); // updating list
        this.reset(); // reset states
        this.active = name;
        this.buttons();
      });
    });
  }
  profiles() {
    app.storage({
      profiles: []
    }).then(prefs => {
      const profile = this.shadowRoot.getElementById('profile');
      const profiles = this.shadowRoot.getElementById('profiles');
      const selector = this.shadowRoot.getElementById('selector');

      profiles.textContent = '';
      selector.textContent = '';

      prefs.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.textContent = option.value = profile;
        selector.appendChild(option);
        profiles.appendChild(option.cloneNode(false));
      });
      selector.value = profile.value;
    });
  }
  search(config) {
    return app.storage(null).then(prefs => {
      const name = (prefs.profiles || []).filter(p => {
        const profile = prefs['profile.' + p];
        return app.compare(profile, config);
      }).shift();
      return name;
    });
  }
  random() {
    fetch('assets/animals.json').then(r => r.json()).then(animals => {
      const n = Math.floor(Math.random() * animals.length);
      const profile = this.shadowRoot.getElementById('profile');
      profile.value = animals[n];
      profile.dispatchEvent(new Event('input', {bubbles: true}));
    });
  }
  get scheme() {
    return this.shadowRoot.querySelector('.type :checked').value;
  }
  get values() {
    return {
      http: {
        host: this.shadowRoot.getElementById('http-host').value,
        port: this.shadowRoot.getElementById('http-port').value
      },
      ssl: {
        host: this.shadowRoot.getElementById('ssl-host').value,
        port: this.shadowRoot.getElementById('ssl-port').value
      },
      ftp: {
        host: this.shadowRoot.getElementById('ftp-host').value,
        port: this.shadowRoot.getElementById('ftp-port').value
      },
      fallback: {
        host: this.shadowRoot.getElementById('fallback-host').value,
        port: this.shadowRoot.getElementById('fallback-port').value
      }
    };
  }
  get bypassList() {
    return this.shadowRoot.getElementById('bypass-list').value;
  }
  get remoteDNS() {
    return this.shadowRoot.getElementById('remote-dns').checked;
  }
  get noPrompt() {
    return this.shadowRoot.getElementById('no-prompt').checked;
  }
  get name() {
    return this.shadowRoot.getElementById('profile').value;
  }
  set name(value) {
    this.shadowRoot.getElementById('profile').value = value;
  }
}
window.customElements.define('manual-view', ManualView);
