'use strict';

const toast = document.getElementById('toast');

function save() {
  const perform = () => chrome.storage.local.set({
    'text': document.getElementById('text').checked,
    'counter': document.getElementById('counter').checked,
    'color': document.getElementById('color').value,
    'server': document.getElementById('server').value,
    'validate-mode': document.getElementById('validate-mode').value,
    'anonymity': document.getElementById('anonymity').value,
    'allowsRefererHeader': document.getElementById('allowsRefererHeader').value,
    'allowsUserAgentHeader': document.getElementById('allowsUserAgentHeader').value,
    'allowsCustomHeaders': document.getElementById('allowsCustomHeaders').value,
    'allowsCookies': document.getElementById('allowsCookies').value,
    'country': document.getElementById('country').value,
    'faqs': document.getElementById('faqs').checked,
    'startup-proxy': document.getElementById('startup-proxy').value,
    'color-auto_detect': document.getElementById('color-auto_detect').value,
    'color-direct': document.getElementById('color-direct').value,
    'color-fixed_servers': document.getElementById('color-fixed_servers').value,
    'color-pac_script_url': document.getElementById('color-pac_script_url').value,
    'color-pac_script_data': document.getElementById('color-pac_script_data').value,
    'color-system': document.getElementById('color-system').value
  }, () => {
    toast.textContent = 'Options saved.';
    chrome.runtime.getBackgroundPage(bg => bg.chrome.proxy.settings.get({}, bg.icon));
    setTimeout(() => toast.textContent = '', 750);
  });
  if (document.getElementById('counter').checked) {
    chrome.permissions.request({
      permissions: ['webRequest'],
      origins: ['*://*/*']
    }, granted => {
      if (granted) {
        perform();
      }
      else {
        document.getElementById('counter').checked = false;
        perform();
      }
    });
  }
  else {
    perform();
  }
}

const storage = prefs => new Promise(resolve => chrome.storage.managed.get(prefs, ps => {
  chrome.storage.local.get(chrome.runtime.lastError ? prefs : ps || prefs, resolve);
}));


function restore() {
  storage({
    'text': false,
    'counter': false,
    'color': '#666666',
    'server': 'https://api.getproxylist.com/proxy',
    'validate-mode': 'direct',
    'anonymity': '',
    'allowsRefererHeader': '',
    'allowsUserAgentHeader': '',
    'allowsCustomHeaders': '',
    'allowsCookies': '',
    'country': '',
    'faqs': true,
    'startup-proxy': 'no',
    'color-auto_detect': '#2124fc',
    'color-direct': '#000',
    'color-fixed_servers': '#fd0e1c',
    'color-pac_script_url': '#fb9426',
    'color-pac_script_data': '#fb9426',
    'color-system': '#31736b'
  }).then(prefs => {
    Object.entries(prefs).forEach(([key, value]) => {
      document.getElementById(key)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
    });
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);

document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const text = JSON.stringify(prefs, null, '\t');
    const blob = new Blob([text], {type: 'application/json'});
    const objectURL = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: objectURL,
      type: 'application/json',
      download: 'proxy-switcher-preferences.json'
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

// reset
document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    toast.textContent = 'Double-click to reset!';
    window.setTimeout(() => toast.textContent = '', 750);
  }
  else {
    localStorage.clear();
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.close();
    });
  }
});
// support
document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));
