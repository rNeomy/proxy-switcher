/* globals app */
'use strict';

var ui = {
  manual: {
    parent: document.getElementById('manual'),
    profile: document.querySelector('#manual [list="profiles"]'),
    profiles: document.querySelector('#profiles'),
    selector: document.querySelector('#selector'),
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
    bypassList: document.querySelector('[data-type="bypass-list"]'),
    remoteDNS: document.querySelector('[data-type="remote-dns"]'),
    noPrompt: document.querySelector('[data-type="no-prompt"]')
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
// colors
document.querySelector('#tabs li.no-proxy').style['border-top-color'] =
  localStorage.getItem('no-proxy') || '#000';
document.querySelector('#tabs li.auto-proxy').style['border-top-color'] =
  localStorage.getItem('auto-proxy') || '#2124fc';
document.querySelector('#tabs li.system-proxy').style['border-top-color'] =
  localStorage.getItem('system-proxy') || '#31736b';
document.querySelector('#tabs li.manual-proxy').style['border-top-color'] =
  localStorage.getItem('manual-proxy') || '#fd0e1c';
document.querySelector('#tabs li.pac-proxy').style['border-top-color'] =
  localStorage.getItem('pac-proxy') || '#fb9426';

document.addEventListener('click', ({target, isTrusted}) => {
  // select radio buttons on focus
  const id = target.getAttribute('for');
  if (id) {
    const elem = document.getElementById(id);
    elem.checked = true;
    if (elem.dataset.mode) {
      app.emit('change-proxy', elem.dataset.mode);
    }
  }
  // change proxy type
  const mode = target.dataset.mode;
  if (mode && isTrusted) {
    app.emit('change-proxy', mode);
  }
});
// change in pac url
ui.pac.input.addEventListener('keyup', ({target}) => {
  ui.pac.apply.disabled = !target || target.value === target.dataset.value;
});
// mirroring HTTP
ui.manual.http.host.addEventListener('input', ({target}) => {
  ui.manual.https.host.value = ui.manual.ftp.host.value = target.value;
});
ui.manual.http.port.addEventListener('input', ({target}) => {
  ui.manual.https.port.value = ui.manual.ftp.port.value = target.value;
});
// change in manual tab
(function(callback) {
  ui.manual.parent.addEventListener('input', callback);
  ui.manual.parent.addEventListener('change', callback);
})(e => {
  if (e.target === ui.manual.selector) {
    return;
  }
  const parent = ui.manual.parent;
  let changed = [
    ...parent.querySelectorAll('[type=text]'),
    ...parent.querySelectorAll('[type=number]'),
  ].reduce((p, c) => p || c.dataset.value !== c.value, false);
  changed = changed || [
    ...parent.querySelectorAll('[type=radio]'),
    ...parent.querySelectorAll('[type=checkbox]')
  ].reduce((p, c) => p || String(c.checked) !== c.dataset.value, false);
  // profile name is mandatory
  changed = changed && ui.manual.profile.value;
  ui.manual.apply.disabled = !changed;
  //
  ui.manual.selector.value = changed ? '' : ui.manual.profile.value;
  // remote DNS
  const scheme = ui.manual.type.querySelector(':checked').value;
  ui.manual.remoteDNS.parentNode.dataset.available = scheme === 'socks5';
  if (!scheme.startsWith('socks')) {
    ui.manual.remoteDNS.checked = false;
  }
});
// updating from object
app.on('update-manual-tab', ({value}) => {
  const rules = value.rules;
  if (rules.fallbackProxy) {
    ui.manual.others.host.value = rules.fallbackProxy.host;
    ui.manual.others.port.value = rules.fallbackProxy.port;
  }
  else {
    ui.manual.others.host.value = ui.manual.others.port.value = '';
  }
  if (rules.proxyForHttp) {
    ui.manual.http.host.value = rules.proxyForHttp.host;
    ui.manual.http.port.value = rules.proxyForHttp.port;
  }
  else {
    ui.manual.http.host.value = ui.manual.http.port.value = '';
  }
  if (rules.proxyForHttps) {
    ui.manual.https.host.value = rules.proxyForHttps.host;
    ui.manual.https.port.value = rules.proxyForHttps.port;
  }
  else {
    ui.manual.https.host.value = ui.manual.https.port.value = '';
  }
  if (rules.proxyForFtp) {
    ui.manual.ftp.host.value = rules.proxyForFtp.host;
    ui.manual.ftp.port.value = rules.proxyForFtp.port;
  }
  else {
    ui.manual.ftp.host.value = ui.manual.ftp.port.value = '';
  }
  ui.manual.bypassList.value = value.rules.bypassList ? value.rules.bypassList.join(', ') : '';

  ui.manual.remoteDNS.checked = value.remoteDNS;
  ui.manual.noPrompt.checked = value.noPrompt;

  const scheme = Object.keys(value.rules)
    .filter(s => ['proxyForHttp', 'proxyForHttps', 'proxyForFtp', 'fallbackProxy'].indexOf(s) !== -1)
    .sort()
    .reverse()
    .reduce((p, c) => p || value.rules[c].scheme, '') || 'http';

  [...ui.manual.parent.querySelectorAll('[type="radio"]')].forEach(r => {
    r.checked = r.value === scheme;
  });

  app.emit('reset-manual-tab');
});
app.on('reset-manual-tab', (exceptions = []) => {
  [...ui.manual.parent.querySelectorAll('[data-value]')].forEach(e => {
    if (exceptions.indexOf(e) !== -1) {
      return;
    }
    if (e.type === 'radio' || e.type === 'checkbox') {
      e.dataset.value = e.checked;
    }
    else {
      e.dataset.value = e.value;
    }
  });
  // updating delete button status
  chrome.storage.local.get({
    profiles: []
  }, prefs => {
    const exist = prefs.profiles.indexOf(ui.manual.profile.value) !== -1;
    ui.manual.delete.disabled = !exist;
  });
  // updating apply button status
  ui.manual.parent.dispatchEvent(new Event('change'));
});

// searching profiles
ui.manual.profile.addEventListener('input', ({target}) => {
  const value = target.value;

  chrome.storage.local.get(null, prefs => {
    const profile = prefs['profile.' + value];
    if (profile) {
      app.emit('update-manual-tab', profile);
      app.emit('change-proxy', 'fixed_servers');
    }
  });
});
// searching pacs
ui.pac.input.addEventListener('keyup', ({target, isTrusted}) => {
  const value = target.value;
  chrome.storage.local.get({
    pacs: []
  }, prefs => {
    const index = prefs.pacs.indexOf(value);
    if (index !== -1) {
      ui.pac.input.dataset.value = value;
    }
    ui.pac.delete.disabled = index === -1;
    // only change proxy if user wants to
    if (isTrusted) {
      app.emit('change-proxy', 'pac_script');
    }
  });
});
// pac_script -> script
ui.pac.editor.addEventListener('change', ({target}) => {
  app.emit('change-proxy', 'pac_script');
  chrome.storage.local.set({
    script: target.value
  });
});

ui.pac.urls.addEventListener('input', () => {
  ui.pac.input.dispatchEvent('keyup', {
    bubbles: true
  });
});

app.on('proxy-changed', mode => {
  const tab = document.querySelector(`#tabs [data-mode="${mode}"]`);
  const open = tab.dataset.open;
  if (open) {
    const body = document.getElementById(open);
    [...document.querySelectorAll('.body')].filter(b => b !== body)
      .forEach(b => b.classList.add('hide'));
    body.classList.remove('hide');
    tab.click();
  }
});

app.on('notify', msg => {
  msg = msg.error || msg.message || msg;
  const div = document.createElement('div');
  div.textContent = (new Date()).toTimeString().split(' ')[0] + ': ' + msg;
  document.getElementById('notify').appendChild(div);
  div.scrollIntoView();
  window.setTimeout(() => document.getElementById('notify').removeChild(div), 5000);
});
