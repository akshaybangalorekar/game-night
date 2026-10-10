# 🎉 Game Night

Party games for a group — two ways to play:

- **🕯️ The Long Table** — everyone in one room, one phone passed around. Runs fully offline.
- **🚗 The Convoy** — different cars, one game. Live across phones with **voice** and **chat**.

No accounts, no sign-ups, no installs. It's a static site that runs in the browser.

## The Long Table (in one room)

Pass the phone around, scan a QR code to get your secret role, and argue with your friends.

**Social deduction**
- **Mafia** — hidden roles, narrator-guided nights and daytime trials, with **QR-code role reveal**
  so each player reads their role on their own phone.

**Party & drawing** (Jackbox-style, pass-and-play)
- **Punchline** — write the funniest answer to a prompt, then the room votes.
- **Fib Factory** — invent a believable lie, then spot the real answer.
- **Scribble** — secretly draw a prompt on the canvas, then the room guesses.

**Table games** (Huddle-style)
- **Spyfall** — everyone knows the location except the spy.
- **Wavelength** — read your teammate's mind on a hidden spectrum.
- **Time's Up** — two teams, three rounds: describe, one word, charades.

## The Convoy (across cars)

Built for road trips and kids: **tap-light, voice-first, minimal screen-staring** (good for travel
sickness). One car starts a convoy, everyone else joins with a 4-character code or an invite link.

- **Would You Rather** — one question, two choices. Tap, then argue about it out loud.
- **Two Truths and a Lie** — say two true things and one fib out loud; everyone taps the lie.
- **Convoy Bingo** — spot things out of the window and mark your card; first full line wins.

Every convoy room has:
- **Push-to-talk voice** — hold the mic button to talk to the other cars.
- **Chat** — short text plus one-tap emoji reactions for anyone who can't use voice.

Rooms are private: only people with the code can join.

### How the convoy connects (no server of yours)

Peer-to-peer WebRTC via [PeerJS](https://peerjs.com). PeerJS provides free signalling; after that,
data and voice go **directly between cars**. The car that starts the convoy is the host and keeps
the game state; the others send their taps and receive updates.

Because it's peer-to-peer, it needs a working connection between the phones (mobile data or Wi-Fi).
Voice uses WebRTC audio, so a decent signal helps.

## Run locally

Plain HTML/CSS/JS — no build step. Either open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Static site — GitHub Pages works out of the box:

1. Push this repo to GitHub.
2. **Settings → Pages → Deploy from a branch → `main` / root**.

QR role-reveal and convoy invite links both work once the site is hosted (they need a real URL).

## Notes

- **The Long Table** is fully offline; no network calls at runtime.
- **The Convoy** uses PeerJS's free public signalling server plus WebRTC. No data is stored on any
  server — chat and game state live only in the room, and the QR role lives only in its link.
- Bundled libraries: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) and
  [PeerJS](https://github.com/peers/peerjs) — both MIT.

## License

MIT — see [LICENSE](LICENSE).
