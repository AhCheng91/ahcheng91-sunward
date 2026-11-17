// The flying camera: a smooth chase rig that always writes into the
// PerspectiveCamera it is given, and nothing else. It sits behind and above
// the glider's nose, lags toward the ideal perch, rolls with the wing, widens
// its lens at speed, and keeps out of the dunes. The title shot orbits the
// world middle and looks across the dunes toward the sun.
import { CONFIG } from './config.js';
import { Vector3 } from 'three';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_ROLL_RAD = 6 * DEG; // 6 degrees: the horizon may tilt only this far

// The dunes are lit from this azimuth (see terrain.js and glider.js); the
// title shot faces the sun across them.
const SUN_AZIMUTH_DEG = 118;
const SUN_ELEVATION_DEG = 12;
const LOOK_UP = 2.2;          // gaze sits a little above the wingline
const GROUND_CLEARANCE = 9;   // the lens never sinks into a dune
const FOV_BOOST_DEG = 4;      // extra lens width at full speed
const TITLE_ORBIT_RATE = 0.07; // radians per second, a gentle drift
const TITLE_LOOK_DISTANCE = 400;

export class ChaseCamera {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;

    // Scratch state, allocated once so update() is allocation-free.
    this._fwd = new Vector3();
    this._ideal = new Vector3();
    this._look = new Vector3();
    this._titleTarget = new Vector3(
      Math.cos(SUN_AZIMUTH_DEG * DEG) * Math.cos(SUN_ELEVATION_DEG * DEG),
      Math.sin(SUN_ELEVATION_DEG * DEG),
      Math.sin(SUN_AZIMUTH_DEG * DEG) * Math.cos(SUN_ELEVATION_DEG * DEG),
    ).multiplyScalar(TITLE_LOOK_DISTANCE);
    // Open opposite the sun so the poster starts looking into the glow.
    this._titleAngle = SUN_AZIMUTH_DEG * DEG + Math.PI;
    this._fov = camera.fov;
    this._axis = new Vector3();
    this._up = new Vector3();
  }

  update(dt, glider) {
    const cam = this.camera;
    this._fwd.set(Math.sin(glider.heading), 0, Math.cos(glider.heading));

    // The ideal trailing perch: behind the nose, up a little.
    this._ideal.copy(glider.position).addScaledVector(this._fwd, -CONFIG.camera.distance);
    this._ideal.y += CONFIG.camera.height;

    // Frame-rate independent exponential smoothing; still when the glider is.
    const k = 1 - Math.exp(-CONFIG.camera.lag * dt);
    cam.position.lerp(this._ideal, k);

    // Keep the lens above the ground with a little air under it.
    // Keep the lens clear of the dunes it is flying over, including the one just
    // ahead of it, so a crest never fills the frame.
    const ground = Math.max(
      this.terrain.heightAt(cam.position.x, cam.position.z),
      this.terrain.heightAt(cam.position.x + this._fwd.x * 12, cam.position.z + this._fwd.z * 12),
      this.terrain.heightAt(glider.position.x, glider.position.z),
    );
    if (cam.position.y < ground + GROUND_CLEARANCE) {
      cam.position.y = ground + GROUND_CLEARANCE;
    }

    // Look a little ahead of the nose and slightly up.
    // Look at the glider itself (slightly ahead of the wing) so it sits in frame.
    this._look.copy(glider.position).addScaledVector(this._fwd, Math.min(6, CONFIG.camera.lookAhead * 0.4));
    this._look.y += 1.2;
    // Roll the up vector around our own forward axis so the horizon banks
    // with the wing but never tilts further than MAX_ROLL_RAD.
    this._axis.subVectors(this._look, cam.position).normalize();
    const appliedRoll = clamp(glider.roll * CONFIG.camera.rollFactor, -MAX_ROLL_RAD, MAX_ROLL_RAD);
    this._up.set(0, 1, 0).applyAxisAngle(this._axis, -appliedRoll);
    cam.up.copy(this._up);
    cam.lookAt(this._look);

    // Widen the lens with speed, without recomputing every frame.
    const speedT = Math.max(0, Math.min(1, (glider.speed - CONFIG.glider.minSpeed)
      / (CONFIG.glider.maxSpeed - CONFIG.glider.minSpeed)));
    const fov = CONFIG.view.fov + FOV_BOOST_DEG * speedT;
    if (Math.abs(fov - this._fov) > 0.01) {
      this._fov = fov;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  // A still photographer's orbit: three-quarter view of the glider over the dunes.
  photoOrbit(dt, glider, t) {
    const cam = this.camera;
    const a = 0.55 + Math.sin(t * 0.12) * 0.1;
    const r = 16;
    const behind = glider.heading + Math.PI;
    cam.position.set(
      glider.position.x + Math.sin(behind + a) * r,
      glider.position.y + 6,
      glider.position.z + Math.cos(behind + a) * r,
    );
    const ground = this.terrain.heightAt(cam.position.x, cam.position.z);
    if (cam.position.y < ground + 10) cam.position.y = ground + 10;
    cam.up.set(0, 1, 0);
    cam.lookAt(glider.position.x, glider.position.y + 0.4, glider.position.z);
  }

  titleOrbit(dt) {
    this._titleAngle += TITLE_ORBIT_RATE * Math.max(0, dt);
    const cam = this.camera;
    const radius = CONFIG.camera.titleDistance;
    cam.position.set(
      Math.cos(this._titleAngle) * radius,
      this.terrain.heightAt(0, 0) + CONFIG.camera.titleHeight,
      Math.sin(this._titleAngle) * radius,
    );
    cam.lookAt(this._titleTarget);
  }
}