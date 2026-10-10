/* Game Night — Mafia as a room game: every player on their own phone.
   No narrator needed: the app deals roles privately to each device and runs the phases.
   Registered in the room registry so it can be started from a room lobby. */
(function () {
  var GN = window.GN;

  var ROLES = {
    mafia:     { name: 'Mafia',      team: 'mafia',   emoji: '🔫', desc: 'Each night, help choose someone to eliminate. Blend in by day.' },
    godfather: { name: 'Godfather',  team: 'mafia',   emoji: '👔', desc: 'You lead the Mafia and read as innocent to the Detective.' },
    doctor:    { name: 'Doctor',     team: 'village', emoji: '⚕️', desc: 'Each night, protect one player from being killed.' },
    detective: { name: 'Detective',  team: 'village', emoji: '🔍', desc: 'Each night, investigate one player to learn if they are Mafia.' },
    villager:  { name: 'Villager',   team: 'village', emoji: '👤', desc: 'No powers. Talk, argue and vote to find the Mafia.' },
    jester:    { name: 'Jester',     team: 'neutral', emoji: '🃏', desc: 'Get yourself voted out during the day to win.' }
  };

  function teamOf(s, id) { return ROLES[s.roles[id]].team; }
  function aliveTeam(s, team) { return s.alive.filter(function (id) { return teamOf(s, id) === team; }); }
  function aliveRole(s, role) { return s.alive.filter(function (id) { return s.roles[id] === role; }); }
  function nameOf(roster, id) { for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i].name; return '?'; }
  function others(roster, s) { return s.alive; }

  function buildDeck(n) {
    var deck = [];
    var mafia = n <= 4 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
    for (var i = 0; i < mafia; i++) deck.push('mafia');
    if (n >= 5) deck.push('detective');
    if (n >= 6) deck.push('doctor');
    while (deck.length < n) deck.push('villager');
    return GN.shuffle(deck).slice(0, n);
  }

  function neededActions(s) {
    var need = [];
    if (aliveTeam(s, 'mafia').length) need.push('mafia');
    if (aliveRole(s, 'doctor').length) need.push('doctor');
    if (aliveRole(s, 'detective').length) need.push('detective');
    return need;
  }
  function actionsReady(s) {
    var need = neededActions(s);
    for (var i = 0; i < need.length; i++) if (!s.actions[need[i]]) return false;
    return true;
  }

  function winCheck(s) {
    var mafia = aliveTeam(s, 'mafia').length;
    var others = s.alive.length - mafia;
    if (mafia === 0) return 'The Village';
    if (mafia >= others) return 'The Mafia';
    return null;
  }

  function resolveNight(s) {
    var deaths = [];
    if (s.actions.mafia && s.actions.mafia !== s.actions.doctor) deaths.push(s.actions.mafia);
    s.detResult = null;
    if (s.actions.detective) {
      var t = s.actions.detective;
      s.detResult = { id: t, mafia: teamOf(s, t) === 'mafia' && s.roles[t] !== 'godfather' };
    }
    deaths.forEach(function (d) { s.alive = s.alive.filter(function (x) { return x !== d; }); s.dead.push(d); });
    s.lastDeath = deaths;
    s.actions = {};
    s.votes = {};
    var w = winCheck(s);
    if (w) { s.winner = w; return; }
    s.phase = 'day';
    s.night++;
  }

  function tallyVote(s) {
    var counts = {};
    Object.keys(s.votes).forEach(function (v) { counts[s.votes[v]] = (counts[s.votes[v]] || 0) + 1; });
    var best = null, bestN = 0, tie = false;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { bestN = counts[k]; best = k; tie = false; }
      else if (counts[k] === bestN) tie = true;
    });
    if (tie || !best) return null;
    return best;
  }

  function doEliminate(s) {
    var out = tallyVote(s);
    s.lastElim = out;
    if (out) {
      if (s.roles[out] === 'jester') { s.winner = 'The Jester'; return; }
      s.alive = s.alive.filter(function (x) { return x !== out; });
      s.dead.push(out);
    }
    var w = winCheck(s);
    if (w) { s.winner = w; return; }
    s.phase = 'night'; s.votes = {}; s.actions = {}; s.lastDeath = []; s.detResult = null;
  }

  GN.registerConvoy({
    id: 'mafia-room', name: 'Mafia (on your phones)', emoji: '🔫', min: 4, max: 16,
    blurb: 'Hidden roles dealt to each phone. The app runs the nights and the votes — no narrator.',
    init: function (roster) {
      var ids = roster.map(function (r) { return r.id; });
      var deck = buildDeck(ids.length);
      var roles = {};
      ids.forEach(function (id, i) { roles[id] = deck[i]; });
      return { game: 'mafia-room', players: ids, roles: roles, alive: ids.slice(), dead: [],
        night: 1, phase: 'night', actions: {}, votes: {}, lastDeath: [], detResult: null, winner: null };
    },
    act: function (s, pid, a) {
      if (s.winner) return;
      if (s.phase === 'night') {
        if (a.t === 'act') {
          var team = teamOf(s, pid);
          if (team === 'mafia') s.actions.mafia = a.target;
          else if (s.roles[pid] === 'doctor') s.actions.doctor = a.target;
          else if (s.roles[pid] === 'detective') s.actions.detective = a.target;
          if (actionsReady(s)) resolveNight(s);
        } else if (a.t === 'resolve') {
          if (s.actions.mafia) resolveNight(s); else { s.actions = {}; s.lastDeath = []; s.phase = 'day'; s.night++; }
        }
      } else if (s.phase === 'day') {
        if (a.t === 'tovote') { s.phase = 'vote'; s.votes = {}; }
      } else if (s.phase === 'vote') {
        if (a.t === 'vote') { s.votes[pid] = a.target; if (Object.keys(s.votes).length >= s.alive.length) doEliminate(s); }
        else if (a.t === 'forcevote') doEliminate(s);
      }
    },
    view: function (s, ctx) {
      var me = ctx.me;
      if (s.winner) return over(s, ctx);
      var alive = s.alive.indexOf(me) !== -1;
      if (!alive) return ghost(s, ctx);
      var role = s.roles[me];
      if (s.phase === 'night') return night(s, ctx, role);
      if (s.phase === 'day') return day(s, ctx);
      return votephase(s, ctx);
    },
    bind: function (app, s, ctx) {
      app.querySelectorAll('[data-target]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'act', target: b.getAttribute('data-target') }); });
      });
      app.querySelectorAll('[data-vote]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.send({ t: 'vote', target: b.getAttribute('data-vote') }); });
      });
      var r = app.querySelector('#resolve'); if (r) r.addEventListener('click', function () { ctx.send({ t: 'resolve' }); });
      var v = app.querySelector('#tovote'); if (v) v.addEventListener('click', function () { ctx.send({ t: 'tovote' }); });
      var f = app.querySelector('#forcevote'); if (f) f.addEventListener('click', function () { ctx.send({ t: 'forcevote' }); });
      var bl = app.querySelector('#backlobby'); if (bl) bl.addEventListener('click', ctx.back);
    }
  });

  function pickList(s, roster, attr, ids) {
    return '<div class="picklist">' + ids.map(function (id) {
      return '<button class="pick" data-' + attr + '="' + GN.esc(id) + '">' + GN.esc(nameOf(roster, id)) + '</button>';
    }).join('') + '</div>';
  }

  function night(s, ctx, role) {
    var team = ROLES[role].team;
    var head = '<div class="phase-badge">🌙 Night ' + s.night + '</div>' +
      '<div class="role-card team-' + team + '"><div class="role-emoji">' + ROLES[role].emoji + '</div>' +
      '<div class="role-name">' + ROLES[role].name + '</div><p class="role-desc">' + ROLES[role].desc + '</p></div>';
    var done = '<p class="muted center">Waiting for the others…</p>';
    var hostBtn = ctx.isHost ? '<button class="btn" id="resolve">Resolve the night now</button>' : '';
    if (team === 'mafia') {
      if (s.actions.mafia) return head + '<p class="muted center">Target chosen. Waiting…</p>' + hostBtn;
      return head + '<h2 class="phase-title">Choose who to eliminate</h2>' + pickList(s, ctx.roster, 'target', s.alive) + hostBtn;
    }
    if (role === 'doctor') {
      if (s.actions.doctor) return head + done + hostBtn;
      return head + '<h2 class="phase-title">Choose someone to protect</h2>' + pickList(s, ctx.roster, 'target', s.alive) + hostBtn;
    }
    if (role === 'detective') {
      if (s.actions.detective) return head + done + hostBtn;
      return head + '<h2 class="phase-title">Choose someone to investigate</h2>' + pickList(s, ctx.roster, 'target', s.alive) + hostBtn;
    }
    return head + '<p class="muted center">Close your eyes. The village sleeps…</p>' + hostBtn;
  }

  function day(s, ctx) {
    var deaths = s.lastDeath || [];
    var html = '<div class="phase-badge">☀️ Day ' + (s.night - 1) + '</div>';
    if (s.detResult && s.roles[ctx.me] === 'detective') {
      html += '<div class="win-banner">🔍 ' + GN.esc(nameOf(ctx.roster, s.detResult.id)) + ' is ' + (s.detResult.mafia ? 'MAFIA' : 'not Mafia') + '</div>';
    }
    html += '<h2 class="phase-title">' + (deaths.length ? GN.esc(deaths.map(function (d) { return nameOf(ctx.roster, d); }).join(', ')) + ' was found dead' : 'A quiet night') + '</h2>' +
      '<p class="muted center">Discuss. Who is lying?</p>' +
      '<p class="muted small center">Alive: ' + s.alive.map(function (id) { return GN.esc(nameOf(ctx.roster, id)); }).join(', ') + '</p>';
    if (ctx.isHost) html += '<button class="btn primary big" id="tovote">Go to the vote</button>';
    else html += '<p class="muted center small">Waiting for the host…</p>';
    return html;
  }

  function votephase(s, ctx) {
    if (s.votes[ctx.me]) return '<div class="phase-badge">⚖️ The vote</div><p class="muted center">Vote cast. Waiting for the others…</p>';
    return '<div class="phase-badge">⚖️ The vote</div><h2 class="phase-title">Who should be voted out?</h2>' +
      pickList(s, ctx.roster, 'vote', s.alive.filter(function (id) { return id !== ctx.me; })) +
      '<p class="muted center small">' + Object.keys(s.votes).length + ' of ' + s.alive.length + ' have voted</p>' +
      (ctx.isHost ? '<button class="btn" id="forcevote">Reveal now</button>' : '');
  }

  function ghost(s, ctx) {
    return '<div class="win-banner">You\u2019re out</div>' +
      '<p class="muted center">Shhh — watch and enjoy. Alive: ' + s.alive.map(function (id) { return GN.esc(nameOf(ctx.roster, id)); }).join(', ') + '</p>' +
      (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
  }

  function over(s, ctx) {
    return '<div class="win-banner">🏆 ' + GN.esc(s.winner) + ' wins!</div>' +
      '<div class="reveal-list">' + s.players.map(function (id) {
        return '<div class="reveal-row' + (s.dead.indexOf(id) !== -1 ? ' dead' : '') + '">' +
          '<span>' + ROLES[s.roles[id]].emoji + ' ' + GN.esc(nameOf(ctx.roster, id)) + '</span>' +
          '<span class="muted">' + ROLES[s.roles[id]].name + '</span></div>';
      }).join('') + '</div>' +
      (ctx.isHost ? '<button class="btn primary big" id="backlobby">Back to the room</button>' : '');
  }
})();
