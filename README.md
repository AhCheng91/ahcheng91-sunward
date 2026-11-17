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

Your goal is to stay aloft and fly sunward as far as you can before the daylight runs out: dive for speed, pull up to trade that speed for height, and never let the dune sea claim your paper wing.

- **Energy model** — the glider trades two currencies against each other: velocity and altitude. Diving builds speed, pulling up spends it to climb, and scraping a hilltop or landing resets you for the loss.
- **Thermals** — columns of rising air drift across the dunes. Ride one and you climb for free, the surest way to gain height without giving up speed.
- **Motes and boost** — motes of light float along your route. Collect them to fill the boost meter, then spend a full bar with Space for a burst of speed through still air.
- **Beacon rings** — three rings hang low over the dunes, waiting to be threaded. Every ring you fly through buys back daylight, pushing the moment of dusk farther out.
- **Storms and sky rays** — the dusk sky is not silent: storms churn and claw at you, while stray sky rays offer a bright updraft if you can catch one.
- **Three endings and the score** — your run ends one of three ways, and the results screen tallies how far you came, how many rings you threaded and how much daylight you bought. Beat your best, ring by ring.

## What is in the box

- `game/index.html` — the page: canvas, HUD and the import map that loads the modules and three.js.
- `game/src/` — the game itself, as plain ES modules:
  - `config.js` — every tunable number and colour, in one place
  - `main.js` — the game: scene, loop and the run's state machinery
  - `glider.js` — the paper glider's flight model, energy and controls
  - `input.js` — mouse and keyboard, read every frame
  - `camera.js` — the chase camera and its feel
  - `terrain.js` — the rolling dune sea and the ground you must not touch
  - `dusk.js` — the daylight meter that counts your time down
  - `sky.js` — the dusk sky, the sun and the rays
  - `thermals.js` — the rising columns of air
  - `hazards.js` — the storms that claw at you
  - `beacons.js` — the three rings, placed and threaded
  - `motes.js` — the motes of light between the rings
  - `audio.js` — synthesised wind through the wing, notes for rings and motes
  - `hud.js` — the heads-up display of speed, height and daylight
  - `rng.js` — deterministic randomness, so every run is reproducible
- `game/vendor/three` — three.js r187, vendored so nothing is fetched from a CDN.
- `main.ts` — builds the make.fun entry directory and `dossier.json`.
- `serve.ts` — the local static server for `game/`.
- `screenshots/` — real frames saved from the running game, the first the cover.

## Notes

- **No network at runtime** — the game loads nothing over the wire: every script, library, asset and sound is a file in `game/`, served by `serve.ts` or opened straight off disk.
- **No build step** — `game/` is plain static files; the game is `index.html` plus standard ES modules behind an import map.
- **Original art and synthesised sound** — the dunes, glider, sky and light are drawn from scratch in WebGL, and every sound is synthesised, none of it sampled from elsewhere.
- **Screenshots are real frames** — the shots in `screenshots/` were captured from the actual rendering engine, not mocked.