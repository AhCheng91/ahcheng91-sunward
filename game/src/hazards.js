import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const WORLD = CONFIG.world.size;
const HALF = WORLD / 2;

const STORM_MIN_ALTITUDE = 90;
const STORM_MAX_ALTITUDE = 200;
const STORM_DRIFT_MIN_SPEED = 6;
const STORM_DRIFT_MAX_SPEED = 14;
const STORM_PUFFS_MIN = 4;
const STORM_PUFFS_MAX = 8;
const STORM_PUFF_MIN_RADIUS = 16;
const STORM_PUFF_MAX_RADIUS = 34;
const STORM_PUFF_SPREAD = 0.5;
const STORM_PUFF_Y_MIN = -18;
const STORM_PUFF_Y_MAX = 14;
const STORM_GLOW_SCALE = 2.1;
const STORM_GLOW_OPACITY = 0.14;
const LIGHTNING_MIN_INTERVAL = 3;
const LIGHTNING_MAX_INTERVAL = 8;
const LIGHTNING_SCALE = 90;
const LIGHTNING_PEAK_OPACITY = 0.85;
const FLASH_LIFE = 0.16;

const RAY_MIN_ALTITUDE = 40;
const RAY_MAX_ALTITUDE = 140;
const RAY_ORBIT_MIN_RADIUS = 170;
const RAY_ORBIT_MAX_RADIUS = 420;
const RAY_MIN_SPEED = 0.16;
const RAY_MAX_SPEED = 0.34;
const RAY_MIN_WINGSPAN = 11;
const RAY_MAX_WINGSPAN = 20;
const RAY_MIN_LENGTH = 7;
const RAY_MAX_LENGTH = 13;
const RAY_FLAP_RATE = 3.4;
const RAY_FLAP_AMP = 0.4;
const RAY_BANK_AMP = 0.14;
const RAY_HIT_RADIUS = 4.5;
const RAY_EDGE_OPACITY = 0.8;

function makeRandom(rng) {
  const base =
    typeof rng === 'function'
      ? rng
      : rng && typeof rng.next === 'function'
        ? rng.next.bind(rng)
        : rng && typeof rng.random === 'function'
          ? rng.random.bind(rng)
          : Math.random;
  const rand = () => base();
  const range = (min, max) => min + rand() * (max - min);
  const int = (min, max) => Math.min(max, Math.floor(range(min, max + 1)));
  return { rand, range, int };
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeRadialTexture(stops) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  for (const [offset, color, alpha] of stops) {
    gradient.addColorStop(offset, alpha == null ? color : hexToRgba(color, alpha));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function groundBelow(terrain, x, z) {
  const height =
    terrain && typeof terrain.heightAt === 'function' ? terrain.heightAt(x, z) : 0;
  return Number.isFinite(height) ? height : 0;
}

function wrapCoord(value, span) {
  let v = value;
  const half = HALF + span;
  while (v < -half) v += WORLD + span * 2;
  while (v > half) v -= WORLD + span * 2;
  return v;
}

function buildStorm(terrain, rand, flashTexture, glowTexture) {
  const storm = {
    x: rand.range(-HALF * 0.8, HALF * 0.8),
    z: rand.range(-HALF * 0.8, HALF * 0.8),
    dirX: rand.range(-1, 1),
    dirZ: rand.range(-1, 1),
    speed: rand.range(STORM_DRIFT_MIN_SPEED, STORM_DRIFT_MAX_SPEED),
    baseAltitude: rand.range(STORM_MIN_ALTITUDE, STORM_MAX_ALTITUDE),
    splash: CONFIG.hazards.stormRadius,
    flashTimer: rand.range(LIGHTNING_MIN_INTERVAL, LIGHTNING_MAX_INTERVAL),
    flashElapsed: FLASH_LIFE,
  };
  const dirLength = Math.hypot(storm.dirX, storm.dirZ) || 1;
  storm.dirX /= dirLength;
  storm.dirZ /= dirLength;
  storm.homeX = storm.x;
  storm.homeZ = storm.z;

  const root = new THREE.Group();
  const puffCount = rand.int(STORM_PUFFS_MIN, STORM_PUFFS_MAX);
  // No lights in this scene: a flat plum storm body with a warm-lit rim reads far
  // better than a lambert surface, which would render as a black hole in the frame.
  const puffMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#4a2f57'),
    flatShading: true,
    fog: true,
  });
  for (let i = 0; i < puffCount; i += 1) {
    const radius = rand.range(STORM_PUFF_MIN_RADIUS, STORM_PUFF_MAX_RADIUS);
    const geometry = new THREE.SphereGeometry(1, 7, 5);
    geometry.scale(radius, radius * rand.range(0.7, 1.05), radius * rand.range(0.7, 1.05));
    geometry.computeVertexNormals();
    const puff = new THREE.Mesh(geometry, puffMaterial);
    puff.position.set(
      rand.range(-STORM_PUFF_SPREAD, STORM_PUFF_SPREAD) * storm.splash,
      rand.range(STORM_PUFF_Y_MIN, STORM_PUFF_Y_MAX),
      rand.range(-STORM_PUFF_SPREAD, STORM_PUFF_SPREAD) * storm.splash,
    );
    root.add(puff);
  }

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      opacity: STORM_GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.set(
    storm.splash * STORM_GLOW_SCALE,
    storm.splash * STORM_GLOW_SCALE,
    1,
  );
  glow.position.set(0, -storm.splash * 0.55, 0);
  glow.renderOrder = 11;
  root.add(glow);

  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flashTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  flash.scale.set(LIGHTNING_SCALE, LIGHTNING_SCALE, 1);
  flash.position.set(
    rand.range(-storm.splash * 0.4, storm.splash * 0.4),
    rand.range(8, 42),
    rand.range(-storm.splash * 0.4, storm.splash * 0.4),
  );
  flash.renderOrder = 12;
  root.add(flash);

  storm.root = root;
  storm.glow = glow;
  storm.flash = flash;
  placeStorm(storm, terrain);
  return storm;
}

