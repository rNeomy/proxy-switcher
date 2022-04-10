import './editor-view/core.js'

const SAMPLE = `function FindProxyForURL(url, host) {
  // our local URLs from the domains below example.com don't need a proxy:
  if (shExpMatch(host, "*.example.com")) {
    return "DIRECT";
  }

  // URLs within this network are accessed through
  // port 8080 on fastproxy.example.com:
  if (isInNet(host, "10.0.0.0", "255.255.248.0")) {
    return "PROXY fastproxy.example.com:8080";
  }

  // All other requests go through port 8080 of proxy.example.com.
  // should that fail to respond, go directly to the WWW:
  return "PROXY proxy.example.com:8080; DIRECT";
}`;

class PacView extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({
      mode: 'open'
    });
    shadow.innerHTML = `
      <style>
        .grid {
          display: grid;
          grid-template-columns: min-content 1fr;
          white-space: nowrap;
          align-items: start;
          grid-gap: 10px;
        }
        .one {
          display: grid;
          grid-template-columns: 1fr 40px 40px 40px;
        }
        label {
          cursor: pointer;
          display: flex;
        }
        input[type=text],
        input[type=submit],
        input[type=button] {
          padding: 8px 5px;
          border: none;
          outline: none;
        }
        input[type=radio] {
          margin: 5px;
        }
        input[type=submit],
        input[type=button] {
          cursor: pointer;
        }
        input:disabled {
          opacity: 0.2;
          cursor: default;
        }
        #href {
          background-color: #f0f0f0;
        }
        #reload {
          background: #f0f0f0 url(images/reload.svg) center center no-repeat;
          background-size: 14px;
        }
        #href:focus {
          background-color: #c0e7ff;
        }
        #apply {
          background: #52af52 url(images/ok.svg) center center no-repeat;
          background-size: 14px;
        }
        #remove {
          background: #eea345 url(images/no.svg) center center no-repeat;
          background-size: 22px;
        }
        #editor {
          background-color: #f0f0f0;
          overflow: auto;
          height: 300px;
        }
        .disabled {
          opacity: 0.4;
          pointer-events: none;
        }
      </style>
      <p>Automatic proxy configuration</p>
      <div class="grid">
        <label><input id="pac-1" type="radio" name="pac" checked value="href" data-mode="pac_script">URL</label>
        <form class="one" id="href-container">
          <input type="text" id="href" placeholder="http://example.com/sample.pac" for="pac-1" list="pacs" autocomplete="off" data-value="" value="">
          <input type="button" id="reload" data-cmd="reload-pac">
          <input type="button" id="remove" disabled="true" data-cmd="delete-pac">
          <input type="submit" id="apply" disabled="true" value="">
        </form>
        <label class="chrome"><input id="pac-2" type="radio" name="pac" value="script" data-mode="pac_script">Inline</label>
        <editor-view id="editor" for="pac-2" class="chrome"></editor-view>
      </div>
      <datalist id="pacs"></datalist>
    `;
  }
  connectedCallback() {
    if (/Firefox/.test(navigator.userAgent)) {
      [...this.shadowRoot.querySelectorAll('.chrome')].forEach(e => e.classList.add('disabled'));
    }

    const editor = this.shadowRoot.getElementById('editor');
    editor.value = SAMPLE;

    // change in pac url
    const reload = this.shadowRoot.getElementById('reload');
    const apply = this.shadowRoot.getElementById('apply');
    const remove = this.shadowRoot.getElementById('remove');
    const href = this.shadowRoot.getElementById('href');
    href.addEventListener('keyup', ({target, code}) => {
      apply.disabled = !target || target.value === target.dataset.value;
    });

    // searching pacs
    href.addEventListener('keyup', ({target}) => {
      const value = target.value;
      app.storage({
        pacs: []
      }).then(prefs => {
        const index = prefs.pacs.indexOf(value);
        if (index !== -1) {
          href.dataset.value = value;
        }
        remove.disabled = index === -1;
      });
    });

    // pac_script -> script
    const changed = () => {
      app.emit('change-proxy', 'pac_script');

      chrome.storage.local.set({
        'script': editor.value
      });
    };
    editor.editor.on('change', e => {
      clearTimeout(editor.timeout);
      editor.timeout = setTimeout(changed, 300);
    });

    this.shadowRoot.getElementById('pacs').addEventListener('input', () => {
      href.dispatchEvent('keyup', {
        bubbles: true
      });
    });

    this.shadowRoot.getElementById('pac-1').onchange = e => {
      if (e.target.checked) {
        app.emit('change-proxy', 'pac_script');
        chrome.storage.local.set({
          'pac-type': 'url'
        });
      }
    };
    this.shadowRoot.getElementById('pac-2').onchange = e => {
      if (e.target.checked) {
        app.emit('change-proxy', 'pac_script');
        chrome.storage.local.set({
          'pac-type': 'data'
        });
      }
    };

    this.shadowRoot.getElementById('href-container').addEventListener('submit', e => {
      e.preventDefault();
      this.apply();
    });
    remove.addEventListener('click', () => this.remove());
    reload.addEventListener('click', () => this.reload());

    href.onfocus = () => this.shadowRoot.getElementById('pac-1').click();
    editor.onfocus = () => this.shadowRoot.getElementById('pac-2').click();

    this.build();
  }
  build() {
    const pacs = this.shadowRoot.getElementById('pacs');

    app.storage({
      'pacs': []
    }).then(prefs => {
      // update pacs
      pacs.textContent = '';
      prefs.pacs.forEach(pac => {
        const option = document.createElement('option');
        option.value = pac;
        pacs.appendChild(option);
      });
    });
  }
  apply() {
    const href = this.shadowRoot.getElementById('href');
    const pac = href.value;
    href.dataset.value = pac;

    chrome.storage.local.set({
      'last-pac': href.value
    });
    app.storage({
      pacs: []
    }).then(prefs => {
      prefs.pacs.push(pac);
      prefs.pacs = prefs.pacs.filter((p, i, l) => p && l.indexOf(p) === i);
      chrome.storage.local.set(prefs, () => {
        href.dispatchEvent(new Event('keyup'));
        console.log('done');
        app.emit('change-proxy', 'pac_script');
        this.build();
      });
    });
  }
  remove() {
    const href = this.shadowRoot.getElementById('href');
    const pac = href.value;
    chrome.storage.local.remove('last-pac');
    app.storage({
      pacs: []
    }).then(prefs => {
      const index = prefs.pacs.indexOf(pac);
      if (index !== -1) {
        prefs.pacs.splice(index, 1);
        chrome.storage.local.set(prefs, () => {
          href.dataset.value = '';
          href.dispatchEvent(new Event('keyup'));
          this.build();
        });
      }
    });
  }
  reload() {
    const href = this.shadowRoot.getElementById('href');
    const url = href.value;
    href.value = 'http://127.0.0.1:8888/dummy.pac';
    app.emit('change-proxy', 'pac_script');
    href.value = url;
    app.emit('change-proxy', 'pac_script');
  }
  set(mode, value, select = false) {
    if (mode === 'href') {
      const href = this.shadowRoot.getElementById('href');
      href.dataset.value = href.value = value;
      if (select) {
        this.shadowRoot.getElementById('pac-1').checked = true;
        href.focus();
      }
      href.dispatchEvent(new Event('keyup'));
    }
    else if (mode === 'script') {
      const editor = this.shadowRoot.getElementById('editor');
      editor.value = value;
      clearTimeout(editor.timeout); // prevent editor from saving
      if (select) {
        this.shadowRoot.getElementById('pac-2').checked = true;
        editor.focus();
      }
      editor.dispatchEvent(new Event('keyup'));
    }
  }
  get mode() {
    return this.shadowRoot.querySelector('[name="pac"]:checked').value;
  }
  get(mode) {
    if (mode === 'href') {
      return this.shadowRoot.getElementById('href').value || 'http://example.com/sample.pac';
    }
    else if (mode === 'script') {
      return this.shadowRoot.getElementById('editor').value;
    }
  }
}
window.customElements.define('pac-view', PacView);
