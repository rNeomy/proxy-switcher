/* globals app */
'use strict';

app.on('update-description', desc => Object.assign(document.querySelector('#toolbar span'), {
  title: desc,
  textContent: desc
}));
