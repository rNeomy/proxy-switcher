/* globals ui, app */
'use strict';

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'set-pac') {
    const pac = ui.pac.input.value;
    ui.pac.input.dataset.value = pac;
    app.storage({
      pacs: []
    }).then(prefs => {
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
    app.storage({
      pacs: []
    }).then(prefs => {
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
  else if (cmd === 'reload-pac') {
    const url = ui.pac.input.value;
    ui.pac.input.value = 'http://127.0.0.1:8888/dummy.pac';
    app.emit('change-proxy', 'pac_script');
    ui.pac.input.value = url;
    app.emit('change-proxy', 'pac_script');
  }
  else if (cmd === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

app.on('pacs-updated', () => {
  app.storage({
    pacs: []
  }).then(prefs => {
    ui.pac.urls.textContent = '';
    prefs.pacs.forEach(pac => {
      const option = document.createElement('option');
      option.value = pac;
      ui.pac.urls.appendChild(option);
    });
  });
});
app.emit('pacs-updated');
