const NOISE_SECONDS = 2;
const MASTER_LEVEL = 0.9;
const WIND_SILENT_GAIN = 0.045;
const WIND_FULL_GAIN = 0.2;
const WIND_FILTER_STILL_HZ = 320;
const WIND_FILTER_FULL_HZ = 1500;
const PAD_LEVEL = 0.05;
const PAD_VOICES = [55, 82.4069, 110, 164.8138];
const PAD_FILTER_HZ = 520;
const PAD_LFO_HZ = 0.05;
const CHIME_BASE_HZ = 523.251;
const CHIME_PEAK = 0.16;
const CHIME_SHINE_PEAK = 0.05;
const CHORD_VOICES = [174.614, 220, 261.626];
const CHORD_PEAK = 0.12;
const CHORD_SHINE_PEAK = 0.04;
const WHOOSH_PEAK = 0.2;
const THUD_PEAK = 0.24;
const THUD_NOISE_PEAK = 0.14;

function makeNoiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this._muted = false;
    this._starting = false;
  }

  start() {
    if (this._starting || (this.ctx && this.master)) return;
    this._starting = true;
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();

      const master = ctx.createGain();
      master.gain.value = this._muted ? 0 : MASTER_LEVEL;
      master.connect(ctx.destination);

      const noise = makeNoiseBuffer(ctx);

      const windSource = ctx.createBufferSource();
      windSource.buffer = noise;
      windSource.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = WIND_FILTER_STILL_HZ;
      windFilter.Q.value = 0.4;
      const windGain = ctx.createGain();
      windGain.gain.value = WIND_SILENT_GAIN;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();

      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = PAD_FILTER_HZ;
      const padGain = ctx.createGain();
      padGain.gain.value = PAD_LEVEL;
      padFilter.connect(padGain);
      padGain.connect(master);
      const padOscillators = [];
      for (const frequency of PAD_VOICES) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        osc.detune.value = (Math.random() - 0.5) * 8;
        osc.connect(padFilter);
        osc.start();
        padOscillators.push(osc);
      }
      const padLfo = ctx.createOscillator();
      padLfo.type = 'sine';
      padLfo.frequency.value = PAD_LFO_HZ;
      const padLfoGain = ctx.createGain();
      padLfoGain.gain.value = PAD_LEVEL * 0.4;
      padLfo.connect(padLfoGain);
      padLfoGain.connect(padGain.gain);
      padLfo.start();

      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
      this.windFilter = windFilter;
      this.windGain = windGain;
      this.padGain = padGain;
      this.ambientSources = [{ stop: () => windSource.stop() }, padLfo, ...padOscillators];
      if (ctx.state === 'suspended') {
        const resumed = ctx.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
    } catch (error) {
      this.ctx = null;
      this.master = null;
      this.noise = null;
    } finally {
      this._starting = false;
    }
  }

  _ok() {
    return !!(this.ctx && this.master);
  }

  _note(frequency, peak, attack, decay, t) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    osc.detune.value = Math.random() * 4;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.1);
  }

  setWind(speed01) {
    if (!this._ok()) return;
    const speed = Math.min(1, Math.max(0, +speed01 || 0));
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(
      WIND_SILENT_GAIN + speed * (WIND_FULL_GAIN - WIND_SILENT_GAIN),
      t,
      0.35,
    );
    this.windFilter.frequency.setTargetAtTime(
      WIND_FILTER_STILL_HZ + speed * (WIND_FILTER_FULL_HZ - WIND_FILTER_STILL_HZ),
      t,
      0.35,
    );
  }

  chime(step) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const frequency = CHIME_BASE_HZ * Math.pow(2, step * 2 / 12);
    this._note(frequency, CHIME_PEAK, 0.008, 0.5, t);
    this._note(frequency * 2.76, CHIME_SHINE_PEAK, 0.008, 0.42, t);
  }

  chord() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    for (const frequency of CHORD_VOICES) {
      this._note(frequency, CHORD_PEAK, 0.08, 1.1, t);
    }
    this._note(CHORD_VOICES[0] * 4, CHORD_SHINE_PEAK, 0.08, 1.1, t);
  }

  whoosh() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1800, t + 0.28);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(WHOOSH_PEAK, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + 0.5);
  }

  thud() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(THUD_PEAK, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.65);

    const thudNoise = this.ctx.createBufferSource();
    thudNoise.buffer = this.noise;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(420, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(THUD_NOISE_PEAK, t + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    thudNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    thudNoise.start(t);
    thudNoise.stop(t + 0.3);
  }

  setMuted(muted) {
    this._muted = !!muted;
    if (this.master) {
      const t = this.ctx ? this.ctx.currentTime : 0;
      this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER_LEVEL, t, 0.05);
    }
  }

  get muted() {
    return this._muted;
  }

  suspend() {
    if (!this._ok()) return;
    try {
      const suspended = this.ctx.suspend();
      if (suspended && typeof suspended.catch === 'function') suspended.catch(() => {});
    } catch (error) {
      // fail silently
    }
  }

  resume() {
    if (!this._ok()) return;
    try {
      const resumed = this.ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    } catch (error) {
      // fail silently
    }
  }

  dispose() {
    try {
      if (this.ctx) this.ctx.close();
    } catch (error) {
      // fail silently
    }
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.ambientSources = null;
  }
}