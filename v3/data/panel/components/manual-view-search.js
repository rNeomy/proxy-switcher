/* globals app */

const search = {};

search.fetch = (base, args = {}) => {
  Object.assign(args, {
    allowsPost: true, // Supports POST requests
    allowsHttps: true // Supports HTTPS requests
  });
  return fetch(base + '?' + Object.entries(args).map(([k, v]) => `${k}=${v}`).join('&')).then(r => r.json().then(j => {
      if (r.ok) {
        const servers = j.socks5;
        const random = Math.floor(Math.random() * servers.length);
        j = servers[random];

        return j;
      }
      return Promise.reject(j.status_message || j.error || 'unknown error');
    }));
};

search.convert = str => {
  const [host, port] = str.split(':');

  const proxy = {
    host,
    port: Number(port),
    scheme: 'socks5'
  };
  return {
    info: {host, port},
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
        'validate-mode': 'direct'
      }).then(async prefs => {
        await set(prefs['validate-mode']);
        Object.entries(prefs).forEach(([key, value]) => {
          if (!value) {
            delete prefs[key];
          }
        });
        try {
          log('Searching for a server ...');
          const json = await search.fetch('https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/json/proxies.json', prefs);
          const {proxy, info} = search.convert(json);
          log(`Validating ${info.host}:${info.port}`);
          done(proxy, 'My New Proxy');
          await search.verify(proxy).then(() => log('Looks good!'),  () => log('Cannot verify this proxy! Retry again'));
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

export {search};
