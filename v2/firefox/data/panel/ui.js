/* globals app */
'use strict';

// colors
app.storage({
  'color-auto_detect': '#2124fc',
  'color-direct': '#000',
  'color-fixed_servers': '#fd0e1c',
  'color-pac_script_url': '#fb9426',
  'color-pac_script_data': '#fb9426',
  'color-system': '#31736b'
}).then(prefs => {
  document.querySelector('#tabs li.no-proxy').style['border-top-color'] = prefs['color-direct'];
  document.querySelector('#tabs li.auto-proxy').style['border-top-color'] = prefs['color-auto_detect'];
  document.querySelector('#tabs li.system-proxy').style['border-top-color'] = prefs['color-system'];
  document.querySelector('#tabs li.manual-proxy').style['border-top-color'] = prefs['color-fixed_servers'];
  document.querySelector('#tabs li.pac-proxy').style['border-top-color'] = prefs['color-pac_script_url'];
});

const click = ({target, isTrusted}) => {
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
};
document.addEventListener('click', click);

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
  const n = document.getElementById('notify');
  msg = msg.error || msg.message || msg;
  const div = document.createElement('div');
  div.textContent = (new Date()).toTimeString().split(' ')[0] + ': ' + msg;
  n.textContent = '';
  n.appendChild(div);
  div.scrollIntoView();
  window.setTimeout(() => div.remove(), 5000);
});

document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage();
document.addEventListener('keydown', e => {
  const meta = e.ctrlKey || e.metaKey;
  if (meta) {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5') {
      e.preventDefault();
      click({
        target: document.querySelector(`#tabs label:nth-child(${e.key}) li`),
        isTrusted: true
      });
    }
  }
});

if (/Firefox/.test(navigator.userAgent)) {
  chrome.extension.isAllowedIncognitoAccess(result => {
    if (!result) {
      document.getElementById('private').classList.remove('hide');
    }
  });
}
