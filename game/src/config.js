export const CONFIG = {
  view: {
    fov: 62,
    near: 1,
    far: 6000,
  },

  world: {
    size: 2400,
    gridSegments: 160,
    maxAltitude: 900,
    fogDensity: 0.00045,
  },

  glider: {
    startAltitude: 130,
    startSpeed: 55,
    minSpeed: 20,
    maxSpeed: 150,
    gravity: 9.8,
    pitchRate: 1.2,
    bankRate: 1.6,
    stallSpeed: 34,
    sinkRate: 6,
  },

  camera: {
    distance: 15,
    height: 3.6,
    lag: 4.5,
    lookAhead: 14,
    rollFactor: 0.35,
    titleDistance: 90,
    titleHeight: 26,
  },

  motes: {
    count: 96,
    clusters: 14,
    clusterRadius: 26,
    pickupRadius: 7,
    perBoostRefill: 10,
  },

  thermals: {
    count: 6,
    radius: 62,
    lift: 26,
    dustPerColumn: 54,
  },

  beacons: {
    positions: [
      [-560, 120],
      [320, -430],
      [560, 440],
    ],
    gateRadius: 34,
    gateAltitude: 70,
    timeBonus: 25,
  },

  hazards: {
    storms: 5,
    stormRadius: 72,
    rayFlocks: 4,
    raysPerFlocks: 5,
  },

  dusk: {
    flightSeconds: 165,
    startDeg: 12,
    endDeg: -4,
  },

  boost: {
    charges: 3,
    duration: 1.6,
    extraSpeed: 40,
  },

  score: {
    perMote: 10,
    perBeacon: 500,
    perSecondLeft: 5,
  },
};

export const PALETTE = {
  skyZenith: '#140a26',
  skyMid: '#5e2a4d',
  skyHorizon: '#ff9a5c',
  skyGlow: '#ffe2b4',
  sunCore: '#fff0c6',
  sunHalo: '#ffb066',
  sunGlow: '#ff9a5c',
  sunDisc: '#fff6dd',
  haze: '#ff9a5c',
  dunePlum: '#35213f',
  duneTerracotta: '#8c4b46',
  duneSand: '#d99a63',
  duneMid: '#8f4a5a',
  duneCrest: '#ffd0a0',
  rockDark: '#241535',
  cloudTop: '#ffe9c8',
  cloudBase: '#ffb98a',
  wingTop: '#f6e7c8',
  wingEdge: '#ff8a4c',
  wingFrame: '#2a1b33',
  trail: '#ffd98a',
  mote: '#ffd98a',
  beaconFire: '#ff8a4c',
  beaconLight: '#fff0c6',
  storm: '#2a1233',
  uiText: '#f8e9cd',
  uiPanel: 'rgba(18,10,26,0.55)',
  uiAccent: '#ffd98a',
  uiDim: 'rgba(248,233,205,0.55)',
};