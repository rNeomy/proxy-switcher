/* globals app, isFirefox */
'use strict';

const _ = chrome.i18n.getMessage;

const prefs = {
  'color': '#848384',
  'counter': false,
  'text': false, // icon text,
  'ffcurent': null,
  'startup-proxy': 'no',
  'color-auto_detect': '#2124fc',
  'color-direct': '#000',
  'color-fixed_servers': '#fd0e1c',
  'color-pac_script_url': '#fb9426',
  'color-pac_script_data': '#fb9426',
  'color-system': '#31736b',
  'profiles': []
};

/* icon color */
const icon = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#626262';
  ctx.fill(
    new Path2D('M28.256,39.289v-1.26h-8.512v1.26c0,1.393-1.129,2.521-2.522,2.521h-2.079v2.523h17.713v-2.523h-2.078 C29.385,41.811,28.256,40.682,28.256,39.289z')
  );
  ctx.fill(
    new Path2D('M45.396,3.667h-0.273H2.859H2.605H0.021V6.25v0.648v26.895v0.391v2.584h2.583h0.589h40.982h1.22h2.583 v-2.584v-0.883V6.846V6.25V3.667H45.396z M24,35.23c-0.696,0-1.261-0.564-1.261-1.262c0-0.695,0.565-1.26,1.261-1.26    c0.697,0,1.261,0.564,1.261,1.26C25.261,34.666,24.697,35.23,24,35.23z M45.435,6.846v0.919v23.644H2.565V7.765V6.898V6.009h0.293    h1.359h39.485h1.419h0.312V6.846z')
  );

  return config => {
    let mode = config.value.mode;
    if (mode === 'pac_script') {
      mode = config.value.pacScript && config.value.pacScript.url ? 'pac_script_url' : 'pac_script_data';
    }

    ctx.fillStyle = prefs['color-' + mode];
    ctx.fillRect(5.04, 8.652, 37.83, 20.176);

    if (mode.startsWith('pac_script')) {
      ctx.fillStyle = mode === 'pac_script_url' ? prefs['color-system'] : prefs['color-fixed_servers'];
      ctx.fillRect(5.04, 8.652, 37.83 / 2, 20.176);
    }
    if (mode === 'fixed_servers' && prefs.text) {
      const profile = (prefs.profiles || []).filter(p => {
        const profile = prefs['profile.' + p];
        return profile && app.compare(profile, config);
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
    }, () => chrome.runtime.lastError);

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

    chrome.browserAction.setTitle({title}, () => chrome.runtime.lastError);
  };
})();

chrome.proxy.settings.onChange.addListener(icon);

/* badge */
const tabs = {};

const badge = tabId => chrome.browserAction.setBadgeText({
  tabId,
  text: tabs[tabId] && tabs[tabId].length ? String(tabs[tabId].length) : ''
}, () => chrome.runtime.lastError);

badge.install = () => {
  console.log(9);
  chrome.tabs.query({}, ts => ts.forEach(t => tabs[t.id] = []));
  chrome.tabs.onCreated.addListener(badge.events.onCreated);
  chrome.tabs.onRemoved.addListener(badge.events.onRemoved);
  chrome.webRequest.onBeforeRequest.addListener(badge.events.onBeforeRequest, {
    urls: ['*://*/*'],
    types: ['main_frame']
  });
  chrome.webRequest.onCompleted.addListener(badge.events.onCompleted, {urls: ['*://*/*']});
  chrome.webRequest.onErrorOccurred.addListener(badge.events.onErrorOccurred, {urls: ['*://*/*']});
};
badge.uninstall = () => {
  chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.browserAction.setBadgeText({
    tabId: tab.id,
    text: ''
  })));
  chrome.tabs.onCreated.removeListener(badge.events.onCreated);
  chrome.tabs.onRemoved.removeListener(badge.events.onRemoved);
  if (chrome.webRequest) {
    chrome.webRequest.onBeforeRequest.removeListener(badge.events.onBeforeRequest);
    chrome.webRequest.onCompleted.removeListener(badge.events.onCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(badge.events.onErrorOccurred);
  }
};
badge.events = {
  onCreated: t => tabs[t.id] = [],
  onRemoved: id => delete tabs[id],
  onBeforeRequest: ({tabId}) => {
    if (tabs[tabId]) {
      tabs[tabId] = [];
    }
  },
  onCompleted: d => {
    const tabId = d.tabId;
    if (!tabs[tabId]) {
      return;
    }
    const bol = (d.statusCode < 200 || d.statusCode >= 400) && d.statusCode !== 101;
    if (bol) {
      tabs[tabId].push(d);
    }
    if (bol || d.type === 'main_frame') {
      badge(tabId);
    }
  },
  onErrorOccurred: d => {
    const tabId = d.tabId;
    if (tabId && tabs[tabId] && prefs.counter &&
      d.error !== 'net::ERR_BLOCKED_BY_CLIENT' &&
      d.error !== 'NS_ERROR_ABORT'
    ) {
      tabs[tabId].push(d);
      badge(tabId);
    }
  }
};

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
  //
  console.log(prefs);
  if (prefs.counter) {
    badge.install();
  }
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
});
// dealing with managed storage
chrome.storage.managed.get({
  'import-json': '',
  'import-version': 0
}, mps => {
  if (!chrome.runtime.lastError && mps && mps['import-json'] && mps['import-version'] > 0) {
    chrome.storage.local.get({
      'import-version': 0
    }, prefs => {
      if (prefs['import-version'] < mps['import-version']) {
        const json = JSON.parse(mps['import-json']);
        chrome.storage.local.set(Object.assign({
          'import-version': mps['import-version']
        }, json), () => chrome.runtime.reload());
      }
      else {
        console.log('recent managed storage. not updating');
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
  if (ps.counter) {
    badge.uninstall();
    if (ps.counter.newValue) {
      badge.install();
    }
  }
  if (ps.profiles || ps.text) {
    chrome.proxy.settings.get({}, icon);
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
