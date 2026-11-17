# SUNWARD — working notes for the build agent

## Work style (read this first)
- Do not explore. No `ls`, `find`, `grep`, `cat` or `git` sightseeing, and no hunting for
  `node_modules`: the repository holds only `game/`, `screenshots/`, `vendor/` and its notes. Read only
  the one or two files the current instruction names, then write the files it asks for.
- Write one file per tool call, and run `node --check` on it right after you write it.
- **Never open or read anything under `game/vendor/`**: those are minified libraries, megabytes on a
  single line, and reading one floods the context. Import from `'three'` (three.js r187) through the
  import map and use the standard, well-known API.
- Finish a turn with a short report, not with another investigation.

## What this is
- Read `/data/home/bounty-best-game/DESIGN.md` before you change anything. It is the art and design
  direction for this game, and every file you write follows it.
- The game is plain static files under `game/`: no fetch, no CDN, no build step, no dependency, no
  font or image loaded from anywhere. Everything it loads is a file under `game/` or a `data:` URI.
- Keep every tunable number and every colour in `game/src/config.js`, and name each exported function
  and class for the job it does: a judge reads the file paths and declaration names.
- The page must run with zero console errors and zero page errors at 1280x800 in headless Chromium
  with software WebGL. Never silence an error by deleting the code that raises it.
- `python3 -m http.server 8123 --directory game` serves the game; `/data/home/bounty-best-game/tools/probe.mjs`
  opens it in headless Chromium, prints console errors, and saves a screenshot.
