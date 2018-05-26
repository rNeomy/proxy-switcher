/* globals app, ui, profile, _ */
'use strict';

const isFirefox = /Firefox/.test(navigator.userAgent);
if (isFirefox === false) {
  const proxy = chrome.proxy.settings.set;
  chrome.proxy.settings.set = function(config) {
    delete config.value.remoteDNS;
    delete config.value.noPrompt;
    proxy.apply(chrome.proxy.settings, arguments);
  };
}

function update(callback = function() {}) {
  chrome.proxy.settings.get({}, ({value}) => {
    app.emit('proxy-changed', value.mode);
    callback(value.mode, {value});
    if (value.mode === 'fixed_servers') {
      const profile = ui.manual.profile.value;
      if (profile) {
        chrome.storage.local.set({
          'last-manual': profile
        });
      }
      app.emit('update-description', _('modeFixedMSG'));
    }
    else if (value.mode === 'pac_script') {
      if (ui.pac.parent.querySelector('[name="pac"][value="url"]').checked) {
        chrome.storage.local.set({
          'last-pac': ui.pac.input.value,
          'pac-type': 'url'
        });
      }
      else {
        chrome.storage.local.set({
          'script': ui.pac.editor.value,
          'pac-type': 'data'
        });
      }
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
  // fixed_servers
  if (mode === 'fixed_servers') {
    profile.search(config, name => {
      if (name) {
        ui.manual.profile.value = name;
      }
      app.emit('update-manual-tab', config);
    });
  }
  else {
    chrome.storage.local.get('last-manual', prefs => {
      if (prefs['last-manual']) {
        ui.manual.profile.value = prefs['last-manual'];

        chrome.storage.local.get(null, prefs => {
          const profile = prefs['profile.' + prefs['last-manual']];
          app.emit('update-manual-tab', profile);
        });
      }
    });
  }
  // pac_script
  if (mode === 'pac_script') {
    if (config.value.pacScript.url || isFirefox) {
      ui.pac.parent.querySelector('[name="pac"][value="url"]').checked = true;
      ui.pac.input.dataset.value = ui.pac.input.value = config.value.pacScript.url;
      ui.pac.input.dispatchEvent(new Event('keyup'));
    }
    else if (config.value.pacScript.data) {
      ui.pac.parent.querySelector('[name="pac"][value="data"]').checked = true;
      ui.pac.editor.value = config.value.pacScript.data;
    }
  }
  chrome.storage.local.get({
    'last-pac': false,
    'script': false,
    'pac-type': isFirefox ? 'url' : 'data'
  }, prefs => {
    if (prefs['last-pac'] && (mode !== 'pac_script' || !config.value.pacScript.url)) {
      ui.pac.input.dataset.value = ui.pac.input.value = prefs['last-pac'];
      ui.pac.input.dispatchEvent(new Event('keyup'));
    }
    if (prefs.script && (mode !== 'pac_script' || !config.value.pacScript.data)) {
      ui.pac.editor.value = prefs.script;
      ui.pac.editor.dispatchEvent(new Event('keyup'));
    }
    if (mode !== 'pac_script') {
      ui.pac.parent.querySelector('[name="pac"][value="' + prefs['pac-type'] + '"]').checked = true;
    }
  });
});

var proxy = {};
proxy.manual = () => {
  const scheme = ui.manual.type.querySelector(':checked').value;
  const value = {
    mode: 'fixed_servers',
    rules: {}
  };
  if (ui.manual.http.host.value && ui.manual.http.port.value) {
    value.rules.proxyForHttp = {
      host: ui.manual.http.host.value,
      port: Number(ui.manual.http.port.value),
      scheme
    };
  }
  if (ui.manual.https.host.value && ui.manual.https.port.value) {
    value.rules.proxyForHttps = {
      host: ui.manual.https.host.value,
      port: Number(ui.manual.https.port.value),
      scheme
    };
  }
  if (ui.manual.ftp.host.value && ui.manual.ftp.port.value) {
    value.rules.proxyForFtp = {
      host: ui.manual.ftp.host.value,
      port: Number(ui.manual.ftp.port.value),
      scheme
    };
  }
  if (ui.manual.others.host.value && ui.manual.others.port.value) {
    value.rules.fallbackProxy = {
      host: ui.manual.others.host.value,
      port: Number(ui.manual.others.port.value),
      scheme
    };
  }

  const bypassList = ui.manual.bypassList.value.split(',').map(s => s.trim())
    .filter((s, i, l) => s && l.indexOf(s) === i);
  if (bypassList.length) {
    value.rules.bypassList = bypassList;
  }

  value.remoteDNS = ui.manual.remoteDNS.checked;
  value.noPrompt = ui.manual.noPrompt.checked;

  return {value};
};
proxy.pac = () => {
  const value = {
    mode: 'pac_script',
    pacScript: {
      mandatory: true
    }
  };
  const mode = ui.pac.parent.querySelector(':checked');
  if (mode && mode.value === 'url') {
    value.pacScript.url = ui.pac.input.value;
  }
  else if (mode && mode.value === 'data') {
    value.pacScript.data = ui.pac.editor.value;
  }
  return {value};
};

app.on('change-proxy', mode => {
  let config = {
    value: {mode}
  };
  if (mode === 'fixed_servers') {
    config = proxy.manual();
  }
  else if (mode === 'pac_script') {
    config = proxy.pac();
  }
  // set proxy
  try {
    chrome.proxy.settings.set(config, () => update(m => {
      if (m !== mode) {
        app.emit('notify', 'Cannot set this proxy type!');
        app.emit('proxy-changed', mode);
      }
    }));
  }
  catch (e) {
    app.emit('notify', e.message || e);
    // change tab if necessary
    app.emit('proxy-changed', mode);
  }
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
