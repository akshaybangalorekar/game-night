# DOS Games — Wolfenstein 3D (shareware)

A DOS games player in the browser. Currently running the shareware
**Episode 1: Escape from Wolfenstein** via
[js-dos](https://js-dos.com) (a DOSBox build compiled to WebAssembly).

## What's here

| Path | What |
|---|---|
| `index.html` | the whole player: screen, on-screen controls, landscape handling |
| `wolf3d.jsdos` | the game bundle (shareware `.WL1` files + `dosbox.conf`) |
| `vendor/js-dos/` | js-dos player (`js-dos.js`, `js-dos.css`) |
| `wdosbox.js`, `wdosbox.wasm` | the DOSBox core (js-dos looks for these at the site root) |

## Controls

On load it asks **"How are you playing?"** — pick **On a mobile** or **On a laptop**.
Either way it goes fullscreen (that click is the gesture the browser needs).

**Mobile** — only two transparent buttons, overlaid:

- **DOOR** (left thumb) — opens doors / uses lifts
- **FIRE** (right thumb) — shoots

Movement is by **swiping anywhere on the screen**: swipe up/down to walk
forward/back, swipe left/right to turn. No d-pad, nothing else on screen.

**Menus** (New Game / Load Game / Save Game): swipe up/down to move the
highlight, **tap** to select. **Press and hold** without moving sends `Esc`,
so menus and the help pages are always escapable.

**Laptop** — no on-screen buttons, just the keyboard: arrows move/turn,
`Ctrl` fire, `Space` doors, `Shift` run, `Alt`+arrow strafe, `1`–`4` weapons,
`Esc` menu, `F1` help, `F2`/`F3` save/load.

## Saves

The game's own menu (`Esc` → Save game) writes save files into the DOS filesystem,
which js-dos keeps in this browser. If progress ever fails to survive a reload on your
device, the fix is to export/import the save files explicitly — ask and I'll add it.

## Licensing

- **Game:** Wolfenstein 3D shareware Episode 1, © 1992 id Software, published by Apogee.
  Apogee's shareware licence permits copying and online distribution of Episode 1
  **unmodified**, which is what this is. The full game (`.WL6`) is *not* included.
- **js-dos / DOSBox:** GPL-2.0. Because they're bundled here, this site is distributed
  under GPL-2.0 too. Sources: https://github.com/caiiiycuk/js-dos and
  https://www.dosbox.com
