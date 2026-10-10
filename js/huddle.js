/* Game Night — table games (Huddle-style): Spyfall, Wavelength, Time's Up. */
(function () {
  var GN = window.GN;

  /* =========================================================
     Spyfall
     ========================================================= */
  var LOCATIONS = ['Airport', 'Beach', 'Casino', 'Cinema', 'Circus', 'Cruise ship', 'Hospital',
    'Hotel', 'Library', 'Museum', 'Restaurant', 'School', 'Space station', 'Submarine',
    'Train', 'Zoo', 'Bank', 'Farm', 'Gym', 'Prison', 'Wedding', 'Music festival'];

  function startSpyfall() {
    GN.playerSetup({
      title: 'Spyfall — players', min: 3, max: 10, cta: 'Play',
      hint: 'Everyone knows the location except the spy. Ask each other questions, then vote.',
      onStart: runSpyfall
    });
  }

  function runSpyfall(players) {
    var scores = {};
    players.forEach(function (p) { scores[p] = 0; });
    var total = 3, round = 1, location = '', spy = '';

    function roundStart() {
      if (round > total) return GN.results(players, scores, 'Spyfall');
      location = GN.sample(LOCATIONS, 1)[0];
      spy = GN.sample(players, 1)[0];
      revealStep(0);
    }

    function revealStep(i) {
      if (i >= players.length) return discuss();
      var name = players[i];
      var isSpy = name === spy;
      GN.secret({
        title: 'Round ' + round + ' · ' + (i + 1) + '/' + players.length,
        player: name,
        content: '<div class="role-card team-' + (isSpy ? 'mafia' : 'village') + '">' +
          '<div class="role-emoji">' + (isSpy ? '🕵️' : '📍') + '</div>' +
          '<div class="role-name">' + (isSpy ? 'You are the SPY' : GN.esc(location)) + '</div>' +
          '<p class="role-desc">' + (isSpy
            ? 'You don\u2019t know where you are. Blend in, work it out, and don\u2019t get caught.'
            : 'Ask subtle questions to find the spy — but don\u2019t make the location too obvious.') + '</p>' +
          '<button class="btn primary big" id="done">Hide &amp; pass on</button></div>',
        onDone: function () { revealStep(i + 1); }
      });
    }

    function discuss() {
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — discuss') +
          '<div class="pad center">' +
            '<div class="phase-badge">🗣️ Round ' + round + '</div>' +
            '<h2 class="phase-title">Interrogate each other</h2>' +
            '<p class="muted">Take turns asking one question. Then vote for the spy.</p>' +
            '<div class="timer" id="clock">3:00</div>' +
            '<button class="btn" id="startclock">Start 3:00 timer</button>' +
            '<button class="btn primary big" id="v">Go to the vote</button>' +
          '</div>',
          function (app) {
            var t = null;
            app.querySelector('#startclock').addEventListener('click', function (e) {
              e.target.disabled = true;
              t = GN.timer(180, app.querySelector('#clock'), function () { GN.flash(app, 'Time!'); });
            });
            app.querySelector('#v').addEventListener('click', function () { if (t) t.stop(); vote(); });
          });
      });
    }

    function vote() {
      var entries = players.map(function (p) { return { text: p, author: p }; });
      GN.voteRound(players, entries, function (ballots) {
        var counts = {};
        players.forEach(function (p) { counts[p] = 0; });
        Object.keys(ballots).forEach(function (v) { counts[players[ballots[v]]] += 1; });
        var max = Math.max.apply(null, players.map(function (p) { return counts[p]; }));
        var top = players.filter(function (p) { return counts[p] === max; });
        var caught = top.length === 1 && top[0] === spy;
        result(ballots, caught);
      }, { instruction: 'Who is the spy?', excludeSelf: true });
    }

    function result(ballots, caught) {
      if (caught) return spyGuess();
      // spy escaped
      scores[spy] += 2;
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — result') +
          '<div class="pad center">' +
            '<div class="win-banner">🕵️ The spy escaped!</div>' +
            '<p class="muted">It was <strong>' + GN.esc(spy) + '</strong>, and the location was ' + GN.esc(location) + '.</p>' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">Next round</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { round++; roundStart(); }); });
      });
    }

    function spyGuess() {
      GN.replace(function () {
        GN.mount(
          GN.topbar('Spy caught') +
          '<div class="pad center">' +
            '<div class="win-banner">🎯 ' + GN.esc(spy) + ' was caught!</div>' +
            '<p class="muted">One last chance: can the spy name the location?</p>' +
            '<button class="btn" id="wrong">No, wrong guess</button>' +
            '<button class="btn primary big" id="right">Yes, guessed it right</button>' +
          '</div>',
          function (app) {
            app.querySelector('#wrong').addEventListener('click', function () {
              players.forEach(function (p) { if (p !== spy) scores[p] += 1; });
              afterGuess();
            });
            app.querySelector('#right').addEventListener('click', function () { scores[spy] += 2; afterGuess(); });
          });
      });
    }

    function afterGuess() {
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — result') +
          '<div class="pad center">' +
            '<p class="muted">The location was <strong>' + GN.esc(location) + '</strong>.</p>' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">Next round</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { round++; roundStart(); }); });
      });
    }

    roundStart();
  }

  /* =========================================================
     Wavelength
     ========================================================= */
  var SPECTRA = [
    { l: 'Hot', r: 'Cold' }, { l: 'Overrated', r: 'Underrated' },
    { l: 'Cheap', r: 'Expensive' }, { l: 'Round', r: 'Pointy' },
    { l: 'Good', r: 'Evil' }, { l: 'Underwater', r: 'In space' },
    { l: 'Boring', r: 'Exciting' }, { l: 'Tiny', r: 'Huge' }
  ];

  function startWavelength() {
    GN.playerSetup({
      title: 'Wavelength — players', min: 3, max: 8, cta: 'Play',
      hint: 'One player gives a clue for a hidden point on a spectrum. The team dials it in. 5 rounds.',
      onStart: runWavelength
    });
  }

  function runWavelength(players) {
    var scores = {};
    players.forEach(function (p) { scores[p] = 0; });
    var total = 5, round = 1, spec = null, target = 0, clue = '', psychic = '', guesser = '';

    function roundStart() {
      if (round > total) return GN.results(players, scores, 'Wavelength');
      spec = GN.sample(SPECTRA, 1)[0];
      target = 10 + Math.floor(Math.random() * 81); // 10..90
      psychic = players[(round - 1) % players.length];
      guesser = players[round % players.length];
      clueStep();
    }

    function clueStep() {
      GN.secret({
        title: 'Round ' + round + ' · clue', player: psychic,
        content: '<div class="phase-badge">Psychic</div>' +
          '<p class="muted">Spectrum: <strong>' + GN.esc(spec.l) + '</strong> ← → <strong>' + GN.esc(spec.r) + '</strong></p>' +
          '<div class="prompt-box">Target is at <strong>' + target + '</strong> / 100</div>' +
          '<p class="muted small">Give a clue that lands on that spot, then pass the phone on.</p>' +
          '<input id="clue" class="input" placeholder="Your one-word clue (optional)" autocomplete="off">' +
          '<button class="btn primary big" id="done">Pass to ' + GN.esc(guesser) + '</button>',
        onDone: function (app) { clue = app.querySelector('#clue').value.trim(); guessStep(); }
      });
    }

    function guessStep() {
      GN.secret({
        title: 'Round ' + round + ' · guess', player: guesser,
        content: '<div class="phase-badge">Guess the target</div>' +
          '<p class="muted">Spectrum: <strong>' + GN.esc(spec.l) + '</strong> ← → <strong>' + GN.esc(spec.r) + '</strong></p>' +
          (clue ? '<div class="prompt-box">Clue: “' + GN.esc(clue) + '”</div>' : '') +
          '<div class="prompt-box">Where is the target? <strong><span id="val">50</span></strong> / 100</div>' +
          '<input id="dial" class="input" type="range" min="0" max="100" value="50">' +
          '<button class="btn primary big" id="done">Lock in</button>',
        onReady: function (app) {
          var dial = app.querySelector('#dial'), val = app.querySelector('#val');
          dial.addEventListener('input', function () { val.textContent = dial.value; });
        },
        onDone: function (app) { reveal(+app.querySelector('#dial').value); }
      });
    }

    function reveal(guess) {
      var diff = Math.abs(guess - target);
      var pts = diff <= 5 ? 4 : diff <= 10 ? 3 : diff <= 15 ? 2 : diff <= 20 ? 1 : 0;
      scores[psychic] += pts;
      scores[guesser] += pts;
      var label = pts === 4 ? 'Bullseye!' : pts >= 2 ? 'Nice one.' : pts === 1 ? 'Close-ish.' : 'Way off!';
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — reveal') +
          '<div class="pad center">' +
            '<div class="win-banner">' + label + ' (' + pts + ' pts)</div>' +
            '<p class="muted">Target was ' + target + ', guess was ' + guess + '.</p>' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">Next round</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { round++; roundStart(); }); });
      });
    }

    roundStart();
  }

  /* =========================================================
     Time's Up
     ========================================================= */
  var WORDS = ['Shah Rukh Khan', 'Virat Kohli', 'Cricket', 'Dosa', 'Elephant', 'Eiffel Tower',
    'Brushing teeth', 'Monsoon', 'Auto rickshaw', 'Chai', 'Yoga', 'Diwali', 'Bollywood dance',
    'Rocket launch', 'Selfie', 'Traffic jam', 'Big fat wedding', 'Pizza', 'Football', 'Sunset',
    'Bicycle', 'Birthday cake', 'Doctor', 'Umbrella'];
  var MODES = { 1: 'Describe freely', 2: 'One word only', 3: 'Charades — no words' };

  function startTimesUp() {
    GN.playerSetup({
      title: "Time's Up — players", min: 4, max: 12, cta: 'Play',
      hint: 'Two teams. Three rounds: describe, then one word, then charades. 45 seconds per turn.',
      onStart: runTimesUp
    });
  }

  function runTimesUp(players) {
    var teams = [[], []];
    players.forEach(function (p, i) { teams[i % 2].push(p); });
    var teamScore = [0, 0];
    var pool = GN.sample(WORDS, Math.min(WORDS.length, 16));
    var order = [];
    for (var r = 1; r <= 3; r++) for (var t = 0; t < 2; t++) order.push({ r: r, t: t });
    var i = 0;

    function step() {
      if (i >= order.length) return finish();
      var o = order[i];
      var desc = teams[o.t][(o.r - 1) % teams[o.t].length];
      turn(o, desc);
    }

    function turn(o, describer) {
      var words = GN.shuffle(pool.slice());
      var idx = 0, got = 0;
      GN.secret({
        title: 'Team ' + (o.t + 1) + ' · Round ' + o.r,
        player: describer,
        content: '<div class="phase-badge">Round ' + o.r + ' · ' + MODES[o.r] + '</div>' +
          '<div class="timer" id="clock">0:45</div>' +
          '<div class="prompt-box" id="word">' + GN.esc(words[0]) + '</div>' +
          '<div class="row"><button class="btn" id="skip">Skip</button>' +
          '<button class="btn primary" id="got">Got it!</button></div>' +
          '<p class="muted small">Team ' + (o.t + 1) + ' this turn: <span id="sc">0</span> · 45 seconds, go!</p>',
        onReveal: function (app) {
          var wordEl = app.querySelector('#word');
          var scEl = app.querySelector('#sc');
          var t = GN.timer(45, app.querySelector('#clock'), function () { finishTurn(); });
          function nextWord() {
            if (idx >= words.length) { idx = 0; words = GN.shuffle(pool.slice()); }
            wordEl.textContent = words[idx];
          }
          function finishTurn() {
            t.stop();
            teamScore[o.t] += got;
            GN.flash(app, 'Team ' + (o.t + 1) + ' scored ' + got + '!');
            setTimeout(function () { i++; step(); }, 900);
          }
          app.querySelector('#got').addEventListener('click', function () { got++; scEl.textContent = got; idx++; nextWord(); });
          app.querySelector('#skip').addEventListener('click', function () { idx++; nextWord(); });
        }
      });
    }

    function finish() {
      var winner = teamScore[0] === teamScore[1] ? 'It\u2019s a tie!' :
        'Team ' + (teamScore[0] > teamScore[1] ? 1 : 2) + ' wins!';
      GN.replace(function () {
        GN.mount(
          GN.topbar("Time's Up — results") +
          '<div class="pad center">' +
            '<div class="win-banner">🏆 ' + winner + '</div>' +
            '<div class="board">' +
              '<div class="board-row' + (teamScore[0] >= teamScore[1] ? ' lead' : '') + '">' +
                '<span class="who">Team 1 · ' + GN.esc(teams[0].join(', ')) + '</span>' +
                '<span class="pts">' + teamScore[0] + '</span></div>' +
              '<div class="board-row' + (teamScore[1] >= teamScore[0] ? ' lead' : '') + '">' +
                '<span class="who">Team 2 · ' + GN.esc(teams[1].join(', ')) + '</span>' +
                '<span class="pts">' + teamScore[1] + '</span></div>' +
            '</div>' +
            '<button class="btn primary big" data-act="home">Back to games</button>' +
          '</div>');
      });
    }

    step();
  }

  /* ---------------- register ---------------- */
  GN.register({ id: 'spyfall', name: 'Spyfall', emoji: '🕵️', group: 'huddle', min: 3, max: 10,
    blurb: 'Everyone knows the location but one player. Ask questions and unmask the spy.', start: startSpyfall });
  GN.register({ id: 'wavelength', name: 'Wavelength', emoji: '📶', group: 'huddle', min: 3, max: 8,
    blurb: 'Read your teammate\u2019s mind on a hidden spectrum. How well do you know each other?', start: startWavelength });
  GN.register({ id: 'timesup', name: "Time's Up", emoji: '⏱️', group: 'huddle', min: 4, max: 12,
    blurb: 'Two teams, three rounds — describe, then one word, then charades. Pure chaos.', start: startTimesUp });
})();