function placeStorm(storm, terrain) {
  const ground = groundBelow(terrain, storm.x, storm.z);
  storm.root.position.set(storm.x, ground + storm.baseAltitude, storm.z);
}

function makeWingGeometry(side, halfSpan, length) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, length * 0.5,
        side * halfSpan, 0, -length * 0.2,
        0, 0, -length * 0.62,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function makeEdgeGeometry(side, halfSpan, length) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, length * 0.5),
    new THREE.Vector3(side * halfSpan, 0, -length * 0.2),
    new THREE.Vector3(0, 0, -length * 0.62),
  ]);
  return geometry;
}

function makeWingRig(side, halfSpan, length, wingMaterial, edgeMaterial) {
  const rig = new THREE.Group();
  const mesh = new THREE.Mesh(makeWingGeometry(side, halfSpan, length), wingMaterial);
  const edge = new THREE.Line(makeEdgeGeometry(side, halfSpan, length), edgeMaterial);
  rig.add(mesh);
  rig.add(edge);
  return { rig, mesh };
}

function buildRay(flock, rand, wingMaterial, edgeMaterial) {
  const wingspan = rand.range(RAY_MIN_WINGSPAN, RAY_MAX_WINGSPAN);
  const length = rand.range(RAY_MIN_LENGTH, RAY_MAX_LENGTH);
  const halfSpan = wingspan / 2;
  const ray = {
    orbitX: flock.x,
    orbitZ: flock.z,
    orbitRadius: rand.range(RAY_ORBIT_MIN_RADIUS, RAY_ORBIT_MAX_RADIUS),
    phase: rand.range(0, Math.PI * 2),
    initialPhase: 0,
    speed: rand.range(RAY_MIN_SPEED, RAY_MAX_SPEED),
    altitude: rand.range(RAY_MIN_ALTITUDE, RAY_MAX_ALTITUDE),
    bankPhase: rand.range(0, Math.PI * 2),
    flapPhase: rand.range(0, Math.PI * 2),
  };
  ray.initialPhase = ray.phase;

  const root = new THREE.Group();
  const left = makeWingRig(-1, halfSpan, length, wingMaterial, edgeMaterial);
  const right = makeWingRig(1, halfSpan, length, wingMaterial, edgeMaterial);
  root.add(left.rig);
  root.add(right.rig);
  ray.root = root;
  ray.leftWing = left.mesh;
  ray.rightWing = right.mesh;
  placeRay(ray);
  return ray;
}

function placeRay(ray) {
  const tx = Math.cos(ray.phase) * ray.orbitRadius;
  const tz = Math.sin(ray.phase) * ray.orbitRadius;
  const px = ray.orbitX + tx;
  const pz = ray.orbitZ + tz;
  ray.root.position.set(px, ray.altitude, pz);

  const dx = -Math.sin(ray.phase) * ray.orbitRadius;
  const dz = Math.cos(ray.phase) * ray.orbitRadius;
  ray.root.rotation.y = Math.atan2(dx, dz);
  ray.root.rotation.x = Math.sin(ray.bankPhase) * RAY_BANK_AMP;

  const flap = Math.sin(ray.phase * RAY_FLAP_RATE + ray.flapPhase) * RAY_FLAP_AMP;
  ray.leftWing.rotation.z = -flap;
  ray.rightWing.rotation.z = flap;
}

