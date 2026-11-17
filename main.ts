// Build the make.fun best-game-01 entry: copy game/ and screenshots/ into the
// output directory and write dossier.json there with buildDossier.
// Deterministic: the same repository always writes the same dossier bytes.
// Node 22, the standard library only: no network, no shell, no dependencies.

import { mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const repository = import.meta.dirname;
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(repository, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(repository, 'screenshots'))) {
  cpSync(join(repository, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);