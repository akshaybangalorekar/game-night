/* Game Night — party games (Jackbox-style): Punchline, Fib Factory, Scribble. */
(function () {
  var GN = window.GN;

  /* =========================================================
     Punchline  (Quiplash-style: write funny, then vote)
     ========================================================= */
  var PUNCH = [
    'The worst possible thing to say at a wedding',
    'A terrible name for a new breakfast cereal',
    'What your pet is secretly plotting',
    'The real reason the WiFi is slow',
    'A bad superpower to be stuck with',
    'The next big reality TV show',
    'An excuse for being late that nobody believes',
    'What the office printer is thinking',
    'A slogan for a very lazy gym',
    'The last thing you\u2019d want to hear from your dentist'
  ];

  function startPunchline() {
    GN.playerSetup({
      title: 'Punchline — players', min: 3, max: 10, cta: 'Play',
      hint: 'Everyone writes a funny answer, then the room votes for the best. 3 rounds.',
      onStart: runPunchline
    });
  }

  function runPunchline(players) {
    var scores = {};
    players.forEach(function (p) { scores[p] = 0; });
    var total = 3, round = 1, prompt = '';

    function roundStart() {
      if (round > total) return GN.results(players, scores, 'Punchline');
      prompt = GN.sample(PUNCH, 1)[0];
      GN.collectTexts({
        title: 'Round ' + round + ' answers', players: players, prompt: GN.esc(prompt),
        placeholder: 'Type the funniest answer',
        onSubmit: reveal
      });
    }

    function reveal(entries) {
      var shown = GN.shuffle(entries.slice());
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — reveal') +
          '<div class="pad">' +
            '<div class="prompt-box">' + GN.esc(prompt) + '</div>' +
            '<div class="answers">' + shown.map(function (e) {
              return '<div class="answer">' + GN.esc(e.text) + '</div>';
            }).join('') + '</div>' +
            '<button class="btn primary big" id="v">Everyone votes</button>' +
          '</div>',
          function (app) {
            app.querySelector('#v').addEventListener('click', function () {
              GN.voteRound(players, shown, function (ballots) { tally(ballots, shown); },
                { instruction: 'Pick the funniest answer.', excludeSelf: true });
            });
          });
      });
    }

    function tally(ballots, entries) {
      Object.keys(ballots).forEach(function (voter) { scores[entries[ballots[voter]].author] += 1; });
      GN.replace(function () {
        GN.mount(
          GN.topbar('Round ' + round + ' — scores') +
          '<div class="pad">' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">Next round</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { round++; roundStart(); }); });
      });
    }

    roundStart();
  }

  /* =========================================================
     Fib Factory  (Fibbage-style: write a lie, spot the truth)
     ========================================================= */
  var FACTS = [
    { q: 'A group of flamingos is called a ___.', a: 'flamboyance' },
    { q: 'The dot over the letter “i” is called a ___.', a: 'tittle' },
    { q: 'Octopuses have ___ hearts.', a: 'three' },
    { q: 'The unicorn is the national animal of ___.', a: 'Scotland' },
    { q: 'Bananas are berries, but strawberries are ___.', a: 'not' },
    { q: 'A “jiffy” is an actual unit of ___.', a: 'time' },
    { q: 'Honey never ___.', a: 'spoils' },
    { q: 'The shortest war in history lasted about 38 ___.', a: 'minutes' },
    { q: 'The Eiffel Tower can grow about 15 cm taller in ___.', a: 'summer' },
    { q: 'A shrimp\u2019s heart is in its ___.', a: 'head' }
  ];

  function startFib() {
    GN.playerSetup({
      title: 'Fib Factory — players', min: 3, max: 8, cta: 'Play',
      hint: 'Write a believable lie, then find the real answer. 3 facts.',
      onStart: runFib
    });
  }

  function runFib(players) {
    var scores = {};
    players.forEach(function (p) { scores[p] = 0; });
    var facts = GN.sample(FACTS, Math.min(3, FACTS.length));
    var round = 0, cur = null, options = [];

    function nextFact() {
      if (round >= facts.length) return GN.results(players, scores, 'Fib Factory');
      cur = facts[round];
      GN.collectTexts({
        title: 'Fib ' + (round + 1) + ' answers', players: players,
        prompt: GN.esc(cur.q) + '<br><span class="muted small">Write a convincing fake answer</span>',
        placeholder: 'Your believable lie',
        onSubmit: present
      });
    }

    function present(lies) {
      options = GN.shuffle(
        [{ text: cur.a, real: true, author: '__real__' }].concat(
          lies.map(function (l) { return { text: l.text, real: false, author: l.author }; }))
      );
      GN.replace(function () {
        GN.mount(
          GN.topbar('Fib ' + (round + 1) + ' — options') +
          '<div class="pad">' +
            '<div class="prompt-box">' + GN.esc(cur.q) + '</div>' +
            '<div class="answers">' + options.map(function (o) {
              return '<div class="answer">' + GN.esc(o.text) + '</div>';
            }).join('') + '</div>' +
            '<button class="btn primary big" id="v">Everyone picks the truth</button>' +
          '</div>',
          function (app) {
            app.querySelector('#v').addEventListener('click', function () {
              GN.voteRound(players, options, tally,
                { instruction: 'Which one is the real answer?', excludeSelf: true });
            });
          });
      });
    }

    function tally(ballots) {
      var realIdx = options.map(function (o) { return o.real; }).indexOf(true);
      var fooled = {};
      Object.keys(ballots).forEach(function (voter) {
        var idx = ballots[voter];
        if (idx === realIdx) { scores[voter] += 1000; }
        else {
          var lie = options[idx];
          if (lie && lie.author !== '__real__') {
            scores[lie.author] += 500;
            fooled[lie.author] = (fooled[lie.author] || 0) + 1;
          }
        }
      });
      GN.replace(function () {
        GN.mount(
          GN.topbar('Fib ' + (round + 1) + ' — result') +
          '<div class="pad center">' +
            '<div class="win-banner">The truth: “' + GN.esc(cur.a) + '”</div>' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">Next fact</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { round++; nextFact(); }); });
      });
    }

    nextFact();
  }

  /* =========================================================
     Scribble  (Drawful-style: draw a prompt, others guess)
     ========================================================= */
  var PROMPTS = [
    'A cat riding a bicycle', 'A haunted house', 'Your morning routine',
    'A dragon eating ice cream', 'The worst haircut ever', 'A robot cooking dinner',
    'A pirate at the dentist', 'A snowman on a beach', 'An alien on holiday',
    'A dog driving a car', 'A very tall sandwich', 'A shark in a swimming pool'
  ];
  var SWATCHES = ['#111111', '#e11d48', '#16a34a', '#2563eb', '#f59e0b', '#a855f7'];

  function startScribble() {
    GN.playerSetup({
      title: 'Scribble — players', min: 3, max: 8, cta: 'Start drawing',
      hint: 'Each player secretly draws a prompt, then the room guesses.',
      onStart: runScribble
    });
  }

  function runScribble(players) {
    var scores = {};
    players.forEach(function (p) { scores[p] = 0; });
    var drawings = [];
    var prompts = GN.sample(PROMPTS, players.length);

    function drawStep(i) {
      if (i >= players.length) return showStep(0);
      GN.secret({
        title: 'Draw · ' + (i + 1) + '/' + players.length,
        player: players[i],
        content:
          '<div class="prompt-box">Draw: ' + GN.esc(prompts[i]) + '</div>' +
          '<div class="canvas-wrap"><canvas id="cv" width="800" height="600"></canvas></div>' +
          '<div class="tools">' + SWATCHES.map(function (c, k) {
            return '<button class="swatch" data-c="' + c + '" style="background:' + c + '" aria-label="colour ' + (k + 1) + '"></button>';
          }).join('') + '<button class="btn small" id="clr">Clear</button></div>' +
          '<button class="btn primary big" id="done">Done drawing</button>',
        onReady: function (app) { wireCanvas(app); },
        onDone: function (app) {
          var cv = app.querySelector('#cv');
          drawings.push({ author: players[i], prompt: prompts[i], data: cv.toDataURL('image/png') });
          drawStep(i + 1);
        }
      });
    }

    function wireCanvas(app) {
      var cv = app.querySelector('#cv');
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 600);
      var color = SWATCHES[0], drawing = false;
      function pos(e) {
        var r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height };
      }
      cv.addEventListener('pointerdown', function (e) {
        drawing = true; cv.setPointerCapture(e.pointerId);
        var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        var p = pos(e); ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.lineTo(p.x, p.y); ctx.stroke();
      });
      cv.addEventListener('pointerup', function () { drawing = false; });
      cv.addEventListener('pointercancel', function () { drawing = false; });
      app.querySelectorAll('[data-c]').forEach(function (b) {
        b.addEventListener('click', function () { color = b.getAttribute('data-c'); });
      });
      app.querySelector('#clr').addEventListener('click', function () {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 600);
      });
    }

    function showStep(idx) {
      if (idx >= drawings.length) return GN.results(players, scores, 'Scribble');
      var d = drawings[idx];
      GN.replace(function () {
        GN.mount(
          GN.topbar('Drawing ' + (idx + 1) + '/' + drawings.length) +
          '<div class="pad center">' +
            '<img class="art" src="' + d.data + '" alt="drawing">' +
            '<p class="muted">Everyone else: shout your guesses!</p>' +
            '<p class="muted small">Tap the names of anyone who got it right.</p>' +
            '<div class="picklist" id="who">' + players.filter(function (p) { return p !== d.author; }).map(function (p) {
              return '<button class="pick toggle" data-p="' + GN.esc(p) + '">' + GN.esc(p) + '</button>';
            }).join('') + '</div>' +
            '<button class="btn primary big" id="reveal">Reveal the prompt</button>' +
          '</div>',
          function (app) {
            var got = {};
            app.querySelectorAll('[data-p]').forEach(function (b) {
              b.addEventListener('click', function () {
                var p = b.getAttribute('data-p');
                if (got[p]) { delete got[p]; b.classList.remove('on'); }
                else { got[p] = true; b.classList.add('on'); }
              });
            });
            app.querySelector('#reveal').addEventListener('click', function () {
              Object.keys(got).forEach(function (p) { scores[p] += 1; });
              revealPrompt(d, idx);
            });
          });
      });
    }

    function revealPrompt(d, idx) {
      GN.replace(function () {
        GN.mount(
          GN.topbar('Reveal') +
          '<div class="pad center">' +
            '<img class="art" src="' + d.data + '" alt="drawing">' +
            '<div class="win-banner">It was: ' + GN.esc(d.prompt) + '</div>' +
            '<p class="muted">Drawn by <strong>' + GN.esc(d.author) + '</strong></p>' +
            GN.scoreboard(players, scores) +
            '<button class="btn primary big" id="n">' + (idx + 1 < drawings.length ? 'Next drawing' : 'See final scores') + '</button>' +
          '</div>',
          function (app) { app.querySelector('#n').addEventListener('click', function () { showStep(idx + 1); }); });
      });
    }

    drawStep(0);
  }

  /* ---------------- register ---------------- */
  GN.register({ id: 'punchline', name: 'Punchline', emoji: '✍️', group: 'party', min: 3, max: 10,
    blurb: 'Write the funniest answer to a prompt. The room votes. Quiplash-style.', start: startPunchline });
  GN.register({ id: 'fib', name: 'Fib Factory', emoji: '🤥', group: 'party', min: 3, max: 8,
    blurb: 'Invent a believable lie, then spot the real answer. Fibbage-style.', start: startFib });
  GN.register({ id: 'scribble', name: 'Scribble', emoji: '🎨', group: 'party', min: 3, max: 8,
    blurb: 'Secretly draw a prompt, then the room guesses what it is. Drawful-style.', start: startScribble });
})();
