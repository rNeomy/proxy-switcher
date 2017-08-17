'use strict';

var _ = chrome.i18n.getMessage;

/* icon color */
function icon(config) {
  let mode = config.value.mode;

  if (mode === 'pac_script') {
    mode = config.value.pacScript && config.value.pacScript.url ? 'pac_script_url' : 'pac_script_data';
  }

  chrome.browserAction.setIcon({
    path: {
      18: 'data/icons/toolbar/' + mode + '/18.png',
      36: 'data/icons/toolbar/' + mode + '/36.png'
    }
  });
  let title = 'Proxy Switcher\n\n';
  title += ({
    'direct': _('modeDirect'),
    'auto_detect': _('modeAuto'),
    get 'pac_script_url'() {
      return _('modePACU') + config.value.pacScript.url;
    },
    'pac_script_data': _('modePACD'),
    'fixed_servers': _('modeFixed'),
    'system': _('modeSystem')
  })[mode];

  chrome.browserAction.setTitle({title});
}
chrome.proxy.settings.get({}, icon);
chrome.proxy.settings.onChange.addListener(icon);

/* faqs */
chrome.storage.local.get('version', prefs => {
  const version = chrome.runtime.getManifest().version;
  if (prefs.version !== version) {
    window.setTimeout(() => {
      chrome.storage.local.set({version}, () => {
        chrome.tabs.create({
          url: 'http://add0n.com/proxy-switcher.html?version=' + version + '&type=' +
            (prefs.version ? ('upgrade&p=' + prefs.version) : 'install')
        });
      });
    }, 3000);
  }
});

/* badge */
var tabs = {};

chrome.tabs.query({}, ts => ts.forEach(t => tabs[t.id] = []));
chrome.tabs.onCreated.addListener(t => tabs[t.id] = []);
chrome.tabs.onRemoved.addListener(id => delete tabs[id]);

function badge(tabId) {
  chrome.browserAction.setBadgeText({
    tabId,
    text: tabs[tabId] && tabs[tabId].length ? String(tabs[tabId].length) : ''
  });
}
chrome.webRequest.onBeforeRequest.addListener(({tabId}) => {
  if (tabs[tabId]) {
    tabs[tabId] = [];
  }
}, {
  urls: ['*://*/*'],
  types: ['main_frame']
});
chrome.webRequest.onCompleted.addListener(d => {
  const tabId = d.tabId;
  if (!tabs[tabId]) {
    return;
  }
  const bol = d.statusCode < 200 || d.statusCode >= 400;
  if (bol) {
    tabs[tabId].push(d);
  }
  if (bol || d.type === 'main_frame') {
    badge(tabId);
  }
}, {urls: ['*://*/*']});
chrome.webRequest.onErrorOccurred.addListener(d => {
  const tabId = d.tabId;
  if (tabId && tabs[tabId] && d.error !== 'net::ERR_BLOCKED_BY_CLIENT') {
    tabs[tabId].push(d);
    badge(tabId);
  }
}, {urls: ['*://*/*']});

/* messaging */
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'fails') {
    response(tabs[request.tabId]);
  }
});
