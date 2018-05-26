'use strict';

{
  const root = document.getElementById('explore');

  const INC = Number(root.dataset.inc || 100);
  const count = Number(localStorage.getItem('explore-count') || INC - 5);

  const style = document.createElement('style');
  style.textContent = `
  #explore {
    background: #fff;
    position: relative;
    color: rgb(158, 158, 158);
  }
  #explore[data-loaded=true] {
    margin: 4px;
    padding: 5px;
    box-shadow: 0 0 1px #ccc;
    border: solid 1px #ccc;
  }
  #explore .close {
    position: absolute;
    right: 6px;
    top: 4px;
    cursor: pointer;
  }
  #explore>div {
    display: flex;
    justify-content: space-around;
    margin: auto;
    margin-top: 10px;
  }
  #explore a {
    background-size: 32px;
    padding-left: 37px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    color: #000;
    background-repeat: no-repeat;
    background-position: center left;
    max-width: calc(100% / 3 - 50px);
  }
  #explore a:not(:last-child) {
    margin-right: 20px;
  }
  #explore a>span {
    border-left: solid 1px #ccc;
    padding-left: 5px;
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }
  #explore .explore {
    position: absolute;
    right: 10px;
    z-index: 1000000;
    cursor: pointer;
    font-size: 15px;
  }
  `;
  document.documentElement.appendChild(style);

  const get = async() => {
    const {homepage_url, short_name} = chrome.runtime.getManifest();
    const resp = await fetch(homepage_url + '?rd=matched&type=json&name=' + short_name);
    if (resp.ok) {
      const json = await resp.json();
      localStorage.setItem('explore-json', JSON.stringify(json));
      localStorage.setItem('explore-date', Date.now());
      return json;
    }
    return [];
  };
  const build = json => {
    if (json.length === 0) {
      return;
    }
    root.dataset.loaded = true;
    root.textContent = 'Explore more';
    const div = document.createElement('div');
    const span = document.createElement('span');
    span.classList.add('close');
    span.textContent = '✕';
    span.onclick = () => {
      root.textContent = '';
      root.dataset.loaded = false;
      localStorage.setItem('explore-count', 0);
      explore();
    };
    root.appendChild(span);
    json.forEach(({title, icon, link, description}) => {
      const a = document.createElement('a');
      a.setAttribute('style', `background-image: url(${icon});`);
      a.target = '_blank';
      a.href = link + '?context=explore';
      const span = document.createElement('span');
      a.title = description || title;
      span.textContent = title;
      a.appendChild(span);
      div.appendChild(a);
      root.appendChild(div);
    });
  };
  const cload = () => {
    let json = localStorage.getItem('explore-json');
    if (json) {
      const d = Number(localStorage.getItem('explore-date'));
      if (Date.now() - d < 3 * 24 * 60 * 60 * 1000) {
        json = JSON.parse(json);
        return build(json);
      }
    }
    get().then(build).catch(e => {});
  };
  const explore = () => {
    const span = document.createElement('span');
    span.textContent = '↯';
    span.title = 'Explore more';
    span.classList.add('explore');
    root.appendChild(span);
    span.onclick = () => {
      root.textContent = '';
      localStorage.setItem('explore-count', INC);
      cload();
    };
  };
  const init = () => {
    if (count >= INC) {
      if (count < INC + 3) {
        cload();
      }
      else {
        explore();
      }
      if (count > INC + 5) {
        localStorage.setItem('explore-count', INC - 6);
      }
      else {
        localStorage.setItem('explore-count', count + 1);
      }
    }
    else {
      explore();
      localStorage.setItem('explore-count', count + 1);
    }
  };
  window.setTimeout(init, 1000);
}
