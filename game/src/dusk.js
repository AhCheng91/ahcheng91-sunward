import { CONFIG } from './config.js';

const SUN_NONLINEARITY = 1.45;

export class Dusk {
  constructor() {
    this._total = CONFIG.dusk.flightSeconds;
    this._left = this._total;
    this._busy = false;
  }

  update(dt) {
    if (this._busy || this.ended) return;
    this._left = Math.max(0, this._left - dt);
  }

  addSeconds(n) {
    if (this.ended) return;
    this._left += n;
  }

  setBusy(busy) {
    this._busy = !!busy;
  }

  reset() {
    this._left = this._total;
    this._busy = false;
  }

  get ended() {
    return this._left <= 0;
  }

  get secondsLeft() {
    return this._left;
  }

  get fraction() {
    if (this.ended) return 0;
    return this._left / this._total;
  }

  get sunAltitudeDeg() {
    const t = Math.pow(1 - this.fraction, SUN_NONLINEARITY);
    return CONFIG.dusk.startDeg + (CONFIG.dusk.endDeg - CONFIG.dusk.startDeg) * t;
  }
}