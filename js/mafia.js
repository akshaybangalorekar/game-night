/* Game Night — Mafia: hidden roles, narrator-guided nights, QR role reveal. */
(function () {
  var GN = window.GN;

  var ROLES = {
    villager:  { name: 'Villager',      team: 'village', emoji: '👤', desc: 'No powers. Use talk, logic and votes to find the Mafia.' },
    mafia:     { name: 'Mafia',         team: 'mafia',   emoji: '🔫', desc: 'Each night, choose someone to eliminate. Blend in by day.' },
    godfather: { name: 'Godfather',     team: 'mafia',   emoji: '👔', desc: 'You lead the Mafia and appear innocent to the Detective.' },
    doctor:    { name: 'Doctor',        team: 'village', emoji: '⚕️', desc: 'Each night, protect one player from being killed.' },
    detective: { name: 'Detective',     team: 'village', emoji: '🔍', desc: 'Each night, investigate one player to learn if they are Mafia.' },
    jester:    { name: 'Jester',        team: 'neutral', emoji: '🃏', desc: 'Get yourself voted out during the day to win.' },
    serial:    { name: 'Serial Killer', team: 'neutral', emoji: '🔪', desc: 'Kill each night and try to be the last one standing.' }
  };

  var G = null;   // game state
  var N = null;   // narrator runtime

  /* ---------------- deck ---------------- */
  function buildDeck(n, o) {
    var deck = [];
    var mafia = n <= 4 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
    for (var i = 0; i < mafia; i++) deck.push('mafia');
    if (o.godfather && mafia >= 2) deck[0] = 'godfather';
    if (n >= 5) deck.push('detective');
    if (n >= 6) deck.push('doctor');
    if (o.serial && n >= 7) deck.push('serial');
    if (o.jester && n >= 6) deck.push('jester');
    while (deck.length < n) deck.push('villager');
    return GN.shuffle(deck).slice(0, n);
  }

  /* ---------------- entry ---------------- */
  function start() { optionsScreen(); }

  function optionsScreen() {
    var opts = { godfather: false, jester: false, serial: false };
    GN.nav(function () {
      function paint() {
        GN.mount(
          GN.topbar('Mafia') +
          '<div class="pad">' +
            '<p class="muted">Classic social deduction. One phone narrates; every role stays secret. ' +
            'Best with 6–10 players.</p>' +
            '<h3>Optional roles</h3>' +
            '<div class="opt-list">' +
              optRow('godfather', 'Godfather', 'A Mafia leader who reads as innocent (needs 2+ Mafia)') +
              optRow('jester', 'Jester', 'A lone troublemaker who wins if the town votes them out') +
              optRow('serial', 'Serial Killer', 'A lone killer who wins by being the last one standing') +
            '</div>' +
            '<button class="btn primary big" id="next">Choose players</button>' +
          '</div>',
          function (app) {
            app.querySelectorAll('[data-opt]').forEach(function (b) {
              b.addEventListener('click', function () {
                var k = b.getAttribute('data-opt'); opts[k] = !opts[k]; paint();
              });
            });
            app.querySelector('#next').addEventListener('click', function () {
              GN.playerSetup({
                title: 'Mafia — players', min: 4, max: 20, cta: 'Deal roles',
                hint: 'Add everyone in the room (4–20).',
                onStart: function (names) { dealRoles(names, opts); }
              });
            });
          });
      }
      function optRow(k, t, sub) {
        return '<button class="opt' + (opts[k] ? ' on' : '') + '" data-opt="' + k + '">' +
          '<span class="box"></span><span class="ot">' + GN.esc(t) + '<small>' + GN.esc(sub) + '</small></span></button>';
      }
      paint();
    });
  }

  function dealRoles(names, opts) {
    var deck = buildDeck(names.length, opts);
    var roles = {};
    names.forEach(function (n, i) { roles[n] = deck[i]; });
    G = { names: names, roles: roles, alive: names.slice(), dead: [], night: 1, opts: opts };
    revealChooser();
  }

  /* ---------------- role reveal ---------------- */
  function revealChooser() {
    GN.nav(function () {
      GN.mount(
        GN.topbar('Reveal roles') +
        '<div class="pad">' +
          '<p class="muted">How should players learn their secret role?</p>' +
          '<button class="btn big" id="pass">📱 Pass the phone around</button>' +
          '<button class="btn big" id="qr">🔳 Show a QR code per player</button>' +
          '<p class="opt-hint">QR mode opens each role on that player\u2019s own phone — perfect when the page is hosted online ' +
          '(e.g. GitHub Pages). Offline, use “Pass the phone”.</p>' +
        '</div>',
        function (app) {
          app.querySelector('#pass').addEventListener('click', function () { revealPass(0); });
          app.querySelector('#qr').addEventListener('click', function () { revealQR(0); });
        });
    });
  }

  function roleCardHTML(name) {
    var r = ROLES[G.roles[name]];
    var mates = r.team === 'mafia'
      ? G.names.filter(function (n) { return n !== name && ROLES[G.roles[n]].team === 'mafia'; })
      : [];
    return '<div class="role-card team-' + r.team + '">' +
      '<div class="role-emoji">' + r.emoji + '</div>' +
      '<div class="role-name">' + r.name + '</div>' +
      '<p class="role-desc">' + r.desc + '</p>' +
      (mates.length ? '<p class="muted">Your Mafia: <strong>' + mates.map(GN.esc).join(', ') + '</strong></p>' : '') +
      '<button class="btn primary big" id="done">Hide &amp; pass on</button>' +
      '</div>';
  }

  function revealPass(i) {
    if (i >= G.names.length) return narratorStart();
    GN.secret({
      title: 'Role ' + (i + 1) + ' of ' + G.names.length,
      player: G.names[i],
      content: roleCardHTML(G.names[i]),
      onDone: function () { revealPass(i + 1); }
    });
  }

  function hosted() { return location.protocol === 'http:' || location.protocol === 'https:'; }

  function revealUrl(payload) {
    var base = hosted() ? location.origin + location.pathname : location.href.split('#')[0];
    return base + '#/reveal/' + GN.b64e(payload);
  }

  function drawQR(box, text) {
    box.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createImgTag(6, 8);
    } catch (e) { box.textContent = 'Could not build QR code'; }
  }

  function revealQR(i) {
    if (i >= G.names.length) return narratorStart();
    var name = G.names[i];
    var r = ROLES[G.roles[name]];
    var mates = r.team === 'mafia'
      ? G.names.filter(function (n) { return ROLES[G.roles[n]].team === 'mafia'; })
      : [];
    var url = revealUrl({ t: 'mafia', n: name, r: G.roles[name], mates: mates });

    GN.replace(function () {
      GN.mount(
        GN.topbar('QR ' + (i + 1) + ' of ' + G.names.length) +
        '<div class="pad center">' +
          '<p class="muted">Show this to</p><h2 class="big-name">' + GN.esc(name) + '</h2>' +
          '<div class="qrbox" id="qrbox"></div>' +
          (hosted()
            ? '<p class="muted small">Scan with a phone camera to open the role privately.</p>'
            : '<p class="muted small">⚠️ Opened from a file, so QR links won\u2019t reach other phones. Host the page ' +
              '(e.g. GitHub Pages), or tap “Show on this phone”.</p>') +
          '<div class="spacer"></div>' +
          '<button class="btn" id="peek">Show on this phone instead</button>' +
          '<button class="btn primary big" id="next">Next player →</button>' +
        '</div>',
        function (app) {
          drawQR(app.querySelector('#qrbox'), url);
          app.querySelector('#next').addEventListener('click', function () { revealQR(i + 1); });
          app.querySelector('#peek').addEventListener('click', function () {
            GN.secret({ title: 'Role peek', player: name, content: roleCardHTML(name), onDone: function () { revealQR(i + 1); } });
          });
        });
    });
  }

  /* ---------------- narrator ---------------- */
  function narratorStart() {
    G.alive = G.names.slice();
    G.dead = [];
    G.night = 1;
    startNight();
  }

  function aliveWithRole(roleKey) {
    return G.alive.filter(function (n) { return G.roles[n] === roleKey; });
  }
  function aliveTeam(team) {
    return G.alive.filter(function (n) { return ROLES[G.roles[n]].team === team; });
  }

  function nightSteps() {
    var steps = [];
    if (aliveTeam('mafia').length) {
      steps.push({ role: 'mafia', label: 'Mafia', prompt: 'Mafia, wake up. Choose who to eliminate tonight.', optional: false });
    }
    if (aliveWithRole('doctor').length) {
      steps.push({ role: 'doctor', label: 'Doctor', prompt: 'Doctor, wake up. Choose someone to protect (or skip).', optional: true });
    }
    if (aliveWithRole('detective').length) {
      steps.push({ role: 'detective', label: 'Detective', prompt: 'Detective, wake up. Choose someone to investigate.', optional: false });
    }
    if (aliveWithRole('serial').length) {
      steps.push({ role: 'serial', label: 'Serial Killer', prompt: 'Serial killer, wake up. Choose who to kill (or skip).', optional: true });
    }
    return steps;
  }

  function startNight() {
    N = { kills: {}, saved: {}, queue: nightSteps() };
    nextNightStep();
  }

  function nextNightStep() {
    if (!N.queue.length) return resolveNight();
    renderStep(N.queue.shift());
  }

  function renderStep(step) {
    GN.replace(function () {
      GN.mount(
        GN.topbar('Night ' + G.night) +
        '<div class="pad">' +
          '<div class="phase-badge">🌙 Night ' + G.night + '</div>' +
          '<h2 class="phase-title">' + GN.esc(step.label) + '</h2>' +
          '<p class="muted">' + GN.esc(step.prompt) + '</p>' +
          '<div class="picklist">' + G.alive.map(function (n) {
            return '<button class="pick" data-p="' + GN.esc(n) + '">' + GN.esc(n) + '</button>';
          }).join('') + '</div>' +
          (step.optional ? '<button class="btn" id="skip">Skip / nobody</button>' : '') +
        '</div>',
        function (app) {
          app.querySelectorAll('[data-p]').forEach(function (b) {
            b.addEventListener('click', function () { choose(step, b.getAttribute('data-p')); });
          });
          var sk = app.querySelector('#skip');
          if (sk) sk.addEventListener('click', function () { choose(step, null); });
        });
    });
  }

  function choose(step, target) {
    if (target) {
      if (step.role === 'mafia' || step.role === 'serial') N.kills[target] = true;
      else if (step.role === 'doctor') N.saved[target] = true;
      else if (step.role === 'detective') {
        var isMafia = ROLES[G.roles[target]].team === 'mafia' && G.roles[target] !== 'godfather';
        return detectiveResult(target, isMafia);
      }
    }
    nextNightStep();
  }

  function detectiveResult(target, isMafia) {
    GN.replace(function () {
      GN.mount(
        GN.topbar('Detective') +
        '<div class="pad center">' +
          '<div class="phase-badge">🔍 Investigation</div>' +
          '<h2 class="phase-title">' + GN.esc(target) + ' is ' + (isMafia ? 'MAFIA' : 'not Mafia') + '</h2>' +
          '<p class="muted small">Show this only to the Detective, then continue.</p>' +
          '<button class="btn primary big" id="ok">Continue the night</button>' +
        '</div>',
        function (app) { app.querySelector('#ok').addEventListener('click', nextNightStep); });
    });
  }

  function resolveNight() {
    var deaths = Object.keys(N.kills).filter(function (t) { return !N.saved[t]; });
    deaths.forEach(function (d) {
      G.alive = G.alive.filter(function (x) { return x !== d; });
      G.dead.push(d);
    });
    var w = winCheck();
    if (w) return endScreen(w, deaths);
    GN.replace(function () {
      GN.mount(
        GN.topbar('Dawn') +
        '<div class="pad center">' +
          '<div class="phase-badge">🌅 Dawn</div>' +
          '<h2 class="phase-title">' + (deaths.length ? 'Someone didn\u2019t make it' : 'A quiet night') + '</h2>' +
          '<p class="muted">' + (deaths.length
            ? '<strong>' + deaths.map(GN.esc).join(', ') + '</strong> ' + (deaths.length > 1 ? 'were' : 'was') + ' found dead.'
            : 'Nobody died tonight.') + '</p>' +
          '<button class="btn primary big" id="day">Start the day</button>' +
        '</div>',
        function (app) { app.querySelector('#day').addEventListener('click', startDay); });
    });
  }

  function winCheck() {
    var mafia = aliveTeam('mafia').length;
    var sk = aliveWithRole('serial').length;
    var others = G.alive.length - mafia - sk;
    if (mafia === 0 && sk === 0) return 'The Village';
    if (sk > 0 && G.alive.length === 1) return 'The Serial Killer';
    if (mafia > 0 && mafia >= others + sk) return 'The Mafia';
    return null;
  }

  function startDay() {
    GN.replace(function () {
      GN.mount(
        GN.topbar('Day ' + G.night) +
        '<div class="pad center">' +
          '<div class="phase-badge">☀️ Day ' + G.night + '</div>' +
          '<h2 class="phase-title">Discuss</h2>' +
          '<p class="muted">Alive: ' + G.alive.map(GN.esc).join(', ') + '</p>' +
          '<div class="timer" id="clock">2:00</div>' +
          '<button class="btn" id="startclock">Start 2:00 timer</button>' +
          '<button class="btn primary big" id="vote">Go to the vote</button>' +
        '</div>',
        function (app) {
          var t = null;
          app.querySelector('#startclock').addEventListener('click', function (e) {
            e.target.disabled = true;
            t = GN.timer(120, app.querySelector('#clock'), function () { GN.flash(app, 'Time!'); });
          });
          app.querySelector('#vote').addEventListener('click', function () { if (t) t.stop(); voteScreen(); });
        });
    });
  }

  function voteScreen() {
    GN.replace(function () {
      GN.mount(
        GN.topbar('The vote') +
        '<div class="pad">' +
          '<h2 class="phase-title">Who is voted out?</h2>' +
          '<p class="muted">Count the votes, then tap the player the town eliminates.</p>' +
          '<div class="picklist">' + G.alive.map(function (n) {
            return '<button class="pick" data-p="' + GN.esc(n) + '">' + GN.esc(n) + '</button>';
          }).join('') + '</div>' +
          '<button class="btn" id="nobody">No one / tie</button>' +
        '</div>',
        function (app) {
          app.querySelectorAll('[data-p]').forEach(function (b) {
            b.addEventListener('click', function () { eliminate(b.getAttribute('data-p')); });
          });
          app.querySelector('#nobody').addEventListener('click', function () { nextNight(); });
        });
    });
  }

  function eliminate(name) {
    var wasJester = G.roles[name] === 'jester';
    G.alive = G.alive.filter(function (x) { return x !== name; });
    G.dead.push(name);
    var w = wasJester ? 'The Jester' : winCheck();
    if (w) return endScreen(w, [name]);
    GN.replace(function () {
      GN.mount(
        GN.topbar('Eliminated') +
        '<div class="pad center">' +
          '<div class="phase-badge">⚖️ The town has spoken</div>' +
          '<h2 class="phase-title">' + GN.esc(name) + ' was voted out</h2>' +
          '<p class="muted">They were the <strong>' + ROLES[G.roles[name]].name + '</strong>.</p>' +
          '<button class="btn primary big" id="next">Next night</button>' +
        '</div>',
        function (app) { app.querySelector('#next').addEventListener('click', nextNight); });
    });
  }

  function nextNight() { G.night++; startNight(); }

  function endScreen(winner, deaths) {
    GN.replace(function () {
      GN.mount(
        GN.topbar('Game over') +
        '<div class="pad center">' +
          '<div class="win-banner">🏆 ' + GN.esc(winner) + ' wins!</div>' +
          (deaths && deaths.length ? '<p class="muted">Last night: ' + deaths.map(GN.esc).join(', ') + '.</p>' : '') +
          '<div class="reveal-list">' + G.names.map(function (n) {
            var dead = G.dead.indexOf(n) !== -1;
            return '<div class="reveal-row' + (dead ? ' dead' : '') + '">' +
              '<span>' + ROLES[G.roles[n]].emoji + ' ' + GN.esc(n) + '</span>' +
              '<span class="muted">' + ROLES[G.roles[n]].name + '</span></div>';
          }).join('') + '</div>' +
          '<button class="btn primary big" data-act="home">Back to games</button>' +
        '</div>');
    });
  }

  GN.register({
    id: 'mafia', name: 'Mafia', emoji: '🔫', group: 'mafia', min: 4, max: 20,
    blurb: 'Hidden roles, nightly kills, daytime trials — narrator-guided with QR role reveal.',
    start: start
  });
})();
