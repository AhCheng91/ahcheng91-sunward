// The dusk sky: the gradient dome, the low sun and its warm halo, the horizon
// haze band and the distant cloud sea. Everything follows the camera so it
// sits at fixed distances.
import { CONFIG } from './config.js';
import { PALETTE } from './config.js';
import { makeRng } from './rng.js';
import {
  BackSide,
  CanvasTexture,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  CylinderGeometry,
  AdditiveBlending,
  NormalBlending,
  Vector3,
} from 'three';

// Parse a #rrggbb hex string into sRGB components in 0..1. The shader writes
// these values straight to the framebuffer in output colour space.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Linear interpolation between two [r,g,b] triplets.
function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// A Vector3 that carries one [r,g,b] uniform value.
function rgbUniform(rgb) {
  return new Vector3(rgb[0], rgb[1], rgb[2]);
}

const DOME_VERT = `
  varying vec3 vViewDir;
  void main() {
    vViewDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Vertical colour bands by height with film-like soft edges. The horizon keeps
// a soft cream veil, a 2-3 degree crown that eases up into the coral band and
// down into the haze with no hard line across the frame; there is no bloom in
// the shader, the halo is drawn as geometry so the sun's disc stays the
// brightest thing.
const DOME_FRAG = `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uCream;
  uniform vec3 uBelow;
  varying vec3 vViewDir;
  void main() {
    vec3 dir = normalize(vViewDir);
    float e = dir.y;
    vec3 col;
    if (e < 0.0) {
      col = mix(uBelow, uHorizon, smoothstep(-0.16, 0.0, e));
    } else {
      col = uHorizon;
      col = mix(col, uMid, smoothstep(0.06, 0.34, e));
      col = mix(col, uZenith, smoothstep(0.34, 1.0, e));
    }
    // A soft cream veil centred on the horizon (sigma ~1.2 degrees), so it
    // fades upward into the coral band and downward into the haze.
    float veil = exp(-(e * e) / 0.0008);
    col = mix(col, uCream, veil * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Draw a soft radial glow into a canvas: a bright core, a warm halo, then out.
function drawRadialCanvas(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col, a] of stops) g.addColorStop(t, col + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : ''));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// Draw one soft billow: a warm-lit top, a cooler base, soft rounded edges.
function drawCloudBlob(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, PALETTE.cloudTop);
  g.addColorStop(0.45, PALETTE.cloudBase);
  g.addColorStop(1, PALETTE.duneMid);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Mask to a soft radial blob.
  const mask = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size * 0.45, size * 0.52);
  mask.addColorStop(0, 'rgba(255,255,255,0.95)');
  mask.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  return c;
}

const DEG = Math.PI / 180;
const DOME_RADIUS = 4500;
const SUN_HALF_DEG = 5;         // disc radius in degrees of arc
const SUN_DISTANCE = DOME_RADIUS - 40; // just in front of the dome, never occluded

