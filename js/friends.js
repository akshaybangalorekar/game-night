/* Game Night — identity + friends.
   No accounts, no sign-in: each kid gets a short friend code (kept on their device),
   and adds friends by code. Friends persist locally between sessions. */
(function () {
  var GN = window.GN;
  var LS_ME = 'gn.me', LS_FR = 'gn.friends';
  var CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function genCode() { var s = ''; for (var i = 0; i < 6; i++) s += CH[Math.floor(Math.random() * CH.length)]; return s; }

  var Me = { name: '', code: genCode() };
  try { var s = JSON.parse(localStorage.getItem(LS_ME) || '{}'); if (s.name) Me.name = s.name; if (s.code) Me.code = s.code; } catch (e) {}

  var Friends = [];
  try { Friends = JSON.parse(localStorage.getItem(LS_FR) || '[]') || []; } catch (e) {}

  function saveMe() { try { localStorage.setItem(LS_ME, JSON.stringify(Me)); } catch (e) {} }
  function saveFr() { try { localStorage.setItem(LS_FR, JSON.stringify(Friends)); } catch (e) {} }

  GN.me = Me;
  GN.friends = Friends;
  GN.saveMe = saveMe;

  GN.newCode = function () { Me.code = genCode(); saveMe(); return Me.code; };

  GN.addFriend = function (code, name) {
    code = String(code || '').toUpperCase().trim();
    if (code.length < 4) return { ok: false, why: 'That code looks too short.' };
    if (code === Me.code) return { ok: false, why: 'That is your own code.' };
    for (var i = 0; i < Friends.length; i++) if (Friends[i].code === code) return { ok: false, why: 'Already in your friends.' };
    Friends.push({ code: code, name: (name || '').trim() || code });
    saveFr();
    return { ok: true };
  };
  GN.removeFriend = function (code) {
    for (var i = 0; i < Friends.length; i++) if (Friends[i].code === code) { Friends.splice(i, 1); break; }
    saveFr();
  };
  GN.friendByCode = function (code) { for (var i = 0; i < Friends.length; i++) if (Friends[i].code === code) return Friends[i]; return null; };
})();
