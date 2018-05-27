'use strict';

var config = {
  text: false,
  counter: true,
  color: '#666666',
  server: 'https://gimmeproxy.com/api/getProxy',
  'validate-mode': 'direct',
  anonymity: '',
  allowsRefererHeader: '',
  allowsUserAgentHeader: '',
  allowsCustomHeaders: '',
  allowsCookies: '',
  country: '',
  faqs: true,
  'startup-proxy': 'no'
};

function save() {
  localStorage.setItem('no-proxy', document.getElementById('no-proxy').value);
  localStorage.setItem('auto-proxy', document.getElementById('auto-proxy').value);
  localStorage.setItem('system-proxy', document.getElementById('system-proxy').value);
  localStorage.setItem('manual-proxy', document.getElementById('manual-proxy').value);
  localStorage.setItem('pac-proxy', document.getElementById('pac-proxy').value);

  chrome.storage.local.set({
    text: document.getElementById('text').checked,
    counter: document.getElementById('counter').checked,
    color: document.getElementById('color').value,
    server: document.getElementById('server').value,
    'validate-mode': document.getElementById('validate-mode').value,
    anonymity: document.getElementById('anonymity').value,
    allowsRefererHeader: document.getElementById('allowsRefererHeader').value,
    allowsUserAgentHeader: document.getElementById('allowsUserAgentHeader').value,
    allowsCustomHeaders: document.getElementById('allowsCustomHeaders').value,
    allowsCookies: document.getElementById('allowsCookies').value,
    country: document.getElementById('country').value,
    faqs: document.getElementById('faqs').checked,
    'startup-proxy': document.getElementById('startup-proxy').value,
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';

    chrome.runtime.getBackgroundPage(bg => bg.chrome.proxy.settings.get({}, bg.icon));

    setTimeout(() => status.textContent = '', 750);
  });
}

function restore() {
  document.getElementById('no-proxy').value =
    localStorage.getItem('no-proxy') || '#000';
  document.getElementById('auto-proxy').value =
    localStorage.getItem('auto-proxy') || '#2124fc';
  document.getElementById('system-proxy').value =
    localStorage.getItem('system-proxy') || '#31736b';
  document.getElementById('manual-proxy').value =
    localStorage.getItem('manual-proxy') || '#fd0e1c';
  document.getElementById('pac-proxy').value =
    localStorage.getItem('pac-proxy') || '#fb9426';
  chrome.storage.local.get(config, prefs => {
    Object.entries(prefs).forEach(([key, value]) => {
      document.getElementById(key)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
    });
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', () => {
  Object.entries(config).forEach(([key, value]) => {
    document.getElementById(key)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
  });
});
document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const text = JSON.stringify(prefs, null, '\t');
    const blob = new Blob([text], {type: 'application/json'});
    const objectURL = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: objectURL,
      type: 'application/json',
      download: 'proxy-switcher-preferences.json',
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(objectURL));
  });
});
document.getElementById('import').addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.style.display = 'none';
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.acceptCharset = 'utf-8';

  document.body.appendChild(fileInput);
  fileInput.initialValue = fileInput.value;
  fileInput.onchange = readFile;
  fileInput.click();

  function readFile() {
    if (fileInput.value !== fileInput.initialValue) {
      const file = fileInput.files[0];
      if (file.size > 100e6) {
        console.warn('100MB backup? I don\'t believe you.');
        return;
      }
      const fReader = new FileReader();
      fReader.onloadend = event => {
        fileInput.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.set(json, () => chrome.runtime.reload());
      };
      fReader.readAsText(file, 'utf-8');
    }
  }
});

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));
