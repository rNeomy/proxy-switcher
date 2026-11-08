/* globals app */
'use strict';

chrome.proxy.settings.set = new Proxy(chrome.proxy.settings.set, {
  apply(target, self, args) {
    const config = args[0];
    // Chrome strips unknown fields; the Firefox polyfill needs them for translation.
    if (!(chrome.proxy && chrome.proxy.__isFirefoxPolyfill)) {
      delete config.value.remoteDNS;
      delete config.value.noPrompt;
    }

    return Reflect.apply(target, self, args);
  }
});

function update(callback = function() {}, store = true) {
  const _ = chrome.i18n.getMessage;
  chrome.proxy.settings.get({}, result => {
    if (!result || !result.value || !result.value.mode) {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        app.emit('notify', lastError.message);
      }
      return;
    }
    if (document.body && document.body.dataset.searching === 'true') {
      return;
    }
    const {value, levelOfControl} = result;
    app.emit('proxy-changed', value.mode);
    app.emit('proxy-controlled', levelOfControl);

    callback(value.mode, {value});
    if (value.mode === 'fixed_servers') {
      const profile = document.querySelector('manual-view').name;
      if (profile && store) {
        chrome.storage.local.set({
          'last-manual': profile
        });
      }
      app.emit('update-description', _('modeFixedMSG'));
    }
    else if (value.mode === 'pac_script') {
      app.emit('update-description', _('modePACMSG'));
    }
    else if (value.mode === 'direct') {
      app.emit('update-description', _('modeDirectMSG'));
    }
    else if (value.mode === 'auto_detect') {
      app.emit('update-description', _('modeAutoMSG'));
    }
    else if (value.mode === 'system') {
      app.emit('update-description', _('modeSystemMSG'));
    }
  });
}
// initialization
update((mode, config) => {
  Promise.all([
    () => { // fixed_servers
      if (mode === 'fixed_servers') {
        const m = document.querySelector('manual-view');
        return m.search(config).then(name => {
          m.update(config.value, name);
          if (!name) {
            m.random();
          }
          m.profiles();
        });
      }
      else {
        return app.storage('last-manual').then(prefs => {
          const name = prefs['last-manual'];
          const m = document.querySelector('manual-view');
          if (name) {
            return app.storage('profile.' + name).then(prefs => {
              const profile = prefs['profile.' + name];
              if (profile) {
                m.update(profile.value, name);
              }
              else {
                m.random();
              }
              m.profiles();
            });
          }
          else {
            m.random();
            m.profiles();
          }
        });
      }
    },
    () => { // pac_script
      const pac = document.querySelector('pac-view');
      if (mode === 'pac_script') {
        if (config.value.pacScript?.url) {
          pac.set('href', config.value.pacScript.url, true);
          return app.storage({
            'script': false
          }).then(prefs => {
            if (prefs.script) {
              pac.set('script', prefs.script, false);
            }
          });
        }
        else if (config.value.pacScript?.data) {
          pac.set('script', config.value.pacScript.data, true);
          return app.storage({
            'last-pac': false
          }).then(prefs => {
            if (prefs['last-pac']) {
              pac.set('href', prefs['last-pac'], false);
            }
          });
        }
      }
      else {
        return app.storage({
          'script': false,
          'last-pac': false,
          'pac-type': 'url'
        }).then(prefs => {
          if (prefs['last-pac']) {
            pac.set('href', prefs['last-pac'], prefs['pac-type'] === 'url');
          }
          if (prefs.script) {
            pac.set('script', prefs.script, prefs['pac-type'] === 'data');
          }
        });
      }
    }
  ].map(c => c())).then(() => document.body.dataset.ready = true);
}, false);

const proxy = {};
proxy.manual = () => {
  const m = document.querySelector('manual-view');
  const scheme = m.scheme;
  const value = {
    mode: 'fixed_servers',
    rules: {}
  };
  const values = m.values;
  if (values.http.host && values.http.port) {
    value.rules.proxyForHttp = {
      host: values.http.host,
      port: Number(values.http.port),
      scheme
    };
  }
  if (values.ssl.host && values.ssl.port) {
    value.rules.proxyForHttps = {
      host: values.ssl.host,
      port: Number(values.ssl.port),
      scheme
    };
  }
  if (values.ftp.host && values.ftp.port) {
    value.rules.proxyForFtp = {
      host: values.ftp.host,
      port: Number(values.ftp.port),
      scheme
    };
  }
  if (values.fallback.host && values.fallback.port) {
    value.rules.fallbackProxy = {
      host: values.fallback.host,
      port: Number(values.fallback.port),
      scheme
    };
  }
  const bypassList = m.bypassList.split(',').map(s => s.trim())
    .filter((s, i, l) => s && l.indexOf(s) === i);
  if (bypassList.length) {
    value.rules.bypassList = bypassList;
  }

  value.remoteDNS = m.remoteDNS;
  value.noPrompt = m.noPrompt;

  return {value};
};
proxy.pac = async () => {
  const value = {
    mode: 'pac_script',
    pacScript: {
      mandatory: true
    }
  };
  const mode = document.querySelector('pac-view').mode;

  if (mode === 'href') {
    const href = document.querySelector('pac-view').get('href');

    // this is for backup only. Conversion to pacScript is done inside the pac component
    if (href.startsWith('file:///')) {
      const r = await fetch(href);
      if (!r.ok) {
        throw Error('Cannot read from local PAC address');
      }
      value.pacScript.data = await r.text();
    }
    else {
      value.pacScript.url = href;
    }
  }
  else if (mode === 'script') {
    value.pacScript.data = document.querySelector('pac-view').get('script');
  }
  return {value};
};

app.on('change-proxy', async mode => {
  let config = {
    value: {mode}
  };
  try {
    if (mode === 'fixed_servers') {
      config = proxy.manual();
    }
    else if (mode === 'pac_script') {
      config = await proxy.pac();
    }
    // set proxy
    chrome.proxy.settings.set(config, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        app.emit('notify', lastError.message);
        update();
      }
      else {
        update(m => {
          if (m !== mode) {
            app.emit('notify', 'Cannot set this proxy type!');
          }
        });
      }
    });
  }
  catch (e) {
    console.error(e);
    app.emit('notify', e.message || e);
    // re-read actual mode (change tab if necessary)
    update();
  }
});

chrome.proxy.settings.onChange.addListener(() => {
  update();
});

chrome.proxy.onProxyError.addListener(e => {
  app.emit('notify', e.message || e);
});

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'set-manual') {
    app.emit('change-proxy', 'fixed_servers');
  }
});

chrome.runtime.sendMessage({
  method: 'update-icon'
});
