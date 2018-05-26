/* globals app, ui, proxy */
'use strict';

var profile = {};

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'delete-profile') {
    const profile = ui.manual.profile.value;
    chrome.storage.local.remove('profile.' + profile);
    chrome.storage.local.get({
      profiles: []
    }, prefs => {
      const index = prefs.profiles.indexOf(profile);
      if (index !== -1) {
        prefs.profiles.splice(index, 1);
        chrome.storage.local.set(prefs, () => {
          // updating list
          app.emit('profiles-updated');
          // updating buttons status
          ui.manual.profile.dataset.value = '';
          app.emit('reset-manual-tab', [ui.manual.profile]);
        });
      }
    });
  }
  else if (cmd === 'set-manual') {
    chrome.storage.local.get({
      profiles: []
    }, prefs => {
      const profile = ui.manual.profile.value;
      prefs.profiles.push(profile);
      prefs.profiles = prefs.profiles.filter((n, i, l) => n && l.indexOf(n) === i);
      prefs['profile.' + profile] = proxy.manual();
      chrome.storage.local.set(prefs, () => {
        // updating list
        app.emit('profiles-updated');
        // updating buttons status
        ui.manual.profile.dataset.value = profile;
        app.emit('reset-manual-tab', [ui.manual.profile]);
      });
    });
  }
});

profile.search = (config, callback) => {
  chrome.storage.local.get(null, prefs => {
    const name = (prefs.profiles || []).filter(p => {
      const profile = prefs['profile.' + p];
      return app.compare(profile, config);
    }).shift();
    callback(name);
  });
};

ui.manual.selector.addEventListener('change', ({target}) => {
  ui.manual.profile.value = target.value;
  ui.manual.profile.dispatchEvent(new Event('input'));
});
// updating manual -> profiles
app.on('profiles-updated', () => chrome.storage.local.get({
  profiles: []
}, prefs => {
  ui.manual.profiles.textContent = '';
  ui.manual.selector.textContent = '';

  prefs.profiles.forEach(profile => {
    const option = document.createElement('option');
    option.textContent = option.value = profile;
    ui.manual.selector.appendChild(option);
    ui.manual.profiles.appendChild(option.cloneNode(false));
  });
  ui.manual.selector.value = ui.manual.profile.value;
}));
app.emit('profiles-updated');
