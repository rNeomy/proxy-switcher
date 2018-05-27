'use strict';

if (/Firefox/.test(navigator.userAgent)) {
  chrome.proxy = {
    callbacks: [],
    errors: [],
    settings: {}
  };
  chrome.storage.onChanged.addListener(ps => {
    if (ps['ffcurent']) {
      if (JSON.stringify(ps['ffcurent'].newValue) !== JSON.stringify(ps['ffcurent'].oldValue)) {
        chrome.proxy.callbacks.forEach(c => c(ps['ffcurent'].newValue));
      }
    }
  });

  chrome.proxy.onProxyError = {
    addListener: c => chrome.proxy.errors.push(c)
  };

  chrome.proxy.settings.onChange = {
    addListener: c => chrome.proxy.callbacks.push(c)
  };

  chrome.proxy.convert = {
    toFF: ({value}) => {
      const mode = value.mode;
      const settings = {
        proxyType: {
          'direct': 'none',
          'system': 'system',
          'auto_detect': 'autoDetect',
          'fixed_servers': 'manual',
          'pac_script': 'autoConfig'
        }[mode],
        autoConfigUrl: mode === 'pac_script' ? value.pacScript.url : '',
        socksVersion: mode === 'fixed_servers' && value.rules.proxyForHttp.scheme === 'socks5' ? 5 : 4,
        proxyDNS: value.remoteDNS,
        autoLogin: value.noPrompt,
        passthrough: mode === 'fixed_servers' && value.rules.bypassList && value.rules.bypassList.length ? value.rules.bypassList.join(', ') : ''
      };

      if (mode === 'fixed_servers') {
        const rules = value.rules;
        const url = ({host, port, scheme}) => {
          if (host && port) {
            return (scheme === 'https' ? 'https://' : '') + (host.trim().replace(/.*:\/\//, '') + ':' + port);
          }
          else {
            return '';
          }
        };

        if (rules.proxyForHttp.scheme.startsWith('socks')) {
          settings.http = settings.ssl = settings.ftp = '';
          settings.socks = url(rules.proxyForHttp);
        }
        else {
          settings.ftp = url(rules.proxyForFtp);
          settings.http = url(rules.proxyForHttp);
          settings.ssl = url(rules.proxyForHttps);
        }
      }
      return {
        value: settings
      };
    },
    fromFF: ({value}) => {
      const config = {
        value: {
          remoteDNS: value.proxyDNS,
          noPrompt: value.autoLogin
        }
      };
      config.value.mode = {
        'none': 'direct',
        'system': 'system',
        'autoDetect': 'auto_detect',
        'manual': 'fixed_servers',
        'autoConfig': 'pac_script'
      }[value.proxyType];

      if (value.proxyType === 'autoConfig' || value.proxyType === 'manual') {
        config.value.rules = {};
      }
      if (value.proxyType === 'autoConfig') {
        config.value.pacScript = {
          url: value.autoConfigUrl
        };
      }
      else if (value.proxyType === 'manual') {
        config.value.rules.bypassList = value.passthrough ? value.passthrough.split(', ') : [];
        const type = url => {
          if (value.socks) {
            return 'socks' + value.socksVersion;
          }
          else {
            return url.startsWith('https://') ? 'https' : 'http';
          }
        };
        const parse = url => {
          const scheme = type(url);
          const [host, port] = url.split('://')[0].split(':');
          return {scheme, host, port: Number(port)};
        };
        config.value.rules.proxyForFtp = parse(value.ftp || value.socks);
        config.value.rules.proxyForHttp = parse(value.http || value.socks);
        config.value.rules.proxyForHttps = parse(value.ssl || value.socks);
      }
      return config;
    }
  };

  chrome.proxy.settings.get = (prop, callback) => browser.proxy.settings.get({})
    .then(settings => callback(chrome.proxy.convert.fromFF(settings)));

  chrome.proxy.settings.set = async(config, callback = function() {}) => {
    const settings = chrome.proxy.convert.toFF(config);
    // console.log(settings);
    await browser.proxy.settings.clear({});
    browser.proxy.settings.set(settings, () => {
      const lastError = chrome.runtime.lastError;
      if (chrome.runtime.lastError) {
        chrome.proxy.errors.forEach(c => c(lastError));
      }
    });

    await browser.storage.local.set({
      'ffcurent': {
        value: config.value
      }
    });
    callback();
  };
}
