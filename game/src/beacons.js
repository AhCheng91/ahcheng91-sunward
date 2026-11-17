import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const RING_GAP = 5;
const RING_TUBE = 0.7;
const RING_TILT = 0.18;
const RING_SPIN = 0.55;
const SHAFT_BASE = 2.8;
const SHAFT_TOP = 0.7;
const SHAFT_SEGMENTS = 7;
const CAGE_SIZE = 3.2;
const CAGE_LIT = '#5a2d28';
const LIGHT_RADIUS = 5.5;
const LIGHT_REACH = 1.95;
const LIGHT_OPACITY = 0.1;
const PASS_HEIGHT = 7;
const FIRE_GROW = 0.6;
const RING_UNLIT = '#8f5a38';
const RING_LIT = '#ffcf7a';
const SPARK_COUNT = 14;
const SPARK_INTERVAL = 2.4;
const SPARK_LIFE = 1.5;
const SMOKE_COUNT = 3;
const SMOKE_RISE = 6;
const SMOKE_HEIGHT = 9;
const SMOKE_OPACITY = 0.5;

function makeRadialTexture(inner, outer) {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function terrainHeight(terrain, x, z) {
  if (terrain && typeof terrain.heightAt === 'function') return terrain.heightAt(x, z);
  if (terrain && typeof terrain.getHeight === 'function') return terrain.getHeight(x, z);
  return 0;
}

function gliderPosition(glider) {
  const p = glider && glider.position ? glider.position : null;
  if (!p) return { x: 0, y: 0, z: 0 };
  return { x: p.x, y: p.y, z: p.z };
}

function gliderHeading(glider) {
  if (!glider) return 0;
  if (typeof glider.heading === 'number') return glider.heading;
  if (glider.rotation) return -glider.rotation.y;
  return 0;
}

function buildBeacon(index, x, z, baseY, cfg, textures, rand) {
  const gateAltitude = cfg.gateAltitude;
  const ringY = baseY + gateAltitude + RING_GAP;
  const beacon = {
    index,
    x,
    z,
    baseY,
    ringY,
    shaftTop: baseY + gateAltitude,
    lit: false,
    phase: rand() * Math.PI * 2,
    fireProgress: 0,
    sparkTimer: SPARK_INTERVAL * rand(),
    root: new THREE.Group(),
    smoke: [],
    sparks: [],
  };
  const root = beacon.root;

  const shaftMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.rockDark });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(SHAFT_TOP, SHAFT_BASE, gateAltitude, SHAFT_SEGMENTS),
    shaftMaterial
  );
  shaft.position.y = baseY + gateAltitude / 2;
  root.add(shaft);

  const cageMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.rockDark });
  const cage = new THREE.Mesh(new THREE.OctahedronGeometry(CAGE_SIZE, 0), cageMaterial);
  cage.position.y = baseY + gateAltitude;
  root.add(cage);

  const flameMaterial = new THREE.SpriteMaterial({
    map: textures.fire,
    color: PALETTE.beaconFire,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flame = new THREE.Sprite(flameMaterial);
  flame.position.y = baseY + gateAltitude;
  flame.scale.setScalar(CAGE_SIZE * 5);
  root.add(flame);
  beacon.flame = flame;
  beacon.flameMaterial = flameMaterial;

  for (let s = 0; s < SMOKE_COUNT; s++) {
    const material = new THREE.SpriteMaterial({
      map: textures.smoke,
      color: PALETTE.rockDark,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set((rand() - 0.5) * 2.4, baseY + gateAltitude + 1, (rand() - 0.5) * 2.4);
    sprite.scale.setScalar(1.6 + rand() * 1.2);
    root.add(sprite);
    beacon.smoke.push({ sprite, material, phase: rand() });
  }

  const ring = new THREE.Group();
  ring.position.y = ringY;
  ring.rotation.x = RING_TILT;
  root.add(ring);
  beacon.ring = ring;

  const ringShellMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.rockDark });
  const ringShell = new THREE.Mesh(
    new THREE.TorusGeometry(cfg.gateRadius, RING_TUBE, 8, 48),
    ringShellMaterial
  );
  ring.add(ringShell);

  const ringGlowMaterial = new THREE.MeshBasicMaterial({
    color: RING_UNLIT,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ringGlow = new THREE.Mesh(
    new THREE.TorusGeometry(cfg.gateRadius, 1.3, 8, 48),
    ringGlowMaterial
  );
  ring.add(ringGlow);
  beacon.ringGlowMaterial = ringGlowMaterial;

  const lightHeight = gateAltitude * (LIGHT_REACH - 1);
  const lightMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.beaconLight,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lightShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(LIGHT_RADIUS, LIGHT_RADIUS, lightHeight, 10, 1, true),
    lightMaterial
  );
  lightShaft.position.y = baseY + gateAltitude + lightHeight / 2;
  root.add(lightShaft);

  const fireHeight = gateAltitude + 2;
  const fireMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.beaconFire,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fireMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(SHAFT_BASE + 0.8, SHAFT_BASE + 0.8, fireHeight, 8),
    fireMaterial
  );
  fireMesh.position.y = baseY + fireHeight / 2;
  fireMesh.scale.y = 0;
  root.add(fireMesh);
  beacon.lightShaft = lightShaft;
  beacon.lightMaterial = lightMaterial;
  beacon.fireMesh = fireMesh;
  beacon.fireMaterial = fireMaterial;
  beacon.fireHeight = fireHeight;
  beacon.cageMaterial = cageMaterial;

  for (let s = 0; s < SPARK_COUNT; s++) {
    const material = new THREE.SpriteMaterial({
      map: textures.spark,
      color: PALETTE.beaconLight,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(2 + rand() * 1.6);
    root.add(sprite);
    beacon.sparks.push({ sprite, material, active: false });
  }

  return beacon;
}

function lightBeacon(beacon) {
  if (beacon.lit) return;
  beacon.lit = true;
  beacon.fireProgress = 0;
  beacon.sparkTimer = 0;
  beacon.ringGlowMaterial.color.set(RING_LIT);
}

function spawnSparks(beacon) {
  const gateRadius = CONFIG.beacons.gateRadius;
  for (const spark of beacon.sparks) {
    const life = SPARK_LIFE * (0.8 + Math.random() * 0.4);
    spark.active = true;
    spark.life = life;
    spark.time = life;
    spark.angle = Math.random() * Math.PI * 2;
    spark.radius = gateRadius * 0.15 + Math.random() * gateRadius * 0.2;
    spark.speed = 10 + Math.random() * 16;
    spark.rise = 3 + Math.random() * 5;
  }
}

function advanceSparks(beacon, dt) {
  for (const spark of beacon.sparks) {
    if (!spark.active) {
      spark.material.opacity = 0;
      continue;
    }
    spark.time -= dt;
    if (spark.time <= 0) {
      spark.active = false;
      spark.material.opacity = 0;
      continue;
    }
    spark.radius += spark.speed * dt;
    const fade = spark.time / spark.life;
    spark.sprite.position.set(
      beacon.x + Math.cos(spark.angle) * spark.radius,
      beacon.ringY + (spark.life - spark.time) * 0.2 * spark.rise,
      beacon.z + Math.sin(spark.angle) * spark.radius
    );
    spark.material.opacity = fade * 0.9;
  }
}

function updateBeacon(beacon, dt) {
  const b = beacon;
  b.phase += dt;
  b.ring.rotation.y += dt * RING_SPIN;

  if (b.lit) {
    const pulse = 0.5 + 0.5 * Math.sin(b.phase * 4);
    b.ringGlowMaterial.opacity = 0.55 + pulse * 0.45;

    b.flameMaterial.opacity = 0.75 + 0.25 * Math.sin(b.phase * 17);
    b.flame.scale.setScalar(CAGE_SIZE * (4.6 + 0.8 * Math.sin(b.phase * 11)));

    b.fireProgress = Math.min(1, b.fireProgress + dt / FIRE_GROW);
    const eased = 1 - Math.pow(1 - b.fireProgress, 2);
    b.fireMesh.scale.y = Math.max(0.01, eased);
    b.fireMesh.position.y = b.baseY + (b.fireHeight * eased) / 2;
    b.fireMaterial.opacity = eased * 0.5;

    b.lightMaterial.opacity = LIGHT_OPACITY * (0.7 + 0.3 * Math.sin(b.phase * 3.2));
    b.cageMaterial.color.set(CAGE_LIT);
  } else {
    b.ringGlowMaterial.opacity = 0.3 + 0.12 * Math.sin(b.phase * 1.4);
    b.flameMaterial.opacity = 0;
    b.lightMaterial.opacity = 0;
    b.fireMaterial.opacity = 0;
    b.fireMesh.scale.y = 0;
    b.cageMaterial.color.set(PALETTE.rockDark);
  }

  const smokeGain = b.lit ? 0 : 1;
  for (const smoke of b.smoke) {
    const u = (b.phase * SMOKE_RISE + smoke.phase) % 1;
    smoke.sprite.position.y = b.shaftTop + 1 + u * SMOKE_HEIGHT;
    smoke.sprite.position.x = Math.sin(b.phase * 1.5 + smoke.phase * 9) * 0.8;
    smoke.material.opacity = (1 - u) * SMOKE_OPACITY * smokeGain;
  }

  b.sparkTimer -= dt;
  if (b.lit && b.sparkTimer <= 0) {
    b.sparkTimer = SPARK_INTERVAL;
    spawnSparks(b);
  }
  advanceSparks(b, dt);
}

export function createBeacons(scene, rng, terrain) {
  const cfg = CONFIG.beacons;
  const rand = typeof rng === 'function' ? rng : Math.random;
  const group = new THREE.Group();
  const list = [];

  const textures = {
    fire: makeRadialTexture('#ffe9b0', 'rgba(255,90,30,0)'),
    spark: makeRadialTexture('#fff6da', 'rgba(255,150,90,0)'),
    smoke: makeRadialTexture('#160b1e', 'rgba(20,10,25,0)'),
  };

  for (let i = 0; i < cfg.positions.length; i++) {
    const [x, z] = cfg.positions[i];
    const baseY = terrainHeight(terrain, x, z);
    const beacon = buildBeacon(i, x, z, baseY, cfg, textures, rand);
    beacon.ringGlowMaterial = beacon.ringGlowMaterial;
    group.add(beacon.root);
    list.push(beacon);
  }

  function tryLight(glider) {
    const pos = gliderPosition(glider);
    let nearest = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.lit) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      if (horizontalDistance > cfg.gateRadius) continue;
      if (Math.abs(pos.y - b.ringY) > PASS_HEIGHT) continue;
      if (horizontalDistance < bestDistance) {
        bestDistance = horizontalDistance;
        nearest = i;
      }
    }
    if (nearest >= 0) lightBeacon(list[nearest]);
    return nearest;
  }

  function update(dt, glider) {
    for (let i = 0; i < list.length; i++) updateBeacon(list[i], dt);
    return tryLight(glider);
  }

  function reset() {
    for (const b of list) {
      b.lit = false;
      b.fireProgress = 0;
      b.fireMesh.scale.y = 0;
      b.fireMaterial.opacity = 0;
      b.lightMaterial.opacity = 0;
      b.flameMaterial.opacity = 0;
      b.ringGlowMaterial.color.set(RING_UNLIT);
      b.ringGlowMaterial.opacity = 0.35;
      b.cageMaterial.color.set(PALETTE.rockDark);
      for (const smoke of b.smoke) smoke.material.opacity = SMOKE_OPACITY;
      for (const spark of b.sparks) {
        spark.active = false;
        spark.material.opacity = 0;
      }
    }
  }

  function litCount() {
    let count = 0;
    for (let i = 0; i < list.length; i++) if (list[i].lit) count++;
    return count;
  }

  function nextTarget(glider) {
    const pos = gliderPosition(glider);
    const heading = gliderHeading(glider);
    let nearest = null;
    let bestDistance = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.lit) continue;
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      const dy = b.ringY - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = b;
      }
    }
    if (!nearest) return null;
    const dx = nearest.x - pos.x;
    const dz = nearest.z - pos.z;
    const bearing = normalizeAngle(Math.atan2(dx, -dz) - heading);
    return {
      position: { x: nearest.x, y: nearest.ringY, z: nearest.z },
      bearing,
      distance: bestDistance,
    };
  }

  scene.add(group);
  return {
    group,
    list,
    total: list.length,
    litCount,
    update,
    tryLight,
    reset,
    nextTarget,
  };
}