/* Game Night — sharing: a QR to share the app, and a camera scanner to join a room
   without typing a code. */
(function () {
  var GN = window.GN;

  function appUrl() { return location.origin + location.pathname; }
  function drawQR(box, text, cell) {
    box.innerHTML = '';
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); box.innerHTML = q.createImgTag(cell || 6, 8); }
    catch (e) { box.textContent = 'QR unavailable'; }
  }
  GN.drawQR = drawQR;

  /* ---------- share the app ---------- */
  GN.shareApp = function () {
    GN.nav(function () {
      var url = appUrl();
      GN.mount(GN.topbar('Share the app') +
        '<div class="pad center">' +
          '<p class="muted">Point a phone camera at this code to open Game Night.</p>' +
          '<div class="qrbox big" id="qrbox"></div>' +
          '<p class="qr-url">' + GN.esc(url) + '</p>' +
          '<button class="btn primary big" id="copyurl">Copy link</button>' +
        '</div>', function (app) {
        drawQR(app.querySelector('#qrbox'), url, 7);
        app.querySelector('#copyurl').addEventListener('click', function () { GN.copy(app, url); });
      });
    });
  };

  /* ---------- scan a QR to join ---------- */
  GN.scanQR = function () {
    var stream = null, raf = null, stopped = false;
    function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    }
    GN.nav(function () {
      GN.mount(GN.topbar('Scan to join') +
        '<div class="pad center">' +
          '<p class="muted">Point the camera at a Game Night QR code.</p>' +
          '<div class="scan-wrap"><video id="scanvid" playsinline muted></video><div class="scan-frame"></div></div>' +
          '<p class="muted small" id="scanmsg">Starting the camera…</p>' +
          '<button class="btn ghost" id="scanstop">Cancel</button>' +
        '</div>', function (app) {
        var video = app.querySelector('#scanvid');
        var msg = app.querySelector('#scanmsg');
        app.querySelector('#scanstop').addEventListener('click', function () { stop(); GN.back(); });
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.jsQR) {
          msg.textContent = 'Camera scanning is not available here — type the room code instead.';
          return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
          stream = s; video.srcObject = s;
          return video.play();
        }).then(function () {
          msg.textContent = 'Looking for a code…';
          var cv = document.createElement('canvas'), cx = cv.getContext('2d');
          function tick() {
            if (stopped) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
              cv.width = video.videoWidth; cv.height = video.videoHeight;
              cx.drawImage(video, 0, 0, cv.width, cv.height);
              var img = cx.getImageData(0, 0, cv.width, cv.height);
              var found = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
              if (found && found.data) {
                var room = roomFrom(found.data);
                if (room) { stop(); GN.convoy.hub(null, room); return; }
                msg.textContent = 'That code is not a Game Night room. Try another.';
              }
            }
            raf = requestAnimationFrame(tick);
          }
          tick();
        }).catch(function () {
          msg.textContent = 'Could not open the camera — type the room code instead.';
        });
      });
    });
  };

  function roomFrom(text) {
    var m = String(text).match(/[?&]room=([A-Za-z0-9]{4})/i);
    if (m) return m[1].toUpperCase();
    var t = String(text).trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(t)) return t;
    return null;
  }
})();
