import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const RGBA = (c) => {
  const n = parseInt(c.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

function makeDustTexture(size = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${RGBA('#ffe7b8')},0.95)`);
  g.addColorStop(0.45, `rgba(${RGBA(PALETTE.haze)},0.5)`);
  g.addColorStop(1, `rgba(${RGBA(PALETTE.haze)},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function rngRange(rng, min, max) {
  return rng.range(min, max);
}

function smoothstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function placeColumns(rng, count, extent, minSeparation) {
  const placed = [];
  const sample = () => [rngRange(rng, -extent, extent), rngRange(rng, -extent, extent)];
  for (let i = 0; i < count; i++) {
    let cx = 0;
    let cz = 0;
    for (let attempt = 0; attempt < 400; attempt++) {
      const [x, z] = sample();
      let ok = true;
      for (const [px, pz] of placed) {
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz < minSeparation * minSeparation) {
          ok = false;
          break;
        }
      }
      if (ok) {
        cx = x;
        cz = z;
        break;
      }
    }
    placed.push([cx, cz]);
  }
  return placed;
}

function buildHazeColumn(cx, cz, base, top, radius) {
  const span = top - base;
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.CylinderGeometry(radius, radius * 1.06, span, 14, 1, true);
  const positionAttr = geometry.getAttribute('position');
  const colors = new Float32Array(positionAttr.count * 3);
  const baseColor = new THREE.Color(1.0, 0.55, 0.28);
  const topColor = new THREE.Color(0.32, 0.1, 0.04);
  const scratch = new THREE.Color();
  const half = span / 2;
  for (let i = 0; i < positionAttr.count; i++) {
    const fy = (positionAttr.getY(i) + half) / span;
    scratch.copy(topColor).lerp(baseColor, 1 - fy);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cx, base + half, cz);
  return mesh;
}

export function createThermals(scene, rng, terrain) {
  const { count, radius, dustPerColumn } = CONFIG.thermals;
  const group = new THREE.Group();

  const extent = CONFIG.world.size * 0.32;
  const span = 400;
  const center = placeColumns(rng, count, extent, 380);

  const columns = [];
  const columnData = {
    cx: new Float32Array(count),
    cz: new Float32Array(count),
    base: new Float32Array(count),
    top: new Float32Array(count),
  };

  for (let c = 0; c < count; c++) {
    const [cx, cz] = center[c];
    const ground = terrain.heightAt ? terrain.heightAt(cx, cz) : 0;
    const base = ground + 24;
    const top = base + span;
    columnData.cx[c] = cx;
    columnData.cz[c] = cz;
    columnData.base[c] = base;
    columnData.top[c] = top;
    columns.push({ x: cx, z: cz, base, top, radius });
    // The haze column is left out: an additive cylinder this size reads as a
    // translucent tent in front of the lens. The rising dust carries the column.
    void buildHazeColumn;
  }

  const total = count * dustPerColumn;
  const dustTexture = makeDustTexture();
  const dustGeometry = new THREE.SphereGeometry(1, 6, 5);
  const dustMaterial = new THREE.MeshBasicMaterial({
    map: dustTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(dustGeometry, dustMaterial, total);

  const cx = new Float32Array(total);
  const cz = new Float32Array(total);
  const radiusA = new Float32Array(total);
  const angle = new Float32Array(total);
  const speed = new Float32Array(total);
  const baseY = new Float32Array(total);
  const phase = new Float32Array(total);
  const accum = new Float32Array(total);
  const scale = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const c = i % count;
    const colX = columnData.cx[c];
    const colZ = columnData.cz[c];
    const colBase = columnData.base[c];
    const colTop = columnData.top[c];
    const rad = radius * (0.08 + 0.92 * rng.range(0, 1));
    const speedFactor = 1 - 0.6 * (rad / radius);
    cx[i] = colX;
    cz[i] = colZ;
    radiusA[i] = rad;
    angle[i] = rng.range(0, Math.PI * 2);
    speed[i] = 14 + 38 * speedFactor;
    baseY[i] = colBase;
    phase[i] = rng.range(0, 1);
    accum[i] = 0;
    scale[i] = 1.5 + rng.range(0, 1) * 2.2;
  }

  const dummy = new THREE.Object3D();

  function update(dt, elapsed) {
    const swirl = 0.12 * elapsed;
    for (let i = 0; i < total; i++) {
      accum[i] += dt * speed[i];
      const spanH = columnData.top[i % count] - columnData.base[i % count];
      const f = (phase[i] + accum[i] / spanH) % 1;
      const y = baseY[i] + spanH * f;
      const a = angle[i] + swirl;
      const x = cx[i] + Math.cos(a) * radiusA[i];
      const z = cz[i] + Math.sin(a) * radiusA[i];
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function liftAt(position) {
    const x = position.x;
    const y = position.y;
    const z = position.z;
    const r2 = radius * radius;
    let best = 0;
    for (let c = 0; c < count; c++) {
      const dx = x - columnData.cx[c];
      const dz = z - columnData.cz[c];
      const dist2 = dx * dx + dz * dz;
      if (dist2 > r2) continue;
      const base = columnData.base[c];
      const top = columnData.top[c];
      if (y < base || y > top) continue;
      const dist = Math.sqrt(dist2);
      const radial = 1 - smoothstep(radius * 0.55, radius, dist);
      if (radial <= 0) continue;
      const t = (y - base) / (top - base);
      const vertical = 1 - smoothstep(0.82, 1.0, t);
      const strength = radial * vertical;
      if (strength > best) best = strength;
    }
    return best;
  }

  group.add(mesh);
  scene.add(group);

  return {
    group,
    columns,
    update,
    liftAt,
  };
}