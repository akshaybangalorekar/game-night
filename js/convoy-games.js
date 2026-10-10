/* Game Night — The Convoy games. Tap-light, voice-first, host-authoritative.
   Each game: { init(roster), act(state, pid, action, roster), view(state, ctx), bind(app, state, ctx) }
   ctx = { me, isHost, roster, myName, send(action), back() } */
(function () {
  var GN = window.GN;

  function nameOf(roster, id) {
    for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name;
    return 'Car';
  }
  function ids(roster) { return roster.map(function (r) { return r.id; }); }
  function countVotes(v) { return Object.keys(v).length; }
  function backBtn(ctx) {
    return ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the convoy</button>' : '';
  }

  /* =========================================================
     Would You Rather  — one prompt, tap A or B, then argue
     ========================================================= */
  var WYR = [
    { a: 'Fly like a bird', b: 'Swim like a fish' },
    { a: 'A pet dragon', b: 'A pet robot' },
    { a: 'Only eat ice cream', b: 'Only eat pizza' },
    { a: 'Be invisible', b: 'Be able to fly' },
    { a: 'Live in a treehouse', b: 'Live in a castle' },
    { a: 'Super speed', b: 'Super strength' },
    { a: 'Talk to animals', b: 'Speak every language' },
    { a: 'A magic pencil', b: 'A magic eraser' },
    { a: 'Ride a dinosaur to school', b: 'Ride a rocket to school' },
    { a: 'Always 5 minutes early', b: 'Always 5 minutes late' },
    { a: 'Snow every day', b: 'Sun every day' },
    { a: 'Be the funniest', b: 'Be the smartest' },
    { a: 'A talking backpack', b: 'A flying bicycle' },
    { a: 'Endless chocolate', b: 'Endless mangoes' },
    { a: 'Live on a boat', b: 'Live in a plane' },
    { a: 'A pet elephant', b: 'A pet penguin' }
  ];

  GN.registerConvoy({
    id: 'wyr', name: 'Would You Rather', emoji: '🤔', min: 2, max: 12,
    blurb: 'One question, two choices. Tap, then argue about it out loud.',
    init: function () {
      return { game: 'wyr', i: GN.convoy.pickUnused('wyr', WYR.length), votes: {}, phase: 'vote' };
    },
    act: function (s, pid, a, roster) {
      if (a.t === 'vote' && s.phase === 'vote') {
        if (s.votes[pid]) return;
        s.votes[pid] = a.pick;
        if (countVotes(s.votes) >= roster.length) s.phase = 'result';
      } else if (a.t === 'force' && s.phase === 'vote') {
        s.phase = 'result';
      } else if (a.t === 'next') {
        s.i = GN.convoy.pickUnused('wyr', WYR.length); s.votes = {}; s.phase = 'vote';
      }
    },
    view: function (s, ctx) {
      var p = WYR[s.i];
      var head = '<div class="wyr-head">Would you rather…</div>' +
        '<div class="wyr-prompt">' + GN.esc(p.a) + ' <span class="wyr-or">or</span> ' + GN.esc(p.b) + '</div>';
      if (s.phase === 'vote') {
        var mine = s.votes[ctx.me];
        return head +
          '<div class="wyr-options">' +
            '<button class="wyr-btn' + (mine === 'a' ? ' on' : '') + '" data-pick="a">' + GN.esc(p.a) + '</button>' +
            '<button class="wyr-btn' + (mine === 'b' ? ' on' : '') + '" data-pick="b">' + GN.esc(p.b) + '</button>' +
          '</div>' +
          '<p class="muted center">' + countVotes(s.votes) + ' of ' + ctx.roster.length + ' have picked' + (mine ? ' · you chose ' + (mine === 'a' ? 'the first' : 'the second') : '') + '</p>' +
          (ctx.isHost ? '<button class="btn" id="skipvote">Reveal now</button>' : '');
      }
      var a = 0, b = 0;
      Object.keys(s.votes).forEach(function (k) { if (s.votes[k] === 'a') a++; else b++; });
      return head +
        '<div class="wyr-tally">' +
          '<div class="wyr-bar"><span style="width:' + (a + b ? (a / (a + b) * 100) : 0) + '%">' + a + '</span></div>' +
          '<div class="wyr-counts"><span>' + GN.esc(p.a) + ' — ' + a + '</span><span>' + b + ' — ' + GN.esc(p.b) + '</span></div>' +
        '</div>' +
        '<p class="muted center">Talk it out! Why did you choose that?</p>' +
        (ctx.isHost ? '<button class="btn primary big" id="nextwyr">Next question</button>' : '<p class="muted center small">Waiting for the host…</p>');
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-pick]').forEach(function (btn) {
        btn.addEventListener('click', function () { ctx.send({ t: 'vote', pick: btn.getAttribute('data-pick') }); });
      });
      var n = app.querySelector('#nextwyr'); if (n) n.addEventListener('click', function () { ctx.send({ t: 'next' }); });
      var r = app.querySelector('#skipvote'); if (r) r.addEventListener('click', function () { ctx.send({ t: 'force' }); });
      var bl = app.querySelector('#backlobby'); if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  /* =========================================================
     Two Truths and a Lie  — speak aloud, others tap who's lying
     ========================================================= */
  GN.registerConvoy({
    id: 'ttl', name: 'Two Truths and a Lie', emoji: '🎭', min: 3, max: 10,
    blurb: 'Say two true things and one fib out loud. Everyone taps the lie.',
    init: function (roster) {
      var sc = {}; ids(roster).forEach(function (id) { sc[id] = 0; });
      return { game: 'ttl', order: ids(roster), turn: 0, votes: {}, phase: 'speak', scores: sc, lie: null };
    },
    act: function (s, pid, a, roster) {
      if (s.phase === 'speak' && a.t === 'vote') {
        if (pid === s.order[s.turn]) return;         // speaker doesn't vote
        if (s.votes[pid]) return;
        s.votes[pid] = a.pick;
        if (countVotes(s.votes) >= roster.length - 1) s.phase = 'reveal';
      } else if (a.t === 'force' && s.phase === 'speak') {
        s.phase = 'reveal';
      } else if (s.phase === 'reveal' && a.t === 'lie') {
        if (pid !== s.order[s.turn]) return;
        s.lie = a.n;
        var correct = 0;
        Object.keys(s.votes).forEach(function (v) { if (s.votes[v] === a.n) { s.scores[v] += 1; correct++; } });
        if (correct <= Math.floor((roster.length - 1) / 2)) s.scores[pid] += 1;   // fooled the room
        s.phase = 'scored';
      } else if (a.t === 'next' && (s.phase === 'scored')) {
        s.turn += 1; s.votes = {}; s.lie = null; s.phase = 'speak';
        if (s.turn >= s.order.length) s.over = true;
      }
    },
    view: function (s, ctx) {
      if (s.over) {
        return '<div class="win-banner">🎉 That\u2019s everyone!</div>' + scoreboard(s, ctx) + backBtn(ctx);
      }
      var speaker = s.order[s.turn];
      var isSpeaker = speaker === ctx.me;
      var head = '<div class="phase-badge">🎭 ' + GN.esc(nameOf(ctx.roster, speaker)) + '\u2019s turn</div>';
      if (s.phase === 'speak') {
        if (isSpeaker) {
          return head +
            '<div class="prompt-box">Say <strong>two true things</strong> and <strong>one lie</strong> about yourself — out loud, so everyone hears.</div>' +
            '<p class="muted center">Then wait for everyone to tap their guess.</p>' +
            '<p class="muted center small">' + countVotes(s.votes) + ' of ' + (ctx.roster.length - 1) + ' have guessed</p>' +
            (ctx.isHost ? '<button class="btn" id="skipttl">Reveal now</button>' : '');
        }
        return head +
          '<div class="prompt-box">Listen to <strong>' + GN.esc(nameOf(ctx.roster, speaker)) + '</strong>.<br>Which one is the lie?</div>' +
          '<div class="ttl-picks">' +
            '<button class="ttl-btn" data-n="1">1<small>first</small></button>' +
            '<button class="ttl-btn" data-n="2">2<small>second</small></button>' +
            '<button class="ttl-btn" data-n="3">3<small>third</small></button>' +
          '</div>' +
          '<p class="muted center">' + countVotes(s.votes) + ' of ' + (ctx.roster.length - 1) + ' have guessed' +
            (s.votes[ctx.me] ? ' · you picked ' + s.votes[ctx.me] : '') + '</p>';
      }
      if (s.phase === 'reveal') {
        if (isSpeaker) {
          return head +
            '<div class="prompt-box">Which one did you make up?</div>' +
            '<div class="ttl-picks">' +
              '<button class="ttl-btn" data-lie="1">1<small>was the lie</small></button>' +
              '<button class="ttl-btn" data-lie="2">2<small>was the lie</small></button>' +
              '<button class="ttl-btn" data-lie="3">3<small>was the lie</small></button>' +
            '</div>';
        }
        return head + '<div class="prompt-box">Everyone has guessed! Waiting for <strong>' + GN.esc(nameOf(ctx.roster, speaker)) + '</strong> to reveal…</div>';
      }
      // scored
      var correct = 0;
      Object.keys(s.votes).forEach(function (v) { if (s.votes[v] === s.lie) correct++; });
      return head +
        '<div class="win-banner">The lie was #' + s.lie + '</div>' +
        '<p class="muted center">' + correct + ' of ' + (ctx.roster.length - 1) + ' guessed it right.</p>' +
        scoreboard(s, ctx) +
        (ctx.isHost ? '<button class="btn primary big" id="nextttl">Next player</button>' : '<p class="muted center small">Waiting for the host…</p>');
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-n]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'vote', pick: +b.getAttribute('data-n') }); });
      });
      app.querySelectorAll('[data-lie]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'lie', n: +b.getAttribute('data-lie') }); });
      });
      var n = app.querySelector('#nextttl'); if (n) n.addEventListener('click', function () { ctx.send({ t: 'next' }); });
      var sk = app.querySelector('#skipttl'); if (sk) sk.addEventListener('click', function () { ctx.send({ t: 'force' }); });
      var bl = app.querySelector('#backlobby'); if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  function scoreboard(s, ctx) {
    var rows = ctx.roster.map(function (r) { return { n: r.name, v: s.scores[r.id] || 0 }; })
      .sort(function (a, b) { return b.v - a.v; });
    return '<div class="board">' + rows.map(function (r, i) {
      return '<div class="board-row' + (i === 0 && r.v > 0 ? ' lead' : '') + '"><span class="rank">' + (i + 1) + '</span><span class="who">' + GN.esc(r.n) + '</span><span class="pts">' + r.v + '</span></div>';
    }).join('') + '</div>';
  }

  /* =========================================================
     Convoy Bingo  — spot things on the road, first line wins
     ========================================================= */
  var BINGO = ['a cow', 'a truck', 'a motorbike', 'a temple', 'a bridge', 'a lake', 'a tractor',
    'a bus', 'a yellow car', 'a speed sign', 'a toll booth', 'a windmill', 'a fort', 'a bird',
    'a bicycle', 'a tunnel', 'a red car', 'a petrol pump', 'a tea stall', 'a dog', 'a lorry',
    'a police car', 'a river', 'a palm tree'];

  function shuffle(a) { return GN.shuffle(a); }

  GN.registerConvoy({
    id: 'bingo', name: 'Convoy Bingo', emoji: '🔎', min: 2, max: 12,
    blurb: 'Spot things out of the window and mark your card. First full line wins!',
    init: function (roster) {
      var cards = {}, marks = {};
      ids(roster).forEach(function (id) {
        cards[id] = shuffle(BINGO).slice(0, 16);
        marks[id] = {};
      });
      return { game: 'bingo', cards: cards, marks: marks, over: false, winner: null };
    },
    act: function (s, pid, a) {
      if (s.over) return;
      if (a.t === 'mark') {
        var m = s.marks[pid] || (s.marks[pid] = {});
        if (m[a.idx]) delete m[a.idx]; else m[a.idx] = true;
        if (hasLine(m)) { s.over = true; s.winner = pid; }
      }
    },
    view: function (s, ctx) {
      var card = s.cards[ctx.me] || [];
      var m = s.marks[ctx.me] || {};
      var cells = card.map(function (item, i) {
        return '<button class="bingo-cell' + (m[i] ? ' on' : '') + '" data-i="' + i + '">' + GN.esc(item) + '</button>';
      }).join('');
      if (s.over) {
        return '<div class="win-banner">🏆 ' + GN.esc(nameOf(ctx.roster, s.winner)) + ' got BINGO!</div>' +
          '<p class="muted center">Great spotting! Everyone can keep playing for fun.</p>' + backBtn(ctx);
      }
      return '<p class="muted center">Tap a square when you spot it out of the window. Get a full row, column or diagonal to win.</p>' +
        '<div class="bingo-grid">' + cells + '</div>';
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'mark', idx: +b.getAttribute('data-i') }); });
      });
      var bl = app.querySelector('#backlobby'); if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  function hasLine(m) {
    var L = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
      [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
      [0, 5, 10, 15], [3, 6, 9, 12]];
    return L.some(function (line) { return line.every(function (i) { return m[i]; }); });
  }
})();
