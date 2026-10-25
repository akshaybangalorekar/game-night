/* Game Night — connection test.
   Runs three checks on this phone and reports exactly which one fails:
     1. Internet                 - can we reach anything at all
     2. Connection service       - can we reach the PeerJS signalling server
     3. Relay (TURN)             - can we gather a relay candidate to link two phones
   The results can be copied and sent on, so a failure can be pinned down. */
(function () {
  var GN = window.GN;

  GN.diagnose = function () {
    GN.nav(function () {
      var log = [];
      var done = false;

      function render() {
        GN.mount(GN.topbar('Connection test') +
          '<div class="pad">' +
            '<p class="muted">Checks whether this phone can reach what Game Night needs. Run it on the phone that cannot join.</p>' +
            '<div class="diag">' + log.map(function (l) {
              var ico = l.state === 'ok' ? '✅' : l.state === 'bad' ? '❌' : '⏳';
              return '<div class="diag-row"><span class="diag-ico">' + ico + '</span>' +
                '<div><b>' + GN.esc(l.title) + '</b><br><span class="muted small">' + GN.esc(l.detail || 'checking…') + '</span></div></div>';
            }).join('') + '</div>' +
            (done ? '<p class="muted small">If step 2 or 3 shows ❌, tap “Copy results” and send them on.</p>' : '') +
            '<button class="btn primary big" id="again">Run again</button>' +
            '<button class="btn" id="copy">Copy results</button>' +
          '</div>', function (app) {
          app.querySelector('#again').addEventListener('click', function () { GN.diagnose(); });
          app.querySelector('#copy').addEventListener('click', function () {
            GN.copy(app, log.map(function (l) { return l.title + ': ' + (l.state === 'ok' ? 'OK' : l.state === 'bad' ? 'FAIL' : '?') + ' - ' + l.detail; }).join(' | '));
          });
        });
      }
      function set(i, state, detail) { log[i].state = state; log[i].detail = detail || ''; render(); }

      log = [
        { title: '1. Internet', state: 'wait', detail: '' },
        { title: '2. Connection service', state: 'wait', detail: '' },
        { title: '3. Relay (TURN)', state: 'wait', detail: '' }
      ];
      render();

      /* 1. internet */
      fetch('https://api.github.com/zen', { cache: 'no-store' })
        .then(function (r) { set(0, r.ok ? 'ok' : 'bad', r.ok ? 'reachable' : 'HTTP ' + r.status); })
        .catch(function () { set(0, 'bad', 'no internet'); })
        .then(testSignal);

      /* 2. connection service (public MQTT broker) */
      function testSignal() {
        var client, fin = false;
        var finish = function (ok, detail) {
          if (fin) return; fin = true;
          try { if (client) client.end(true); } catch (e) {}
          set(1, ok ? 'ok' : 'bad', detail);
          testTurn();
        };
        var timer = setTimeout(function () { finish(false, 'no answer in 12s'); }, 12000);
        try {
          client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
            clientId: 'gndiag_' + Math.random().toString(16).slice(2, 8),
            connectTimeout: 8000, reconnectPeriod: 0
          });
          client.on('connect', function () { clearTimeout(timer); finish(true, 'connected'); });
          client.on('error', function (e) { clearTimeout(timer); finish(false, (e && e.message) || 'error'); });
        } catch (e) { clearTimeout(timer); finish(false, 'could not start'); }
      }

      /* 3. relay */
      function testTurn() {
        var pc, fin = false, got = { host: false, srflx: false, relay: false };
        var finish = function () {
          if (fin) return; fin = true;
          try { if (pc) pc.close(); } catch (e) {}
          var detail = (got.relay ? 'relay ok' : 'no relay') + ', ' + (got.srflx ? 'stun ok' : 'no stun') + (got.host ? ', direct ok' : '');
          set(2, got.relay ? 'ok' : 'bad', detail);
          done = true; render();
        };
        try {
          var cfg = GN.convoy.iceConfig();
          pc = new RTCPeerConnection(cfg);
          pc.createDataChannel('x');
          pc.onicecandidate = function (e) {
            if (!e.candidate) return;
            var c = e.candidate, t = c.type;
            if (!t) { var s = c.candidate || ''; t = s.indexOf('relay') >= 0 ? 'relay' : s.indexOf('srflx') >= 0 ? 'srflx' : 'host'; }
            if (got[t] !== undefined) got[t] = true;
          };
          pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function () {});
          setTimeout(finish, 9000);
        } catch (e) { set(2, 'bad', 'not supported'); done = true; render(); }
      }
    });
  };
})();
