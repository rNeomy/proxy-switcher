'use strict';

var tabId = document.location.search.split('id=')[1];
var tbody = document.querySelector('tbody');

if (tabId) {
  chrome.runtime.sendMessage({
    cmd: 'fails',
    tabId
  }, (response) => {
    (response || []).forEach (obj => {
      let tr = document.createElement('tr');
      let method = document.createElement('td');
      method.textContent = obj.method;
      let url = document.createElement('td');
      let a = document.createElement('a');
      a.href = a.title = a.textContent = obj.url;
      let statusLine = document.createElement('td');
      statusLine.title = statusLine.textContent = obj.statusLine || obj.error;
      let ip = document.createElement('td');
      ip.textContent = obj.ip;
      let type = document.createElement('td');
      type.textContent = obj.type;

      tr.appendChild(method);
      url.appendChild(a);
      tr.appendChild(url);
      tr.appendChild(statusLine);
      tr.appendChild(ip);
      tr.appendChild(type);
      tbody.appendChild(tr);
    });
  });
}
