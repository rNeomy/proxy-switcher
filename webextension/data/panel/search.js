/* globals ui, app */
'use strict';

var search = {};

search.fetch = (base, args = {}) => {
  Object.assign(args, {
    allowsPost: true, // Supports POST requests
    allowsHttps: true // Supports HTTPS requests
  });
  return fetch(base + '?' + Object.entries(args)
    .map(([k, v]) => `${k}=${v}`)
    .join('&'))
    .then(r => (
      r.ok ? r.json() : Promise.reject(r.status === 403 ? 'Max limit reached' : 'Cannot connect to the server')
    ))
    .then(j => (j.error ? Promise.reject(j.error) : j));
};

search.convert = json => {
  const {ip, port, protocol, country, anonymity, downloadSpeed} = json;
  const proxy = {
    host: ip,
    port: Number(port),
    scheme: protocol
  };
  return {
    info: {ip, port, protocol, country, anonymity, downloadSpeed},
    proxy: {
      value: {
        mode: 'fixed_servers',
        rules: {
          proxyForFtp: proxy,
          proxyForHttp: proxy,
          proxyForHttps: proxy
        }
      }
    }
  };
};

search.ping = ip => new Promise((resolve, reject) => {
  const timer = setTimeout(reject, 5000, 'timeout');
  fetch('http://' + ip, {
    method: 'HEAD'
  }).then(resolve, reject).finally(() => clearTimeout(timer));
});
search.verify = proxy => new Promise((resolve, reject) => chrome.proxy.settings.set(proxy, () => {
  Promise.all([
    search.ping('google.com').then(resolve, () => false),
    search.ping('bing.com').then(resolve, () => false),
    search.ping('yahoo.com').then(resolve, () => false)
  ]).then(() => reject('Ping failed'));
}));

{
  const button = document.querySelector('.search input');
  const le = document.querySelector('.search td:nth-child(2)');
  const log = msg => le.textContent = (new Date()).toTimeString().split(' ')[0] + ': ' + msg;

  button.addEventListener('click', () => {
    button.disabled = true;
    // store proxy setting
    const set = mode => {
      if (mode === 'fixed_servers') {
        return Promise.resolve();
      }
      return new Promise(resolve => chrome.proxy.settings.set({ //clear proxy
        value: {mode}
      }, resolve));
    };
    chrome.proxy.settings.get({}, ({value}) => {
      chrome.storage.local.get({
        server: 'https://gimmeproxy.com/api/getProxy',
        'validate-mode': 'direct',
        anonymity: '',
        allowsRefererHeader: '',
        allowsUserAgentHeader: '',
        allowsCustomHeaders: '',
        allowsCookies: '',
        country: ''
      }, async(prefs) => {
        await set(prefs['validate-mode']);
        Object.entries(prefs).forEach(([key, value]) => {
          if (!value) {
            delete prefs[key];
          }
        });
        try {
          log('Searching for a server ...');
          const json = await search.fetch(prefs.server, prefs);
          const {proxy, info} = search.convert(json);
          log(`Validating ${info.ip}:${info.port}`);
          await search.verify(proxy);
          log('Looks good!');
          app.emit('update-manual-tab', proxy);
          ui.manual.profile.value = 'new proxy from ' + ({
            BR: 'Brazil',
            US: 'United States',
            ID: 'Indonesia',
            CN: 'China',
            RU: 'Russia',
            BD: 'Bangladesh',
            IN: 'India',
            TH: 'Thailand',
            UA: 'Ukraine',
            SG: 'Singapore',
            ES: 'Spain'
          }[info.country] || info.country);
          ui.manual.profile.dispatchEvent(new Event('input', {bubbles: true}));
        }
        catch (e) {
          log(e.message || e || 'Error!');
          chrome.proxy.settings.set({value});
        }
        button.disabled = false;
      });
    });
  });
}
