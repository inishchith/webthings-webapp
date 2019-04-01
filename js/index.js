// -*- mode: js; js-indent-level:2; -*-
// SPDX-License-Identifier: MPL-2.0
/* Copyright 2018-present Samsung Electronics France
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

(function() {
  // 'use strict';
  app.auto = false;
  app.isLoading = true;
  app.localStorage = localStorage;
  app.loginUrl = 'login.html';
  app.viewerUrl = '00index.html'; // TODO
  app.viewerUrl = 'aframe-ui-widgets.html'; // TODO
  app.devel = function() {
    return Boolean(localStorage.devel || false);
  };
  app.log = function(arg) {
    if (!this.devel()) {
      return;
    }

    if (arg && arg.name && arg.message) {
      const err = arg;
      this.log(`exception [${err.name}] msg[${err.message}]`);
    }
    const text = `log: ${arg}\n`;
    console.log(text);

    const el = document.getElementById('console');
    let value;
    if (el) {
      value = el.value || '';
      if (value.length > 1024 * 1024) {
        value = '(...)\n';
      }
      value += text;
      el.value = value;
      el.scrollTop = el.scrollHeight;
    }
  };

  // TODO enable this if you want to use brower log only for debuging
  // app.log = console.log;

  app.handleDocument = function(document) {
    let token = null;
    this.log(`parse: ${document}`);
    // TODO: https://github.com/mozilla-iot/gateway/pull/1142
    // TODO: document.getElementById('token').textContent;
    try {
      const xpath = '/html/body/section/div[2]/code/text()';
      const iterator = document.evaluate(xpath,
                                         document, null,
                                         XPathResult.ANY_TYPE, null);
      const thisNode = iterator.iterateNext();
      token = thisNode.textContent;
    } catch (err) {
      this.log(`error: ${err}`);
    }
    this.log(`token: ${token}`); // TODO

    return token;
  };
  // TODO: endpoint
  app.browse = function(endpoint, callback) {
    const self = this;
    if (localStorage.token) {
      return;
    }
    if (!localStorage.url) {
      throw 'Error: ';
    }
    if (!endpoint) {
      endpoint = localStorage.endpoint;
    }
    let url = localStorage.url + endpoint;
    this.log(`browse: ${url}`);
    const delay = 50;
    window.authCount = 0;
    // TODO: https://github.com/mozilla-iot/gateway/pull/1149
    window.addEventListener('message', function(ev) {
      self.log(`message:${ev}`);
      if (ev.data.message && ev.data.message.token) {
        localStorage.token = ev.data.message.token;
        window.authCount = 98;
      }
    });
    if (app.devel() && !confirm(`Opening: ${url}`)) {
      return;
    }
    window.authWin = window.open(url);
    if (!window.authWin) {
      throw `Can't open window: ${url}`;
    }
    window.interval = setInterval(function() {
      self.log(`loop: ${window.authCount}`);
      // self.log('TODO: check if host alive using xhr');
      if (window.authCount > 60) {
        window.clearInterval(window.interval);
        if (window.authWin && (window.authCount < 100)) {
          window.authWin.close();
        }
        if (callback) {
          callback(null, localStorage.token);
        }
      }
      try {
        self.log('auth: access authWin may throw exception');
        self.log(`post: win: ${window.authWin}`);
        window.authWin.postMessage({message: 'token'}, '*');
      } catch (err) {
        self.log(`post: err: ${err}`);
      }

      try {
        self.log(`accessing a cross-origin frame: ${window.authWin.location}`);
        url = (window.authWin && window.authWin.location &&
               window.authWin.location.href);

        self.log(`auth: url: ${url}`);
        if (url && (url.indexOf('code=') >= 0)) {
          localStorage.token = self.handleDocument(window.authWin.document);
          window.authCount = 99;
        } else {
          window.authCount++;
          self.log(`wait: ${url}`); // TODO
        }
      } catch (e) {
        window.authCount = 100;
        if (e.name === 'SecurityError') {
          alert('Token should be copied manually from other frame');
        }
        self.log(e);
        self.log(e.name);
        self.log(e.message);
        if (callback) {
          callback(e, null);
        }
      }
    }, delay);
  };

  app.get = function(endpoint, callback) {
    const url = localStorage.url + endpoint;
    this.log(`get: url: ${url}`);
    const token = localStorage.token;
    const request = new XMLHttpRequest();
    request.addEventListener('load', function() {
      if (callback) {
        callback(null, this.responseText);
      }
    });
    request.open('GET', url);
    request.setRequestHeader('Accept', 'application/json');
    if (token.length > 8) {
      request.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    request.send();
  };

  app.put = function(endpoint, payload, callback) {
    const url = localStorage.url + endpoint;
    const token = localStorage.token;
    payload = JSON.stringify(payload);
    this.log(`url: ${url}`);
    this.log(`payload: ${payload}`);
    const request = new XMLHttpRequest();
    request.addEventListener('load', function() {
      callback = callback || {};
      callback(null, this.responseText);
    });
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.send(payload);
  };

  app.query = function(endpoint, token) {
    const self = this;
    this.log(`query: ${endpoint}`);
    if (!token) {
      token = localStorage.token;
    }
    if (!endpoint) {
      endpoint = localStorage.endpoint;
    }

    this.get(endpoint, function(err, data) {
      if (err || !data) {
        console.error(err);
        throw err;
      }
      const items = data && JSON.parse(data) || [];
      for (let index = 0; index < items.length; index++) {
        const model = items[index];
        self.log(JSON.stringify(model));
      }
    });
  };

  app.request = function(endpoint) {
    const self = this;
    this.log(`request: ${endpoint}`);
    if (!endpoint) {
      endpoint = localStorage.endpoint;
    }
    if (localStorage.token && localStorage.token.length) {
      return self.query(endpoint);
    }
    const authorize_endpoint = `\
/oauth/authorize\
?\
&client_id=${localStorage.client_id}\
&scope=/things:readwrite\
&response_type=code`;
    if (!window.location.hostname) {
      return this.browse(authorize_endpoint, function(err, data) {
        if (!err) {
          if (data) {
            document.getElementById('token').setAttribute('value', data);
            return self.query(endpoint);
          }
        }
        self.log(`error: browsing: ${err}`);
      });
    }
    const isCallback = (localStorage.state === 'callback');
    let code = null;
    const url = new URL(document.location);
    this.log(`isCallback: ${isCallback}`);

    if (url) { // TODO: refactor
      try {
        code = url.searchParams.get('code');
        this.log(`code: should not be null: ${code}`);
      } catch (err) {
        this.log(`TODO: err: ${err}`);
        this.log(err);
      }

      if (!code && !isCallback) {
        return setTimeout(function() {
          const redirect_uri =
                encodeURIComponent
                (document.location.substring
                (0,
                 1 + document.location.lastIndexOf('/')));
          const redirectUrl = `\
${localStorage.url}\
${authorize_endpoint}\
&redirect_uri=${redirect_uri}
`;
          localStorage.state = 'callback';
          this.redirect(redirectUrl);
        }, 100);
      } else if (code && isCallback) {
        localStorage.state = 'token';
        const request_url = `${localStorage.url}/oauth/token`;
        const params = {
          code: code,
          grant_type: 'authorization_code',
          client_id: localStorage.client_id,
        };
        const request = new XMLHttpRequest();
        request.onreadystatechange = function() {
          if (request.readyState == 4 && request.status == 200) {
            localStorage.token =
              JSON.parse(request.responseText).access_token;
            // TODO: app.emit('token', token);
            document.getElementById('token').setAttribute('value',
                                                          localStorage.token);
            const pos = window.location.href.indexOf('?');
            if (pos) {
              const loc = window.location.href.substring(0, pos);
              window.history.replaceState({}, document.title, loc);
            }
            self.query(endpoint);
          }
        };
        this.log(`grant: ${request_url}`);
        request.open('POST', request_url, true);
        request.setRequestHeader('Content-type', 'application/json');
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('Authorization', `Basic ${
          window.btoa(`${localStorage.client_id
          }:${localStorage.secret}`)}`);
        request.send(JSON.stringify(params));
      } else {
        localStorage.state = 'disconnected';
      }
    }
  };

  app.main = function() {
    this.log(`main: endpoint: ${localStorage.endpoint}`);
    this.log(`main: ${localStorage.state}`);
    this.log(`main: ${window.location.hostname}`);
    // TODO: OAuth update ids here, URLs using file:// will copy from default
    if (!localStorage.client_id || !localStorage.secret) {
      if (!window.location.hostname) {
        localStorage.client_id = 'local-token';
        localStorage.secret = 'super secret';
      } else {
        // TODO: add GUI to overide default creds:
        localStorage.client_id = window.location.hostname;
        localStorage.secret = window.location.hostname;
      }
    }
    try {
      if (!localStorage.token) {
        app.request(localStorage.endpoint); // TODO
      } else {
        app.query(localStorage.endpoint);
      }
    } catch (err) {
      this.log(err);
    }
  };

  window.htmlOnLoad = function() {
    console.log(`Devel mode:${localStorage.devel}`);
    const develCheckbox = document.getElementById('devel');
    if (develCheckbox) {
      if (localStorage.devel) {
        develCheckbox.checked = localStorage.devel;
      } else if (develCheckbox.checked) {
        localStorage.devel = develCheckbox.checked;
      }
      develCheckbox.addEventListener('change', function() {
        localStorage.devel = this.checked;
      });
    }

    console.log(`Auto mode: ${localStorage.auto}`);
    const autoCheckbox = document.getElementById('auto');
    if (autoCheckbox) {
      if (localStorage.auto) {
        autoCheckbox.checked = localStorage.auto;
      } else if (autoCheckbox.checked) {
        localStorage.auto = autoCheckbox.checked;
      }
      autoCheckbox.addEventListener('change', function() {
        localStorage.auto = this.checked;
        console.log(localStorage.auto);
      });
    }

    // hack to pass token from CLI
    let hash = window.location.hash;
    if (hash) {
      try {
        hash = hash.substring(1, hash.length);
        const url = `http://0.0.0.0/${hash}`;
        const params = new URL(url).searchParams;
        for (const entry of params.entries()) {
          if (entry[0] && entry[1]) {
            localStorage[entry[0]] = entry[1];
          }
        }
      } catch (e) {
        console.log(e);
      }
      const loc = `${window.location.protocol}\
//\
${window.location.host}\
${window.location.pathname}`;
      if (localStorage.auto || !app.devel() || confirm(`Relocate to ${loc}`)) {
        window.history.replaceState({}, document.title, loc);
      }
    }

    const runButton = document.getElementById('run');
    runButton.addEventListener('click', function() {
      app.main();
    });

    const clearButton = document.getElementById('clear');
    if (clearButton) {
      clearButton.addEventListener('click', function() {
        document.getElementById('console').value = '';
      });
    }

    const resetButton = document.getElementById('reset');
    resetButton.addEventListener('click', function() {
      document.getElementById('console').setAttribute('value', '');
      document.getElementById('url').setAttribute('value', '');
      document.getElementById('token').setAttribute('value', '');
      // document.getElementById('endpoint').setAttribute('value', '');
      localStorage.clear();
      app.log('token forgotten (need auth again)');
    });

    const aboutButton = document.getElementById('about');
    aboutButton.addEventListener('click', function() {
      window.open('README.md');
    });

    const browseButton = document.getElementById('browse');
    browseButton.addEventListener('click', function() {
      window.location.href =
        (app.devel()) ? '00index.html' : 'aframe-ui-widgets.html';
    });

    const urlInput = document.getElementById('url');
    if (localStorage.url && localStorage.url.length) {
      urlInput.setAttribute('value', localStorage.url);
    } else if (urlInput.value && urlInput.value.length) {
      localStorage.url = urlInput.value;
    } else {
      urlInput.setAttribute('value', 'http://gateway.local:8080');
    }
    urlInput.addEventListener('change', function() {
      this.value = this.value.replace(/\/$/, '');
      localStorage.url = this.value;
    });

    const tokenInput = document.getElementById('token');
    if (localStorage.token && localStorage.token.length) {
      tokenInput.setAttribute('value', localStorage.token);
    } else if (tokenInput && tokenInput.value) {
      localStorage.token = tokenInput.value;
    }
    tokenInput.addEventListener('change', function() {
      this.value = this.value.replace(/\/$/, '');
      localStorage.token = this.value;
    });

    const endpointInput = document.getElementById('endpoint');
    if (localStorage.endpoint) {
      endpoint.setAttribute('value', localStorage.endpoint);
    } else if (endpointInput.getAttribute('value')) {
      localStorage.endpoint = endpointInput.getAttribute('value');
    }
    endpointInput.addEventListener('change', function() {
      if (this.value !== '/') {
        this.value = this.value.replace(/\/$/, '');
      }
      localStorage.endpoint = this.value;
    });

    // add eventListener for tizenhwkey
    document.addEventListener('tizenhwkey', function(e) {
      if (e.keyName === 'back' && tizen && tizen.application) {
        try {
          tizen.application.getCurrentApplication().exit();
        } catch (e) {
          this.log(`ignore: ${e}`);
        }
      }
    });

    // TODO: enable PWA
    if (!navigator && 'serviceWorker' in navigator) {
      try {
        navigator.serviceWorker.register('service-worker.js').then(
          function(registration) {
            console.log('ServiceWorker registration successful with scope: ',
                        registration.scope);
          }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
          });
      } catch (e) {
        console.log(e.message);
      }
    }

    app.redirect = function(location) {
      console.log(`log: redirect: ${location}`);
      if (localStorage.auto || confirm(`Redirect to: ${location}`)) {
        setTimeout(function() {
          window.location = location;
        }, 500);
      }
    };

    // Autoconnect
    // TODO add settings page to disable (for debuging)
    app.main();
    if (localStorage.token) {
      app.redirect(app.viewerUrl);
    }
  };
})();
