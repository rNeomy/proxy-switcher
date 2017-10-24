/* globals ui, app */
'use strict';

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'set-pac') {
    const pac = ui.pac.input.value;
    ui.pac.input.dataset.value = pac;
    chrome.storage.local.get({
      pacs: []
    }, prefs => {
      prefs.pacs.push(pac);
      prefs.pacs = prefs.pacs.filter((p, i, l) => p && l.indexOf(p) === i);
      chrome.storage.local.set(prefs, () => {
        ui.pac.input.dispatchEvent(new Event('keyup'));
        app.on('change-proxy', 'pac_script');
        app.emit('pacs-updated');
      });
    });
  }
  else if (cmd === 'delete-pac') {
    const pac = ui.pac.input.value;
    chrome.storage.local.get({
      pacs: []
    }, prefs => {
      const index = prefs.pacs.indexOf(pac);
      if (index !== -1) {
        prefs.pacs.splice(index, 1);
        chrome.storage.local.set(prefs, () => {
          ui.pac.input.dataset.value = '';
          ui.pac.input.dispatchEvent(new Event('keyup'));
          app.emit('pacs-updated');
        });
      }
    });
  }
  else if (cmd === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

app.on('pacs-updated', () => {
  chrome.storage.local.get({
    pacs: []
  }, prefs => {
    ui.pac.urls.textContent = '';
    prefs.pacs.forEach(pac => {
      const option = document.createElement('option');
      option.value = pac;
      ui.pac.urls.appendChild(option);
    });
  });
});
app.emit('pacs-updated');
