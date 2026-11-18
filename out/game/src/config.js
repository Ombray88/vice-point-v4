/**
 * @file config.js
 * @description Configuration and constants for Vice Point 3D.
 * Exports all tuning parameters, color palettes, and keys for the game engine.
 */

export const STEP = 1 / 60;
export const FIELD = { width: 1280, height: 720 };
export const WORLD = { width: 2560, height: 1920 };

export const PLAYER = {
  radius: 10,
  walkSpeed: 170,
  health: 100
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  brake: 600,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  turnRate: 2.6,
  grip: 3.2
};

export const TRAFFIC = {
  count: 14,
  speedMin: 90,
  speedMax: 150
};

export const PEDS = {
  count: 22,
  speedMin: 28,
  speedMax: 55
};

export const POLICE = {
  chaseSpeed: 540,
  ramDamage: 8,
  spawnDistance: 500
};

export const HELI = {
  altitude: 160,
  speed: 320,
  searchRadius: 90
};

export const WANTED = {
  decayDelay: 6,
  decayRate: 0.25,
  max: 5
};

export const SAVE_KEY = 'vice-point-v4.save';
export const BEST_KEY = 'vice-point-v4.best';

export const PALETTE = {
  skyTop: '#2b1a4d',
  skyBottom: '#ff7e3d',
  fog: '#e07840',
  asphalt: '#232733',
  roadLine: '#c9a227',
  sidewalk: '#3a3f4d',
  buildings: ['#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#f3f4f6', '#e5e7eb', '#1f2937'],
  windowsLit: '#ffd166',
  windowsDark: '#2b3040',
  park: '#1f4d2e',
  sand: '#c2a878',
  water: '#14425e',
  player: '#4fc3f7',
  police: '#e5534b',
  policeLightA: '#ff3b30',
  policeLightB: '#3b82f6',
  heli: '#3a3f4d',
  trafficCars: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'],
  peds: ['#fca5a5', '#93c5fd', '#86efac', '#fde047', '#d8b4fe', '#f472b6'],
  hudPanel: 'rgba(10,12,20,0.72)',
  text: '#eef1f5',
  muted: '#8b93a3',
  objective: '#ffd166',
  money: '#7ee787'
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
