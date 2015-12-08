'use strict';

var app = require('./firefox/firefox');
var config = require('./config');

/* welcome page */
(function () {
  var version = config.welcome.version;
  if (app.version() !== version) {
    app.timer.setTimeout(function () {
      app.tab.open(
        'http://firefox.add0n.com/proxy-switcher.html?v=' + app.version() +
        (version ? '&p=' + version + '&type=upgrade' : '&type=install')
      );
      config.welcome.version = app.version();
    }, config.welcome.timeout);
  }
})();

/* proxy.type */
app.popup.receive('proxy.type', function (index) {
  if (index === null) {
    app.popup.send('proxy.type', app.proxy.type);
  }
  else {
    app.proxy.type = index;
    app.button.icon = ['gray', 'blue', 'green', 'red'][index];
  }
});
app.button.icon = ['gray', 'blue', 'green', 'red'][app.proxy.type];

/* attached */
app.popup.receive('attached', function (bol) {
  if (bol === null) {
    app.popup.send('attached', config.proxy.attached);
  }
  else {
    config.proxy.attached = bol;
  }
});

/* prefs */
app.popup.receive('pref-changed', function (obj) {
  app.proxy.set(obj.pref, obj.value);
  // is http attached?
  if (obj.pref === 'network.proxy.http' && config.proxy.attached) {
    app.proxy.set('network.proxy.ftp', obj.value);
    app.proxy.set('network.proxy.ssl', obj.value);
    app.proxy.set('network.proxy.socks', obj.value);
    app.popup.send('pref', {pref: 'network.proxy.ftp', value: obj.value});
    app.popup.send('pref', {pref: 'network.proxy.ssl', value: obj.value});
    app.popup.send('pref', {pref: 'network.proxy.socks', value: obj.value});
  }
  if (obj.pref === 'network.proxy.http_port' && config.proxy.attached) {
    app.proxy.set('network.proxy.ftp_port', obj.value);
    app.proxy.set('network.proxy.ssl_port', obj.value);
    app.proxy.set('network.proxy.socks_port', obj.value);
    app.popup.send('pref', {pref: 'network.proxy.ftp_port', value: obj.value});
    app.popup.send('pref', {pref: 'network.proxy.ssl_port', value: obj.value});
    app.popup.send('pref', {pref: 'network.proxy.socks_port', value: obj.value});
  }
  // storing prefs in the selected profile
  app.storage.write('profile-' + config.proxy.pIndex, app.proxy.toJSON());
});
app.popup.receive('pref', function (pref) {
  app.popup.send('pref', {
    pref: pref,
    value: app.proxy.get(pref)
  });
});

/* profiles */
app.popup.receive('profiles', function () {
  app.popup.send('profiles', config.proxy.profiles);
});
app.popup.receive('profile-index', function (i) {
  if (i === null) {
    app.popup.send('profile-index', config.proxy.pIndex);
  }
  else {
    config.proxy.pIndex = i;
    app.proxy.fromJSON(app.storage.read('profile-' + config.proxy.pIndex));
    app.popup.init();
  }
});

/* links */
app.popup.receive('command', function (cmd) {
  switch (cmd) {
  case 'open-ip':
    app.tab.open(config.links.ip);
    app.popup.hide();
    break;
  case 'open-geo':
    app.tab.open(config.links.geo);
    app.popup.hide();
    break;
  case 'open-leak':
    app.tab.open(config.links.leak);
    app.popup.hide();
    break;
  case 'open-faq':
    app.tab.open(config.links.faq);
    app.popup.hide();
    break;
  case 'edit-profiles':
    var tmp = app.prompt('Edit profile names', 'Comma separated list of profiles:', config.proxy.profiles);
    if (tmp.result) {
      config.proxy.profiles = tmp.input;
    }
    app.popup.hide();
  }
});
