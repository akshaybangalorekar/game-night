/* Game Night — The Convoy: peer-to-peer rooms, push-to-talk voice, chat and convoy games.
   No server of our own: PeerJS provides free signalling, then it's direct WebRTC between cars.
   The host is authoritative for game state; guests send actions and receive state. */
(function () {
  var GN = window.GN;

  /* PeerJS gives free signalling. STUN + a public TURN relay let two phones on different
     networks (mobile data, strict Wi-Fi) still reach each other when a direct link fails. */
  function peerOpts() {
    if (window.GN_PEER) return window.GN_PEER;   // override for local testing
    return {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:3478', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    };
  }

  /* Keep the screen awake while a room is open. On phones, a sleeping screen suspends the
     page, which drops the signalling socket and makes the room unreachable to others. */
  var wakeLock = null;
  function keepAwake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
      }
    } catch (e) {}
  }
  function releaseAwake() { try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Net.peer) keepAwake();
  });

  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randCode() { var s = ''; for (var i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
  function drawQR(box, text) { box.innerHTML = ''; try { var qr = qrcode(0, 'M'); qr.addData(text); qr.make(); box.innerHTML = qr.createImgTag(6, 8); } catch (e) { box.textContent = 'QR unavailable'; } }

  var Net = {
    peer: null, isHost: false, room: '', myId: null, me: { name: '', car: '' },
    hostConn: null, conns: {}, roster: [], state: null, chat: [],
    calls: {}, audios: {}, localStream: null,
    screen: 'hub', viewFn: null, chatOpen: false,
    used: {}, roomObj: null, saveTimer: null, saveDebounce: null, pendingGame: null,
    micUntil: 0, micTimer: null, micTicker: null
  };
  GN.convoy = { Net: Net };
  GN.convoy.peerOpts = peerOpts;

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

  /* high-frequency channel for real-time games (positions) — no re-render */
  GN.convoy.fastSend = function (d, toPid) {
    var msg = { t: 'fast', from: Net.myId, d: d };
    if (Net.isHost) { if (toPid) sendTo(toPid, msg); else broadcast(msg); }
    else sendToHost(msg);
  };
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

  /* ---------------- persistence (GitHub store) ---------------- */
  function storeReady() { return GN.store && GN.store.ready(); }
  function canWrite() { return GN.store && GN.store.hasWrite(); }
  function loadUsed() {
    if (!storeReady()) return Promise.resolve();
    return GN.store.loadUsed().then(function (u) { if (u) Net.used = u; }).catch(function () {});
  }
  function saveUsed() {
    if (!canWrite()) return Promise.resolve();
    return GN.store.saveUsed(Net.used).catch(function () {});
  }
  function snapshotRoom() {
    return {
      code: Net.room, host: Net.me.name,
      cars: Net.roster.map(function (r) { return { name: r.name, car: r.car, host: !!r.host }; }),
      state: Net.state || null, updatedAt: Date.now()
    };
  }
  function saveRoomNow() {
    if (!canWrite() || !Net.room || !Net.isHost) return Promise.resolve();   // only the host's device saves
    return GN.store.saveRoom(snapshotRoom()).catch(function () {});
  }
  function saveRoomSoon() {
    if (!canWrite() || !Net.room || !Net.isHost) return;
    clearTimeout(Net.saveDebounce);
    Net.saveDebounce = setTimeout(saveRoomNow, 4000);
  }
  function startAutoSave() {
    if (Net.saveTimer || !Net.isHost) return;
    Net.saveTimer = setInterval(saveRoomNow, 180000);   // every 3 minutes while in use
  }
  function stopAutoSave() {
    if (Net.saveTimer) { clearInterval(Net.saveTimer); Net.saveTimer = null; }
    clearTimeout(Net.saveDebounce);
  }

  /* pick a prompt/scenario never used before, across all sessions */
  function pickUnused(gameId, len) {
    var u = Net.used[gameId] || (Net.used[gameId] = []);
    var avail = [];
    for (var i = 0; i < len; i++) if (u.indexOf(i) === -1) avail.push(i);
    if (!avail.length) { Net.used[gameId] = []; for (var j = 0; j < len; j++) avail.push(j); }   // exhausted -> start over
    var pick = avail[Math.floor(Math.random() * avail.length)];
    Net.used[gameId].push(pick);
    saveUsed();
    return pick;
  }
  GN.convoy.pickUnused = pickUnused;

  /* ---------------- create / join ---------------- */
  GN.convoy.create = function (me, cb, resumeCode) {
    var room = resumeCode || randCode();
    var p = new Peer('gnc-' + room, peerOpts());
    var settled = false;
    p.on('open', function (id) {
      settled = true;
      Net.peer = p; Net.isHost = true; Net.room = room; Net.myId = id; Net.me = me;
      Net.roster = [{ id: id, name: me.name, car: me.car, voice: false, host: true }];
      Net.screen = 'lobby';
      setView(lobbyView);
      keepAwake();
      loadUsed(); saveRoomSoon(); startAutoSave();
      if (resumeCode && storeReady()) {
        GN.store.loadRoom(resumeCode).then(function (rm) {
          if (rm && rm.state) { Net.state = rm.state; Net.screen = 'game'; setView(gameView); }
        });
      }
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
    p.on('disconnected', function () { try { p.reconnect(); } catch (e) {} });
    p.on('call', handleIncomingCall);
  };

  GN.convoy.join = function (room, me, cb) {
    var p = new Peer(peerOpts());
    var settled = false;
    // if the signalling socket never opens, don't hang forever
    var openTimer = setTimeout(function () { if (!settled) { settled = true; cb(new Error('no-signal')); } }, 15000);
    p.on('open', function (id) {
      clearTimeout(openTimer);
      Net.peer = p; Net.isHost = false; Net.room = room; Net.myId = id; Net.me = me;
      var conn = p.connect('gnc-' + room, { reliable: true });
      conn.on('open', function () {
        settled = true;
        Net.hostConn = conn;
        conn.send({ t: 'hello', me: me });
        Net.screen = 'lobby';
        setView(lobbyView);
        keepAwake();
        loadUsed();
        cb(null);
      });
      conn.on('data', fromHost);
      conn.on('error', function (e) { if (!settled) { settled = true; cb(e); } });
      setTimeout(function () { if (!settled) { settled = true; cb(new Error('no-answer')); } }, 20000);
    });
    p.on('error', function (e) { if (!settled) { settled = true; cb(e); } });
    p.on('disconnected', function () { try { p.reconnect(); } catch (e) {} });
    p.on('call', handleIncomingCall);
  };

  GN.convoy.leave = function () {
    stopAutoSave();
    releaseAwake();
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
    else if (d.t === 'fast') { if (Net.onFast) Net.onFast(d.from || pid, d.d); }
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
    else if (d.t === 'fast') { if (Net.onFast) Net.onFast(d.from, d.d); }
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
    saveRoomSoon();
    render();
  }

  function startGame(id) {
    if (!Net.isHost) return;
    var g = gameById(id);
    Net.state = g.init(Net.roster);
    Net.screen = 'game';
    broadcastState();
    saveRoomSoon();
    setView(gameView);
  }
  function backToLobby() {
    if (!Net.isHost) return;
    Net.state = null;
    Net.screen = 'lobby';
    broadcastState();
    saveRoomSoon();
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

  /* ---------------- voice (WebRTC mesh; mic runs for 5 minutes) ---------------- */
  var MIC_MS = 5 * 60 * 1000;
  function micEnabled() {
    return !!(Net.localStream && Net.localStream.getAudioTracks().some(function (t) { return t.enabled; }));
  }
  function micLabel() {
    if (!micEnabled()) return '🎙 Turn on mic';
    var left = Math.max(0, Math.ceil((Net.micUntil - Date.now()) / 1000));
    return '🎙 Mic on · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }
  function updateMicBtn() {
    var b = document.getElementById('ptt');
    if (b) { b.textContent = micLabel(); b.classList.toggle('talking', micEnabled()); }
  }
  function micTick() {
    if (Net.micTicker) return;
    Net.micTicker = setInterval(function () {
      if (!micEnabled()) { clearInterval(Net.micTicker); Net.micTicker = null; return; }
      updateMicBtn();
    }, 1000);
  }
  GN.convoy.enableMic = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no-mic-api'));
    if (Net.localStream) return Promise.resolve(true);
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
      Net.localStream = stream;
      stream.getAudioTracks().forEach(function (t) { t.enabled = false; });
      if (Net.isHost) setVoice(Net.myId, true); else sendToHost({ t: 'voice' });
      syncVoice(); render();
      return true;
    });
  };
  GN.convoy.micOn = function () {
    return GN.convoy.enableMic().then(function () {
      Net.localStream.getAudioTracks().forEach(function (t) { t.enabled = true; });
      Net.micUntil = Date.now() + MIC_MS;
      clearTimeout(Net.micTimer);
      Net.micTimer = setTimeout(function () { GN.convoy.micOff(true); }, MIC_MS);
      micTick(); updateMicBtn();
      return true;
    });
  };
  GN.convoy.micOff = function (auto) {
    if (Net.localStream) Net.localStream.getAudioTracks().forEach(function (t) { t.enabled = false; });
    clearTimeout(Net.micTimer); Net.micTimer = null; Net.micUntil = 0;
    if (Net.micTicker) { clearInterval(Net.micTicker); Net.micTicker = null; }
    updateMicBtn();
    if (auto) GN.flash(document.getElementById('app'), 'Mic turned off after 5 minutes');
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
  GN.convoy.hub = function (gameId, roomCode) {
    Net.screen = 'hub';
    Net.pendingGame = gameId || null;
    var preRoom = '';
    if (roomCode) preRoom = String(roomCode).toUpperCase();
    else { var m = location.search.match(/[?&]room=([A-Za-z0-9]+)/); if (m) preRoom = m[1].toUpperCase(); }
    var autoTried = false;
    Net.viewFn = hubView;
    GN.nav(hubView);

    function hubView() {
      GN.mount(GN.topbar((GN.gameMeta(gameId) && GN.gameMeta(gameId).name) || 'Play together') +
        '<div class="pad">' +
          '<p class="muted">Start a room and share the QR, or join one a friend already started.</p>' +
          '<div class="field"><label>Your name</label><input id="cname" class="input" placeholder="e.g. Aarav" autocomplete="off" value="' + GN.esc((GN.me && GN.me.name) || '') + '"></div>' +
          '<button class="btn primary big" id="create">➕ Start a new room</button>' +
          '<div class="or">or join a room your friend started</div>' +
          '<button class="btn big" id="scanjoin">📷 Scan their QR</button>' +
          '<div class="row"><input id="croom" class="input" placeholder="Room code" maxlength="4" value="' + GN.esc(preRoom) + '" style="text-transform:uppercase"><button class="btn" id="join">Join</button></div>' +
          '<p class="muted small" id="cmsg"></p>' +
          '<p class="opt-hint">Voice and chat stay inside your private room — only people with the code can join.</p>' +
        '</div>', function (app) {
        function names() {
          return { name: app.querySelector('#cname').value.trim() || 'Player', car: '' };
        }
        function msg(t) { app.querySelector('#cmsg').textContent = t; }
        app.querySelector('#create').addEventListener('click', function () {
          msg('Making a room…');
          GN.convoy.create(names(), function (err) { if (err) msg('Could not create: ' + (err.type || err.message || err)); });
        });
        function joinNow(room) {
          if (room.length < 4) { msg('Enter the 4-character room code.'); return; }
          joinTo(room, names().name);
        }
        app.querySelector('#join').addEventListener('click', function () {
          joinNow(app.querySelector('#croom').value.trim().toUpperCase());
        });
        app.querySelector('#scanjoin').addEventListener('click', function () { GN.scanQR(); });
        // arriving from a QR code or invite link: if we already know the name, just go in
        if (preRoom && GN.me && GN.me.name && !autoTried) {
          autoTried = true;
          joinTo(preRoom, GN.me.name);
        }
      });
    }
  };

  function joinTo(room, name) {
    room = String(room).toUpperCase();
    name = name || 'Player';
    showJoining(room);
    GN.convoy.join(room, { name: name, car: '' }, function (err) {
      if (!err) return;
      showJoinError(room, name, err);
    });
  }

  function showJoining(room) {
    GN.replace(function () {
      GN.mount(GN.topbar('Joining') +
        '<div class="pad center">' +
          '<div class="spinner"></div>' +
          '<h2 class="phase-title">Joining room ' + GN.esc(room) + '</h2>' +
          '<p class="muted">Connecting to your friend\u2019s phone…</p>' +
          '<p class="muted small">Keep this screen open for a moment.</p>' +
        '</div>');
    });
  }

  function showJoinError(room, name, err) {
    var t = (err && (err.type || err.message)) || 'unknown';
    var title, why;
    if (t === 'peer-unavailable') {
      title = 'Room ' + room + ' is not open';
      why = 'No room with that code is open right now. Check the code, or ask your friend to show the QR again.';
    } else if (t === 'no-signal' || t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
      title = 'Could not reach the game service';
      why = 'Your phone could not reach the connection service. Check your internet, then try again.';
    } else if (t === 'no-answer') {
      title = 'Room ' + room + ' did not answer';
      why = 'The room was found, but the two phones could not link up. Keep the host\u2019s app open and on screen, stay on the same Wi-Fi if you can, and try again.';
    } else {
      title = 'Could not join room ' + room;
      why = 'Something went wrong while joining. Try again.';
    }
    GN.replace(function () {
      GN.mount(GN.topbar('Could not join') +
        '<div class="pad center">' +
          '<div class="win-banner">😕 ' + GN.esc(title) + '</div>' +
          '<p class="muted">' + GN.esc(why) + '</p>' +
          '<p class="muted small">Details: ' + GN.esc(t) + '</p>' +
          '<button class="btn primary big" id="retry">Try again</button>' +
          '<button class="btn" id="backbtn">Back</button>' +
        '</div>', function (app) {
        app.querySelector('#retry').addEventListener('click', function () { joinTo(room, name); });
        app.querySelector('#backbtn').addEventListener('click', function () { GN.goHome(); });
      });
    });
  }

  function inviteFriend(app, code) {
    var f = GN.friendByCode ? GN.friendByCode(code) : null;
    var name = f ? f.name : 'your friend';
    var url = location.origin + location.pathname + '?room=' + Net.room;
    var text = 'Join my Game Night room! Tap this link: ' + url;
    if (navigator.share) {
      navigator.share({ title: 'Game Night', text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { GN.flash(app, 'Invite copied — send it to ' + name); },
        function () { GN.flash(app, url); });
    } else {
      GN.flash(app, url);
    }
  }

  function lobbyView() {
    var shareUrl = location.origin + location.pathname + '?room=' + Net.room;
    var players = Net.roster.map(function (r) {
      return '<div class="car-row' + (r.id === Net.myId ? ' me' : '') + '">' +
        '<span class="car-emoji">🙂</span>' +
        '<span class="car-who"><strong>' + GN.esc(r.name) + '</strong>' + (r.host ? '<small>host</small>' : '') + '</span>' +
        '<span class="car-voice">' + (r.voice ? '🎙' : '') + '</span>' +
        '</div>';
    }).join('');
    var meta = Net.pendingGame ? GN.gameMeta(Net.pendingGame) : null;
    var hostControls;
    if (Net.isHost && meta) {
      var enough = Net.roster.length >= meta.min;
      hostControls = '<h3>' + meta.emoji + ' ' + GN.esc(meta.name) + '</h3>' +
        '<p class="muted small">' + GN.esc(meta.blurb) + '</p>' +
        '<button class="btn primary big" id="startgame"' + (enough ? '' : ' disabled') + '>' +
          (enough ? 'Start ' + GN.esc(meta.name) : 'Need ' + meta.min + ' players (' + Net.roster.length + ')') + '</button>';
    } else if (Net.isHost) {
      hostControls = '<h3>Start a game</h3><div class="grid">' + GN.convoyGames.map(function (g) {
        var ok = Net.roster.length >= g.min;
        return '<button class="card' + (ok ? '' : ' disabled') + '" data-start="' + g.id + '"' + (ok ? '' : ' disabled') + '>' +
          '<span class="card-emoji">' + g.emoji + '</span><span class="card-name">' + GN.esc(g.name) + '</span>' +
          '<span class="card-blurb">' + GN.esc(g.blurb) + '</span><span class="card-meta">needs ' + g.min + '+</span></button>';
      }).join('') + '</div>';
    } else {
      hostControls = '<div class="joined-banner">✅ You are in the room</div>' +
        '<p class="muted center">Waiting for the host to start…</p>';
    }

    var myFriends = GN.friends || [];
    var inviteHTML = '<h3>Invite your friends</h3>' + (myFriends.length
      ? '<div class="invite-list">' + myFriends.map(function (f) {
          return '<div class="invite-row"><span class="friend-name">' + GN.esc(f.name) + '</span>' +
            '<button class="btn small" data-invite="' + GN.esc(f.code) + '">Invite</button></div>';
        }).join('') + '</div>'
      : '<p class="muted small">No friends yet — add some on the home screen and they will appear here.</p>');

    GN.mount(GN.topbar('Room') +
      '<div class="pad">' +
        '<p class="muted small">Show this QR to your friends so they can join.</p>' +
        '<div class="room-box">' +
          '<div class="room-label">Scan to join</div>' +
          '<div class="qrbox big" id="qrbox"></div>' +
          '<div class="room-label" style="margin-top:12px">or type the code</div>' +
          '<div class="room-code">' + GN.esc(Net.room) + '</div>' +
          '<button class="btn small" id="share">Copy invite link</button>' +
        '</div>' +
        '<h3>Players in the room (' + Net.roster.length + ')</h3>' +
        '<div class="car-list">' + players + '</div>' +
        inviteHTML +
        hostControls +
        '<button class="btn ghost" id="leave">Leave room</button>' +
      '</div>' + dockHTML(), function (app) {
      app.querySelector('#share').addEventListener('click', function () {
        var done = function () { GN.flash(app, 'Invite link copied'); };
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(done, function () { GN.flash(app, shareUrl); });
        else GN.flash(app, shareUrl);
      });
      app.querySelector('#leave').addEventListener('click', GN.convoy.leave);
      app.querySelectorAll('[data-invite]').forEach(function (b) {
        b.addEventListener('click', function () { inviteFriend(app, b.getAttribute('data-invite')); });
      });
      var qb = app.querySelector('#qrbox');
      if (qb) (GN.drawQR || drawQR)(qb, shareUrl, 6);
      app.querySelectorAll('[data-start]').forEach(function (b) {
        b.addEventListener('click', function () { startGame(b.getAttribute('data-start')); });
      });
      var sg = app.querySelector('#startgame');
      if (sg) sg.addEventListener('click', function () { startGame(Net.pendingGame); });
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
      '<button class="ptt' + (micEnabled() ? ' talking' : '') + '" id="ptt">' + micLabel() + '</button>' +
      '<button class="btn small" id="chatbtn">💬<span id="chatcount">' + (Net.chat.length || '') + '</span></button>' +
      '</div>' +
      '<div class="chat-panel" id="chatpanel"' + (Net.chatOpen ? '' : ' hidden') + '>' + chatHTML() + '</div>';
  }
  function bindDock(app) {
    var ptt = app.querySelector('#ptt');
    if (ptt) {
      ptt.addEventListener('click', function () {
        if (micEnabled()) { GN.convoy.micOff(false); return; }
        GN.convoy.micOn().catch(function () { GN.flash(app, 'Microphone blocked — chat still works.'); });
      });
      updateMicBtn();
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
