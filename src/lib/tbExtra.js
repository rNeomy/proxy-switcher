'use strict';

var {Cu} = require('chrome'),
    self       = require('sdk/self'),
    unload     = require('sdk/system/unload');

var onClick = function () {};

(function (listen) {
  let {CustomizableUI} = Cu.import('resource:///modules/CustomizableUI.jsm');
  CustomizableUI.addListener(listen);
  unload.when(() => CustomizableUI.removeListener(listen));
})({
  onWidgetBeforeDOMChange: function (tbb) {
    if (tbb.id.indexOf(self.name) === -1 || tbb.isOnContextInstalled) {
      return;
    }
    // Install onContext if it is not installed
    tbb.isOnContextInstalled = true;
    tbb.addEventListener('click', (e) => onClick(e), false);
  }
});

exports.onClick = (c) => onClick = c;
