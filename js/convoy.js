/* Game Night — The Convoy: peer-to-peer rooms, push-to-talk voice, chat and convoy games.
   No server of our own: PeerJS provides free signalling, then it's direct WebRTC between cars.
   The host is authoritative for game state; guests send actions and receive state. */
(function () {
  var GN = window.GN;

  function peerOpts() {
    if (window.GN_PEER) return window.GN_PEER;   // override for local testing
    return { debug: 1 };                          // PeerJS free cloud signalling
  }

  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randCode() { var s = ''; for (var i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

  var Net = {
    peer: null, isHost: false, room: '', myId: null, me: { name: '', car: '' },
    hostConn: null, conns: {}, roster: [], state: null, chat: [],
    calls: {}, audios: {}, localStream: null,
    screen: 'hub', viewFn: null, chatOpen: false
  };
  GN.convoy = { Net: Net };

  /* ---------------- convoy game registry ---------------- */
  GN.convoyGames = [];
  GN.registerConvoy = function (g) {
    GN.convoyGames.push(g);
    GN.register({ id: g.id, name: g.name, emoji: g.emoji, group: 'convoy', min: g.min, max: g.max,
      blurb: g.blurb, start: function () { GN.convoy.hub(); } });
    return g;
  };
  function gameById(id) { for (var i = 0; i < GN.convoyGames.length; i++) if (GN.convoyGames[i].id === id) return GN.convoyGames[i]; return null; }

  /* ---------------- transport ---------------- */
  function sendToHost(d) { if (Net.hostConn && Net.hostConn.open) Net.hostConn.send(d); }
  function sendTo(pid, d) { var c = Net.conns[pid]; if (c && c.open) c.send(d); }
  function broadcast(d) { Object.keys(Net.conns).forEach(function (id) { var c = Net.conns[id]; if (c && c.open) c.send(d); }); }
  function broadcastRoster() { broadcast({ t: 'roster', roster: Net.roster }); }
  function broadcastState() { broadcast({ t: 'state', state: Net.state }); }

  function setView(fn) { Net.viewFn = fn; GN.replace(fn); }
  function render() { if (Net.viewFn) GN.replace(Net.viewFn); }

  /* ---------------- roster ---------------- */
  function upsertRoster(entry) {
    var found = null;
    Net.roster.forEach(function (r) { if (r.id === entry.id) found = r; });
    if (found) { found.name = entry.name; found.car = entry.car; if (entry.voice != null) found.voice = entry.voice; }
    else Net.roster.push(entry);
  }
  function setVoice(pid, on) {
    Net.roster.forEach(function (r) { if (r.id === pid) r.voice = on; });
    broadcastRoster();
    syncVoice();
    render();
  }

  /* ---------------- create / join ---------------- */
  GN.convoy.create = function (me, cb) {
    var room = randCode();
    var p = new Peer('gnc-' + room, peerOpts());
    var settled = false;
    p.on('open', function (id) {
      settled = true;
      Net.peer = p; Net.isHost = true; Net.room = room; Net.myId = id; Net.me = me;
      Net.roster = [{ id: id, name: me.name, car: me.car, voice: false, host: true }];
      Net.screen = 'lobby';
      setView(lobbyView);
      cb(null);
    });
    p.on('error', function (e) {
      if (e && e.type === 'unavailable-id') { Net.room = ''; p.destroy(); return GN.convoy.create(me, cb); }
      if (!settled) cb(e); else GN.flash(document.getElementById('app'), 'Connection issue: ' + (e.type || e.message));
    });
    p.on('connection', function (conn) {
      conn.on('open', function () {
        Net.conns[conn.peer] = conn;
        conn.on('data', function (d) { fromGuest(conn.peer, d); });
        conn.on('close', function () {
          delete Net.conns[conn.peer];
          Net.roster = Net.roster.filter(function (r) { return r.id !== conn.peer; });
          broadcastRoster(); render();
        });
      });
    });
    p.on('call', handleIncomingCall);
  };

  GN.convoy.join = function (room, me, cb) {
    var p = new Peer(peerOpts());
    var settled = false;
    p.on('open', function (id) {
      Net.peer = p; Net.isHost = false; Net.room = room; Net.myId = id; Net.me = me;
      var conn = p.connect('gnc-' + room, { reliable: true });
      conn.on('open', function () {
        settled = true;
        Net.hostConn = conn;
        conn.send({ t: 'hello', me: me });
        Net.screen = 'lobby';
        setView(lobbyView);
        cb(null);
      });
      conn.on('data', fromHost);
      conn.on('error', function (e) { if (!settled) { settled = true; cb(e); } });
      setTimeout(function () { if (!settled) { settled = true; cb(new Error('no-answer')); } }, 14000);
    });
    p.on('error', function (e) { if (!settled) { settled = true; cb(e); } });
    p.on('call', handleIncomingCall);
  };

  GN.convoy.leave = function () {
    try { if (Net.peer) Net.peer.destroy(); } catch (e) {}
    Object.keys(Net.audios).forEach(function (k) { try { Net.audios[k].remove(); } catch (e) {} });
    Net.peer = null; Net.isHost = false; Net.room = ''; Net.myId = null;
    Net.hostConn = null; Net.conns = {}; Net.roster = []; Net.state = null; Net.chat = [];
    Net.calls = {}; Net.audios = {}; if (Net.localStream) { try { Net.localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    Net.localStream = null; Net.screen = 'hub'; Net.viewFn = null;
    GN.goHome();
  };

  /* ---------------- message handling ---------------- */
  function fromGuest(pid, d) {
    if (d.t === 'hello') {
      upsertRoster({ id: pid, name: d.me.name, car: d.me.car, voice: false });
      sendTo(pid, { t: 'roster', roster: Net.roster });
      sendTo(pid, { t: 'chat-log', chat: Net.chat });
      if (Net.state) sendTo(pid, { t: 'state', state: Net.state });
      broadcastRoster(); render();
    } else if (d.t === 'action') { applyAction(d.a, pid); }
    else if (d.t === 'chat') { addChat(d.msg, true); }
    else if (d.t === 'voice') { setVoice(pid, true); }
  }

  function fromHost(d) {
    if (d.t === 'roster') { Net.roster = d.roster; render(); syncVoice(); }
    else if (d.t === 'state') {
      Net.state = d.state;
      if (!d.state) { Net.screen = 'lobby'; setView(lobbyView); }
      else if (Net.screen !== 'game') { Net.screen = 'game'; setView(gameView); }
      else render();
    } else if (d.t === 'chat') { addChat(d.msg, false); }
    else if (d.t === 'chat-log') { Net.chat = d.chat || []; renderChat(); }
  }

  /* ---------------- actions ---------------- */
  function doAction(action) {
    if (Net.isHost) applyAction(action, Net.myId);
    else sendToHost({ t: 'action', a: action });
  }
  function applyAction(action, pid) {
    var g = gameById(Net.state && Net.state.game);
    if (!g || !g.act) return;
    g.act(Net.state, pid, action, Net.roster);
    broadcastState();
    render();
  }

  function startGame(id) {
    if (!Net.isHost) return;
    var g = gameById(id);
    Net.state = g.init(Net.roster);
    Net.screen = 'game';
    broadcastState();
    setView(gameView);
  }
  function backToLobby() {
    if (!Net.isHost) return;
    Net.state = null;
    Net.screen = 'lobby';
    broadcastState();
    setView(lobbyView);
  }

  /* ---------------- chat ---------------- */
  function addChat(msg, broadcastIt) {
    Net.chat.push(msg);
    if (broadcastIt) broadcast({ t: 'chat', msg: msg });
    renderChat();
  }
  function sendChat(text) {
    text = (text || '').trim();
    if (!text) return;
    var msg = { id: Net.myId, name: Net.me.name, car: Net.me.car, text: text, ts: Date.now() };
    if (Net.isHost) addChat(msg, true); else sendToHost({ t: 'chat', msg: msg });
  }
  function chatMsgHTML(m) {
    var mine = m.id === Net.myId;
    return '<div class="chat-msg' + (mine ? ' mine' : '') + '"><span class="cm-name">' + GN.esc(m.name || '?') + '</span> ' + GN.esc(m.text) + '</div>';
  }
  function chatHTML() {
    return '<div class="chat-head">Convoy chat<button class="btn small ghost" id="chatclose">✕</button></div>' +
      '<div class="chat-log" id="chatlog">' + Net.chat.map(chatMsgHTML).join('') + '</div>' +
      '<div class="quick">' + ['👍', '😂', '🐄', '🚗', '🎉', '❤️', '😴', '🍦'].map(function (e) {
        return '<button class="qemoji" data-e="' + e + '">' + e + '</button>';
      }).join('') + '</div>' +
      '<div class="row"><input id="chatinput" class="input" placeholder="Say something…" autocomplete="off"><button class="btn" id="chatsend">Send</button></div>';
  }
  function renderChat() {
    var log = document.querySelector('#chatlog');
    if (log) { log.innerHTML = Net.chat.map(chatMsgHTML).join(''); log.scrollTop = log.scrollHeight; }
    var c = document.querySelector('#chatcount'); if (c) c.textContent = Net.chat.length ? Net.chat.length : '';
  }

  /* ---------------- voice (WebRTC mesh, push-to-talk) ---------------- */
  GN.convoy.enableMic = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no-mic-api'));
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
      Net.localStream = stream;
      stream.getAudioTracks().forEach(function (t) { t.enabled = false; });  // start muted (push-to-talk)
      if (Net.isHost) setVoice(Net.myId, true); else sendToHost({ t: 'voice' });
      syncVoice(); render();
      return true;
    });
  };
  GN.convoy.ptt = function (on) {
    if (!Net.localStream) return;
    Net.localStream.getAudioTracks().forEach(function (t) { t.enabled = !!on; });
  };
  function syncVoice() {
    if (!Net.localStream || !Net.peer) return;
    Net.roster.forEach(function (r) {
      if (r.id === Net.myId || !r.voice || Net.calls[r.id]) return;
      if (Net.myId > r.id) wireCall(Net.peer.call(r.id, Net.localStream), r.id);
    });
  }
  function handleIncomingCall(call) {
    if (!Net.localStream) { try { call.close(); } catch (e) {} return; }
    call.answer(Net.localStream);
    wireCall(call, call.peer);
  }
  function wireCall(call, pid) {
    Net.calls[pid] = call;
    call.on('stream', function (remote) {
      if (!Net.audios[pid]) {
        var a = document.createElement('audio');
        a.autoplay = true; a.setAttribute('playsinline', ''); a.style.display = 'none';
        Net.audios[pid] = a; document.body.appendChild(a);
      }
      Net.audios[pid].srcObject = remote;
      var pr = Net.audios[pid].play(); if (pr && pr.catch) pr.catch(function () {});
    });
    call.on('close', function () { delete Net.calls[pid]; });
    call.on('error', function () { delete Net.calls[pid]; });
  }

  /* ---------------- screens ---------------- */
  GN.convoy.hub = function () {
    Net.screen = 'hub';
    var preRoom = '';
    var m = location.search.match(/[?&]room=([A-Za-z0-9]+)/); if (m) preRoom = m[1].toUpperCase();
    var m2 = location.search.match(/[?&]name=([^&]+)/);
    Net.viewFn = hubView;
    GN.nav(hubView);

    function hubView() {
      GN.mount(GN.topbar('The Convoy') +
        '<div class="pad">' +
          '<p class="muted">One game across every car. No app to install — share a code and you\u2019re in.</p>' +
          '<div class="field"><label>Your name</label><input id="cname" class="input" placeholder="e.g. Aarav" autocomplete="off" value="' + (m2 ? GN.esc(decodeURIComponent(m2[1])) : '') + '"></div>' +
          '<div class="field"><label>Your car</label><input id="ccar" class="input" placeholder="e.g. Blue Swift" autocomplete="off"></div>' +
          '<button class="btn primary big" id="create">🚗 Start a convoy</button>' +
          '<div class="or">or join one</div>' +
          '<div class="row"><input id="croom" class="input" placeholder="Room code" maxlength="4" value="' + GN.esc(preRoom) + '" style="text-transform:uppercase"><button class="btn" id="join">Join</button></div>' +
          '<p class="muted small" id="cmsg"></p>' +
          '<h3>Games in the convoy</h3>' +
          '<div class="grid">' + GN.convoyGames.map(function (g) {
            return '<div class="card static"><span class="card-emoji">' + g.emoji + '</span><span class="card-name">' + GN.esc(g.name) + '</span><span class="card-blurb">' + GN.esc(g.blurb) + '</span><span class="card-meta">' + g.min + '+ cars</span></div>';
          }).join('') + '</div>' +
          '<p class="opt-hint">Voice and chat stay inside your private room — only people with the code can join.</p>' +
        '</div>', function (app) {
        function names() {
          return { name: app.querySelector('#cname').value.trim() || 'Car', car: app.querySelector('#ccar').value.trim() || 'Car' };
        }
        function msg(t) { app.querySelector('#cmsg').textContent = t; }
        app.querySelector('#create').addEventListener('click', function () {
          msg('Creating convoy…');
          GN.convoy.create(names(), function (err) { if (err) msg('Could not create: ' + (err.type || err.message || err)); });
        });
        app.querySelector('#join').addEventListener('click', function () {
          var room = app.querySelector('#croom').value.trim().toUpperCase();
          if (room.length < 4) { msg('Enter the 4-character room code.'); return; }
          msg('Joining…');
          GN.convoy.join(room, names(), function (err) {
            if (!err) return;
            msg(err.message === 'no-answer' ? 'No convoy answered that code. Check it with the driver.' : 'Could not join: ' + (err.type || err.message || err));
          });
        });
      });
    }
  };

  function lobbyView() {
    var shareUrl = location.origin + location.pathname + '?room=' + Net.room;
    var players = Net.roster.map(function (r) {
      return '<div class="car-row' + (r.id === Net.myId ? ' me' : '') + '">' +
        '<span class="car-emoji">🚗</span>' +
        '<span class="car-who"><strong>' + GN.esc(r.name) + '</strong><small>' + GN.esc(r.car || 'Car') + (r.host ? ' · host' : '') + '</small></span>' +
        '<span class="car-voice">' + (r.voice ? '🎙' : '') + '</span>' +
        '</div>';
    }).join('');
    var hostControls = Net.isHost
      ? '<h3>Start a game</h3><div class="grid">' + GN.convoyGames.map(function (g) {
          var ok = Net.roster.length >= g.min;
          return '<button class="card' + (ok ? '' : ' disabled') + '" data-start="' + g.id + '"' + (ok ? '' : ' disabled') + '>' +
            '<span class="card-emoji">' + g.emoji + '</span><span class="card-name">' + GN.esc(g.name) + '</span>' +
            '<span class="card-blurb">' + GN.esc(g.blurb) + '</span><span class="card-meta">needs ' + g.min + '+ cars</span></button>';
        }).join('') + '</div>'
      : '<p class="muted center">Waiting for the host to start a game…</p>';

    GN.mount(GN.topbar('The Convoy · Lobby') +
      '<div class="pad">' +
        '<div class="room-box">' +
          '<div class="room-label">Room code</div>' +
          '<div class="room-code">' + GN.esc(Net.room) + '</div>' +
          '<button class="btn small" id="share">Copy invite link</button>' +
        '</div>' +
        '<h3>Cars in the convoy (' + Net.roster.length + ')</h3>' +
        '<div class="car-list">' + players + '</div>' +
        hostControls +
        '<button class="btn ghost" id="leave">Leave convoy</button>' +
      '</div>' + dockHTML(), function (app) {
      app.querySelector('#share').addEventListener('click', function () {
        var done = function () { GN.flash(app, 'Invite link copied'); };
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(done, function () { GN.flash(app, shareUrl); });
        else GN.flash(app, shareUrl);
      });
      app.querySelector('#leave').addEventListener('click', GN.convoy.leave);
      app.querySelectorAll('[data-start]').forEach(function (b) {
        b.addEventListener('click', function () { startGame(b.getAttribute('data-start')); });
      });
      bindDock(app);
    });
  }

  function gameView() {
    var g = gameById(Net.state.game);
    var ctx = { me: Net.myId, isHost: Net.isHost, roster: Net.roster, myName: Net.me.name, send: doAction, back: backToLobby };
    GN.mount(GN.topbar(g.name) + '<div class="pad game-pad">' + g.view(Net.state, ctx) + '</div>' + dockHTML(), function (app) {
      g.bind(app, Net.state, ctx);
      bindDock(app);
    });
  }

  /* ---------------- shared dock: PTT + chat ---------------- */
  function dockHTML() {
    return '<div class="dock">' +
      (Net.isHost ? '<button class="btn small" id="docklobby" title="Back to lobby">⏹</button>' : '') +
      '<button class="ptt' + (Net.localStream ? ' live' : '') + '" id="ptt">' + (Net.localStream ? '🎙 Hold to talk' : '🎙 Enable mic') + '</button>' +
      '<button class="btn small" id="chatbtn">💬<span id="chatcount">' + (Net.chat.length || '') + '</span></button>' +
      '</div>' +
      '<div class="chat-panel" id="chatpanel"' + (Net.chatOpen ? '' : ' hidden') + '>' + chatHTML() + '</div>';
  }
  function bindDock(app) {
    var ptt = app.querySelector('#ptt');
    if (ptt) {
      if (Net.localStream) {
        ptt.addEventListener('pointerdown', function (e) { e.preventDefault(); GN.convoy.ptt(true); ptt.classList.add('talking'); });
        var stop = function () { GN.convoy.ptt(false); ptt.classList.remove('talking'); };
        ptt.addEventListener('pointerup', stop); ptt.addEventListener('pointerleave', stop); ptt.addEventListener('pointercancel', stop);
        ptt.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      } else {
        ptt.addEventListener('click', function () {
          GN.convoy.enableMic().then(function () { render(); }).catch(function () { GN.flash(app, 'Microphone blocked — chat still works.'); });
        });
      }
    }
    var dl = app.querySelector('#docklobby');
    if (dl) dl.addEventListener('click', function () { Net.chatOpen = false; backToLobby(); });
    var cb = app.querySelector('#chatbtn');
    if (cb) cb.addEventListener('click', function () { Net.chatOpen = !Net.chatOpen; var p = app.querySelector('#chatpanel'); p.hidden = !Net.chatOpen; });
    var cc = app.querySelector('#chatclose');
    if (cc) cc.addEventListener('click', function () { Net.chatOpen = false; app.querySelector('#chatpanel').hidden = true; });
    var send = function () { var i = app.querySelector('#chatinput'); sendChat(i.value); i.value = ''; };
    var cs = app.querySelector('#chatsend'); if (cs) cs.addEventListener('click', send);
    var ci = app.querySelector('#chatinput'); if (ci) ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    app.querySelectorAll('.qemoji').forEach(function (b) { b.addEventListener('click', function () { sendChat(b.getAttribute('data-e')); }); });
    renderChat();
  }

  GN.convoy.renderChat = renderChat;
})();
