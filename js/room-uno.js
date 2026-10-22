/* Game Night — Uno as a room game. Every player on their own phone.
   Simplified standard rules: match colour or number, skips, reverses, +2, wild, wild +4. */
(function () {
  var GN = window.GN;
  var COLOR = { R: '#e11d48', G: '#16a34a', B: '#2563eb', Y: '#f59e0b', W: '#a855f7' };
  var LABEL = { skip: '🚫', rev: '⇄', d2: '+2', wild: '🌈', wd4: '+4' };

  function buildDeck() {
    var cols = ['R', 'G', 'B', 'Y'], deck = [];
    cols.forEach(function (c) {
      deck.push({ c: c, v: '0' });
      for (var n = 1; n <= 9; n++) { deck.push({ c: c, v: String(n) }); deck.push({ c: c, v: String(n) }); }
      ['skip', 'rev', 'd2'].forEach(function (v) { deck.push({ c: c, v: v }); deck.push({ c: c, v: v }); });
    });
    for (var i = 0; i < 4; i++) { deck.push({ c: 'W', v: 'wild' }); deck.push({ c: 'W', v: 'wd4' }); }
    return deck;
  }
  function top(s) { return s.discard[s.discard.length - 1]; }
  function canPlay(card, t, color) { return card.c === 'W' || card.c === color || card.v === t.v; }
  function advance(s, steps) { var n = s.order.length; s.turn = ((s.turn + s.dir * steps) % n + n) % n; }
  function nextId(s, steps) { var n = s.order.length; return s.order[((s.turn + s.dir * steps) % n + n) % n]; }
  function give(s, pid, n) {
    for (var k = 0; k < n; k++) {
      if (!s.deck.length) {
        var t = s.discard.pop();
        s.deck = GN.shuffle(s.discard.slice());
        s.discard = [t];
        if (!s.deck.length) return;
      }
      s.hands[pid].push(s.deck.shift());
    }
  }
  function nameOf(roster, id) { for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name; return '?'; }
  function cardHTML(card, i, playable) {
    var bg = COLOR[card.c];
    var face = LABEL[card.v] || card.v;
    return '<button class="uno-card' + (playable ? ' playable' : '') + '" data-card="' + i + '" style="background:' + bg + '">' + face + '</button>';
  }

  GN.registerConvoy({
    id: 'uno', name: 'Uno', emoji: '🃏', min: 2, max: 6,
    blurb: 'Match colour or number. First to empty their hand wins.',
    init: function (roster) {
      var ids = roster.map(function (r) { return r.id; });
      var deck = GN.shuffle(buildDeck());
      var hands = {};
      ids.forEach(function (id) { hands[id] = deck.splice(0, 7); });
      var first = null, guard = 0;
      while (guard++ < 300) { var c = deck.shift(); if (c.c !== 'W') { first = c; break; } deck.push(c); }
      if (!first) first = { c: 'R', v: '0' };
      return { game: 'uno', deck: deck, discard: [first], hands: hands, order: ids,
        turn: 0, dir: 1, color: first.c, phase: 'play', winner: null, last: null };
    },
    act: function (s, pid, a, roster) {
      if (s.phase !== 'play') return;
      if (s.order[s.turn] !== pid) return;
      if (a.t === 'play') {
        var card = s.hands[pid][a.i];
        if (!card) return;
        if (!canPlay(card, top(s), s.color)) return;
        s.hands[pid].splice(a.i, 1);
        s.discard.push(card);
        s.last = { by: pid, card: card };
        var skipNext = 0;
        if (card.c === 'W') s.color = a.color || 'R'; else s.color = card.c;
        if (card.v === 'skip') skipNext = 1;
        else if (card.v === 'rev') { s.dir = -s.dir; if (s.order.length === 2) skipNext = 1; }
        else if (card.v === 'd2') { give(s, nextId(s, 1), 2); skipNext = 1; }
        else if (card.v === 'wd4') { s.color = a.color || 'R'; give(s, nextId(s, 1), 4); skipNext = 1; }
        if (s.hands[pid].length === 0) { s.winner = pid; s.phase = 'over'; return; }
        advance(s, skipNext ? 2 : 1);
      } else if (a.t === 'draw') {
        give(s, pid, 1);
        advance(s, 1);
      }
    },
    view: function (s, ctx) {
      if (s.winner) {
        return '<div class="win-banner">🏆 ' + GN.esc(nameOf(ctx.roster, s.winner)) + ' wins!</div>' +
          '<p class="muted center">That’s Uno. Want another round?</p>' +
          (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
      }
      var t = top(s);
      var myTurn = s.order[s.turn] === ctx.me;
      var hand = s.hands[ctx.me] || [];
      var html = '<div class="uno-table">' +
        '<div class="uno-pile"><div class="uno-card big" style="background:' + COLOR[t.c] + '">' + (LABEL[t.v] || t.v) + '</div>' +
        '<div class="uno-color" style="background:' + COLOR[s.color] + '"></div></div>' +
        '<div class="uno-info"><div>' + (myTurn ? '<strong>Your turn</strong>' : GN.esc(nameOf(ctx.roster, s.order[s.turn])) + '’s turn') + '</div>' +
        '<div class="muted small">' + s.deck.length + ' in the pile</div></div></div>';
      if (s.last) html += '<p class="muted center small">' + GN.esc(nameOf(ctx.roster, s.last.by)) + ' played ' + (LABEL[s.last.card.v] || s.last.card.v) + '</p>';
      html += '<h3>Your hand (' + hand.length + ')</h3><div class="uno-hand">' +
        hand.map(function (c, i) { return cardHTML(c, i, myTurn && canPlay(c, t, s.color)); }).join('') + '</div>';
      if (myTurn) html += '<button class="btn primary big" id="drawcard">Draw a card</button>';
      else html += '<p class="muted center small">Waiting…</p>';
      return html;
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-card]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-card');
          var card = (s.hands[ctx.me] || [])[i];
          if (!card) return;
          if (card.c === 'W') {
            colorPicker(app, function (col) { ctx.send({ t: 'play', i: i, color: col }); });
          } else {
            ctx.send({ t: 'play', i: i });
          }
        });
      });
      var d = app.querySelector('#drawcard');
      if (d) d.addEventListener('click', function () { ctx.send({ t: 'draw' }); });
      var bl = app.querySelector('#backlobby');
      if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  function colorPicker(app, cb) {
    var d = document.createElement('div');
    d.className = 'color-pick';
    d.innerHTML = '<p>Choose a colour</p><div class="color-row">' + ['R', 'G', 'B', 'Y'].map(function (c) {
      return '<button class="swatch" data-col="' + c + '" style="background:' + COLOR[c] + '"></button>';
    }).join('') + '</div>';
    app.appendChild(d);
    d.querySelectorAll('[data-col]').forEach(function (b) {
      b.addEventListener('click', function () { d.remove(); cb(b.getAttribute('data-col')); });
    });
  }
})();
