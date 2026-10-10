/* Game Night — bootstrap + QR role-reveal handler. */
(function () {
  var GN = window.GN;
  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    if (handleReveal()) return;
    if (/[?&]room=/.test(location.search)) { GN.convoy.hub(); return; }   // invite link
    GN.goHome();
  }

  function handleReveal() {
    var m = location.hash.match(/^#\/reveal\/(.+)$/);
    if (!m) return false;
    var payload;
    try { payload = GN.b64d(decodeURIComponent(m[1])); }
    catch (e) { return false; }
    if (payload && payload.t === 'mafia') { showMafiaReveal(payload); return true; }
    return false;
  }

  var ROLE_INFO = {
    villager:  ['👤', 'Villager',      'village', 'No powers. Use talk, logic and votes to find the Mafia.'],
    mafia:     ['🔫', 'Mafia',         'mafia',   'Each night, choose someone to eliminate. Survive the daytime vote.'],
    godfather: ['👔', 'Godfather',     'mafia',   'You lead the Mafia and appear innocent to the Detective.'],
    doctor:    ['⚕️', 'Doctor',        'village', 'Each night, protect one player from being killed.'],
    detective: ['🔍', 'Detective',     'village', 'Each night, investigate one player to learn if they are Mafia.'],
    jester:    ['🃏', 'Jester',        'neutral', 'Get yourself voted out during the day to win.'],
    serial:    ['🔪', 'Serial Killer', 'neutral', 'Kill each night and try to be the last one standing.']
  };

  function showMafiaReveal(p) {
    var info = ROLE_INFO[p.r] || ROLE_INFO.villager;
    var mates = (p.mates || []).filter(function (n) { return n !== p.n; });
    document.getElementById('app').innerHTML =
      '<div class="reveal-page">' +
        '<div class="reveal-top">Game Night · your secret role</div>' +
        '<div class="role-card team-' + info[2] + '">' +
          '<div class="role-emoji">' + info[0] + '</div>' +
          '<div class="role-name">' + info[1] + '</div>' +
          '<div class="role-you">' + GN.esc(p.n) + '</div>' +
          '<p class="role-desc">' + info[3] + '</p>' +
          (mates.length ? '<p class="muted">Your Mafia: <strong>' + mates.map(GN.esc).join(', ') + '</strong></p>' : '') +
        '</div>' +
        '<button class="btn primary big" id="hide">Hide role</button>' +
        '<p class="opt-hint">Nothing is stored on a server — this role lives only in the link.</p>' +
      '</div>';
    document.getElementById('hide').addEventListener('click', function () {
      location.hash = '';
      GN.goHome();
    });
  }

  window.addEventListener('hashchange', function () { handleReveal(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
