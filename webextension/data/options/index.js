'use strict';

function save() {
  const counter = document.getElementById('counter').checked;
  const color = document.getElementById('color').value;
  chrome.storage.local.set({
    counter,
    color
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 750);
  });
}

function reset() {
  document.getElementById('counter').checked = true;
  document.getElementById('color').value = '#666666';
}

function restore() {
  chrome.storage.local.get({
    counter: true,
    color: '#666666'
  }, prefs => {
    document.getElementById('counter').checked = prefs.counter;
    document.getElementById('color').value = prefs.color;
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', reset);
