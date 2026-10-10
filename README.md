# 🎉 Game Night

Offline-friendly party games for a group in **one room**. Pass a phone around, scan a QR code to
get your secret role, and argue with your friends. No accounts, no sign-ups, no installs — it's a
static site that runs entirely in the browser.

## Games

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

## How to play

1. Open `index.html` (locally or from the hosted URL) on one phone or laptop.
2. Pick a game, add the players, and follow the on-screen prompts.
3. Most games are **pass-and-play**: hand the phone to whoever is prompted, so secrets stay secret.

### Mafia QR role reveal

The Mafia setup can hand out roles as QR codes instead of passing the phone. Each QR encodes the
player's role in the URL **fragment** (`#/reveal/...`), so scanning it opens the role privately on
that player's phone — nothing is sent to any server.

QR links need the page to be reachable by every phone, so this mode works best when the site is
**hosted** (e.g. GitHub Pages). If you open the file directly (`file://`), the app will tell you and
you can fall back to "Pass the phone".

## Run locally

It's plain HTML/CSS/JS — no build step. Either open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Because it's a static site, GitHub Pages works out of the box:

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
3. Share the Pages URL; QR role-reveal will work for everyone.

## Notes

- Fully offline: no network calls at runtime. The QR generator is bundled under `vendor/`.
- State lives only in memory and in the QR link — nothing is stored.

## License

MIT — see [LICENSE](LICENSE). Bundled QR generator: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
