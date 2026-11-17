// Package this repository entry for make.fun's best-game-01 bounty: copy the playable game and its
// screenshots into the output directory, then write dossier.json the way the scorer's gate reads it.
// Deterministic and self-contained: standard library only, no network, no shell, no build step.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });

cpSync(join('game'), join(out, 'game'), { recursive: true });
if (existsSync(join('screenshots'))) cpSync(join('screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);