/* globals app */
'use strict';

var _ = chrome.i18n.getMessage;
var isFirefox = /Firefox/.test(navigator.userAgent);

var prefs = {
  color: '#848384',
  counter: true,
  text: false, // icon text,
  version: null,
  faqs: true,
  'last-update': 0,
  ffcurent: null,
  'startup-proxy': 'no'
};

/* icon color */
var icon = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#626262';

  ctx.fill(
    new Path2D('M28.256,39.289v-1.26h-8.512v1.26c0,1.393-1.129,2.521-2.522,2.521h-2.079v2.523h17.713v-2.523h-2.078    C29.385,41.811,28.256,40.682,28.256,39.289z')
  );
  ctx.fill(
    new Path2D('M45.396,3.667h-0.273H2.859H2.605H0.021V6.25v0.648v26.895v0.391v2.584h2.583h0.589h40.982h1.22h2.583    v-2.584v-0.883V6.846V6.25V3.667H45.396z M24,35.23c-0.696,0-1.261-0.564-1.261-1.262c0-0.695,0.565-1.26,1.261-1.26    c0.697,0,1.261,0.564,1.261,1.26C25.261,34.666,24.697,35.23,24,35.23z M45.435,6.846v0.919v23.644H2.565V7.765V6.898V6.009h0.293    h1.359h39.485h1.419h0.312V6.846z')
  );

  return config => {
    let mode = config.value.mode;
    if (mode === 'pac_script') {
      mode = config.value.pacScript && config.value.pacScript.url ? 'pac_script_url' : 'pac_script_data';
    }

    const map = {
      'auto_detect': localStorage.getItem('auto-proxy') || '#2124fc',
      'direct': localStorage.getItem('no-proxy') || '#000',
      'fixed_servers': localStorage.getItem('manual-proxy') || '#fd0e1c',
      'pac_script_url': localStorage.getItem('pac-proxy') || '#fb9426',
      'pac_script_data': localStorage.getItem('pac-proxy') || '#fb9426',
      'system': localStorage.getItem('system-proxy') || '#31736b'
    };

    ctx.fillStyle = map[mode];
    ctx.fillRect(5.04, 8.652, 37.83, 20.176);

    if (mode.startsWith('pac_script')) {
      ctx.fillStyle = mode === 'pac_script_url' ? map['system'] : map['fixed_servers'];
      ctx.fillRect(5.04, 8.652, 37.83 / 2, 20.176);
    }
    if (mode === 'fixed_servers' && prefs.text) {
      const profile = (prefs.profiles || []).filter(p => {
        const profile = prefs['profile.' + p];
        return app.compare(profile, config);
      }).shift();
      if (profile) {
        ctx.fillStyle = '#fff';
        ctx.font = '400 20px/24px Roboto,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(profile[0], 24, 19);
      }
    }

    chrome.browserAction.setIcon({
      imageData: ctx.getImageData(0, 0, 48, 48)
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
  };
})();

chrome.proxy.settings.onChange.addListener(icon);

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
  chrome.runtime.lastError;
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
  if (tabId && tabs[tabId] && prefs.counter &&
    d.error !== 'net::ERR_BLOCKED_BY_CLIENT' &&
    d.error !== 'NS_ERROR_ABORT'
  ) {
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

// init
chrome.storage.local.get(null, ps => {
  Object.assign(prefs, ps);
  // badge color
  chrome.browserAction.setBadgeBackgroundColor({
    color: prefs.color
  });
  // initial proxy
  if (prefs['startup-proxy'] === 'no') {
    if (isFirefox && prefs.ffcurent) {
      chrome.proxy.settings.set(prefs.ffcurent, () => {
        chrome.proxy.settings.get({}, icon);
      });
    }
    else {
      chrome.proxy.settings.get({}, icon);
    }
  }
  else {
    chrome.proxy.settings.set({
      value: {
        mode: prefs['startup-proxy']
      }
    }, icon);
  }
  // FAQs
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});
// pref changes
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(k => prefs[k] = ps[k].newValue);

  if (ps.color) {
    chrome.browserAction.setBadgeBackgroundColor({
      color: prefs.color
    });
  }
  if (ps.counter && ps.counter.newValue === false) {
    chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.browserAction.setBadgeText({
      tabId: tab.id,
      text: ''
    })));
  }
  if (ps.profiles || ps.text) {
    chrome.proxy.settings.get({}, icon);
  }
});

// Feedback
{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