export function createHazards(scene, rng, terrain) {
  const group = new THREE.Group();
  const rand = makeRandom(rng);

  const flashTexture = makeRadialTexture([
    [0, PALETTE.sunCore, 1],
    [0.35, PALETTE.sunGlow, 0.6],
    [1, PALETTE.storm, 0],
  ]);
  const glowTexture = makeRadialTexture([
    [0, PALETTE.cloudBase, 1],
    [0.5, PALETTE.sunGlow, 0.3],
    [1, PALETTE.sunGlow, 0],
  ]);

  const storms = [];
  for (let i = 0; i < CONFIG.hazards.storms; i += 1) {
    const storm = buildStorm(terrain, rand, flashTexture, glowTexture);
    storms.push(storm);
    group.add(storm.root);
  }

  const wingMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.rockDark),
    side: THREE.DoubleSide,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.wingEdge),
    transparent: true,
    opacity: RAY_EDGE_OPACITY,
    blending: THREE.AdditiveBlending,
  });

  const rays = [];
  for (let f = 0; f < CONFIG.hazards.rayFlocks; f += 1) {
    const flock = {
      x: rand.range(-HALF * 0.58, HALF * 0.58),
      z: rand.range(-HALF * 0.58, HALF * 0.58),
    };
    for (let r = 0; r < CONFIG.hazards.raysPerFlocks; r += 1) {
      const ray = buildRay(flock, rand, wingMaterial, edgeMaterial);
      rays.push(ray);
      group.add(ray.root);
    }
  }

  scene.add(group);

  const sampleOut = { storm: 0, ray: false };

  function sample(position) {
    const px = position.x;
    const py = position.y;
    const pz = position.z;
    let strength = 0;
    for (let i = 0; i < storms.length; i += 1) {
      const storm = storms[i];
      const dx = px - storm.x;
      const dz = pz - storm.z;
      const radius = storm.splash;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const horizontal = 1 - Math.sqrt(d2) / radius;
        const midY = storm.root.position.y;
        const vd = Math.abs(py - midY);
        const vertical = vd < 50 ? 1 : Math.max(0, 1 - (vd - 50) / 120);
        const cell = horizontal * vertical;
        if (cell > strength) strength = cell;
      }
    }
    let hit = false;
    for (let i = 0; i < rays.length; i += 1) {
      const positionRay = rays[i].root.position;
      const dx = px - positionRay.x;
      const dy = py - positionRay.y;
      const dz = pz - positionRay.z;
      if (dx * dx + dy * dy + dz * dz < RAY_HIT_RADIUS * RAY_HIT_RADIUS) {
        hit = true;
        break;
      }
    }
    sampleOut.storm = strength;
    sampleOut.ray = hit;
    return sampleOut;
  }

  function update(dt, glider) {
    for (let i = 0; i < storms.length; i += 1) {
      const storm = storms[i];
      storm.x = wrapCoord(storm.x + storm.dirX * storm.speed * dt, storm.splash);
      storm.z = wrapCoord(storm.z + storm.dirZ * storm.speed * dt, storm.splash);
      placeStorm(storm, terrain);

      if (storm.flashElapsed >= FLASH_LIFE) {
        storm.flashTimer -= dt;
        if (storm.flashTimer <= 0) {
          storm.flashTimer = rand.range(LIGHTNING_MIN_INTERVAL, LIGHTNING_MAX_INTERVAL);
          storm.flashElapsed = 0;
        }
      }
      if (storm.flashElapsed < FLASH_LIFE) {
        storm.flashElapsed += dt;
        const decay = 1 - storm.flashElapsed / FLASH_LIFE;
        storm.flash.material.opacity = decay * LIGHTNING_PEAK_OPACITY;
      } else {
        storm.flash.material.opacity = 0;
      }
    }

    for (let i = 0; i < rays.length; i += 1) {
      const ray = rays[i];
      ray.phase += ray.speed * dt;
      ray.bankPhase += dt * 0.7;
      placeRay(ray);
    }
  }

  function reset() {
    for (let i = 0; i < storms.length; i += 1) {
      const storm = storms[i];
      storm.x = storm.homeX;
      storm.z = storm.homeZ;
      storm.flashTimer = rand.range(LIGHTNING_MIN_INTERVAL, LIGHTNING_MAX_INTERVAL);
      storm.flashElapsed = FLASH_LIFE;
      storm.flash.material.opacity = 0;
      placeStorm(storm, terrain);
    }
    for (let i = 0; i < rays.length; i += 1) {
      const ray = rays[i];
      ray.phase = ray.initialPhase + rand.range(0, 0.6);
      placeRay(ray);
    }
  }

  return { group, update, sample, reset };
}