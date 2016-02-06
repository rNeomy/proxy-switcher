/* globals background */
'use strict';

function $ (id) {
  return document.getElementById(id);
}

/* tabs */
(function (tabs) {
  if (!tabs) {
    return;
  }
  var index;
  function detect () {
    index = parseInt(tabs.querySelector(':checked').value);
    document.body.dataset.type = index;
    background.send('proxy.type', index);
  }
  background.receive('proxy.type', function (i) {
    tabs.querySelector('[name=proxy][value="' + i + '"]').click();
  });
  tabs.addEventListener('click', function (e) {
    if (e.target.localName === 'input') {
      detect();
    }
  }, true);
})($('tabs'));

/* attached */
(function (checkbox, socks) {
  if (!checkbox) {
    return;
  }
  checkbox.addEventListener('change', function () {
    socks.dataset.type = checkbox.checked ? 'global' : 'individual';
    background.send('attached', checkbox.checked);
  });
  background.receive('attached', function (bol) {
    checkbox.checked = bol;
    socks.dataset.type = bol ? 'global' : 'individual';
  });
})($('for-all'), $('socks'));

// listener
document.addEventListener('change', function (e) {
  var target = e.target;
  if (target.dataset.pref) {
    var value = target.value;
    if (target.type === 'number') {
      value = parseInt(value);
    }
    if (target.type === 'checkbox') {
      value = target.checked;
    }
    background.send('pref-changed', {
      pref: target.dataset.pref,
      value: value
    });
  }
});
background.receive('pref', function (obj) {
  var elem = document.querySelector('[data-pref="' + obj.pref + '"]');
  if (elem) {
    switch (elem.type) {
    case 'text':
    case 'number':
      elem.value = obj.value;
      break;
    case 'checkbox':
      elem.checked = obj.value;
    }
  }
});

/* socks version */
(function (socks) {
  if (!socks) {
    return;
  }
  socks.parentNode.parentNode.addEventListener('click', function (e) {
    var target = e.target;
    if (target.type === 'radio') {
      background.send('pref-changed', {
        pref: 'network.proxy.socks_version',
        value: parseInt(target.value)
      });
    }
  });
})(document.querySelector('[name=socks]'));
background.receive('pref', function (obj) {
  if (obj.pref === 'network.proxy.socks_version') {
    document.querySelector('[name=socks][value="' + obj.value + '"]').checked = true;
  }
});

/* automatic */
(function (input, button) {
  background.receive('automatic', function (val) {
    input.value = val;
  });
  input.addEventListener('change', function () {
    background.send('automatic', input.value);
  });
  button.addEventListener('click', function () {
    background.send('reload-pac');
  });
})(document.getElementById('automatic-text'), document.getElementById('automatic-button'));

/* profiles */
background.receive('profiles', (function () {
  var cache = 'Profile 1, Profile 2, Profile 3, Profile 4, Profile 5, Profile 6';
  return function (obj) {
    if (obj.profiles === cache) {
      return;
    }
    var parent = document.querySelector('select');
    parent.innerHTML = '';
    obj.profiles.split(', ').forEach(function (p, i) {
      var option = document.createElement('option');
      option.setAttribute('value', i);
      option.setAttribute('name', 'profile');
      if (obj.index === i) {
        option.setAttribute('selected', true);
      }
      option.textContent = p;
      parent.appendChild(option);
    });
    cache = obj.profiles;
  };
})());
background.receive('profile-index', function (i) {
  console.error(i, document.querySelector('select').selectedIndex);
  document.querySelector('select').selectedIndex = i;
});
document.querySelector('select').addEventListener('change', function (e) {
  var target = e.target;
  if (e.isTrusted) {
    background.send('profile-index', target.value);
  }
});

/* links */
document.addEventListener('click', function (e) {
  var target = e.target;
  if (target.dataset.cmd) {
    background.send('command', target.dataset.cmd);
  }
});

/* init */
background.receive('init', function () {
  background.send('proxy.type', null);
  background.send('pref', 'network.proxy.socks_version');
  background.send('profiles');
  background.send('attached', null);
  background.send('automatic', null);
  [].forEach.call(document.querySelectorAll('[data-pref]'), function (elem) {
    var pref = elem.dataset.pref;
    background.send('pref', pref);
  });
});