export function createSky(scene, options = {}) {
  const rng = options.rng ?? makeRng(20240621);
  // 25 degrees to the right of the opening view's forward line.
  const azimuthDeg = options.azimuthDeg ?? 143;
  let altitudeDeg = options.sunAltitudeDeg ?? 9;

  const sunDir = new Vector3();
  const group = new Group();
  group.name = 'sky';

  // --- the dome -------------------------------------------------------------
  const horizonBase = hexToRgb(PALETTE.skyHorizon);
  const horizonDeep = hexToRgb('#d95b40');
  const dome = new Mesh(
    new SphereGeometry(DOME_RADIUS, 48, 24),
    new ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: rgbUniform(hexToRgb(PALETTE.skyZenith)) },
        uMid: { value: rgbUniform(hexToRgb(PALETTE.skyMid)) },
        uHorizon: { value: rgbUniform(horizonBase) },
        uCream: { value: rgbUniform(hexToRgb(PALETTE.skyGlow)) },
        uBelow: { value: rgbUniform(hexToRgb('#241237')) },
      },
    }),
  );
  dome.name = 'sky-dome';
  dome.renderOrder = -10;
  group.add(dome);

  // --- the sun: a crisp filled disc, a warm ring at 1.4x, a wide glow at 3x --
  // No plane is wider than three disc radii, and nothing white hazes the disc.
  const sun = new Group();
  sun.name = 'sun';

  const discRadius = Math.tan(SUN_HALF_DEG * DEG) * SUN_DISTANCE;

  const disc = new Mesh(
    new CircleGeometry(1, 64),
    new MeshBasicMaterial({
      color: PALETTE.sunDisc,
      fog: false,
      toneMapped: false,
      transparent: true,
      depthWrite: false,
    }),
  );
  disc.name = 'sun-disc';
  disc.scale.setScalar(discRadius);

  const ringTex = new CanvasTexture(drawRadialCanvas(256, [
    [0.0, PALETTE.sunHalo, 0],
    [0.55, PALETTE.sunHalo, 0],
    [0.72, PALETTE.sunHalo, 0.12],
    [0.88, PALETTE.sunHalo, 0.30],
    [0.97, PALETTE.sunHalo, 0.30],
    [1.0, PALETTE.sunHalo, 0],
  ]));
  const ring = new Sprite(new SpriteMaterial({
    map: ringTex,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  ring.name = 'sun-ring';
  ring.scale.set(2.8 * discRadius, 2.8 * discRadius, 1);

  const glowTex = new CanvasTexture(drawRadialCanvas(256, [
    [0.0, PALETTE.sunGlow, 0.16],
    [0.35, PALETTE.sunGlow, 0.11],
    [0.7, PALETTE.sunGlow, 0.05],
    [1.0, PALETTE.sunGlow, 0],
  ]));
  const glow = new Sprite(new SpriteMaterial({
    map: glowTex,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  glow.name = 'sun-glow';
  glow.scale.set(6 * discRadius, 6 * discRadius, 1);

  glow.renderOrder = 20;
  ring.renderOrder = 21;
  disc.renderOrder = 22;

  sun.add(glow);
  sun.add(ring);
  sun.add(disc);
  group.add(sun);

  // --- the haze at the horizon --------------------------------------------------
  // A wide, faint warm band: the soft haze the crest band melts into below.
  const hazeWarm = new Mesh(
    new CylinderGeometry(4320, 4320, 160, 64, 1, true),
    new MeshBasicMaterial({
      color: PALETTE.skyGlow,
      transparent: true,
      opacity: 0.05,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  hazeWarm.name = 'haze-warm';
  hazeWarm.position.y = 40;
  group.add(hazeWarm);

  // --- the cloud sea -----------------------------------------------------------
  // Soft billows scattered on a ring far out, low down, never over the play area.
  const cloudTex = new CanvasTexture(drawCloudBlob(128));
  const cloudCount = options.cloudCount ?? 42;
  const clouds = [];
  const cloudGroup = new Group();
  cloudGroup.name = 'cloud-sea';
  for (let i = 0; i < cloudCount; i += 1) {
    const angle = (i / cloudCount) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const radius = rng.range(1500, 3600);
    const y = rng.range(-150, 40); // low, on the horizon
    const size = rng.range(140, 460);
    const mat = new SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: rng.range(0.35, 0.85),
      depthWrite: false,
      fog: true,
      blending: NormalBlending,
    });
    const sp = new Sprite(mat);
    sp.scale.set(size, size * rng.range(0.4, 0.7), 1);
    sp.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const c = { sprite: sp, angle, radius, y, drift: rng.range(-0.002, 0.002) };
    cloudGroup.add(sp);
    clouds.push(c);
  }
  group.add(cloudGroup);

  // --- helpers -------------------------------------------------------------------
  function placeSun() {
    const rad = altitudeDeg * DEG;
    const az = azimuthDeg * DEG;
    const horiz = Math.cos(rad);
    sunDir.set(Math.cos(az) * horiz, Math.sin(rad), Math.sin(az) * horiz);
    sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
  }

  function setSunAltitude(deg) {
    altitudeDeg = Math.max(-30, Math.min(45, deg));
    placeSun();
    // Warm the horizon toward a deeper red as the sun drops.
    const t = Math.max(0, Math.min(1, (altitudeDeg - 2) / 8));
    const h = 1 - t;
    const warm = lerpRgb(horizonBase, horizonDeep, h);
    dome.material.uniforms.uHorizon.value.set(warm[0], warm[1], warm[2]);
    hazeWarm.material.opacity = 0.05 + h * 0.05;
  }

  placeSun();
  setSunAltitude(altitudeDeg);

  // --- the per-frame hook ----------------------------------------------------------
  function update(dt, state) {
    const camPos = state.camera.position;
    group.position.copy(camPos);
    // The sun rides the dome around the camera.
    sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
    disc.lookAt(camPos);
    for (const c of clouds) {
      c.angle += c.drift * dt * 60;
      c.sprite.position.set(Math.cos(c.angle) * c.radius, c.y, Math.sin(c.angle) * c.radius);
    }
  }

  scene.add(group);
  return { group, update, setSunAltitude, sun };
}