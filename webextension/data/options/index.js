'use strict';

function save() {
  localStorage.setItem('no-proxy', document.getElementById('no-proxy').value);
  localStorage.setItem('auto-proxy', document.getElementById('auto-proxy').value);
  localStorage.setItem('system-proxy', document.getElementById('system-proxy').value);
  localStorage.setItem('manual-proxy', document.getElementById('manual-proxy').value);
  localStorage.setItem('pac-proxy', document.getElementById('pac-proxy').value);

  const faqs = document.getElementById('faqs').checked;
  const text = document.getElementById('text').checked;
  const counter = document.getElementById('counter').checked;
  const color = document.getElementById('color').value;
  chrome.storage.local.set({
    faqs,
    text,
    counter,
    color
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
  chrome.storage.local.get({
    faqs: true,
    text: false,
    counter: true,
    color: '#666666'
  }, prefs => {
    document.getElementById('faqs').checked = prefs.faqs;
    document.getElementById('text').checked = prefs.text;
    document.getElementById('counter').checked = prefs.counter;
    document.getElementById('color').value = prefs.color;
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', () => {
  document.getElementById('counter').checked = true;
  document.getElementById('faqs').checked = true;
  document.getElementById('text').checked = false;
  document.getElementById('color').value = '#666666';
  document.getElementById('no-proxy').value = '#000';
  document.getElementById('auto-proxy').value = '#2124fc';
  document.getElementById('system-proxy').value = '#31736b';
  document.getElementById('manual-proxy').value = '#fd0e1c';
  document.getElementById('pac-proxy').value = '#fb9426';
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
