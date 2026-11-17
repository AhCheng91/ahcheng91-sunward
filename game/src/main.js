import {
  WebGLRenderer, PerspectiveCamera, Scene, FogExp2, SRGBColorSpace,
} from 'three';
import { CONFIG, PALETTE } from './config.js';
import { makeRng } from './rng.js';
import { Input } from './input.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { Glider } from './glider.js';
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { createMotes } from './motes.js';
import { createThermals } from './thermals.js';
import { createBeacons } from './beacons.js';
import { Dusk } from './dusk.js';
import { createHazards } from './hazards.js';
import { Sound } from './audio.js';

const query = new URLSearchParams(location.search);
const seed = Number(query.get('seed') || '1');
const shot = query.get('shot');
const shotT = Number(query.get('t') || '6');
const shotPause = query.get('pause') === '1';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const STEP = 1 / 60;
const SHOT_BEACON_BACK = 120;  // ?shot=beacon starts the wing this far short of the gate
const SHOT_BEACON_CLEAR = 2;   // ...and flies this far above the ring, so tryLight lights on approach
const SHOT_BEACON_FREEZE = 60; // ...and must stay clear of dunes this far past the gate for the freeze
const SHOT_RESULTS_HOLD = 4;   // ?shot=results parks at each gate this many steps
const SHOT_RESULTS_MOTES = 14; // ...and gathers this many motes before the last gate lights

const errors = [];
addEventListener('error', (e) => {
  errors.push(String(e.message));
  console.error(e.message);
});
addEventListener('unhandledrejection', (e) => {
  errors.push(String(e.reason));
  console.error(e.reason);
});

const canvas = document.getElementById('game');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = SRGBColorSpace;
renderer.setClearColor(PALETTE.haze);
renderer.setSize(innerWidth, innerHeight);

const scene = new Scene();
scene.fog = new FogExp2(PALETTE.haze, 0.0035);

const camera = new PerspectiveCamera(
  CONFIG.view.fov, innerWidth / innerHeight, CONFIG.view.near, CONFIG.view.far,
);

const rng = makeRng(seed);
const terrain = createTerrain(scene, rng);
const sky = createSky(scene);
const glider = new Glider(scene, terrain);
const motes = createMotes(scene, rng, terrain);
const thermals = createThermals(scene, rng, terrain);
const beacons = createBeacons(scene, rng, terrain);
const dusk = new Dusk();
const hazards = createHazards(scene, rng, terrain);
const chase = new ChaseCamera(camera, terrain);
const hud = new Hud(document);
const sound = new Sound();
const input = new Input(canvas);

scene.add(terrain.group, sky.group, motes.group, thermals.group, beacons.group, hazards.group);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let state = 'title';
let paused = false;
let score = 0, collectedMotes = 0, streak = 0, best = 0;
let boostThreshold = CONFIG.motes.perBoostRefill;
let simElapsed = 0, elapsedReal = 0, acc = 0;
let lastTime = performance.now();
let frames = 0, fps = 60;

let shotPlay = false, shotDone = false;
let script = null;          // 'beacon' | 'results' | null: running shot driver
let scriptGate = 0;
let scriptHold = 0;
let moteCursor = 0;         // ?shot=results sweeps motes from here onward
const shotSteer = {
  steerX: 0, steerY: 0, tuck: false, flare: false, boost: false,
  started: false, paused: false, clicked: false, pointerX: 0, pointerY: 0,
};
const skyState = { camera };
const hudDatum = {};

function resetRun() {
  glider.reset(seed);
  motes.reset();
  beacons.reset();
  dusk.reset();
  hazards.reset();
  score = 0;
  collectedMotes = 0;
  streak = 0;
  boostThreshold = CONFIG.motes.perBoostRefill;
  simElapsed = 0;
}

function placeGliderAt(x, y, z, heading) {
  glider.position.set(x, y, z);
  glider._altitude = y - terrain.heightAt(x, z);
  glider.heading = heading;
  glider.pitch = 0;
  glider.roll = 0;
  glider.speed = CONFIG.glider.startSpeed;
  glider.stalled = false;
  glider.crashed = false;
}

function firstUnlitGateIndex() {
  for (let i = 0; i < beacons.list.length; i += 1) {
    if (!beacons.list[i].lit) return i;
  }
  return -1;
}

