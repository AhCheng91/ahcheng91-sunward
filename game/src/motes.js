import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const RGBA = (c) => {
  const n = parseInt(c.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

function makeGlowTexture(size = 64, color = PALETTE.mote, core = '#fff7dd') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${RGBA(core)},1)`);
  g.addColorStop(0.22, `rgba(${RGBA(core)},0.85)`);
  g.addColorStop(0.5, `rgba(${RGBA(color)},0.4)`);
  g.addColorStop(1, `rgba(${RGBA(color)},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function rngRange(rng, min, max) {
  return rng.range(min, max);
}

export function createMotes(scene, rng, terrain) {
  const { count, clusters, clusterRadius, pickupRadius } = CONFIG.motes;

  const group = new THREE.Group();
  const texture = makeGlowTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const items = [];
  const extent = CONFIG.world.size * 0.34;

  for (let c = 0; c < clusters; c++) {
    const cx = rngRange(rng, -extent, extent);
    const cz = rngRange(rng, -extent, extent);
    const floorY = terrain.heightAt ? terrain.heightAt(cx, cz) : 0;

    for (let m = 0; m < Math.ceil(count / clusters); m++) {
      const hover = 18 + rng.range(0, 142);
      const hoverY = floorY + hover;
      const orbitR = clusterRadius * rngRange(rng, 0.12, 1.05);
      const orbitA = rng.range(0, Math.PI * 2);
      const jitterR = clusterRadius * 0.5;

      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(rngRange(rng, 4, 9));
      sprite.position.set(cx, hoverY, cz);
      group.add(sprite);

      items.push({
        sprite,
        baseX: cx + Math.cos(orbitA) * jitterR,
        baseZ: cz + Math.sin(orbitA) * jitterR,
        hoverY,
        orbitR,
        orbitA,
        phase: rng.range(0, Math.PI * 2),
        bobAmp: rngRange(rng, 1, 3.2),
        bobRate: rngRange(rng, 0.6, 1.4),
        drift: rngRange(rng, 0.2, 0.55),
        active: true,
      });
    }
  }

  if (items.length > count) items.length = count;

  let time = 0;
  let remaining = items.length;

  function currentPosition(item, out) {
    const orbit = item.orbitA + time * 0.05;
    const x =
      item.baseX + Math.cos(orbit) * item.orbitR + Math.sin(time * item.drift + item.phase) * 1.6;
    const z =
      item.baseZ + Math.sin(orbit) * item.orbitR + Math.cos(time * item.drift * 0.8 + item.phase) * 1.6;
    const y = item.hoverY + Math.sin(time * item.bobRate + item.phase) * item.bobAmp;
    out.set(x, y, z);
  }

  const posHelper = new THREE.Vector3();

  function update(dt, _glider) {
    time += dt;
    for (const item of items) {
      if (!item.active) continue;
      currentPosition(item, posHelper);
      item.sprite.position.copy(posHelper);
    }
  }

  function collect(glider) {
    const gx = glider.position.x;
    const gy = glider.position.y;
    const gz = glider.position.z;
    const r2 = pickupRadius * pickupRadius;
    let taken = 0;
    for (const item of items) {
      if (!item.active) continue;
      currentPosition(item, posHelper);
      const dx = gx - posHelper.x;
      const dy = gy - posHelper.y;
      const dz = gz - posHelper.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        item.active = false;
        item.sprite.visible = false;
        taken++;
      }
    }
    remaining -= taken;
    return taken;
  }

  function reset() {
    time = 0;
    for (const item of items) {
      item.active = true;
      item.sprite.visible = true;
      item.phase = Math.random() * Math.PI * 2;
    }
    remaining = items.length;
  }

  scene.add(group);

  return {
    group,
    items,
    update,
    collect,
    reset,
    remaining,
    total: items.length,
  };
}