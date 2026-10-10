/* Game Night — shared store.
   Persistence backed by a GitHub repo:
     - reads  : tokenless, from raw.githubusercontent.com (works for a public repo)
     - writes : a fine-grained PAT that lives ONLY on this device (localStorage),
                never in the page and never in the repo.
   Layout in the repo (under `data/`):
     rooms/<CODE>.json   -> { code, host, roster, state, scores, updatedAt }
     used.json           -> { <gameId>: [keys already seen] }
*/
(function () {
  var GN = window.GN;
  var LS = 'gn.store';
  var S = { owner: 'akshaybangalorekar', repo: 'game-night', branch: 'main', dir: 'data', pat: '' };
  try { var saved = JSON.parse(localStorage.getItem(LS) || '{}'); for (var k in saved) if (saved[k] != null) S[k] = saved[k]; } catch (e) {}

  function persistCfg() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

  var Store = { cfg: S };
  GN.store = Store;

  Store.setConfig = function (o) { for (var k in o) if (o[k] != null) S[k] = o[k]; persistCfg(); };
  Store.hasWrite = function () { return !!S.pat; };
  Store.ready = function () { return !!(S.owner && S.repo && S.branch); };

  function rawUrl(p) { return 'https://raw.githubusercontent.com/' + S.owner + '/' + S.repo + '/' + S.branch + '/' + S.dir + '/' + p + '?t=' + Date.now(); }
  function apiUrl(p) { return 'https://api.github.com/repos/' + S.owner + '/' + S.repo + '/contents/' + S.dir + '/' + p; }

  /* ---------- read (public, no token) ---------- */
  Store.read = function (p) {
    return fetch(rawUrl(p)).then(function (r) {
      if (!r.ok) return null;
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } });
    }).catch(function () { return null; });
  };

  /* ---------- write (needs the on-device PAT) ---------- */
  Store.write = function (p, obj) {
    if (!S.pat) return Promise.reject(new Error('no-token'));
    var headers = { Authorization: 'Bearer ' + S.pat, Accept: 'application/vnd.github+json' };
    return fetch(apiUrl(p), { headers: headers })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (cur) {
        var body = { message: 'gn: update ' + p, content: b64(JSON.stringify(obj)), branch: S.branch };
        if (cur && cur.sha) body.sha = cur.sha;
        return fetch(apiUrl(p), { method: 'PUT', headers: headers, body: JSON.stringify(body) });
      })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('write ' + r.status + ': ' + t.slice(0, 140)); });
        return r.json();
      });
  };

  /* ---------- rooms ---------- */
  Store.roomPath = function (code) { return 'rooms/' + code + '.json'; };
  Store.loadRoom = function (code) { return Store.read(Store.roomPath(code)); };
  Store.saveRoom = function (room) {
    room.updatedAt = Date.now();
    return Store.write(Store.roomPath(room.code), room);
  };

  /* ---------- used questions / scenarios ---------- */
  Store.loadUsed = function () { return Store.read('used.json'); };
  Store.saveUsed = function (u) { return Store.write('used.json', u); };

  /* ---------- settings screen ---------- */
  Store.settings = function () {
    GN.nav(function () {
      GN.mount(
        GN.topbar('Storage settings') +
        '<div class="pad">' +
          '<p class="muted">Rooms, scores and the “already used” list are saved to a GitHub repo so ' +
          'any phone can rejoin a room later. Reads are public; <strong>writes need a fine-grained token</strong>.</p>' +
          '<div class="field"><label>Repo owner</label><input id="s-owner" class="input" value="' + GN.esc(S.owner) + '"></div>' +
          '<div class="field"><label>Repo name</label><input id="s-repo" class="input" value="' + GN.esc(S.repo) + '"></div>' +
          '<div class="field"><label>Branch</label><input id="s-branch" class="input" value="' + GN.esc(S.branch) + '"></div>' +
          '<div class="field"><label>Fine-grained token (Contents: Read and write on this repo only)</label>' +
            '<input id="s-pat" class="input" type="password" placeholder="' + (S.pat ? '•••••••• saved on this device' : 'github_pat_…') + '" autocomplete="off"></div>' +
          '<p class="opt-hint">The token is stored only in this browser and used only to write to the repo above. ' +
          'It is never uploaded, committed, or shared. Leave it blank to keep read-only mode.</p>' +
          '<button class="btn primary big" id="s-save">Save</button>' +
          '<button class="btn" id="s-test">Test connection</button>' +
          '<p class="muted small" id="s-msg"></p>' +
        '</div>',
        function (app) {
          var msg = function (t) { app.querySelector('#s-msg').textContent = t; };
          app.querySelector('#s-save').addEventListener('click', function () {
            Store.setConfig({
              owner: app.querySelector('#s-owner').value.trim(),
              repo: app.querySelector('#s-repo').value.trim(),
              branch: app.querySelector('#s-branch').value.trim() || 'main'
            });
            var pat = app.querySelector('#s-pat').value.trim();
            if (pat) Store.setConfig({ pat: pat });
            msg('Saved. ' + (Store.hasWrite() ? 'Writes enabled on this device.' : 'Read-only (no token).'));
          });
          app.querySelector('#s-test').addEventListener('click', function () {
            msg('Testing…');
            Store.read('used.json').then(function (u) {
              msg(u ? 'Read OK — used.json found.' : 'Read OK — no used.json yet (that’s fine).');
            }).catch(function () { msg('Could not reach the repo.'); });
          });
        });
    });
  };
})();
