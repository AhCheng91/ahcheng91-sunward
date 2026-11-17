// The heads-up display: a thin layer over the DOM in index.html. It caches its
// elements once and only rewrites text, classes or custom properties when a
// value has changed, so the canvas is never touched and nothing is recreated
// per frame.
import { CONFIG } from './config.js';
import { PALETTE } from './config.js';

const TOAST_MS = 2000;   // how long a toast stays up
const AHEAD_LIMIT = 0.6; // bearing (radians) that still reads AHEAD
const SUN_RX = 84;       // horizontal radius of the dusk arc, px
const SUN_RY = 30;       // vertical radius of the dusk arc, px

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Hud {
  constructor(document) {
    this._doc = document;
    this._els = new Map();
    this._texts = new Map();
    this._lastBeacons = null;
    this._lastBeaconsTotal = null;
    this._lastCharges = null;
    this._lastStall = null;
    this._lastNext = null;
    this._lastBar = null;
    this._lastDusk = null;
    this._toastTimer = 0;
  }

  _el(id) {
    let el = this._els.get(id);
    if (el === undefined) {
      el = this._doc.getElementById(id);
      this._els.set(id, el);
    }
    return el;
  }

  _setText(id, text) {
    const el = this._el(id);
    if (!el) return;
    if (this._texts.get(el) === text) return;
    this._texts.set(el, text);
    el.textContent = text;
  }

  _setHidden(id, hidden) {
    const el = this._el(id);
    if (el) el.hidden = hidden;
  }

  _setClass(id, cls, on) {
    const el = this._el(id);
    if (el) el.classList.toggle(cls, on);
  }

  _compassWord(bearing) {
    if (Math.abs(bearing) < AHEAD_LIMIT) return 'AHEAD';
    return bearing > 0 ? 'RIGHT' : 'LEFT';
  }

  _formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return minutes + ':' + String(secs).padStart(2, '0');
  }

  showTitle(visible) {
    this._setClass('screen-title', 'hidden', !visible);
  }

  setHud(visible) {
    this._setClass('hud', 'hidden', !visible);
  }

  setPaused(visible) {
    this._setHidden('pause-screen', !visible);
  }

  update(s) {
    const altitude = s.altitude ?? 0;
    this._setText('hud-altitude', String(Math.round(altitude)));
    this._setText('hud-speed', String(Math.round((s.speed ?? 0) * 3.6)));
    this._setText('hud-motes', String(Math.round(s.motes ?? 0)));
    this._setText('hud-score', Math.round(s.score ?? 0).toLocaleString('en-US'));
    this._setText('hud-best', Math.round(s.best ?? 0).toLocaleString('en-US'));

    // The altitude bar fills from the bottom with the wing height under the ceiling.
    const bar = clamp01(altitude / CONFIG.world.maxAltitude) * 100;
    if (bar !== this._lastBar) {
      this._lastBar = bar;
      const el = this._el('hud-altitude-fill');
      if (el) el.style.height = bar.toFixed(1) + '%';
    }

    // The dusk fraction is the share of daylight still left. The sun marker
    // travels along the shallow arc as the day runs down, and the plate shows
    // the mm:ss remaining.
    const remain = clamp01(s.duskFraction ?? 0);
    if (remain !== this._lastDusk) {
      this._lastDusk = remain;
      this._setText('hud-dusk-time', this._formatTime(remain * CONFIG.dusk.flightSeconds));
      const t = Math.PI * clamp01(1 - remain);
      const sun = this._el('hud-dusk-sun');
      if (sun) {
        sun.style.left = (SUN_RX - SUN_RX * Math.cos(t)).toFixed(1) + 'px';
        sun.style.top = (SUN_RY * Math.sin(t)).toFixed(1) + 'px';
      }
    }

    // Beacon diamonds light up as each gate is hit, with the count beside them.
    const lit = s.beaconsLit ?? 0;
    const total = s.beaconsTotal ?? 0;
    if (lit !== this._lastBeacons || total !== this._lastBeaconsTotal) {
      this._lastBeacons = lit;
      this._lastBeaconsTotal = total;
      const el = this._el('hud-beacons');
      if (el) {
        const diamonds = el.querySelectorAll('.beacon-diamond');
        for (let i = 0; i < diamonds.length; i += 1) {
          diamonds[i].classList.toggle('hit', i < lit);
        }
      }
      this._setText('hud-beacon-count', lit + ' / ' + total);
    }

    // Boost pips go hollow (spent) from the far end when a charge is used.
    const charges = s.boostCharges ?? 0;
    if (charges !== this._lastCharges) {
      this._lastCharges = charges;
      const el = this._el('hud-boost');
      if (el) {
        const pips = el.querySelectorAll('.boost-pip');
        for (let i = 0; i < pips.length; i += 1) {
          pips[i].classList.toggle('spent', i >= charges);
        }
      }
    }

    // STALL shows only while the wing is stalled.
    const stall = !!s.stalled;
    if (stall !== this._lastStall) {
      this._lastStall = stall;
      const el = this._el('hud-stall');
      if (el) el.classList.toggle('show', stall);
    }

    // The next beacon as a compass word plus its distance; when none remain
    // the corner reads ALL BEACONS LIT instead.
    const beacon = s.nextBeacon;
    const nextKey = beacon
      ? this._compassWord(beacon.bearing ?? 0) + ':' + Math.round(beacon.distance ?? 0)
      : null;
    if (nextKey !== this._lastNext) {
      this._lastNext = nextKey;
      const value = this._el('hud-next-value');
      const all = this._el('hud-next-all');
      if (value) value.classList.toggle('hidden', !beacon);
      if (all) all.classList.toggle('hidden', !!beacon);
      if (beacon) {
        this._setText('hud-compass', this._compassWord(beacon.bearing ?? 0));
        this._setText('hud-compass-distance', String(Math.round(beacon.distance ?? 0)));
      }
    }
  }

  toast(text) {
    const el = this._el('hud-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      el.classList.remove('show');
    }, TOAST_MS);
  }

  showResults(r) {
    const screen = this._el('screen-results');
    if (r === null || typeof r !== 'object') {
      if (screen) screen.classList.add('hidden');
      return;
    }
    this._setText('results-verdict', String(r.verdict ?? ''));
    const verdict = this._el('results-verdict');
    if (verdict) verdict.style.color = PALETTE.uiAccent;
    this._setText('results-motes', Math.round(r.motes ?? 0).toLocaleString('en-US'));
    this._setText('results-beacons', String(r.beacons ?? '0'));
    this._setText('results-time', typeof r.time === 'string' ? r.time : this._formatTime(r.time ?? 0));
    this._setText('results-total', Math.round(r.total ?? 0).toLocaleString('en-US'));
    this._setText('results-best', Math.round(r.best ?? 0).toLocaleString('en-US'));
    if (screen) screen.classList.remove('hidden');
  }
}