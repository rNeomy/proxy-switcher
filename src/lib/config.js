'use strict';

var app = require('./firefox/firefox');
var config = exports;

config.popup = {
  width: 550,
  height: 370
};

config.proxy = {
  get attached () {
    return app.storage.read('attached') === 'false' ? false : true;
  },
  set attached (val) {
    app.storage.write('attached', val);
  },
  get profiles () {
    return app.storage.read('profiles') || 'Profile 1, Profile 2, Profile 3, Profile 4, Profile 5';
  },
  set profiles (val) {
    var tmp = val.split(/\s*\,\s*/).map(function (p) {
      return p.trim().substr(0, 10);
    });

    let profiles =  {};
    let keys = config.proxy.profiles.split(', ');
    keys.forEach((name, i) => profiles[name] = app.storage.read('profile-' + i));
    tmp.forEach(function (name, i) {
      console.error('profile-' + i, name, profiles[name] ,i, keys[i], profiles[keys[i]]);
      app.storage.write('profile-' + i, profiles[name] || profiles[keys[i]] || '');
    });

    app.storage.write('profiles', tmp.join(', '));
    config.proxy.pIndex = Math.min(config.proxy.pIndex, tmp.length - 1);
  },
  getProfile: function (i) {
    return app.storage.read('profile-' + i);
  },
  setProfile: function (i, name, str) {
    app.storage.write('profile-' + i, str);
    let tmp = config.proxy.profiles.split(', ');
    tmp[i] = name;
    app.storage.write('profiles', tmp.join(', '));
  },
  get pIndex () {
    return parseInt(app.storage.read('profile-index') || '0');
  },
  set pIndex (val) {
    app.storage.write('profile-index', val);
  },
  pac: {
    get index () {
      return parseInt(app.storage.read('pac-index') || '0');
    },
    set index (val) {
      app.storage.write('pac-index', val);
    },
    value: function (index, val) {
      if (val !== null) {
        app.storage.write('pac-value-' + index, val);
      }
      else {
        let pac = app.storage.read('pac-value-' + index);
        if (!pac && index === 0) {
          val = app.proxy.get('network.proxy.autoconfig_url');
          app.storage.write('pac-value-0', val);
          return val;
        }
        return pac || '';
      }
    }
  }
};

config.welcome = {
  get version () {
    return app.storage.read('version');
  },
  set version (val) {
    app.storage.write('version', val);
  },
  timeout: 3,
  get show () {
    return app.storage.read('show') === 'false' ? false : true; // default is true
  },
  set show (val) {
    app.storage.write('show', val);
  }
};

config.links = {
  get faq () {
    return 'http://firefox.add0n.com/proxy-switcher.html';
  },
  get ip () {
    return app.storage.read('open-ip') || 'http://tools.add0n.com/what-is-my-ip.php';
  },
  get geo () {
    return app.storage.read('open-geo') || 'http://www.geoipview.com/';
  },
  get leak () {
    return app.storage.read('open-leak') || 'https://ipleak.net';
  },
  get pac () {
    return 'http://blog.add0n.com/2016/02/11/configure-proxy-settings-in-firefox.html';
  }
}
