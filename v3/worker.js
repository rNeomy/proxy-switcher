/* global app */

if (typeof importScripts !== 'undefined') {
  self.importScripts('/data/panel/utils.js');
  self.importScripts('/managed.js');
}

const _ = chrome.i18n.getMessage;

/* icon color */
{
  let busy = false;
  self.icon = async (config, reason) => {
    if (busy) {
      return;
    }
    console.info('icon', reason);
    busy = true;

    try {
      let prefs = await chrome.storage.local.get(null);
      prefs = {
        'color-auto_detect': '#2124fc',
        'color-direct': '#000',
        'color-fixed_servers': '#fd0e1c',
        'color-pac_script_url': '#fb9426',
        'color-pac_script_data': '#fb9426',
        'color-system': '#31736b',
        'text': false, // icon text,
        'profiles': [],
        ...prefs
      };
      let mode = config.value.mode || config.value.proxyType;

      if (mode === 'pac_script') {
        mode = config.value.pacScript && config.value.pacScript.url ? 'pac_script_url' : 'pac_script_data';
      }

      const canvas = new OffscreenCanvas(48, 48);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#777';
      ctx.fill(
        new Path2D(
          'M28.256,39.289v-1.26h-8.512v1.26c0,1.393-1.129,2.521-2.522,2.521h-2.079v2.523h17.713v-2.523h-2.078 ' +
          'C29.385,41.811,28.256,40.682,28.256,39.289z'
        )
      );
      ctx.fill(
        new Path2D(
          'M45.396,3.667h-0.273H2.859H2.605H0.021V6.25v0.648v26.895v0.391v2.584h2.583h0.589h40.982h1.22h2.583 ' +
          'v-2.584v-0.883V6.846V6.25V3.667H45.396z M24,35.23c-0.696,0-1.261-0.564-1.261-1.262c0-0.695, ' +
          '0.565-1.26,1.261-1.26 c0.697,0,1.261,0.564,1.261,1.26C25.261,34.666,24.697,35.23,24,35.23z ' +
          'M45.435,6.846v0.919v23.644H2.565V7.765V6.898V6.009h0.293    h1.359h39.485h1.419h0.312V6.846z'
        )
      );
      ctx.fillStyle = prefs['color-' + mode];
      ctx.fillRect(5.04, 8.652, 37.83, 20.176);

      if (mode.startsWith('pac_script')) {
        ctx.fillStyle = mode === 'pac_script_url' ? prefs['color-system'] : prefs['color-fixed_servers'];
        ctx.fillRect(5.04, 8.652, 37.83 / 2, 20.176);
      }
      chrome.action.setBadgeText({
        text: ''
      });
      if (mode === 'fixed_servers' && prefs.text) {
        const profile = (prefs.profiles || []).filter(p => {
          const profile = prefs['profile.' + p];
          return profile && app.compare(profile, config);
        }).shift();
        if (profile) {
          chrome.action.setBadgeText({
            text: profile[0]
          });
        }
      }

      chrome.action.setIcon({
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

      chrome.action.setTitle({title}, () => chrome.runtime.lastError);
    }
    catch (e) {
      console.error(e);
    }
    busy = false;
  };
}

chrome.proxy.settings.onChange.addListener(config => {
  self.icon(config, 'proxy-changed');
});

// init
const startup = async () => {
  if (startup.once) {
    return;
  }
  startup.once = true;
  const prefs = await chrome.storage.local.get({
    'color': '#848384',
    'startup-proxy': 'no'
  });
  // badge color
  chrome.action.setBadgeBackgroundColor({
    color: prefs.color
  });
  // initial proxy
  if (prefs['startup-proxy'] !== 'no') {
    await chrome.proxy.settings.set({
      value: {
        mode: prefs['startup-proxy']
      }
    });
  }
  chrome.proxy.settings.get({}, config => {
    self.icon(config, 'startup/1');
  });
};
chrome.runtime.onInstalled.addListener(startup);
chrome.runtime.onStartup.addListener(startup);

chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'update-icon') {
    chrome.proxy.settings.get({}, config => self.icon(config, 'popup-open'));
  }
});

// pref changes
chrome.storage.onChanged.addListener(ps => {
  if (ps.color) {
    chrome.action.setBadgeBackgroundColor({
      color: ps.color.newValue
    });
  }
  if (
    ps.profiles || ps.text ||
    ps['color-auto_detect'] || ps['color-direct'] || ps['color-fixed_servers'] ||
    ps['color-pac_script_data'] || ps['color-pac_script_url'] || ps['color-system']
  ) {
    chrome.proxy.settings.get({}, config => self.icon(config, 'pref-changes'));
  }
});

/* FAQs & Feedback */
{
  chrome.management = chrome.management || {
    getSelf(c) {
      c({installType: 'normal'});
    }
  };
  if (navigator.webdriver !== true) {
    const {homepage_url: page, name, version} = chrome.runtime.getManifest();
    chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
      chrome.management.getSelf(({installType}) => installType === 'normal' && chrome.storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            chrome.tabs.query({active: true, lastFocusedWindow: true}, tbs => chrome.tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            chrome.storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    chrome.runtime.setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
