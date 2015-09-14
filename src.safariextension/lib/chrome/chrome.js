/* globals webkitNotifications*/
'use strict';

var app = new EventEmitter();
app.globals = {
  browser: navigator.userAgent.indexOf('OPR') === -1 ? 'chrome' : 'opera'
};

app.once('load', function () {
  var script = document.createElement('script');
  document.body.appendChild(script);
  script.src = '../common.js';
});

app.Promise = Promise;

// Eventify
app.EventEmitter = EventEmitter;

app.Eventify = function (func, event) {
  var locals = [];
  var d = Promise.defer();
  event = event || new EventEmitter();
  var e = {
    on: function (id, callback) {
      locals.push({id: id, callback: callback});
      event.on(id, callback);
    },
    once: function (id, callback) {
      locals.push({id: id, callback: callback});
      event.once(id, callback);
    },
    emit: event.emit.bind(event),
    removeListener: event.removeListener.bind(event)
  };
  function unbind() {
    locals.forEach(function (obj) {
      event.removeListener(obj.id, obj.callback);
    });
    e.on = e.once = e.emit = e.removeListener = function () {};
  }
  try {
    func(d.resolve, d.reject, e);
  }
  catch (err) {
    d.reject(err);
  }
  return d.promise.then(
    function onResolve (obj) {
      e.emit('resolve', obj);
      unbind();
      return obj;
    },
    function (err) {
      e.emit('reject', err);
      unbind();
      throw Error(err);
    }
  );
};

app.Config = function () {
  var events = new EventEmitter();
  var internals = {};
  return function () {
    [].forEach.call(arguments, function (id) {
      Object.defineProperty(events, id, {
        get () {
          return internals[id];
        },
        set (val) {
          internals[id] = val;
          events.emit(id, val);
        }
      });
    });
    return events;
  };
};

app.storage = (function () {
  var objs = {};
  chrome.storage.local.get(null, function (o) {
    objs = o;
    app.emit('load');
  });
  return {
    read: function (id) {
      return (objs[id] || !isNaN(objs[id])) ? objs[id] + '' : objs[id];
    },
    write: function (id, data) {
      objs[id] = data;
      var tmp = {};
      tmp[id] = data;
      chrome.storage.local.set(tmp, function () {});
    }
  };
})();

app.button = (function () {
  var onCommand;
  chrome.browserAction.onClicked.addListener(function () {
    if (onCommand) {
      onCommand();
    }
  });
  return {
    onCommand: function (c) {
      onCommand = c;
    },
    set icon (root) { // jshint ignore: line
      chrome.browserAction.setIcon({
        path: {
          '19': '../../data/' + root + '/19.png',
          '38': '../../data/' + root + '/38.png'
        }
      });
    },
    set label (label) { // jshint ignore: line
      chrome.browserAction.setTitle({
        title: label
      });
    },
    set badge (val) { // jshint ignore: line
      chrome.browserAction.setBadgeText({
        text: (val ? val : '') + ''
      });
    }
  };
})();

app.get = function (url, headers, data) {
  var xhr = new XMLHttpRequest();
  var d = Promise.defer();
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status !== 200) {
        var e = new Error(xhr.statusText);
        e.status = xhr.status;
        d.reject(e);
      }
      else {
        d.resolve(xhr.responseText);
      }
    }
  };
  xhr.open(data ? 'POST' : 'GET', url, true);
  for (var id in headers) {
    xhr.setRequestHeader(id, headers[id]);
  }
  if (data) {
    var arr = [];
    for (var e in data) {
      arr.push(e + '=' + data[e]);
    }
    data = arr.join('&');
  }
  xhr.send(data ? data : '');
  return d.promise;
};

app.getURL = function (path) {
  return chrome.extension.getURL(path);
};

app.popup = {
  send: function (id, data) {
    chrome.extension.sendRequest({method: id, data: data});
  },
  receive: function (id, callback) {
    chrome.extension.onRequest.addListener(function (request, sender) {
      if (request.method === id && !sender.tab) {
        callback(request.data);
      }
    });
  }
};

app.contentScript = (function () {
  return {
    send: function (id, data, global) {
      if (global) {
        chrome.tabs.query({}, function (tabs) {
          tabs.forEach(function (tab) {
            chrome.tabs.sendMessage(tab.id, {method: id, data: data}, function () {});
          });
        });
      }
      else if ('id' in this && 'windowId' in this) {
        chrome.tabs.sendMessage(this.id, {method: id, data: data}, function () {});
      }
      else {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
          tabs.forEach(function (tab) {
            chrome.tabs.sendMessage(tab.id, {method: id, data: data}, function () {});
          });
        });
      }
    },
    receive: function (id, callback) {
      chrome.runtime.onMessage.addListener(function (message, sender) {
        if (message.method === id && sender.tab && sender.tab.url.indexOf('http') === 0) {
          callback.call(sender.tab, message.data);
        }
      });
    }
  };
})();

app.tab = {
  open: function (url, inBackground, inCurrent) {
    if (inCurrent) {
      chrome.tabs.update(null, {url: url});
    }
    else {
      chrome.tabs.create({
        url: url,
        active: typeof inBackground === 'undefined' ? true : !inBackground
      });
    }
  },
  list: function () {
    var d = app.Promise.defer();
    chrome.tabs.query({
      currentWindow: false
    }, function (tabs) {
      d.resolve(tabs);
    });
    return d.promise;
  }
};

app.contextMenu = {
  create: function (title, type, callback) {  //type: selection, page
    chrome.contextMenus.create({
      'title': title,
      'contexts': [type],
      'onclick': function () {
        callback();
      }
    });
  }
};

app.notification = function (title, text) {
  chrome.notifications.create(null, {
    type: 'basic',
    iconUrl: chrome.extension.getURL('./') + 'data/icons/48.png',
    title: title,
    message: text
  }, function () {});
};

app.play = (function () {
  var audio = new Audio();
  var canPlay = audio.canPlayType('audio/mpeg');
  if (!canPlay) {
    audio = document.createElement('iframe');
    document.body.appendChild(audio);
  }
  return function (url) {
    if (canPlay) {
      audio.setAttribute('src', url);
      audio.play();
    }
    else {
      audio.removeAttribute('src');
      audio.setAttribute('src', url);
    }
  };
})();

app.version = function () {
  return chrome[chrome.runtime && chrome.runtime.getManifest ? 'runtime' : 'extension'].getManifest().version;
};

app.timer = window;

app.options = {
  send: function (id, data) {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(function (tab) {
        if (tab.url.indexOf(chrome.extension.getURL('data/options/index.html') === 0)) {
          chrome.tabs.sendMessage(tab.id, {method: id, data: data}, function () {});
        }
      });
    });
  },
  receive: function (id, callback) {
    chrome.runtime.onMessage.addListener(function (message, sender) {
      if (
        message.method === id &&
        sender.tab &&
        sender.tab.url.indexOf(chrome.extension.getURL('data/options/index.html') === 0)
      ) {
        callback.call(sender.tab, message.data);
      }
    });
  }
};
