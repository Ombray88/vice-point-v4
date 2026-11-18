import { STEP, POLICE } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN } from './render.js';

function normalised(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const stuckState = { timeLow: 0, reversing: 0 };

function pilot(state) {
  const player = state.player;
  if (player.onFoot) {
    let bestCar = null;
    let minDist = Infinity;
    for (const car of state.cars) {
      if (car.isPolice || Math.abs(car.speed) >= 10) continue;
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      if (dist < minDist) {
        minDist = dist;
        bestCar = car;
      }
    }
    if (!bestCar) return { mx: 0, my: 0, enter: false, action: false, handbrake: false };
    const desired = Math.atan2(bestCar.y - player.y, bestCar.x - player.x);
    const diff = normalised(desired - player.angle);
    return {
      mx: clamp(diff * 2, -1, 1),
      my: 1,
      enter: minDist <= 40,
      action: false,
      handbrake: false
    };
  } else {
    const car = state.cars.find(c => c.id === player.carId) || state.cars[0];
    if (!car) return { mx: 0, my: 0, enter: false, action: false, handbrake: false };

    if (Math.abs(car.speed) < 20) {
      stuckState.timeLow += STEP;
    } else {
      stuckState.timeLow = 0;
      stuckState.reversing = 0;
    }

    if (stuckState.reversing > 0) {
      stuckState.reversing -= STEP;
      const target = state.mission.target;
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      const diff = normalised(desired - car.angle);
      return {
        mx: clamp(-diff * 2, -1, 1),
        my: -1,
        enter: false,
        action: false,
        handbrake: false
      };
    }

    if (stuckState.timeLow >= 2.0) {
      stuckState.reversing = 1.0;
      stuckState.timeLow = 0;
    }

    // Check nearest police car within 140 units
    let nearestCop = null;
    let minCopDist = Infinity;
    for (const p of state.police) {
      const pc = state.cars.find(c => c.id === p.carId);
      if (pc) {
        const d = Math.hypot(pc.x - car.x, pc.y - car.y);
        if (d < minCopDist) {
          minCopDist = d;
          nearestCop = pc;
        }
      }
    }

    let desired = 0;
    if (nearestCop && minCopDist < 140) {
      desired = Math.atan2(car.y - nearestCop.y, car.x - nearestCop.x);
    } else {
      const target = state.mission.target;
      desired = Math.atan2(target.y - car.y, target.x - car.x);
    }

    const diff = normalised(desired - car.angle);
    return {
      mx: clamp(diff * 2, -1, 1),
      my: 1,
      enter: false,
      action: false,
      handbrake: false
    };
  }
}

export function stageShot(name, world) {
  world.reset();
  stuckState.timeLow = 0;
  stuckState.reversing = 0;

  if (name === 'start') {
    for (let t = 0; t < 5.0; t += STEP) {
      world.step(STEP, { mx: 0, my: 0, enter: false, action: false, handbrake: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'end') {
    world.state.win = true;
    world.state.money = 22500;
    world.state.mission.index = 7;
    return { screen: SCREEN_WIN, best: 22500 };
  }

  if (name === 'play') {
    const car = world.state.cars.find(c => !c.isPolice && Math.abs(c.speed) < 10);
    if (car) {
      world.state.player.onFoot = false;
      world.state.player.carId = car.id;
      world.state.player.x = car.x;
      world.state.player.y = car.y;
      world.state.player.angle = car.angle;
      world.state.player.speed = 0;
      car.stolen = true;
      car.driver = 'player';
    }

    for (let t = 0; t < 8.0; t += STEP) {
      world.step(STEP, pilot(world.state), false);
    }

    world.state.wantedHeat = 3;
    world.state.wanted = 3;
    const player = world.state.player;
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1 + 0.5;
      const px = player.x + Math.cos(angle) * 500;
      const py = player.y + Math.sin(angle) * 500;
      const copId = 'police_shot_' + i;
      world.state.cars.push({
        id: copId,
        x: px,
        y: py,
        angle: 0,
        speed: 0,
        color: '#e5534b',
        isPolice: true,
        stolen: false,
        driver: 'cop'
      });
      world.state.police.push({ carId: copId });
    }
    world.state.heli.active = true;
    world.state.heli.x = player.x;
    world.state.heli.y = player.y;
    world.state.heli.alt = 160;

    for (let t = 0; t < 18.0; t += STEP) {
      world.step(STEP, pilot(world.state), false);
    }

    return { screen: SCREEN_PLAY, best: world.state.money };
  }

  if (name === 'chase') {
    const car = world.state.cars.find(c => !c.isPolice && Math.abs(c.speed) < 10);
    if (car) {
      world.state.player.onFoot = false;
      world.state.player.carId = car.id;
      world.state.player.x = car.x;
      world.state.player.y = car.y;
      world.state.player.angle = car.angle;
      world.state.player.speed = 0;
      car.stolen = true;
      car.driver = 'player';
    }

    for (let t = 0; t < 4.0; t += STEP) {
      world.step(STEP, pilot(world.state), false);
    }

    world.state.wantedHeat = 4;
    world.state.wanted = 4;
    const player = world.state.player;
    for (let i = 0; i < 4; i++) {
      const angle = i * 1.5 + 0.2;
      const px = player.x + Math.cos(angle) * 450;
      const py = player.y + Math.sin(angle) * 450;
      const copId = 'police_shot_' + i;
      world.state.cars.push({
        id: copId,
        x: px,
        y: py,
        angle: 0,
        speed: 0,
        color: '#e5534b',
        isPolice: true,
        stolen: false,
        driver: 'cop'
      });
      world.state.police.push({ carId: copId });
    }
    world.state.heli.active = true;
    world.state.heli.x = player.x;
    world.state.heli.y = player.y;
    world.state.heli.alt = 160;

    for (let t = 0; t < 12.0; t += STEP) {
      world.step(STEP, pilot(world.state), false);
    }

    return { screen: SCREEN_PLAY, best: world.state.money };
  }

  for (let t = 0; t < 5.0; t += STEP) {
    world.step(STEP, { mx: 0, my: 0, enter: false, action: false, handbrake: false }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
