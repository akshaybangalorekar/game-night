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

  /* ---------------- home: two hubs ---------------- */
  GN.hubs = [
    { key: 'table', name: 'The Long Table', emoji: '🕯️', cls: 'hub-table',
      blurb: 'Everyone in one room, one phone passed around. Mafia, drawing and bluffing.' },
    { key: 'convoy', name: 'The Convoy', emoji: '🚗', cls: 'hub-convoy',
      blurb: 'Different cars, one game. Talk, guess and spot things on the road.' }
  ];

  GN.homeView = function () {
    var html = '<header class="hero"><div class="brand">🎉 Game Night</div>' +
      '<p class="tagline">Pick a road. Everything runs in the browser — no accounts, no installs.</p></header>' +
      '<div class="pad"><div class="hubs">' + GN.hubs.map(function (h) {
        return '<button class="hub-card ' + h.cls + '" data-hub="' + h.key + '">' +
          '<span class="hub-emoji">' + h.emoji + '</span>' +
          '<span class="hub-name">' + GN.esc(h.name) + '</span>' +
          '<span class="hub-blurb">' + GN.esc(h.blurb) + '</span>' +
          '</button>';
      }).join('') + '</div></div>';
    GN.mount(html, function (app) {
      app.querySelectorAll('[data-hub]').forEach(function (b) {
        b.addEventListener('click', function () { GN.hubView(b.getAttribute('data-hub')); });
      });
    });
  };

  GN.hubView = function (key) {
    if (key === 'convoy') return GN.convoy.hub();
    var groups = [
      { key: 'mafia', label: 'Social deduction' },
      { key: 'party', label: 'Party & drawing' },
      { key: 'huddle', label: 'Table games' }
    ];
    var html = GN.topbar('The Long Table') + '<div class="pad">' +
      '<p class="muted">One room, one phone. Pass it around so secrets stay secret.</p>';
    groups.forEach(function (g) {
      var games = GN.games.filter(function (x) { return x.group === g.key; });
      if (!games.length) return;
      html += '<h2 class="group-title">' + g.label + '</h2><div class="grid">';
      games.forEach(function (gm) {
        html += '<button class="card" data-game="' + gm.id + '">' +
          '<span class="card-emoji">' + gm.emoji + '</span>' +
          '<span class="card-name">' + GN.esc(gm.name) + '</span>' +
          '<span class="card-blurb">' + GN.esc(gm.blurb) + '</span>' +
          '<span class="card-meta">' + gm.min + (gm.max ? '–' + gm.max : '+') + ' players</span>' +
          '</button>';
      });
      html += '</div>';
    });
    html += '</div>';
    GN.mount(html, function (app) {
      app.querySelectorAll('[data-game]').forEach(function (b) {
        b.addEventListener('click', function () {
          var g = GN.gameById(b.getAttribute('data-game'));
          if (g) g.start();
        });
      });
    });
  };

  return GN;
})();
