/* Game Night — core framework: registry, routing, shared UI helpers. */
window.GN = (function () {
  var GN = {};

  /* ---------------- game registry ---------------- */
  GN.games = [];
  GN.register = function (g) { GN.games.push(g); return g; };
  GN.gameById = function (id) { for (var i = 0; i < GN.games.length; i++) if (GN.games[i].id === id) return GN.games[i]; return null; };

  /* ---------------- session state ---------------- */
  GN.players = [];
  GN.setPlayers = function (arr) { GN.players = arr.slice(); };

  /* ---------------- utils ---------------- */
  GN.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  GN.uid = function () { return Math.random().toString(36).slice(2, 9); };
  GN.shuffle = function (a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  GN.sample = function (a, n) { return GN.shuffle(a).slice(0, n); };
  GN.b64e = function (o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); };
  GN.b64d = function (s) { return JSON.parse(decodeURIComponent(escape(atob(s)))); };

  /* ---------------- routing (view stack) ---------------- */
  GN._stack = [];
  GN.nav = function (view) { GN._stack.push(view); view(); };
  GN.replace = function (view) {
    if (GN._stack.length) GN._stack[GN._stack.length - 1] = view; else GN._stack = [view];
    view();
  };
  GN.reset = function (view) { GN._stack = [view]; view(); };
  GN.back = function () {
    if (GN._stack.length > 1) { GN._stack.pop(); GN._stack[GN._stack.length - 1](); }
    else { GN.goHome(); }
  };
  GN.goHome = function () { GN.reset(GN.homeView); };

  /* ---------------- mount + chrome ---------------- */
  GN.mount = function (html, onMount) {
    var app = document.getElementById('app');
    app.innerHTML = html;
    window.scrollTo(0, 0);
    if (onMount) onMount(app);
  };

  GN.topbar = function (title) {
    return '<header class="topbar">' +
      '<button class="icon-btn" data-act="back" aria-label="Back">&#8592;</button>' +
      '<div class="topbar-title">' + GN.esc(title) + '</div>' +
      '<button class="icon-btn" data-act="home" aria-label="Home">&#8962;</button>' +
      '</header>';
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'back') { e.preventDefault(); GN.back(); }
    else if (a === 'home') { e.preventDefault(); GN.goHome(); }
  });

  GN.flash = function (app, msg) {
    var t = app.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; app.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(GN.flash._t);
    GN.flash._t = setTimeout(function () { t.classList.remove('show'); }, 1700);
  };

  /* ---------------- timer ---------------- */
  GN.timer = function (seconds, el, onEnd) {
    var left = seconds;
    function fmt(n) { return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
    function tick() {
      el.textContent = fmt(Math.max(0, left));
      if (left <= 0) { clearInterval(iv); el.classList.add('done'); if (onEnd) onEnd(); return; }
      left--;
    }
    tick();
    var iv = setInterval(tick, 1000);
    return { stop: function () { clearInterval(iv); } };
  };

  /* ---------------- scoreboard + results ---------------- */
  GN.scoreboard = function (players, scores) {
    var rows = players.map(function (p) { return { p: p, s: scores[p] || 0 }; })
      .sort(function (a, b) { return b.s - a.s; });
    return '<div class="board">' + rows.map(function (r, i) {
      return '<div class="board-row' + (i === 0 ? ' lead' : '') + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="who">' + GN.esc(r.p) + '</span>' +
        '<span class="pts">' + r.s + '</span></div>';
    }).join('') + '</div>';
  };

  GN.results = function (players, scores, title, opts) {
    opts = opts || {};
    var ranked = players.slice().sort(function (a, b) { return (scores[b] || 0) - (scores[a] || 0); });
    var win = ranked[0];
    GN.replace(function () {
      GN.mount(
        GN.topbar(title + ' — results') +
        '<div class="pad center">' +
          '<div class="win-banner">🏆 ' + GN.esc(win) + ' wins!</div>' +
          GN.scoreboard(players, scores) +
          (opts.extra || '') +
          '<button class="btn primary big" data-act="home">Back to games</button>' +
        '</div>');
    });
  };

  /* ---------------- shared screens ---------------- */
  GN.playerSetup = function (opts) {
    var names = (GN.players || []).slice();
    GN.nav(function view() {
      function paint() {
        var valid = names.filter(function (n) { return n.trim().length; });
        var canStart = valid.length >= opts.min && (!opts.max || valid.length <= opts.max);
        GN.mount(
          GN.topbar(opts.title) +
          '<div class="pad">' +
            (opts.hint ? '<p class="muted">' + GN.esc(opts.hint) + '</p>' : '') +
            '<div class="chips">' + names.map(function (n, i) {
              return '<span class="chip">' + (GN.esc(n) || '—') +
                '<button class="chip-x" data-del="' + i + '" aria-label="Remove">&times;</button></span>';
            }).join('') + '</div>' +
            '<div class="row">' +
              '<input id="pname" class="input" placeholder="Add a player name" autocomplete="off" enterkeyhint="done">' +
              '<button id="addp" class="btn">Add</button>' +
            '</div>' +
            '<p class="muted small">' + valid.length + ' player' + (valid.length === 1 ? '' : 's') +
              ' · needs ' + opts.min + (opts.max ? '–' + opts.max : '+') + '</p>' +
            '<button id="start" class="btn primary big"' + (canStart ? '' : ' disabled') + '>' +
              GN.esc(opts.cta || 'Start') + '</button>' +
          '</div>',
          function (app) {
            var input = app.querySelector('#pname');
            function add() {
              var v = input.value.trim();
              if (!v) return;
              if (opts.max && names.length >= opts.max) { GN.flash(app, 'Max ' + opts.max + ' players'); return; }
              names.push(v); paint();
            }
            app.querySelector('#addp').addEventListener('click', add);
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
            input.focus();
            app.querySelectorAll('[data-del]').forEach(function (b) {
              b.addEventListener('click', function () { names.splice(+b.getAttribute('data-del'), 1); paint(); });
            });
            var s = app.querySelector('#start');
            if (s) s.addEventListener('click', function () {
              var final = names.filter(function (n) { return n.trim().length; });
              GN.setPlayers(final);
              opts.onStart(GN.players);
            });
          });
      }
      paint();
    });
  };

  /* Secret reveal: "hand the phone to X" -> tap to reveal -> content.
     opts: {title, player, content, revealLabel, onReady(app), onReveal(app), onDone(app)} */
  GN.secret = function (opts) {
    GN.replace(function () {
      GN.mount(
        GN.topbar(opts.title || 'Secret') +
        '<div class="pad center">' +
          '<div class="pass-gate" id="gate">' +
            (opts.player ? '<p class="muted">Hand the phone to</p><h2 class="big-name">' + GN.esc(opts.player) + '</h2>' +
              '<p class="muted small">No peeking, everyone else.</p>' : '') +
            '<button class="btn primary big" id="reveal">' + GN.esc(opts.revealLabel || 'Tap to reveal') + '</button>' +
          '</div>' +
          '<div class="pass-content" id="content" hidden>' + (opts.content || '') + '</div>' +
        '</div>',
        function (app) {
          if (opts.onReady) opts.onReady(app);
          app.querySelector('#reveal').addEventListener('click', function () {
            app.querySelector('#gate').hidden = true;
            var c = app.querySelector('#content');
            c.hidden = false;
            if (opts.onReveal) opts.onReveal(app);
          });
          var done = app.querySelector('#done');
          if (done && opts.onDone) done.addEventListener('click', function () { opts.onDone(app); });
        });
    });
  };

  /* Collect a private text answer from each player, passing the device. */
  GN.collectTexts = function (opts) {
    var texts = [];
    function step(i) {
      if (i >= opts.players.length) return opts.onSubmit(texts);
      GN.secret({
        title: opts.title + ' · ' + (i + 1) + '/' + opts.players.length,
        player: opts.players[i],
        content:
          '<div class="prompt-box">' + opts.prompt + '</div>' +
          '<textarea id="ans" class="input" rows="3" placeholder="' + GN.esc(opts.placeholder || 'Type your answer') + '"></textarea>' +
          '<button class="btn primary big" id="done">Lock it in</button>',
        onReady: function (app) { var t = app.querySelector('#ans'); if (t) t.focus(); },
        onDone: function (app) {
          var v = app.querySelector('#ans').value.trim();
          if (!v) { GN.flash(app, 'Type something first'); return; }
          texts.push({ author: opts.players[i], text: v });
          step(i + 1);
        }
      });
    }
    step(0);
  };

  /* Pass-the-device voting. Returns ballots = {voter: entryIndex}. */
  GN.voteRound = function (players, entries, onDone, opts) {
    opts = opts || {};
    var ballots = {};
    function step(i) {
      if (i >= players.length) return onDone(ballots);
      var voter = players[i];
      var options = [];
      entries.forEach(function (e, idx) {
        if (opts.excludeSelf && e.author === voter) return;
        options.push({ e: e, idx: idx });
      });
      GN.secret({
        title: 'Vote · ' + (i + 1) + '/' + players.length,
        player: voter,
        content:
          '<p class="muted">' + (opts.instruction || 'Pick one.') + '</p>' +
          '<div class="picklist">' + options.map(function (o) {
            return '<button class="pick" data-i="' + o.idx + '">' + GN.esc(o.e.text) + '</button>';
          }).join('') + '</div>',
        onReady: function (app) {
          app.querySelectorAll('[data-i]').forEach(function (b) {
            b.addEventListener('click', function () {
              ballots[voter] = +b.getAttribute('data-i');
              step(i + 1);
            });
          });
        }
      });
    }
    step(0);
  };

  /* ---------------- home: identity, friends, games ---------------- */
  GN.catalog = [
    { id: 'uno', name: 'Uno', emoji: '🃏', min: 2, max: 6, blurb: 'Match colour or number. First to empty their hand wins.' },
    { id: 'ludo', name: 'Ludo', emoji: '🎲', min: 2, max: 4, blurb: 'Roll the dice, race your tokens home.', soon: true },
    { id: 'chess', name: 'Chess', emoji: '♟️', min: 2, max: 2, blurb: 'The classic duel of wits.', soon: true },
    { id: 'airhockey', name: 'Air Hockey', emoji: '🏒', min: 2, max: 2, blurb: 'Fast paddles — best when you are on the same Wi-Fi.', soon: true },
    { id: 'mafia-room', name: 'Mafia', emoji: '🔫', min: 4, max: 16, blurb: 'Hidden roles dealt to every phone. No narrator needed.' }
  ];
  GN.gameMeta = function (id) { for (var i = 0; i < GN.catalog.length; i++) if (GN.catalog[i].id === id) return GN.catalog[i]; return null; };

  GN.copy = function (app, text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(
      function () { GN.flash(app, 'Copied: ' + text); },
      function () { GN.flash(app, text); });
    else GN.flash(app, text);
  };

  GN.homeView = function () {
    var me = GN.me || { name: '', code: '' };
    var friends = GN.friends || [];
    var html = '<header class="hero"><div class="brand">🎉 Game Night</div>' +
      '<p class="tagline">Add your friends, pick a game, play together. Voice and chat built in.</p></header>' +
      '<div class="pad">' +
        '<div class="me-card">' +
          '<input id="myname" class="input" placeholder="Your name" value="' + GN.esc(me.name) + '">' +
          '<div class="me-code">Friend code <strong>' + GN.esc(me.code) + '</strong>' +
            '<button class="btn small" id="copycode">Copy</button>' +
            '<button class="btn small" id="newcode">New</button></div>' +
          '<p class="opt-hint">Share your code so friends can add you.</p>' +
        '</div>' +
        '<h3>Friends (' + friends.length + ')</h3>' +
        '<div class="friend-list">' + (friends.length ? friends.map(function (f) {
          return '<div class="friend-row"><span class="friend-name">' + GN.esc(f.name) + '</span>' +
            '<span class="friend-code">' + GN.esc(f.code) + '</span>' +
            '<button class="chip-x" data-unfriend="' + GN.esc(f.code) + '" aria-label="Remove">&times;</button></div>';
        }).join('') : '<p class="muted small">No friends yet — add one below, or share your code.</p>') + '</div>' +
        '<div class="row"><input id="fcode" class="input" placeholder="Friend code" style="text-transform:uppercase">' +
          '<input id="fname" class="input" placeholder="Their name"><button class="btn" id="addfriend">Add</button></div>' +
        '<h3>Games</h3>' +
        '<div class="grid">' + GN.catalog.map(function (g) {
          return '<button class="card' + (g.soon ? ' disabled' : '') + '" data-game="' + g.id + '"' + (g.soon ? ' disabled' : '') + '>' +
            '<span class="card-emoji">' + g.emoji + '</span>' +
            '<span class="card-name">' + GN.esc(g.name) + '</span>' +
            '<span class="card-blurb">' + GN.esc(g.blurb) + '</span>' +
            '<span class="card-meta">' + g.min + (g.max > g.min ? '–' + g.max : '') + ' players' + (g.soon ? ' · soon' : '') + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<button class="btn ghost" id="settings" style="margin-top:20px">⚙ Storage settings</button>' +
      '</div>';
    GN.mount(html, function (app) {
      app.querySelector('#myname').addEventListener('change', function (e) { GN.me.name = e.target.value.trim(); GN.saveMe(); });
      app.querySelector('#copycode').addEventListener('click', function () { GN.copy(app, GN.me.code); });
      app.querySelector('#newcode').addEventListener('click', function () { GN.newCode(); GN.goHome(); });
      app.querySelector('#addfriend').addEventListener('click', function () {
        var r = GN.addFriend(app.querySelector('#fcode').value, app.querySelector('#fname').value);
        if (!r.ok) { GN.flash(app, r.why); return; }
        GN.goHome();
      });
      app.querySelectorAll('[data-unfriend]').forEach(function (b) {
        b.addEventListener('click', function () { GN.removeFriend(b.getAttribute('data-unfriend')); GN.goHome(); });
      });
      app.querySelectorAll('[data-game]').forEach(function (b) {
        b.addEventListener('click', function () { GN.convoy.hub(b.getAttribute('data-game')); });
      });
      var st = app.querySelector('#settings');
      if (st) st.addEventListener('click', function () { GN.store.settings(); });
    });
  };

  return GN;
})();