// Pick the closest unlit gate, then place the glider 120 units out along the
// line toward that gate's centre with the nose aimed at it, at ring altitude
// plus 2m, flying level at cruise. driveShot later re-winds altitude each step
// so the wing never sinks into a lee slope on the way in.
function placeBeaconRun() {
  const gateIndex = firstUnlitGateIndex();
  if (gateIndex < 0) return false;
  const gate = beacons.list[gateIndex];
  scriptGate = gateIndex;
  const len = Math.hypot(gate.x, gate.z) || 1;
  const sx = gate.x - (gate.x / len) * SHOT_BEACON_BACK;
  const sz = gate.z - (gate.z / len) * SHOT_BEACON_BACK;
  const heading = Math.atan2(gate.z / len, gate.x / len);
  placeGliderAt(sx, gate.ringY + SHOT_BEACON_CLEAR, sz, heading);
  return true;
}

// Drives the two scripted shots through the same simStep path the real game
// uses: ?shot=beacon flies straight into its gate and holds the ring altitude
// (the autopilot banks gently and keeps the nose up, so beacons.tryLight fires
// for real); ?shot=results stations the glider at each gate in turn so tryLight
// lights them truly, and sweeps a short mote line between gates so the win card
// shows a harvest.
function driveShot() {
  if (script === 'beacon') {
    const gate = beacons.list[scriptGate];
    if (gate && !gate.lit) {
      const ground = glider.terrain.heightAt(glider.position.x, glider.position.z);
      glider._altitude = Math.max(SHOT_BEACON_CLEAR, gate.ringY + SHOT_BEACON_CLEAR - ground);
      glider.pitch = 0;
    } else {
      script = null;
    }
  } else if (script === 'results') {
    const gate = beacons.list[scriptGate];
    if (gate && !gate.lit) {
      placeGliderAt(gate.x, gate.ringY, gate.z, 0);
      scriptHold += 1;
      if (scriptHold >= SHOT_RESULTS_HOLD) {
        scriptHold = 0;
        scriptGate += 1;
        if (scriptGate >= beacons.total) script = null;
      }
    } else if (gate && gate.lit) {
      scriptGate += 1;
      scriptHold = 0;
      if (scriptGate >= beacons.total) script = null;
    } else {
      script = null;
    }
  }
}

function enterFlight() {
  resetRun();
  hud.showTitle(false);
  hud.setHud(true);
  hud.setPaused(false);
  state = 'flying';
}

function steerShot() {
  const g = glider.position;
  const s = sky.sun.position;
  const dx = s.x - g.x, dz = s.z - g.z;
  const dist = Math.hypot(dx, dz) || 1e-4;
  let turn = Math.atan2(dx, dz) - glider.heading;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  // Aim a little to the right of the sun (so it sits off-centre, not in the lens)
  // and hold a low band over the dunes rather than climbing to the sun.
  shotSteer.steerX = clamp(turn * 1.1 + 0.22, -1, 1);
  const alt = glider.altitude;
  shotSteer.steerY = clamp((95 - alt) / 55, -0.55, 0.55);
  shotSteer.tuck = alt > 150;
  shotSteer.flare = alt < 70;
}

function simStep(dt) {
  if (state === 'title') {
    chase.titleOrbit(dt);
    return;
  }
  if (state === 'ended') return; // freeze the world, keep rendering it
  if (script) driveShot();
  if (shotPlay) steerShot();
  const inputState = (shotPlay || script) ? shotSteer : input.getState();
  hazards.update(dt, glider);
  thermals.update(dt, simElapsed);
  motes.update(dt, glider);
  beacons.update(dt, glider);
  glider.update(dt, inputState, { thermals, hazards, bounds: terrain.bounds });

  const taken = motes.collect(glider);
  if (taken > 0) {
    collectedMotes += taken;
    score += taken * CONFIG.score.perMote;
    streak += taken;
    sound.chime(streak);
    while (collectedMotes >= boostThreshold) {
      glider.addBoostCharge();
      boostThreshold += CONFIG.motes.perBoostRefill;
    }
  }

  const lit = beacons.tryLight(glider);
  if (lit >= 0) {
    dusk.addSeconds(CONFIG.beacons.timeBonus);
    score += CONFIG.score.perBeacon;
    sound.chord();
    hud.toast('BEACON ' + (lit + 1) + ' LIT  +' + CONFIG.beacons.timeBonus + 's');
  }

  dusk.update(dt);
  sound.setWind(clamp(glider.speed / CONFIG.glider.maxSpeed, 0, 1));
  if (script === 'scenic') chase.photoOrbit(dt, glider, elapsedReal);
  else chase.update(dt, glider);
  checkEnding();
}

