/* Game Night — Chess as a room game (2 players). Full legal moves: castling,
   en passant, promotion (auto-queen), check, checkmate and stalemate. */
(function () {
  var GN = window.GN;
  var GLYPH = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };
  var BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  var N = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var KD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function rc(i) { return [Math.floor(i / 8), i % 8]; }
  function idx(r, c) { return r * 8 + c; }
  function on(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function clone(b) { return b.map(function (p) { return p ? { t: p.t, c: p.c } : null; }); }
  function startBoard() {
    var b = new Array(64).fill(null);
    for (var c = 0; c < 8; c++) { b[idx(0, c)] = { t: BACK[c], c: 'b' }; b[idx(1, c)] = { t: 'p', c: 'b' }; b[idx(6, c)] = { t: 'p', c: 'w' }; b[idx(7, c)] = { t: BACK[c], c: 'w' }; }
    return b;
  }
  function nameOf(roster, id) { for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name; return '?'; }

  function attacked(b, sq, by) {
    var r = Math.floor(sq / 8), c = sq % 8;
    for (var i = 0; i < 64; i++) {
      var p = b[i]; if (!p || p.c !== by) continue;
      var pr = Math.floor(i / 8), pc = i % 8, dr = r - pr, dc = c - pc;
      if (p.t === 'p') { if (dr === (by === 'w' ? -1 : 1) && Math.abs(dc) === 1) return true; }
      else if (p.t === 'n') { if (Math.abs(dr) === 2 && Math.abs(dc) === 1 || Math.abs(dr) === 1 && Math.abs(dc) === 2) return true; }
      else if (p.t === 'k') { if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true; }
      else if (p.t === 'b' || p.t === 'q') { if (Math.abs(dr) === Math.abs(dc)) { if (clear(b, pr, pc, r, c)) return true; } }
      if (p.t === 'r' || p.t === 'q') { if (dr === 0 || dc === 0) { if (clear(b, pr, pc, r, c)) return true; } }
    }
    return false;
  }
  function clear(b, fr, fc, tr, tc) {
    var dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
    var r = fr + dr, c = fc + dc;
    while (r !== tr || c !== tc) { if (b[idx(r, c)]) return false; r += dr; c += dc; }
    return true;
  }
  function findKing(b, col) { for (var i = 0; i < 64; i++) { var p = b[i]; if (p && p.t === 'k' && p.c === col) return i; } return -1; }
  function inCheck(b, col) { var k = findKing(b, col); return k >= 0 && attacked(b, k, col === 'w' ? 'b' : 'w'); }

  function pseudo(b, i, st) {
    var p = b[i]; if (!p) return [];
    var r = Math.floor(i / 8), c = i % 8, out = [];
    function add(rr, cc) { if (on(rr, cc) && (!b[idx(rr, cc)] || b[idx(rr, cc)].c !== p.c)) out.push(idx(rr, cc)); }
    if (p.t === 'p') {
      var dir = p.c === 'w' ? -1 : 1, one = r + dir;
      if (on(one, c) && !b[idx(one, c)]) {
        out.push(idx(one, c));
        var two = r + 2 * dir;
        if ((p.c === 'w' ? r === 6 : r === 1) && !b[idx(two, c)]) out.push(idx(two, c));
      }
      [[dir, -1], [dir, 1]].forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        if (!on(rr, cc)) return;
        var q = b[idx(rr, cc)];
        if (q && q.c !== p.c) out.push(idx(rr, cc));
        else if (!q && st.ep === idx(rr, cc)) out.push(idx(rr, cc));
      });
    } else if (p.t === 'n') { N.forEach(function (d) { add(r + d[0], c + d[1]); }); }
    else if (p.t === 'k') {
      KD.forEach(function (d) { add(r + d[0], c + d[1]); });
      var rights = st.castling, home = p.c === 'w' ? 7 : 0, opp = p.c === 'w' ? 'b' : 'w';
      if (r === home && c === 4 && !inCheck(b, p.c)) {
        if (rights[p.c + 'k'] && !b[idx(home, 5)] && !b[idx(home, 6)] && !attacked(b, idx(home, 5), opp) && !attacked(b, idx(home, 6), opp)) out.push(idx(home, 6));
        if (rights[p.c + 'q'] && !b[idx(home, 3)] && !b[idx(home, 2)] && !b[idx(home, 1)] && !attacked(b, idx(home, 3), opp) && !attacked(b, idx(home, 2), opp)) out.push(idx(home, 2));
      }
    } else {
      var dirs = p.t === 'b' ? BD : p.t === 'r' ? RD : BD.concat(RD);
      dirs.forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        while (on(rr, cc)) {
          var q = b[idx(rr, cc)];
          if (!q) out.push(idx(rr, cc));
          else { if (q.c !== p.c) out.push(idx(rr, cc)); break; }
          rr += d[0]; cc += d[1];
        }
      });
    }
    return out;
  }

  function apply(st, from, to) {
    var b = clone(st.board), p = b[from], cap = b[to];
    b[to] = p; b[from] = null;
    var castling = Object.assign({}, st.castling);
    if (p.t === 'p' && to === st.ep && !cap) { b[to + (p.c === 'w' ? 8 : -8)] = null; }   // en passant capture
    if (p.t === 'k') {
      if (to - from === 2) { b[to - 1] = b[to + 1]; b[to + 1] = null; }
      if (from - to === 2) { b[to + 1] = b[to - 2]; b[to - 2] = null; }
      castling[p.c + 'k'] = false; castling[p.c + 'q'] = false;
    }
    if (p.t === 'r') { if (from % 8 === 0) castling[p.c + 'q'] = false; if (from % 8 === 7) castling[p.c + 'k'] = false; }
    if (cap && cap.t === 'r') { var oc = cap.c; if (to % 8 === 0) castling[oc + 'q'] = false; if (to % 8 === 7) castling[oc + 'k'] = false; }
    var ep = null;
    if (p.t === 'p' && Math.abs(to - from) === 16) ep = (from + to) / 2;
    if (p.t === 'p' && (to < 8 || to > 55)) b[to] = { t: 'q', c: p.c };   // promotion
    var next = { board: b, turn: p.c === 'w' ? 'b' : 'w', ep: ep, castling: castling, last: { from: from, to: to } };
    return next;
  }

  function legalFrom(st, from) {
    var p = st.board[from]; if (!p || p.c !== st.turn) return [];
    return pseudo(st.board, from, st).filter(function (to) {
      var nx = apply(st, from, to);
      return !inCheck(nx.board, p.c);
    });
  }
  function anyLegal(st) {
    for (var i = 0; i < 64; i++) { var p = st.board[i]; if (p && p.c === st.turn && legalFrom(st, i).length) return true; }
    return false;
  }

  GN.registerConvoy({
    id: 'chess', name: 'Chess', emoji: '♟️', min: 2, max: 2,
    blurb: 'The classic duel. Full rules — castling, en passant and promotion.',
    init: function (roster) {
      var ids = roster.map(function (r) { return r.id; });
      return { game: 'chess', players: ids, colors: { }, board: startBoard(), turn: 'w', ep: null,
        castling: { wk: true, wq: true, bk: true, bq: true }, sel: null, over: null, winner: null, last: null,
        _ids: ids };
    },
    act: function (s, pid, a) {
      if (s.over) return;
      var myColor = (s.players[0] === pid) ? 'w' : 'b';
      if (s.turn !== myColor) return;
      if (a.t === 'sel') {
        var moves = legalFrom(s, a.i);
        s.sel = (moves.length && s.board[a.i]) ? a.i : null;
        s.hint = s.sel != null ? moves : null;
      } else if (a.t === 'move') {
        var legal = legalFrom(s, a.from);
        if (legal.indexOf(a.to) === -1) return;
        var nx = apply(s, a.from, a.to);
        s.board = nx.board; s.turn = nx.turn; s.ep = nx.ep; s.castling = nx.castling; s.last = nx.last;
        s.sel = null; s.hint = null;
        if (!anyLegal(s)) {
          if (inCheck(s.board, s.turn)) { s.over = 'checkmate'; s.winner = (s.turn === 'w' ? 'b' : 'w'); }
          else { s.over = 'stalemate'; }
        }
      }
    },
    view: function (s, ctx) {
      if (s.over) {
        var msg = s.over === 'checkmate'
          ? '🏆 ' + GN.esc(nameOf(ctx.roster, s.players[s.winner === 'w' ? 0 : 1])) + ' wins by checkmate!'
          : '🤝 Stalemate — it’s a draw.';
        return '<div class="win-banner">' + msg + '</div>' + (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
      }
      var myColor = (s.players[0] === ctx.me) ? 'w' : 'b';
      var myTurn = s.turn === myColor;
      var rows = myColor === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
      var html = '<div class="chess-wrap"><div class="chess-board">';
      rows.forEach(function (r) {
        for (var c = 0; c < 8; c++) {
          var i = idx(r, c), p = s.board[i];
          var light = (r + c) % 2 === 0;
          var cls = 'csq ' + (light ? 'light' : 'dark');
          if (s.hint && s.hint.indexOf(i) !== -1) cls += ' hint';
          if (s.last && (i === s.last.from || i === s.last.to)) cls += ' last';
          if (s.sel === i) cls += ' sel';
          html += '<button class="' + cls + '" data-sq="' + i + '">' + (p ? '<span class="cp ' + p.c + '">' + GLYPH[p.c][p.t] + '</span>' : '') + '</button>';
        }
      });
      html += '</div></div>';
      html += '<p class="muted center">' + (myTurn ? '<strong>Your move</strong>' : GN.esc(nameOf(ctx.roster, s.players[s.turn === 'w' ? 0 : 1])) + ' is thinking…') +
        ' · you are ' + (myColor === 'w' ? 'White ♔' : 'Black ♚') + '</p>';
      return html;
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-sq]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-sq');
          var myColor = (s.players[0] === ctx.me) ? 'w' : 'b';
          if (s.turn !== myColor) return;
          if (s.sel != null && s.hint && s.hint.indexOf(i) !== -1) ctx.send({ t: 'move', from: s.sel, to: i });
          else ctx.send({ t: 'sel', i: i });
        });
      });
      var bl = app.querySelector('#backlobby');
      if (bl) bl.addEventListener('click', ctx.back);
    }
  });
})();
