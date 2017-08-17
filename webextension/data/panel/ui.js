/* globals app */
'use strict';

var ui = {
  manual: {
    parent: document.getElementById('manual'),
    profile: document.querySelector('#manual [list="profiles"]'),
    profiles: document.querySelector('#profiles'),
    delete: document.querySelector('#manual .modify input:first-child'),
    apply: document.querySelector('#manual .modify input:last-child'),
    http: {
      host: document.querySelector('[data-scheme=http] input[type=text]'),
      port: document.querySelector('[data-scheme=http] input[type=number]')
    },
    https: {
      host: document.querySelector('[data-scheme=https] input[type=text]'),
      port: document.querySelector('[data-scheme=https] input[type=number]')
    },
    ftp: {
      host: document.querySelector('[data-scheme=ftp] input[type=text]'),
      port: document.querySelector('[data-scheme=ftp] input[type=number]')
    },
    others: {
      host: document.querySelector('[data-scheme=others] input[type=text]'),
      port: document.querySelector('[data-scheme=others] input[type=number]')
    },
    type: document.querySelector('[data-type="server-type"]'),
    bypassList: document.querySelector('[data-type="bypass-list"]')
  },
  pac: {
    parent: document.getElementById('pac'),
    urls: document.getElementById('pacs'),
    delete: document.querySelector('#pac .modify input:first-child'),
    apply: document.querySelector('#pac .modify input:last-child'),
    input: document.querySelector('[list="pacs"]'),
    editor: document.querySelector('textarea')
  }
};

document.addEventListener('click', (e) => {
  // select radio buttons on focus
  let id = e.target.getAttribute('for');
  if (id) {
    let elem = document.getElementById(id);
    elem.checked = true;
    if (elem.dataset.mode) {
      app.emit('change-proxy', elem.dataset.mode);
    }
  }
  // change proxy type
  let mode = e.target.dataset.mode;
  if (mode && e.isTrusted) {
    app.emit('change-proxy', mode);
  }
});
// change in manual tab
(function (callback) {
  ui.manual.parent.addEventListener('keyup', callback);
  ui.manual.parent.addEventListener('change', callback);
})(() => {
  let parent = ui.manual.parent;

  let changed = [
    ...parent.querySelectorAll('[type=text]'),
    ...parent.querySelectorAll('[type=number]'),
  ].reduce((p, c) => p || c.dataset.value !== c.value, false);
  changed = changed || [...parent.querySelectorAll('[type=radio]')]
    .reduce((p, c) => p || c.checked + '' !== c.dataset.value, false);
  // profile name is mandatory
  changed = changed && ui.manual.profile.value;
  ui.manual.apply.disabled = !changed;
});
// change in pac url
ui.pac.input.addEventListener('keyup', (e) => {
  let target = e.target;
  ui.pac.apply.disabled = !target || target.value === target.dataset.value;
});
// mirroring HTTP
ui.manual.http.host.addEventListener('keyup', (e) => {
  ui.manual.https.host.value = ui.manual.ftp.host.value = ui.manual.others.host.value = e.target.value;
});
ui.manual.http.port.addEventListener('keyup', (e) => {
  ui.manual.https.port.value = ui.manual.ftp.port.value = ui.manual.others.port.value = e.target.value;
});
// updating from object
app.on('update-manual-tab', config => {
  let value = config.value;

  ui.manual.others.host.dataset.value =
  ui.manual.others.host.value = value.rules.fallbackProxy ? value.rules.fallbackProxy.host : '';
  ui.manual.others.port.dataset.value =
  ui.manual.others.port.value = value.rules.fallbackProxy ? value.rules.fallbackProxy.port : '';

  ui.manual.http.host.dataset.value =
  ui.manual.http.host.value = value.rules.proxyForHttp ? value.rules.proxyForHttp.host : '';
  ui.manual.http.port.dataset.value =
  ui.manual.http.port.value = value.rules.proxyForHttp ? value.rules.proxyForHttp.port : '';

  ui.manual.https.host.dataset.value =
  ui.manual.https.host.value = value.rules.proxyForHttps ? value.rules.proxyForHttps.host : '';
  ui.manual.https.port.dataset.value =
  ui.manual.https.port.value = value.rules.proxyForHttps ? value.rules.proxyForHttps.port : '';

  ui.manual.ftp.host.dataset.value =
  ui.manual.ftp.host.value = value.rules.proxyForFtp ? value.rules.proxyForFtp.host : '';
  ui.manual.ftp.port.dataset.value =
  ui.manual.ftp.port.value = value.rules.proxyForFtp ? value.rules.proxyForFtp.port : '';

  ui.manual.bypassList.dataset.value =
  ui.manual.bypassList.value = value.rules.bypassList ? value.rules.bypassList.join(', ') : '';

  let scheme = Object.keys(value.rules).filter(k => k !== 'bypassList')
    .reduce((p, c) => p || value.rules[c].scheme, '') || 'http';
  [...ui.manual.parent.querySelectorAll('[type="radio"]')].forEach(r => {
    r.dataset.value = r.checked = r.value === scheme;
  });

  ui.manual.profile.dispatchEvent(new Event('change', {
    bubbles: true
  }));
});
// searching profiles
ui.manual.profile.addEventListener('keyup', e => {
  let value = e.target.value;
  let prefs = {};
  let name = 'profile.' + value;
  prefs[name] = false;
  chrome.storage.local.get(prefs, prefs => {
    if (prefs[name]) {
      ui.manual.profile.dataset.value = value;
      app.emit('update-manual-tab', prefs[name]);
    }
    ui.manual.delete.disabled = !prefs[name];
    // only change proxy if user wants to
    if (e.isTrusted) {
      app.emit('change-proxy', 'fixed_servers');
    }
  });
});
// searching pacs
ui.pac.input.addEventListener('keyup', e => {
  let value = e.target.value;
  chrome.storage.local.get({
    pacs: []
  }, prefs => {
    let index = prefs.pacs.indexOf(value);
    if (index !== -1) {
      ui.pac.input.dataset.value = value;
    }
    ui.pac.delete.disabled = index === -1;
    // only change proxy if user wants to
    if (e.isTrusted) {
      app.emit('change-proxy', 'pac_script');
    }
  });
});
// pac_script -> script
ui.pac.editor.addEventListener('change', (e) => {
  app.emit('change-proxy', 'pac_script');
  chrome.storage.local.set({
    script: e.target.value
  });
});
// generating change event when datalist is clicked
ui.manual.profiles.addEventListener('input', () => {
  ui.manual.profile.dispatchEvent('keyup', {
    bubbles: true
  });
});
ui.pac.urls.addEventListener('input', () => {
  ui.pac.input.dispatchEvent('keyup', {
    bubbles: true
  });
});

app.on('proxy-changed', mode => {
  let tab = document.querySelector(`#tabs [data-mode="${mode}"]`);
  let open = tab.dataset.open;
  if (open) {
    let body = document.getElementById(open);
    [...document.querySelectorAll('.body')].filter(b => b !== body)
      .forEach(b => b.classList.add('hide'));
    body.classList.remove('hide');
    tab.click();
  }
});

app.on('notify', msg => {
  let div = document.createElement('div');
  div.textContent = (new Date()).toTimeString().split(' ')[0] + ': ' + msg;
  document.getElementById('notify').appendChild(div);
  window.setTimeout(() => document.getElementById('notify').removeChild(div), 2000);
});
