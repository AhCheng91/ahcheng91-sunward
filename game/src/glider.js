import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { CONFIG, PALETTE } from './config.js';

const DEG = Math.PI / 180;
const SUN_AZIMUTH_RAD = 118 * DEG;
const MAX_BANK = 1.05;
const PITCH_MIN = -1.2;
const PITCH_MAX = 1.0;
const TURN_RATE = 0.7;
const TUCK_PULL = 1.1;
const FLARE_PULL = 1.4;
const DRAG_RATE = 0.4;
const STALL_PITCH = 0.12;
const STALL_EXIT = 0.06;
const STALL_NOSE_DROP = 0.9;
const BUFFET_FREQ = 6.0;
const BUFFET_AMP = 0.5;
const STORM_SINK = 7;
const RAY_SLOW = 22;
const BOUND_PUSH = 0.9;
const TRAIL_CAP = 90;
const TRAIL_FADE = 1.6;
const TRAIL_BRIGHTNESS = 0.42;
const SPARKLE_ON = 3;
const SPARKLE_PERIOD = 6;

// Palette hex strings are sRGB; three wants vertex colours in linear space, so
// convert through Color (which does the transfer the renderer will undo).
const _toneColor = new Color();
function hexToRgb(hex) {
  _toneColor.set(hex);
  return [_toneColor.r, _toneColor.g, _toneColor.b];
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

export class Glider {
  constructor(scene, terrain) {
    this.terrain = terrain;

    this.position = new Vector3();
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this._altitude = 0;
    this.stalled = false;
    this.crashed = false;
    this.boostActive = false;
    this._boostRemain = 0;
    this.boostCharges = CONFIG.boost.charges;
    this._time = 0;

    this._fwd = new Vector3();
    this._lookTarget = new Vector3();
    this._scratchA = new Vector3();
    this._scratchB = new Vector3();
    this._offset = new Vector3();

    this._trailColor = hexToRgb(PALETTE.trail);
    this._trailHead = 0;
    this._trailCount = 0;
    this._trail = [];
    for (let i = 0; i < TRAIL_CAP; i += 1) this._trail.push(new Vector3());

    this.group = this._buildGlider();
    this.trailMesh = this._buildTrail();
    scene.add(this.group);
    scene.add(this.trailMesh);

    this.reset();
  }

  get altitude() {
    return this._altitude;
  }

  get wingGroup() {
    return this.group;
  }

  _buildGlider() {
    const group = new Group();

    const wingPoints = new Float32Array([
      0, 0, 0.55, 0, 0, -0.95,
      4.5, 0.55, -1.15, 4.5, 0.55, -1.55,
      -4.5, 0.55, -1.15, -4.5, 0.55, -1.55,
    ]);
    const wingGeometry = new BufferGeometry();
    wingGeometry.setAttribute('position', new BufferAttribute(wingPoints, 3));
    wingGeometry.setIndex([0, 2, 1, 1, 2, 3, 0, 4, 1, 1, 4, 5]);
    const wing = new Mesh(
      wingGeometry,
      new MeshBasicMaterial({ color: PALETTE.wingTop, side: DoubleSide }),
    );
    group.add(wing);

    const edgePoints = new Float32Array([
      -4.5, 0.55, -1.15, 0, 0, 0.55,
      0, 0, 0.55, 4.5, 0.55, -1.15,
    ]);
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new BufferAttribute(edgePoints, 3));
    const edge = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({ color: PALETTE.wingEdge }),
    );
    group.add(edge);

    const spar = new Mesh(
      new BoxGeometry(8.6, 0.18, 0.24),
      new MeshBasicMaterial({ color: PALETTE.wingFrame }),
    );
    spar.position.set(0, 0.14, -0.2);
    group.add(spar);

    const pod = new Mesh(
      new CapsuleGeometry(0.32, 0.8, 6, 10),
      new MeshBasicMaterial({ color: PALETTE.rockDark }),
    );
    pod.rotation.x = Math.PI / 2;
    pod.position.set(0, 0.5, 0.05);
    group.add(pod);

    group.name = 'glider';
    return group;
  }

  _buildTrail() {
    const positions = new Float32Array(TRAIL_CAP * 2 * 3);
    const colors = new Float32Array(TRAIL_CAP * 2 * 3);
    const indices = new Uint16Array((TRAIL_CAP - 1) * 6);
    for (let i = 0; i < TRAIL_CAP - 1; i += 1) {
      const a = i * 2;
      const m = i * 6;
      indices[m] = a;
      indices[m + 1] = a + 1;
      indices[m + 2] = a + 2;
      indices[m + 3] = a + 2;
      indices[m + 4] = a + 1;
      indices[m + 5] = a + 3;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        vertexColors: true,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.name = 'ribbon-trail';
    return mesh;
  }

  boost() {
    if (this.boostCharges > 0 && !this.boostActive) {
      this.boostCharges -= 1;
      this.boostActive = true;
      this._boostRemain = CONFIG.boost.duration;
    }
  }

  addBoostCharge() {
    if (this.boostCharges < CONFIG.boost.charges) this.boostCharges += 1;
  }

  reset(seed) {
    const groundH = this.terrain.heightAt(0, 0);
    this.position.set(0, groundH + CONFIG.glider.startAltitude, 0);
    this.heading = SUN_AZIMUTH_RAD - 0.55; // side light: the sun sits right of the nose
    this.pitch = 0;
    this.roll = 0;
    this.speed = CONFIG.glider.startSpeed;
    this._altitude = CONFIG.glider.startAltitude;
    this.stalled = false;
    this.crashed = false;
    this.boostActive = false;
    this._boostRemain = 0;
    this.boostCharges = CONFIG.boost.charges;
    this._time = 0;
    this._trailHead = 0;
    this._trailCount = 0;

    this._fwd.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    this._lookTarget.copy(this.position).add(this._fwd);
    this.group.position.copy(this.position);
    this.group.up.set(0, 1, 0);
    this.group.lookAt(this._lookTarget);
    this._pushTrail();
    this._rebuildTrail();
    return this;
  }

  update(dt, input, world) {
    if (this.crashed) return;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    input = input || {};

    const G = CONFIG.glider;
    this._time += dt;

    if (input.boost) this.boost();

    const steerX = input.steerX || 0;
    const steerY = input.steerY || 0;

    if (this.boostActive) {
      this._boostRemain -= dt;
      if (this._boostRemain <= 0) this.boostActive = false;
    }

    this.roll += (steerX * MAX_BANK - this.roll) * (1 - Math.exp(-G.bankRate * dt));
    const turn = Math.sin(this.roll) * (this.speed / G.startSpeed) * TURN_RATE;
    this.heading += turn * dt;

    let pitchIn = steerY;
    if (input.tuck) pitchIn -= TUCK_PULL;
    if (input.flare) pitchIn += FLARE_PULL;
    this.pitch = clamp(this.pitch + pitchIn * G.pitchRate * dt, PITCH_MIN, PITCH_MAX);

    if (this.stalled) {
      this.pitch -= STALL_NOSE_DROP * dt;
      this._altitude -= G.sinkRate * dt;
      if (this.pitch < STALL_EXIT) this.stalled = false;
    } else if (this.speed < G.stallSpeed && this.pitch > STALL_PITCH) {
      this.stalled = true;
    }

    const sinP = Math.sin(this.pitch);
    const cosP = Math.cos(this.pitch);
    const fwdX = Math.cos(this.heading);
    const fwdZ = Math.sin(this.heading);
    const horiz = this.speed * cosP;
    const px = this.position.x;
    const pz = this.position.z;
    this.position.x = px + fwdX * horiz * dt;
    this.position.z = pz + fwdZ * horiz * dt;

    let cruise = G.startSpeed;
    if (this.boostActive) cruise += CONFIG.boost.extraSpeed;
    this.speed += (cruise - this.speed) * (1 - Math.exp(-DRAG_RATE * dt));
    this.speed += -G.gravity * sinP * dt;
    this.speed = clamp(this.speed, G.minSpeed, G.maxSpeed);

    let vertical = this.speed * sinP;
    const liftSample = world.thermals.liftAt(this.position);
    let lift = 0;
    if (typeof liftSample === 'number') lift = liftSample;
    else if (liftSample && typeof liftSample.lift === 'number') lift = liftSample.lift;
    vertical += lift * CONFIG.thermals.lift;
    this._altitude += vertical * dt;

    const hazard = world.hazards ? world.hazards.sample(this.position) : null;
    const storm = hazard && typeof hazard === 'object' ? (hazard.storm || 0) : 0;
    const ray = hazard && typeof hazard === 'object' ? !!hazard.ray : false;
    if (storm > 0) {
      this.pitch += Math.sin(BUFFET_FREQ * this._time + px * 0.012) * BUFFET_AMP * storm * dt;
      this.roll += Math.cos(BUFFET_FREQ * 1.4 * this._time + pz * 0.02) * BUFFET_AMP * 0.7 * storm * dt;
      this._altitude -= STORM_SINK * storm * dt;
    }
    if (ray) this.speed = Math.max(G.minSpeed, this.speed - RAY_SLOW * dt);

    if (world.bounds) {
      const half = world.bounds.half;
      if (this.position.x > half) this.position.x -= (this.position.x - half) * BOUND_PUSH * dt;
      else if (this.position.x < -half) this.position.x += (-half - this.position.x) * BOUND_PUSH * dt;
      if (this.position.z > half) this.position.z -= (this.position.z - half) * BOUND_PUSH * dt;
      else if (this.position.z < -half) this.position.z += (-half - this.position.z) * BOUND_PUSH * dt;
    }
    if (this._altitude > CONFIG.world.maxAltitude) this._altitude = CONFIG.world.maxAltitude;
    if (this._altitude < 0) this._altitude = 0;

    const groundH = this.terrain.heightAt(this.position.x, this.position.z);
    const rockHit = this.terrain.isRock
      ? this.terrain.isRock(this.position.x, this.position.z, groundH + this._altitude)
      : false;
    if (this._altitude <= 0 || rockHit) {
      this.crashed = true;
      this.speed = 0;
    }
    this.position.y = groundH + this._altitude;

    this._fwd.set(fwdX * cosP, sinP, fwdZ * cosP);
    this._lookTarget.copy(this.position).add(this._fwd);
    this.group.position.copy(this.position);
    this.group.up.set(0, 1, 0);
    this.group.lookAt(this._lookTarget);
    this.group.rotateZ(this.roll);

    this._pushTrail();
    this._rebuildTrail();
  }

  _pushTrail() {
    if (this._trailCount < TRAIL_CAP) {
      this._trail[(this._trailHead + this._trailCount) % TRAIL_CAP].copy(this.position);
      this._trailCount += 1;
    } else {
      this._trail[this._trailHead].copy(this.position);
      this._trailHead = (this._trailHead + 1) % TRAIL_CAP;
    }
  }

  _rebuildTrail() {
    const geometry = this.trailMesh.geometry;
    const count = this._trailCount;
    if (count < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const cap = TRAIL_CAP;
    const head = this._trailHead;
    const boost = this.boostActive;
    const maxWidth = boost ? 1.5 : 1.1;
    const gain = TRAIL_BRIGHTNESS * (boost ? 1.9 : 1.0);
    const tc = this._trailColor;

    for (let k = 0; k < count; k += 1) {
      const i = (head + k) % cap;
      const j = k < count - 1 ? (head + k + 1) % cap : i;
      const p = this._trail[i];
      this._scratchA.copy(this._trail[j]).sub(p);

      let ox = this._scratchA.z;
      let oz = -this._scratchA.x;
      let len = Math.sqrt(ox * ox + oz * oz);
      if (len < 1e-4) {
        ox = 1;
        oz = 0;
        len = 1;
      }
      ox /= len;
      oz /= len;

      const age = (count - 1 - k) / (count - 1);
      let width = maxWidth * (0.16 + 0.84 * age);
      let fade = Math.pow(age, TRAIL_FADE) * gain;
      if (boost && (k % SPARKLE_PERIOD) < SPARKLE_ON) {
        width *= 0.12;
        fade *= 1.9;
      }

      this._offset.set(ox * width, 0, oz * width);
      const m = k * 2;
      this._scratchB.copy(p).sub(this._offset);
      positions[m * 3] = this._scratchB.x;
      positions[m * 3 + 1] = this._scratchB.y;
      positions[m * 3 + 2] = this._scratchB.z;
      this._scratchB.copy(p).add(this._offset);
      positions[m * 3 + 3] = this._scratchB.x;
      positions[m * 3 + 4] = this._scratchB.y;
      positions[m * 3 + 5] = this._scratchB.z;
      colors[m * 3] = tc[0] * fade;
      colors[m * 3 + 1] = tc[1] * fade;
      colors[m * 3 + 2] = tc[2] * fade;
      colors[m * 3 + 3] = tc[0] * fade;
      colors[m * 3 + 4] = tc[1] * fade;
      colors[m * 3 + 5] = tc[2] * fade;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  }
}