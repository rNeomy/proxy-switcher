'use strict';

var app = require('./firefox/firefox');
var config = exports;

config.popup = {
  width: 500,
  height: 300
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
    }).join(', ');
    app.storage.write('profiles', tmp);
  },
  get pIndex () {
    return parseInt(app.storage.read('profile-index') || '0');
  },
  set pIndex (val) {
    app.storage.write('profile-index', val);
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
    return app.storage.read('open-ip') || 'http://checkip.dyndns.org/';
  },
  get geo () {
    return app.storage.read('open-geo') || 'http://www.geoipview.com/';
  },
  get leak () {
    return app.storage.read('open-leak') || 'https://ipleak.net';
  }
}
