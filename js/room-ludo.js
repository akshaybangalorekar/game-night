/* Game Night — Ludo as a room game (2–4 players, 4 tokens each).
   Shared ring of 52 cells; each player starts 13 apart. Roll a 6 to leave the yard.
   Land on an opponent on a non-safe cell to send them home. Exact roll to finish. */
(function () {
  var GN = window.GN;
  var COLORS = ['#e11d48', '#16a34a', '#2563eb', '#f59e0b'];
  var FINISH = 57;                 // -1 yard, 0..50 ring, 51..56 home column, 57 finished
  function startOf(s, pid) { return s.players.indexOf(pid) * 13; }
  function ringOf(s, pid, pos) { return (startOf(s, pid) + pos) % 52; }
  function isSafe(r) { return r % 13 === 0 || r % 13 === 8; }
  function nameOf(roster, id) { for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name; return '?'; }
  function legal(s, pid, d) {
    var out = [];
    s.tokens[pid].forEach(function (pos, i) {
      if (pos === -1) { if (d === 6) out.push(i); }
      else if (pos + d <= FINISH) out.push(i);
    });
    return out;
  }
  function won(s, pid) { return s.tokens[pid].every(function (p) { return p === FINISH; }); }

  GN.registerConvoy({
    id: 'ludo', name: 'Ludo', emoji: '🎲', min: 2, max: 4,
    blurb: 'Roll the dice, race your four tokens home, and send your friends back.',
    init: function (roster) {
      var ids = roster.map(function (r) { return r.id; });
      var tokens = {};
      ids.forEach(function (id) { tokens[id] = [-1, -1, -1, -1]; });
      return { game: 'ludo', players: ids, tokens: tokens, turn: 0, dice: null, phase: 'roll', winner: null, note: '' };
    },
    act: function (s, pid, a) {
      if (s.phase === 'over') return;
      if (s.players[s.turn] !== pid) return;
      if (a.t === 'roll' && s.phase === 'roll') {
        var d = 1 + Math.floor(Math.random() * 6);
        s.dice = d;
        var moves = legal(s, pid, d);
        if (!moves.length) { s.note = 'rolled ' + d + ' — no move'; s.dice = null; nextTurn(s); return; }
        s.phase = 'move';
        s.note = 'rolled ' + d;
      } else if (a.t === 'move' && s.phase === 'move') {
        var i = a.tok;
        if (legal(s, pid, s.dice).indexOf(i) === -1) return;
        var captured = applyMove(s, pid, i, s.dice);
        if (won(s, pid)) { s.winner = pid; s.phase = 'over'; return; }
        var extra = (s.dice === 6) || captured;
        s.note = captured ? 'sent someone home!' : (s.dice === 6 ? 'rolled a 6 — go again' : '');
        s.dice = null; s.phase = 'roll';
        if (!extra) nextTurn(s);
      }
    },
    view: function (s, ctx) {
      if (s.phase === 'over') {
        return '<div class="win-banner">🏆 ' + GN.esc(nameOf(ctx.roster, s.winner)) + ' wins!</div>' +
          '<p class="muted center">All four tokens home. Well played!</p>' +
          (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
      }
      var cur = s.players[s.turn];
      var myTurn = cur === ctx.me;
      var moves = (myTurn && s.phase === 'move') ? legal(s, ctx.me, s.dice) : [];
      var html = '<div class="ludo-wrap">' + boardHTML(s, ctx, moves) + '</div>';
      html += '<div class="ludo-players">' + s.players.map(function (id, idx) {
        var tk = s.tokens[id];
        var yard = tk.filter(function (p) { return p === -1; }).length;
        var home = tk.filter(function (p) { return p === FINISH; }).length;
        return '<div class="ludo-p' + (id === cur ? ' active' : '') + '"><span class="dot" style="background:' + COLORS[idx] + '"></span>' +
          GN.esc(nameOf(ctx.roster, id)) + ' <span class="muted small">yard ' + yard + ' · home ' + home + '</span></div>';
      }).join('') + '</div>';
      if (s.note) html += '<p class="muted center small">' + GN.esc(nameOf(ctx.roster, cur)) + ' ' + GN.esc(s.note) + '</p>';
      if (myTurn) {
        if (s.phase === 'roll') html += '<button class="btn primary big" id="roll">🎲 Roll</button>';
        else html += '<p class="muted center">Tap a glowing token to move ' + s.dice + '.</p>';
      } else {
        html += '<p class="muted center small">' + GN.esc(nameOf(ctx.roster, cur)) + '\u2019s turn…</p>';
      }
      return html;
    },
    bind: function (app, s, ctx) {
      var r = app.querySelector('#roll');
      if (r) r.addEventListener('click', function () { ctx.send({ t: 'roll' }); });
      app.querySelectorAll('[data-tok]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'move', tok: +b.getAttribute('data-tok') }); });
      });
      var bl = app.querySelector('#backlobby');
      if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  function nextTurn(s) { s.turn = (s.turn + 1) % s.players.length; s.dice = null; s.phase = 'roll'; s.note = ''; }

  function applyMove(s, pid, i, d) {
    var pos = s.tokens[pid][i];
    var np = pos === -1 ? 0 : pos + d;
    s.tokens[pid][i] = np;
    var captured = false;
    if (np <= 50) {
      var ring = ringOf(s, pid, np);
      if (!isSafe(ring)) {
        s.players.forEach(function (op) {
          if (op === pid) return;
          s.tokens[op].forEach(function (p, j) {
            if (p >= 0 && p <= 50 && ringOf(s, op, p) === ring) { s.tokens[op][j] = -1; captured = true; }
          });
        });
      }
    }
    return captured;
  }

  function boardHTML(s, ctx, moves) {
    var cells = '';
    for (var r = 0; r < 52; r++) {
      var ang = (r / 52) * Math.PI * 2 - Math.PI / 2;
      var x = 50 + 44 * Math.cos(ang), y = 50 + 44 * Math.sin(ang);
      var cls = 'lcell' + (isSafe(r) ? ' safe' : '');
      if (r % 13 === 0 && (r / 13) < s.players.length) cls += ' p' + (r / 13);
      cells += '<div class="' + cls + '" style="left:' + x + '%;top:' + y + '%"></div>';
    }
    // tokens on the ring / home column
    var dots = '';
    s.players.forEach(function (id, idx) {
      s.tokens[id].forEach(function (pos, t) {
        var x, y, cls = 'ldot';
        if (pos >= 0 && pos <= 50) {
          var r = ringOf(s, id, pos);
          var ang = (r / 52) * Math.PI * 2 - Math.PI / 2;
          x = 50 + 44 * Math.cos(ang) + (idx - 1.5) * 1.6;
          y = 50 + 44 * Math.sin(ang) + (t - 1.5) * 1.6;
        } else if (pos > 50 && pos < FINISH) {
          x = 50 + (idx - 1.5) * 4; y = 50 + (pos - 53) * 3;
        } else { return; }
        var canMove = (id === ctx.me && moves.indexOf(t) !== -1);
        if (canMove) cls += ' can';
        dots += '<div class="' + cls + '" style="background:' + COLORS[idx] + ';left:' + x + '%;top:' + y + '%"' +
          (canMove ? ' data-tok="' + t + '"' : '') + '></div>';
      });
    });
    return '<div class="ludo-board">' + cells + dots +
      '<div class="ludo-center">🏁</div></div>';
  }
})();