function checkEnding() {
  if (state !== 'flying') return;
  let verdict = null;
  if (beacons.litCount() === beacons.total) verdict = 'THE SUN STOOD STILL';
  else if (glider.crashed) verdict = 'DOWN IN THE DUNES';
  else if (dusk.ended) verdict = 'THE SUN SET FIRST';
  if (verdict) enterEnded(verdict);
}

function enterEnded(verdict) {
  const timeLeft = Math.floor(Math.max(0, dusk.secondsLeft));
  score += timeLeft * CONFIG.score.perSecondLeft;
  best = Math.max(best, score);
  hud.showResults({
    verdict,
    motes: collectedMotes,
    beacons: beacons.litCount() + ' / ' + beacons.total,
    time: timeLeft + 's',
    total: score,
    best,
  });
  if (verdict === 'THE SUN STOOD STILL') sound.chord();
  else sound.thud();
  state = 'ended';
}

function backToTitle() {
  resetRun();
  script = null;
  hud.showResults(false);
  hud.showTitle(true);
  hud.setHud(false);
  hud.setPaused(false);
  paused = false;
  state = 'title';
}

function handleInput() {
  if (state === 'flying') {
    if (input.consumeRestart()) {
      backToTitle();
    } else if (input.consumePause()) {
      paused = !paused;
      hud.setPaused(paused);
    } else if (!paused && input.consumeBoost() && glider.boostCharges > 0) {
      glider.boost();
    }
  } else if (state === 'ended') {
    if (input.consumeRestart() || input.consumeStart()) backToTitle();
  } else if (state === 'title' && input.consumeStart()) {
    enterFlight();
    sound.start();
  }
}

function diagJSON() {
  return {
    frames, fps: Math.round(fps), state,
    altitude: Math.round(glider.altitude), speed: Math.round(glider.speed),
    motes: collectedMotes, beacons: beacons.litCount(), errors,
  };
}
window.__diag = () => diagJSON();
const diagEl = document.getElementById('diag');
function writeDiag() {
  diagEl.textContent = JSON.stringify(diagJSON());
}

function perFrame() {
  sky.setSunAltitude(dusk.sunAltitudeDeg);
  sky.update(STEP, skyState);
  hudDatum.altitude = glider.altitude;
  hudDatum.speed = glider.speed;
  hudDatum.motes = collectedMotes;
  hudDatum.score = score;
  hudDatum.beaconsLit = beacons.litCount();
  hudDatum.beaconsTotal = beacons.total;
  hudDatum.duskFraction = dusk.fraction;
  hudDatum.boostCharges = glider.boostCharges;
  hudDatum.boostMax = CONFIG.boost.charges;
  hudDatum.nextBeacon = beacons.nextTarget(glider);
  hudDatum.stalled = glider.stalled;
  hudDatum.best = best;
  hud.update(hudDatum);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.25);
  lastTime = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.08;
  elapsedReal += dt;

  handleInput();
  if (shotPlay && !shotDone && elapsedReal >= shotT) {
    shotDone = true;
    paused = true; // a capture freeze, not the player's pause: no banner
  }

  if (!paused) {
    acc += dt;
    while (acc >= STEP) {
      simStep(STEP);
      acc -= STEP;
      simElapsed += STEP;
    }
  }

  perFrame();
  renderer.render(scene, camera);
  input.update();
  if (++frames % 30 === 0) writeDiag();
}

hud.showTitle(true);
hud.setHud(false);
hud.showResults(false);

if (shot === 'play') {
  enterFlight();
  sound.start();
  shotPlay = true;
} else if (shot === 'beacon') {
  enterFlight();
  sound.start();
  const gateIndex = firstUnlitGateIndex();
  if (gateIndex >= 0) {
    const t = beacons.list[gateIndex];
    const len = Math.hypot(t.x, t.z) || 1;
    placeGliderAt(
      t.x - (t.x / len) * SHOT_BEACON_BACK,
      t.ringY,
      t.z - (t.z / len) * SHOT_BEACON_BACK,
      Math.atan2(t.z / len, t.x / len),
    );
    script = 'beacon';
    scriptGate = gateIndex;
    scriptHold = 0;
  }
} else if (shot === 'scenic') {
  enterFlight();
  sound.start();
  script = 'scenic';
} else if (shot === 'results') {
  enterFlight();
  sound.start();
  script = 'results';
  scriptGate = 0;
  scriptHold = 0;
} else {
  state = 'title';
}

if (shotPause) {
  paused = true;
}

requestAnimationFrame(frame);