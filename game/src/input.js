// The pointer and keyboard, observed and reported, nothing about game rules.
// Client code polls getState() each frame and draws one-shot signals with the
// consume*() readers; the game decides what every signal means.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Input {
  constructor(element, view = window) {
    this.element = element;
    this.view = view;

    // Persistent aim: the pointer's offset from the window centre in -1..1.
    this.steerX = 0;
    this.steerY = 0;
    this.pointerX = 0;
    this.pointerY = 0;
    this.locked = false;

    this.keys = new Set();

    // One-shot signal queues, set on the triggering event, cleared on consume.
    this._clickQueue = 0;
    this._boostQueue = 0;
    this._pauseQueue = 0;
    this._restartQueue = 0;

    this.onPointerMove = (e) => {
      if (this._lockedNow()) {
        // Pointer lock hands us deltas; steer follows the movement this frame.
        this.pointerX = clamp(this.pointerX + e.movementX, 0, this.view.innerWidth);
        this.pointerY = clamp(this.pointerY + e.movementY, 0, this.view.innerHeight);
      } else {
        this.pointerX = e.clientX;
        this.pointerY = e.clientY;
      }
    };

    this.onPointerDown = (e) => {
      if (e.button === 0) {
        this._clickQueue += 1;
      }
    };

    this.onKeyDown = (e) => {
      this.keys.add(e.code);
      if (!e.repeat) {
        if (e.code === 'Space') this._boostQueue += 1;
        if (e.code === 'Escape') this._pauseQueue += 1;
        if (e.code === 'KeyR') this._restartQueue += 1;
      }
    };

    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._bound = [
      this.onPointerMove,
      this.onPointerDown,
      this.onKeyDown,
      this.onKeyUp,
    ];

    this.view.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.view.addEventListener('pointerdown', this.onPointerDown);
    this.view.addEventListener('keydown', this.onKeyDown);
    this.view.addEventListener('keyup', this.onKeyUp);
  }

  // Has the browser granted Pointer Lock on our element?
  _lockedNow() {
    return this.view.document && this.view.document.pointerLockElement === this.element;
  }

  // Recompute steering from the pointer position. Whether the pointer is
  // locked or free, steering is the pointer's offset from the window centre:
  // it persists while the pointer rests there, so a mouse-aimed glider flies
  // toward where you point until you move.
  update() {
    this.locked = this._lockedNow();
    const cx = this.view.innerWidth / 2;
    const cy = this.view.innerHeight / 2;
    this.steerX = clamp((this.pointerX - cx) / cx, -1, 1);
    this.steerY = clamp((this.pointerY - cy) / cy, -1, 1);
  }

  getState() {
    return {
      steerX: this.steerX,
      steerY: this.steerY,
      tuck: this.keys.has('KeyW') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      flare: this.keys.has('KeyS'),
      boost: this._boostQueue > 0,
      started: this._clickQueue > 0,
      paused: this._pauseQueue > 0,
      clicked: this._clickQueue > 0,
      pointerX: this.pointerX,
      pointerY: this.pointerY,
    };
  }

  consumeStart() {
    if (this._clickQueue > 0) {
      this._clickQueue = 0;
      return true;
    }
    return false;
  }

  consumeBoost() {
    if (this._boostQueue > 0) {
      this._boostQueue = 0;
      return true;
    }
    return false;
  }

  consumePause() {
    if (this._pauseQueue > 0) {
      this._pauseQueue = 0;
      return true;
    }
    return false;
  }

  consumeRestart() {
    if (this._restartQueue > 0) {
      this._restartQueue = 0;
      return true;
    }
    return false;
  }

  dispose() {
    this.view.removeEventListener('pointermove', this.onPointerMove);
    this.view.removeEventListener('pointerdown', this.onPointerDown);
    this.view.removeEventListener('keydown', this.onKeyDown);
    this.view.removeEventListener('keyup', this.onKeyUp);
  }
}