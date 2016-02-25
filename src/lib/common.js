'use strict';

var tbExtra = require('./tbExtra');
var app = require('./firefox/firefox');
var config = require('./config');

/* proxy.type */
function setProxy (index) {
  if (index === null) {
    app.popup.send('proxy.type', app.proxy.type);
  }
  else {
    app.proxy.type = index;
    if (index === 3) { // red
      let tmp = 'red';
      if (config.proxy.pIndex  && config.proxy.pIndex < 6) {
        tmp = 'red/' + config.proxy.pIndex;
      }
      if (config.proxy.pIndex > 5) {
        tmp = 'red/plus';
      }
      app.button.icon = tmp;
    }
    else {
      app.button.icon =  ['gray', 'blue', 'green', 'red', 'orange'][index];
    }
  }
}
app.popup.receive('proxy.type', setProxy);
setProxy(app.proxy.type);
app.proxy.observe('network.proxy.type', function () {
  setProxy(app.proxy.type);
});

/* attached */
app.popup.receive('attached', function (bol) {
  if (bol === null) {
    app.popup.send('attached', config.proxy.attached);
  }
  else {
    config.proxy.attached = bol;
  }
});

app.popup.receive('automatic', function (val) {
  if (val === null) {
    app.popup.send('automatic', app.proxy.get('network.proxy.autoconfig_url'));
  }
  else {
    app.proxy.set('network.proxy.autoconfig_url', val);
  }
});
app.popup.receive('reload-pac', app.proxy.reload);

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
  app.popup.send('profiles', {
    profiles: config.proxy.profiles,
    index: config.proxy.pIndex
  });
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
    app.popup.hide();
    app.tab.open(config.links.ip);
    break;
  case 'open-geo':
    app.popup.hide();
    app.tab.open(config.links.geo);
    break;
  case 'open-leak':
    app.popup.hide();
    app.tab.open(config.links.leak);
    break;
  case 'open-faq':
    app.popup.hide();
    app.tab.open(config.links.faq);
    break;
  case 'open-console':
    app.popup.hide();
    app.developer.HUDService.openBrowserConsoleOrFocus();
    break;
  case 'edit-profiles':
    app.popup.hide();
    var tmp = app.prompt('Edit profile names', 'Comma separated list of profiles:', config.proxy.profiles);
    if (tmp.result) {
      config.proxy.profiles = tmp.input;
    }
  }
});

/* middle clicking */
tbExtra.onClick(function (e) {
  if (e.button === 1) {
    app.proxy.type = (app.proxy.type + 1) % 5;
    setProxy(app.proxy.type);
  }
});

/* welcome page */
app.startup(function () {
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
});
