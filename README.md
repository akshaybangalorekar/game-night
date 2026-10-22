# 🎉 Game Night

A simple place for kids to add their friends and play games together — each on their own phone,
with **voice** and **chat** built in.

## Games

- **Uno** — match colour or number, skips, reverses, +2, wild, wild +4. First to empty their hand wins.
- **Ludo** — roll a 6 to leave the yard, race four tokens home, send friends back.
- **Chess** — full rules: castling, en passant, promotion, check and checkmate.
- **Mafia** — hidden roles dealt privately to every phone; the app runs the nights and the votes.
- **Air Hockey** — real-time paddles, first to 7 goals. Best when everyone is on the same Wi-Fi.

## How it works

1. **Open the app** — you get a name and a **friend code** (like `YJB YQW`).
2. **Add friends** by typing their code. Your friends list is kept on your device.
3. **Pick a game**, then **make a room**. A big **QR code** appears — friends just point a camera
   at it (or tap **Scan to join** in the app) and they're in. No typing needed. There's also a
   4-letter code and a copy-link button as backups.
4. **Share the app itself** with the **🔳 Share the app** button on the home screen — it shows a QR
   a friend can scan to open Game Night.
5. **Talk as you play** — tap **Turn on mic** and your mic stays live for **5 minutes** (then it
   switches itself off, so nothing is left open by accident). Tap again any time to re-open it.
   Or use the chat with one-tap emoji.

No accounts, no sign-ups, no installs. It's a static site that runs in the browser.

## How it connects (no server of ours)

Peer-to-peer WebRTC via [PeerJS](https://peerjs.com). PeerJS provides free signalling; after that,
game data and voice go **directly between phones**. The phone that makes the room is the host and
keeps the game state; the others send their moves and receive updates.

Voice uses WebRTC audio, so a decent connection helps — and it's best when everyone is on the same
Wi-Fi.

## Saving rooms (optional)

Rooms, scores and the "already used" list can be saved to a GitHub repo so a room can be resumed
later. Reads are public; **writes need a fine-grained token** (Contents: read and write on that one
repo). Enter it once in **⚙ Storage settings** on *your* device — it stays in that browser only and
is never uploaded or shared. Leave it blank to run without saving.

## Run locally

Plain HTML/CSS/JS — no build step:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Static site — GitHub Pages works out of the box: **Settings → Pages → Deploy from a branch →
`main` / root**.

## Notes

- Friend codes and the friends list live only on your device (localStorage).
- No data is stored on any server; chat and game state live only in the room.
- Bundled libraries: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) and
  [PeerJS](https://github.com/peers/peerjs) — both MIT.

## License

MIT — see [LICENSE](LICENSE).
