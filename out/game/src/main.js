/**
 * @file main.js
 * @description Game entry point and loop for Vice Point 3D.
 * Coordinates input, world simulation, rendering, and game state transitions.
 */

import { createWorld, EVENT_OVER, EVENT_BUSTED, EVENT_MISSION, EVENT_WANTED } from './world.js';
import { createRandom } from './random.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createInput } from './input.js';
import { STEP, BEST_KEY, SAVE_KEY, CAR } from './config.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const input = createInput(canvas);
input.attach();

const urlParams = new URLSearchParams(window.location.search);
const seedParam = urlParams.get('seed');
const seed = seedParam !== null ? parseInt(seedParam, 10) : Math.floor(Math.random() * 1000000);
const rng = createRandom(seed);
const world = createWorld(rng);
const renderer = createRenderer(canvas);

// Check for screenshot mode
const shotParam = urlParams.get('shot');
if (shotParam) {
  const shot = stageShot(shotParam, world);
  const shotScreen = (shot && shot.screen) || SCREEN_PLAY;
  const shotBest = (shot && typeof shot.best === 'number') ? shot.best : 0;
  renderer.draw(world.state, shotScreen, shotBest);
  renderer.draw(world.state, shotScreen, shotBest);
  window.__shotReady = true;
} else {
  const audio = createAudio();
  // Main game loop
  let currentScreen = SCREEN_TITLE;
  let lastTime = performance.now();
  let accumulator = 0;
  let bestMoney = 0;
  let lastCarSpeed = 0;

  try {
    const savedBest = localStorage.getItem(BEST_KEY);
    if (savedBest) bestMoney = parseInt(savedBest, 10) || 0;
  } catch (e) {
    // LocalStorage might be restricted
  }

  // Handle visibility change for pausing
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === SCREEN_PLAY) {
      currentScreen = SCREEN_PAUSED;
      audio.setPaused(true);
    }
  });

  function loop(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += dt;

    const inp = input.read();
    const mouse = input.mouse;

    // Pause toggle
    if (inp.pause) {
      if (currentScreen === SCREEN_PLAY) {
        currentScreen = SCREEN_PAUSED;
        audio.setPaused(true);
      } else if (currentScreen === SCREEN_PAUSED) {
        currentScreen = SCREEN_PLAY;
        audio.setPaused(false);
      }
    }

    // Screen state logic
    if (currentScreen === SCREEN_TITLE) {
      // Attract mode simulation
      world.step(STEP, inp, true);
      if (inp.enter || inp.handbrake || mouse.clicked || inp.my !== 0 || inp.mx !== 0 || inp.radio || inp.mute) {
        audio.resume();
        world.reset();
        currentScreen = SCREEN_PLAY;
        audio.setPaused(false);
      }
    } else if (currentScreen === SCREEN_PAUSED) {
      if (inp.handbrake || inp.enter) {
        currentScreen = SCREEN_PLAY;
        audio.setPaused(false);
      }
    } else if (currentScreen === SCREEN_OVER || currentScreen === SCREEN_WIN) {
      if (inp.enter || inp.handbrake || mouse.clicked) {
        audio.resume();
        world.reset();
        world.state.money = 0;
        currentScreen = SCREEN_TITLE;
        audio.setPaused(true);
      }
    } else if (currentScreen === SCREEN_PLAY) {
      audio.setPaused(false);
      // Fixed timestep updates
      while (accumulator >= STEP) {
        accumulator -= STEP;

        const events = world.step(STEP, inp, false);

        if (events & EVENT_BUSTED || world.state.busted) {
          world.state.busted = true;
          currentScreen = SCREEN_OVER;
          audio.setPaused(true);
          updateBest(world.state.money);
        } else if (events & EVENT_OVER || world.state.over) {
          currentScreen = SCREEN_OVER;
          audio.setPaused(true);
          updateBest(world.state.money);
        } else if (world.state.win) {
          currentScreen = SCREEN_WIN;
          audio.setPaused(true);
          updateBest(world.state.money);
        } else {
          if (events & EVENT_MISSION) {
            audio.complete();
            try {
              localStorage.setItem(SAVE_KEY, String(world.state.money || 0));
            } catch (e) {}
          }
        }
      }

      audio.tick(dt);
      audio.setSpeed(world.state.player.onFoot ? 0 : world.state.player.speed, CAR.maxSpeed);
      audio.setWanted(world.state.wanted);

      if (!world.state.player.onFoot) {
        const curSpeed = world.state.player.speed;
        if (lastCarSpeed - curSpeed > 250) {
          audio.crash();
        }
        lastCarSpeed = curSpeed;
      } else {
        lastCarSpeed = 0;
      }

      if (inp.radio) {
        const nextIdx = (audio.currentStation().index + 1) % 3;
        audio.setStation(nextIdx);
        world.state.radio = audio.currentStation();
      }

      if (inp.mute) {
        audio.setMuted(!audio.isMuted());
      }
    }

    renderer.draw(world.state, currentScreen, bestMoney);
    requestAnimationFrame(loop);
  }

  function updateBest(money) {
    if (money > bestMoney) {
      bestMoney = money;
      try {
        localStorage.setItem(BEST_KEY, String(bestMoney));
      } catch (e) {}
    }
  }

  requestAnimationFrame(loop);
}
