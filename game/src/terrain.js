// The dune field: a wind-carved heightfield built as one grid, the rock spires
// that guard it, and the ground the glider flies against. Light is baked into
// vertex colours, so nothing needs a light source.
import { CONFIG } from './config.js';
import { PALETTE } from './config.js';
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

// smoothstep: 0 below a, 1 above b, eased in between.
function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Palette hex strings are sRGB; three wants vertex colours in linear space, so
// convert through Color (which does the transfer the renderer will undo).
const _toneColor = new Color();
function hexToRgb(hex) {
  _toneColor.set(hex);
  return [_toneColor.r, _toneColor.g, _toneColor.b];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Deterministic ridge set for one world. Each band is a sine of a rotated
// coordinate, sharpened with a power so the crest is a razor line with a long
// lee slope, wobbling gently along its own length.
function makeDuneProfiles(rng, options) {
  const sunAzimuthDeg = options.sunAzimuthDeg ?? 118;
  const ridgeBasis = sunAzimuthDeg * DEG + Math.PI / 2; // crests run across the sun
  const half = (options.worldSize ?? CONFIG.world.size) / 2;

  const bands = [];
  const count = options.ridgeBands ?? 5;
  for (let i = 0; i < count; i += 1) {
    bands.push({
      phi: ridgeBasis + rng.range(-0.11, 0.11),
      wavelength: rng.range(170, 330),
      amplitude: rng.range(18, 40),
      sharpness: rng.range(2.2, 5.0),
      phase: rng.range(0, TWO_PI),
      meanderAmp: rng.range(0, 70),
      alongPeriod: rng.range(240, 560),
      alongPhase: rng.range(0, TWO_PI),
      envFx: rng.range(0.0024, 0.0052),
      envFz: rng.range(0.0024, 0.0052),
      envPhase: rng.range(0, TWO_PI),
    });
  }

  return {
    bands,
    half,
    rippleAmp: rng.range(1.2, 2.6),
    ripFx: rng.range(0.045, 0.09),
    ripFz: rng.range(0.045, 0.09),
    ripPhase: rng.range(0, TWO_PI),
    rimStart: 0.80,
    rimHeight: 46,
  };
}

// The analytic field the whole terrain is built from. The mesh is sampled from
// it and heightAt() reads the same grid, so collision matches the picture.
function makeDuneHeightAt(profiles) {
  const { bands, half, rippleAmp, ripFx, ripFz, ripPhase, rimStart, rimHeight } = profiles;
  return function duneHeightAt(x, z) {
    let h = 0;
    for (let i = 0; i < bands.length; i += 1) {
      const b = bands[i];
      const px = -x * Math.sin(b.phi) + z * Math.cos(b.phi);
      const ax = x * Math.cos(b.phi) + z * Math.sin(b.phi);
      const p = px + b.meanderAmp * Math.sin(ax * TWO_PI / b.alongPeriod + b.alongPhase);
      const u = p * TWO_PI / b.wavelength + b.phase;
      const wave = Math.pow((Math.sin(u) + 1) * 0.5, b.sharpness);
      const env = 0.6 + 0.4 * Math.sin(x * b.envFx + z * b.envFz + b.envPhase);
      h += wave * b.amplitude * env;
    }
    // Low, fine ripple so the surface never reads flat.
    h += rippleAmp * Math.sin(x * ripFx + ripPhase) * Math.sin(z * ripFz);
    // A gentle bowl that rises into a rim toward the world's edge.
    const d = Math.hypot(x, z) / half;
    const u = Math.min(1, Math.max(0, d - rimStart) / (1 - rimStart));
    h += rimHeight * u * u;
    return h;
  };
}

function createRockGeometry(rng, sunAzimuthDeg, sunAltitudeDeg, baseYaw, radius, height) {
  const az = sunAzimuthDeg * DEG;
  const el = sunAltitudeDeg * DEG;
  const sunHorizX = Math.cos(az) * Math.cos(el);
  const sunHorizZ = Math.sin(az) * Math.cos(el);
  const cosY = Math.cos(baseYaw);
  const sinY = Math.sin(baseYaw);

  const dark = hexToRgb(PALETTE.rockDark);
  const lit = hexToRgb('#6d4058'); // warm plum where the sun hits the rock

  const geo = new ConeGeometry(radius, height, 6, 3, false);
  const positions = geo.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const lx = positions.getX(i);
    const lz = positions.getZ(i);
    const dirX = lx * cosY - lz * sinY;
    const dirZ = lx * sinY + lz * cosY;
    let facing = (Math.abs(dirX) < 0.001 && Math.abs(dirZ) < 0.001) ? 1 : 0;
    if (facing === 0) facing = Math.max(0, (dirX * sunHorizX + dirZ * sunHorizZ) / Math.hypot(dirX, dirZ));
    const light = smooth(-0.25, 0.55, facing);
    const jitter = 0.9 + rng.next() * 0.2;
    const c = mixRgb(dark, lit, light * 0.85);
    colors[i * 3] = c[0] * jitter;
    colors[i * 3 + 1] = c[1] * jitter;
    colors[i * 3 + 2] = c[2] * jitter;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}

export function createTerrain(scene, rng, options = {}) {
  const size = options.worldSize ?? CONFIG.world.size;
  const half = size / 2;
  const segments = options.gridSegments ?? CONFIG.world.gridSegments;
  const sunAzimuthDeg = options.sunAzimuthDeg ?? 118;
  const sunAltitudeDeg = options.sunAltitudeDeg ?? 11;
  const az = sunAzimuthDeg * DEG;
  // Stylised sun-facing value: a dune reads by the horizontal heading of its
  // surface normal against the sun's horizontal azimuth, nothing vertical.
  const sunHorizX = Math.cos(az);
  const sunHorizZ = Math.sin(az);

  // The field must stay readable out to the mid-distance dunes; the entry
  // point pins a far denser haze, so set the aerial depth this field was built
  // for before anything fogged is drawn.
  const fogDensity = options.fogDensity ?? CONFIG.world.fogDensity;
  if (scene.fog) scene.fog.density = fogDensity;

  const profiles = makeDuneProfiles(rng, { ...options, worldSize: size });
  const sample = makeDuneHeightAt(profiles);

  // --- the heightfield grid --------------------------------------------------
  const n = segments + 1;
  const cell = size / segments;
  const heights = new Float32Array(n * n);
  for (let i = 0; i <= segments; i += 1) {
    const z = -half + i * cell;
    for (let j = 0; j <= segments; j += 1) {
      const x = -half + j * cell;
      heights[i * n + j] = sample(x, z);
    }
  }

  // --- build geometry and bake light into vertex colours ----------------------
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const indices = new Array(segments * segments * 6);

  const plumCol = hexToRgb(PALETTE.dunePlum);
  const midCol = hexToRgb(PALETTE.duneTerracotta);
  const sandCol = hexToRgb(PALETTE.duneSand);
  const crestCol = hexToRgb(PALETTE.duneCrest);

  for (let i = 0; i <= segments; i += 1) {
    for (let j = 0; j <= segments; j += 1) {
      const k = i * n + j;
      const x = -half + j * cell;
      const z = -half + i * cell;
      positions[k * 3] = x;
      positions[k * 3 + 1] = heights[k];
      positions[k * 3 + 2] = z;

      // Slope from grid neighbours; the normal is flattened onto the horizontal
      // so the light is a broad sun-facing value, never a 3D dot product.
      const zl = heights[Math.min(segments, i + 1) * n + j] - heights[Math.max(0, i - 1) * n + j];
      const xl = heights[i * n + Math.min(segments, j + 1)] - heights[i * n + Math.max(0, j - 1)];
      const nx = -xl;
      const nz = -zl;
      const horizLen = Math.sqrt(nx * nx + nz * nz);

      // The slope's horizontal facing against the sun's horizontal azimuth, in
      // -1..1: the far side of a ridge reads -1, a sun-facing face +1, flat 0.
      let facing = 0; // flat ground carries no horizontal heading
      if (horizLen > 1e-6) facing = (nx * sunHorizX + nz * sunHorizZ) / horizLen;
      // Broad stylised tone: 0.10 far side of a ridge, 1.00 sun side, 0.55 flat.
      const tone = 0.55 + 0.45 * facing;

      // Three flat tones divided by narrow (0.05 wide) transitions, and a thin
      // blade of crest light only where the face steps fully into the sun.
      let c = mixRgb(plumCol, midCol, smooth(0.42 - 0.025, 0.42 + 0.025, tone));
      c = mixRgb(c, sandCol, smooth(0.68 - 0.025, 0.68 + 0.025, tone));
      c = mixRgb(c, crestCol, smooth(0.93, 0.945, tone));
      const jitter = 0.95 + rng.next() * 0.1;
      colors[k * 3] = c[0] * jitter;
      colors[k * 3 + 1] = c[1] * jitter;
      colors[k * 3 + 2] = c[2] * jitter;

      // Two triangles per cell, wound to face up.
      if (i < segments && j < segments) {
        const a = i * n + j;
        const b = (i + 1) * n + j;
        const c2 = i * n + j + 1;
        const d = (i + 1) * n + j + 1;
        const m = (i * segments + j) * 6;
        indices[m] = a; indices[m + 1] = c2; indices[m + 2] = b;
        indices[m + 3] = b; indices[m + 4] = c2; indices[m + 5] = d;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new MeshBasicMaterial({ vertexColors: true, fog: true });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.name = 'dune-field';

  // --- ground queries ----------------------------------------------------------
  function heightAt(x, z) {
    const cx = Math.max(-half, Math.min(half, x));
    const cz = Math.max(-half, Math.min(half, z));
    const ux = (cx + half) / cell;
    const uz = (cz + half) / cell;
    const i = Math.max(0, Math.min(segments - 1, Math.floor(uz)));
    const j = Math.max(0, Math.min(segments - 1, Math.floor(ux)));
    const fx = ux - Math.floor(ux);
    const fz = uz - Math.floor(uz);
    const h00 = heights[i * n + j];
    const h10 = heights[i * n + j + 1];
    const h01 = heights[(i + 1) * n + j];
    const h11 = heights[(i + 1) * n + j + 1];
    const a = h00 + (h10 - h00) * fx;
    const b = h01 + (h11 - h01) * fx;
    return a + (b - a) * fz;
  }

  function normalAt(x, z) {
    const e = 3;
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    const n2 = new Vector3(-hx, 2 * e, -hz).normalize();
    return n2;
  }

  // --- the rock spires -----------------------------------------------------------
  const group = new Group();
  group.name = 'terrain';
  const spires = [];
  const keepOut = options.spireKeepOut ?? 320;
  const spireCount = options.spireCount ?? 10;
  for (let s = 0; s < spireCount; s += 1) {
    let sx = 0, sz = 0, placed = false;
    for (let tries = 0; tries < 60 && !placed; tries += 1) {
      sx = rng.range(-half * 0.88, half * 0.88);
      sz = rng.range(-half * 0.88, half * 0.88);
      if (Math.hypot(sx, sz) < keepOut) continue;
      let clear = true;
      for (const p of spires) {
        if (Math.hypot(sx - p.x, sz - p.z) < 120) { clear = false; break; }
      }
      if (clear) placed = true;
    }
    if (!placed) continue;
    const radius = rng.range(11, 26);
    const height = rng.range(80, 190);
    const baseY = heightAt(sx, sz);
    const mesh = new Mesh(
      createRockGeometry(rng, sunAzimuthDeg, sunAltitudeDeg, rng.range(0, TWO_PI), radius, height),
      new MeshBasicMaterial({ vertexColors: true, fog: true }),
    );
    mesh.position.set(sx, baseY + height / 2, sz);
    mesh.name = 'rock-spire';
    group.add(mesh);
    spires.push({ x: sx, z: sz, radius, baseY, topY: baseY + height, mesh });
  }

  function isRock(x, z, altitude) {
    for (const p of spires) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz <= p.radius * p.radius && altitude < p.topY) return true;
    }
    return false;
  }

  group.add(terrainMesh);
  scene.add(group);

  const bounds = { half };
  return {
    group,
    heightAt,
    normalAt,
    isRock,
    bounds,
    update() {},
  };
}