/* globals app */

const search = {};

search.fetch = (base, args = {}) => {
  Object.assign(args, {
    allowsPost: true, // Supports POST requests
    allowsHttps: true // Supports HTTPS requests
  });
  return fetch(base + '?' + Object.entries(args).map(([k, v]) => `${k}=${v}`).join('&')).then(r => r.json().then(j => {
      if (r.ok) {
        return j;
      }
      return Promise.reject(j.status_message || j.error || 'unknown error');
    }));
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

search.ping = href => new Promise((resolve, reject) => {
  const timer = setTimeout(reject, 5000, 'timeout');
  fetch(href, {
    method: 'HEAD'
  }).then(resolve, reject).finally(() => clearTimeout(timer));
});
search.verify = proxy => new Promise((resolve, reject) => chrome.proxy.settings.set(proxy, () => {
  Promise.all([
    search.ping('https://raw.githubusercontent.com/rNeomy/proxy-switcher/master/LICENSE').then(resolve, () => false),
    search.ping('https://raw.githubusercontent.com/rNeomy/proxy-switcher/master/README.md').then(resolve, () => false)
  ]).then(() => reject(Error('Ping failed')));
}));

search.attach = (button, msg, done) => {
  const log = s => msg.textContent = (new Date()).toTimeString().split(' ')[0] + ': ' + s;

  button.addEventListener('click', () => {
    button.disabled = true;
    // store proxy setting
    const set = mode => {
      if (mode === 'fixed_servers') {
        return Promise.resolve();
      }
      return new Promise(resolve => chrome.proxy.settings.set({ // clear proxy
        value: {mode}
      }, resolve));
    };

    chrome.proxy.settings.get({}, ({value}) => {
      app.storage({
        // 'server': 'https://gimmeproxy.com/api/getProxy',
        'server': 'https://api.getproxylist.com/proxy',
        'validate-mode': 'direct',
        'anonymity': '',
        'allowsRefererHeader': '',
        'allowsUserAgentHeader': '',
        'allowsCustomHeaders': '',
        'allowsCookies': '',
        'country': ''
      }).then(prefs => {
        chrome.permissions.request({
          origins: [prefs.server]
        }, async granted => {
          if (granted === false) {
            return log('Cannot connect to the server');
          }
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
            done(proxy, 'new proxy from ' + ({
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
            }[info.country] || info.country));
            await search.verify(proxy).then(() => log('Looks good!'),  () => log('Cannot verify this proxy!'));
          }
          catch (e) {
            log(e.message || e || 'Error!');
            chrome.proxy.settings.set({value});
          }
          button.disabled = false;
        });
      });
    });
  });
}

export {search};
