/* Game Night — Air Hockey as a room game (2 players, real-time).
   The host runs the puck; both send paddle positions over the room's fast channel
   (~30/s, no re-render). Built for same-Wi-Fi play, where latency is a few ms. */
(function () {
  var GN = window.GN;
  var W = 320, H = 520, TARGET = 7;
  var loop = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function nameOf(roster, id) { for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name; return '?'; }

  /* pure physics: returns the index of the player who scored, or null */
  function step(puck, pad0, pad1, dt) {
    puck.x += puck.vx * dt; puck.y += puck.vy * dt;
    if (puck.x < puck.r) { puck.x = puck.r; puck.vx = Math.abs(puck.vx); }
    if (puck.x > W - puck.r) { puck.x = W - puck.r; puck.vx = -Math.abs(puck.vx); }
    var inGoal = Math.abs(puck.x - W / 2) < W * 0.2;
    if (puck.y < puck.r) {
      if (inGoal) return 0;                       // into the top goal -> player 0 scores
      puck.y = puck.r; puck.vy = Math.abs(puck.vy);
    }
    if (puck.y > H - puck.r) {
      if (inGoal) return 1;                       // into the bottom goal -> player 1 scores
      puck.y = H - puck.r; puck.vy = -Math.abs(puck.vy);
    }
    [pad0, pad1].forEach(function (pad) {
      var dx = puck.x - pad.x, dy = puck.y - pad.y;
      var dist = Math.sqrt(dx * dx + dy * dy), min = puck.r + pad.r;
      if (dist < min && dist > 0.001) {
        var nx = dx / dist, ny = dy / dist;
        puck.x = pad.x + nx * min; puck.y = pad.y + ny * min;
        var sp = Math.max(Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy), 220);
        puck.vx = nx * sp * 1.04; puck.vy = ny * sp * 1.04;
      }
    });
    puck.vx *= 0.999; puck.vy *= 0.999;
    return null;
  }
  GN.airhockey = { step: step, W: W, H: H, TARGET: TARGET };

  function stopLoop() { if (loop) { cancelAnimationFrame(loop); loop = null; } if (GN.convoy.Net) GN.convoy.Net.onFast = null; }

  GN.registerConvoy({
    id: 'airhockey', name: 'Air Hockey', emoji: '🏒', min: 2, max: 2,
    blurb: 'Real-time paddles — best when you are both on the same Wi-Fi.',
    init: function (roster) {
      var ids = roster.map(function (r) { return r.id; });
      var score = {}; ids.forEach(function (id) { score[id] = 0; });
      return { game: 'airhockey', players: ids, score: score, serve: Math.random() < 0.5 ? 0 : 1, over: false, winner: null };
    },
    act: function (s, pid, a) {
      if (s.over || a.t !== 'goal') return;
      var scorer = s.players[a.scorer];
      if (!scorer) return;
      s.score[scorer] = (s.score[scorer] || 0) + 1;
      if (s.score[scorer] >= TARGET) { s.over = true; s.winner = scorer; return; }
      s.serve = a.scorer === 0 ? 1 : 0;          // serve toward whoever conceded
    },
    view: function (s, ctx) {
      if (s.over) {
        return '<div class="win-banner">🏆 ' + GN.esc(nameOf(ctx.roster, s.winner)) + ' wins!</div>' +
          (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
      }
      var myIdx = s.players.indexOf(ctx.me);
      var opp = s.players[1 - myIdx];
      return '<div class="ah-scores">' +
          '<span>' + GN.esc(nameOf(ctx.roster, ctx.me)) + ' <strong>' + (s.score[ctx.me] || 0) + '</strong></span>' +
          '<span class="muted small">first to ' + TARGET + '</span>' +
          '<span><strong>' + (s.score[opp] || 0) + '</strong> ' + GN.esc(nameOf(ctx.roster, opp)) + '</span>' +
        '</div>' +
        '<div class="ah-wrap"><canvas id="ah" width="' + W + '" height="' + H + '"></canvas></div>' +
        '<p class="muted center small">Drag on your half to move your paddle.</p>';
    },
    bind: function (app, s, ctx) { startLoop(app, s, ctx); }
  });

  function startLoop(app, s, ctx) {
    stopLoop();
    var cv = app.querySelector('#ah'); if (!cv) return;
    var g = cv.getContext('2d');
    var isHost = ctx.isHost;
    var myIdx = s.players.indexOf(ctx.me);
    var flip = myIdx === 1;
    var rp = 20, rpk = 9;

    var myPad = { x: W / 2, y: myIdx === 0 ? H - 45 : 45, r: rp };
    var opPad = { x: W / 2, y: myIdx === 0 ? 45 : H - 45, r: rp };
    var puck = { x: W / 2, y: H / 2, vx: 0, vy: (s.serve === 0 ? 1 : -1) * 150, r: rpk };

    GN.convoy.Net.onFast = function (from, d) {
      if (!d) return;
      if (d.p) { opPad.x = d.p.x; opPad.y = d.p.y; }
      if (!isHost && d.puck) { puck.x = d.puck.x; puck.y = d.puck.y; }
    };

    function toShared(e) {
      var r = cv.getBoundingClientRect();
      var sx = (e.clientX - r.left) * W / r.width;
      var sy = (e.clientY - r.top) * H / r.height;
      var y = flip ? H - sy : sy;
      var x = clamp(sx, rp + 4, W - rp - 4);
      y = myIdx === 0 ? clamp(y, H / 2 + rp, H - rp - 4) : clamp(y, rp + 4, H / 2 - rp);
      myPad.x = x; myPad.y = y;
    }
    cv.addEventListener('pointermove', toShared);
    cv.addEventListener('pointerdown', toShared);

    var last = performance.now(), acc = 0;
    function frame(now) {
      if (!document.getElementById('ah')) { stopLoop(); return; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (isHost) {
        var scored = step(puck, myPad, opPad, dt);
        if (scored != null) { stopLoop(); ctx.send({ t: 'goal', scorer: scored }); return; }
      }
      acc += dt;
      if (acc >= 0.033) {
        acc = 0;
        if (isHost) GN.convoy.fastSend({ p: { x: myPad.x, y: myPad.y }, puck: { x: puck.x, y: puck.y } });
        else GN.convoy.fastSend({ p: { x: myPad.x, y: myPad.y } });
      }
      draw(g, myPad, opPad, puck, flip);
      loop = requestAnimationFrame(frame);
    }
    loop = requestAnimationFrame(frame);
  }

  function draw(g, myPad, opPad, puck, flip) {
    function f(y) { return flip ? H - y : y; }
    g.fillStyle = '#0d1730'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, f(H / 2)); g.lineTo(W, f(H / 2)); g.stroke();
    g.beginPath(); g.arc(W / 2, f(H / 2), 44, 0, Math.PI * 2); g.stroke();
    var gh = W * 0.4, gx = (W - gh) / 2;
    g.fillStyle = '#38bdf8';
    var t = f(0), b = f(H);
    g.fillRect(gx, t === 0 ? 0 : H - 10, gh, 10);
    g.fillRect(gx, b === 0 ? 0 : H - 10, gh, 10);
    g.fillStyle = '#7c5cff';
    g.beginPath(); g.arc(myPad.x, f(myPad.y), myPad.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff5c8a';
    g.beginPath(); g.arc(opPad.x, f(opPad.y), opPad.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(puck.x, f(puck.y), puck.r, 0, Math.PI * 2); g.fill();
  }
})();
