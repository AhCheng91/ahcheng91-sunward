// makeRng(seed) returns a deterministic generator for one world.
// Under the hood it is Mulberry32: a 32-bit state integer stepped with an
// LCG and mixed with a 16-round xorshift, squeezing the whole period of
// 2^32 out of a single number. It is tiny, order-independent and cheap.
export function makeRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Uniform integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}