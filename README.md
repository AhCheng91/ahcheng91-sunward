# ahcheng91-sunward

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/AhCheng91/ahcheng91-sunward/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/AhCheng91/ahcheng91-sunward/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

SUNWARD is a browser game about flying a paper-wing glider over a dusk dune sea. Dive for speed, pull up to trade it for height, ride the thermals and thread the three beacon rings before the daylight runs out.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome: the mouse steers, W tucks, S flares, Space boosts, R restarts, Esc pauses.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2se0v5jr&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

## How it plays

Your goal is to fly far enough and high enough to reach the three beacon rings, in order, before the daylight fades. Speed is energy: dive from altitude to build it, pull up to trade it back for height, and let thermals sweep you up for free. Sparkling motes drift through the air — harvest them to fill the boost meter, then spend it with Space for an extra surge. Threading a ring turns the dusk back a notch and lights the next one further out. Storms brew off the dunes and turbulent patches shake the glider, while the sky runs through its colours into night, its last rays your guide. The runs ends three ways — daylight gone before the rings, all three rings threaded and the dusk lifted, or a hard landing — and each earns its score.

## What is in the box

- `game/index.html` — the page and its import map
- `game/src/` — the game itself, one module per job:
  - `config.js` — every tunable number and colour
  - `rng.js` — seeded, deterministic randomness
  - `input.js` — mouse and keyboard
  - `glider.js` — the flight model
  - `camera.js` — the follow camera
  - `terrain.js` — the dune sea
  - `dusk.js` — the falling daylight
  - `sky.js` — the sky and its rays
  - `thermals.js` — rising columns of air
  - `motes.js` — the drifting sparkles that fuel boost
  - `beacons.js` — the three beacon rings
  - `hazards.js` — storms and turbulence
  - `hud.js` — the heads-up display and score
  - `audio.js` — synthesised sound
  - `main.js` — the loop that ties it together
- `game/vendor/three` — three.js r187, vendored and imported through the map
- `main.ts` — builds the entry: copies `game/` and `screenshots/` into the output and writes `dossier.json`
- `serve.ts` — the local static server the run block above uses
- `screenshots/` — real frames of the game, the first the cover

## Notes

Nothing is fetched at runtime: the game serves its own files and data URI sound, never the network. There is no build step — open `game/index.html` through the server and it runs. The art is original and the audio is synthesised in code. The screenshots are real frames rendered in headless Chromium, not mock-ups.