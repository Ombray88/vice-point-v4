/**
 * @file world.js
 * @description World simulation, city generation, vehicle physics, pedestrians, traffic AI, police, helicopter, and missions for Vice Point 3D.
 * 
 * Exports:
 *   - EVENT_OVER = 1
 *   - EVENT_BUSTED = 2
 *   - EVENT_MISSION = 4
 *   - EVENT_WANTED = 8
 *   - createWorld(random) -> world object with reset(), step(dt, input, attract), and state property.
 */

import { WORLD, PLAYER, CAR, TRAFFIC, PEDS, POLICE, HELI, WANTED, PALETTE } from './config.js';

export const EVENT_OVER = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_WANTED = 8;

const MISSIONS = [
  {
    id: 0,
    title: 'Hotwire',
    brief: 'Steal any car parked in the plaza.',
    target: { kind: 'car', x: WORLD.width / 2, y: WORLD.height / 2 + 100, label: 'Parked Car' },
    reward: 1000,
    timeLimit: 120
  },
  {
    id: 1,
    title: 'Courier',
    brief: 'Drive the package to the port warehouse.',
    target: { kind: 'place', x: WORLD.width - 200, y: WORLD.height / 2, label: 'Port Warehouse' },
    reward: 2500,
    timeLimit: 75
  },
  {
    id: 2,
    title: 'Getaway',
    brief: 'Attract 3 stars of wanted heat and survive for 25 seconds.',
    target: { kind: 'evade', x: WORLD.width / 2, y: WORLD.height / 2, label: 'Survive 3 Stars' },
    reward: 4000,
    timeLimit: 60
  },
  {
    id: 3,
    title: 'Collection',
    brief: 'Collect all 3 cash drops across the district.',
    target: { kind: 'collect', x: WORLD.width / 3, y: WORLD.height / 3, label: 'Cash Drop' },
    reward: 5000,
    timeLimit: 90
  },
  {
    id: 4,
    title: 'The Big Score',
    brief: 'Rob the bank downtown, then escape to the safehouse.',
    target: { kind: 'place', x: WORLD.width / 2 - 150, y: WORLD.height / 2 - 100, label: 'Downtown Bank' },
    reward: 10000,
    timeLimit: 120
  },
  {
    id: 5,
    title: 'Air Support',
    brief: 'Lose the police helicopter inside the parking structure.',
    target: { kind: 'escape', x: WORLD.width / 2 + 200, y: WORLD.height / 2 + 200, label: 'Parking Garage' },
    reward: 15000,
    timeLimit: 90
  },
  {
    id: 6,
    title: 'Kingpin',
    brief: 'Pick up Mara Voss at the plaza and drive to the mansion.',
    target: { kind: 'pickup', x: WORLD.width / 2, y: WORLD.height / 2 + 50, label: 'Mara Voss' },
    reward: 30000,
    timeLimit: 180
  }
];

export function createWorld(random) {
  let state = {};
  let nextCarId = 1;
  let lastEnter = false;
  let lastAction = false;
  let missionStage = 0; // 0: go to target, 1: secondary stage (e.g. escape)
  let cashDrops = [];
  let prevWanted = 0;

  function reset() {
    missionStage = 0;
    nextCarId = 1;

    // Generate city grid
    const vRoads = [];
    for (let x = 160; x < WORLD.width - 160; x += 320) vRoads.push(x);
    const hRoads = [];
    for (let y = 160; y < WORLD.height - 300; y += 280) hRoads.push(y);

    const buildings = [];
    const parkY = hRoads[1] || 440;
    const parkX = vRoads[1] || 480;

    // Build city blocks
    for (let i = 0; i < vRoads.length - 1; i++) {
      for (let j = 0; j < hRoads.length - 1; j++) {
        const rx = vRoads[i] + 32;
        const ry = hRoads[j] + 32;
        const rw = 320 - 64;
        const rh = 280 - 64;

        // Check if park block
        if (i === 1 && j === 1) {
          // Park
        } else {
          // 1 to 4 buildings per block
          const bW = rw / 2 - 10;
          const bH = rh / 2 - 10;
          for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 2; dy++) {
              const bx = rx + dx * (bW + 20) + bW / 2;
              const by = ry + dy * (bH + 20) + bH / 2;
              const height = 40 + Math.floor(random() * 160);
              const color = PALETTE.buildings[Math.floor(random() * PALETTE.buildings.length)];
              const isPort = (i >= vRoads.length - 2 && j >= hRoads.length - 2);
              buildings.push({
                x: bx,
                y: by,
                w: bW - 10,
                h: bH - 10,
                height: isPort ? 60 : height,
                color: isPort ? '#64748b' : color,
                roof: isPort ? '#334155' : PALETTE.windowsDark
              });
            }
          }
        }
      }
    }

    const beachY = WORLD.height - 200;
    const waterY = WORLD.height - 100;

    // Cars (Parked + Traffic)
    const cars = [];
    // 3 Parked cars near spawn
    const spawnX = WORLD.width / 2;
    const spawnY = WORLD.height / 2 + 100;
    for (let k = 0; k < 3; k++) {
      cars.push({
        id: nextCarId++,
        x: spawnX + (k - 1) * 60,
        y: spawnY + 80,
        angle: 0,
        speed: 0,
        color: PALETTE.trafficCars[Math.floor(random() * PALETTE.trafficCars.length)],
        isPolice: false,
        stolen: false,
        driver: false
      });
    }

    // Traffic cars
    for (let k = 0; k < TRAFFIC.count; k++) {
      const roadX = vRoads[Math.floor(random() * vRoads.length)];
      const roadY = hRoads[Math.floor(random() * hRoads.length)];
      cars.push({
        id: nextCarId++,
        x: roadX + (random() > 0.5 ? 16 : -16),
        y: roadY + (random() - 0.5) * 200,
        angle: random() > 0.5 ? 0 : Math.PI,
        speed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
        color: PALETTE.trafficCars[Math.floor(random() * PALETTE.trafficCars.length)],
        isPolice: false,
        stolen: false,
        driver: true
      });
    }

    // Pedestrians
    const peds = [];
    for (let k = 0; k < PEDS.count; k++) {
      const roadX = vRoads[Math.floor(random() * vRoads.length)];
      const roadY = hRoads[Math.floor(random() * hRoads.length)];
      peds.push({
        x: roadX + 40,
        y: roadY + (random() - 0.5) * 200,
        angle: random() * Math.PI * 2,
        speed: PEDS.speedMin + random() * (PEDS.speedMax - PEDS.speedMin),
        color: PALETTE.peds[Math.floor(random() * PALETTE.peds.length)],
        flee: false
      });
    }

    cashDrops = [
      { x: vRoads[0] + 100, y: hRoads[0] + 100, taken: false, collected: false },
      { x: vRoads[2] + 100, y: hRoads[1] + 100, taken: false, collected: false },
      { x: vRoads[1] + 100, y: hRoads[2] + 100, taken: false, collected: false }
    ];

    const shops = [
      { kind: 'paint', x: vRoads[1] + 32, y: hRoads[2] + 32, label: 'Spray & Go', lastUsed: 0 },
      { kind: 'safehouse', x: vRoads[0] + 32, y: hRoads[0] + 32, label: 'Safehouse', lastUsed: 0 },
      { kind: 'garage', x: vRoads[vRoads.length - 1] + 32, y: hRoads[hRoads.length - 1] + 32, label: 'Garage', lastUsed: 0 }
    ];

    const currentMission = MISSIONS[0];

    state = {
      time: 0,
      score: 0,
      money: 500,
      health: PLAYER.health,
      wanted: 0,
      wantedHeat: 0,
      player: {
        x: spawnX,
        y: spawnY,
        angle: 0,
        speed: 0,
        onFoot: true,
        carId: null
      },
      cars,
      peds,
      police: [],
      heli: { active: false, x: spawnX, y: spawnY, angle: 0, alt: HELI.altitude },
      buildings,
      roads: { vertical: vRoads, horizontal: hRoads },
      parks: [{ x: parkX, y: parkY, w: 260, h: 220 }],
      beach: { y: beachY },
      water: { y: waterY },
      shops,
      cashDrops,
      mission: {
        index: 0,
        stage: 0,
        target: { ...currentMission.target },
        timer: currentMission.timeLimit,
        text: currentMission.title + ': ' + currentMission.brief
      },
      camera: { x: spawnX, y: spawnY },
      message: 'Welcome to Vice Point 3D. Press E to enter/steal cars.',
      messageTimer: 5,
      busted: false,
      over: false,
      win: false
    };
  }

  reset();

  function step(dt, input, attract) {
    if (state.over || state.busted || state.win) return 0;

    let events = 0;
    state.time += dt;

    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    // Attract mode behavior
    if (attract) {
      state.camera.x += 40 * dt;
      if (state.camera.x > WORLD.width - 200) state.camera.x = 200;
      state.camera.y = WORLD.height / 2;
      // Step traffic & peds lightly
      updateTrafficAndPeds(dt, true);
      return 0;
    }

    // Handle Input Edges
    const enterPressed = input.enter && !lastEnter;
    const actionPressed = input.action && !lastAction;
    lastEnter = input.enter;
    lastAction = input.action;

    // Player Movement & Physics
    const p = state.player;
    if (p.onFoot) {
      // On foot movement
      const moveSpeed = PLAYER.walkSpeed;
      if (input.mx !== 0 || input.my !== 0) {
        p.angle = Math.atan2(input.my, input.mx);
        const nx = p.x + input.mx * moveSpeed * dt;
        const ny = p.y + input.my * moveSpeed * dt;
        if (!checkBuildingCollision(nx, ny, PLAYER.radius)) {
          p.x = nx;
          p.y = ny;
        }
      }

      // Enter / Steal Car
      if (enterPressed) {
        let nearestCar = null;
        let minDist = 46;
        for (const car of state.cars) {
          const dist = Math.hypot(car.x - p.x, car.y - p.y);
          if (dist < minDist) {
            minDist = dist;
            nearestCar = car;
          }
        }
        if (nearestCar) {
          p.onFoot = false;
          p.carId = nearestCar.id;
          nearestCar.stolen = true;
          nearestCar.driver = true;
          state.wantedHeat += 1;
          state.message = 'Car stolen! Police alerted.';
          state.messageTimer = 4;
          events |= EVENT_WANTED;
        }
      }

      // Punch action
      if (actionPressed) {
        // Punch nearest ped or cop
        for (const ped of state.peds) {
          if (Math.hypot(ped.x - p.x, ped.y - p.y) < 34) {
            ped.flee = true;
            ped.speed *= 2;
            state.message = 'You threw a punch!';
            state.messageTimer = 2;
            break;
          }
        }
      }
    } else {
      // Driving Car
      const car = state.cars.find(c => c.id === p.carId);
      if (!car) {
        p.onFoot = true;
        p.carId = null;
      } else {
        const maxSpd = car.tuned ? CAR.maxSpeed * 1.25 : CAR.maxSpeed;
        // Steering
        if (input.mx !== 0) {
          car.angle += input.mx * CAR.turnRate * dt * (car.speed / maxSpd * 0.7 + 0.3);
        }

        // Throttle / Brake
        if (input.my > 0) {
          car.speed = Math.min(maxSpd, car.speed + CAR.accel * dt);
        } else if (input.my < 0) {
          if (car.speed > 10) car.speed -= CAR.brake * dt;
          else car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
        } else {
          // Drag
          car.speed *= Math.pow(0.5, dt);
          if (Math.abs(car.speed) < 5) car.speed = 0;
        }

        if (input.handbrake) {
          car.speed *= Math.pow(0.2, dt);
        }

        // Move car
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;

        if (checkBuildingCollision(nx, ny, CAR.length / 2)) {
          car.speed *= -0.3; // Crash recoil
          state.health -= 4;
          if (Math.abs(car.speed) > 200) {
            state.wantedHeat += 0.5;
          }
        } else {
          car.x = nx;
          car.y = ny;
        }

        p.x = car.x;
        p.y = car.y;
        p.angle = car.angle;
        p.speed = car.speed;

        // Exit car
        if (enterPressed) {
          p.onFoot = true;
          p.x = car.x + 30 * Math.sin(car.angle);
          p.y = car.y - 30 * Math.cos(car.angle);
          p.carId = null;
          car.speed = 0;
        }
      }
    }

    // Shop logic
    if (state.shops) {
      for (const shop of state.shops) {
        const distToShop = Math.hypot(shop.x - p.x, shop.y - p.y);
        if (shop.kind === 'paint') {
          if (!p.onFoot && distToShop < 50 && state.money >= 200 && state.time - shop.lastUsed >= 10) {
            shop.lastUsed = state.time;
            state.money -= 200;
            const car = state.cars.find(c => c.id === p.carId);
            if (car) {
              car.color = PALETTE.trafficCars[Math.floor(Math.random() * PALETTE.trafficCars.length)];
            }
            state.health = 100;
            state.message = 'Fresh paint + full repair — $200';
            state.messageTimer = 4;
          }
        } else if (shop.kind === 'safehouse') {
          if (distToShop < 60) {
            state.wantedHeat = Math.max(0, state.wantedHeat - WANTED.decayRate * 2 * dt);
            if (state.time - shop.lastUsed >= 10 && state.wanted > 0) {
              shop.lastUsed = state.time;
              state.message = 'Safehouse — heat dropping fast';
              state.messageTimer = 3;
            }
          }
        } else if (shop.kind === 'garage') {
          if (!p.onFoot && distToShop < 50 && state.time - shop.lastUsed >= 10) {
            shop.lastUsed = state.time;
            const car = state.cars.find(c => c.id === p.carId);
            if (car) {
              car.tuned = true;
              car.color = '#ffd166';
            }
            state.message = 'Garage tune-up — sports spec!';
            state.messageTimer = 4;
          }
        }
      }
    }

    // Cash collection
    if (state.cashDrops) {
      for (const drop of state.cashDrops) {
        if (!drop.taken && Math.hypot(drop.x - p.x, drop.y - p.y) < 30) {
          drop.taken = true;
          drop.collected = true;
          state.money += 250;
          state.score += 250;
          state.message = 'Cash collected!';
          state.messageTimer = 3;
        }
      }
    }

    // Update Traffic, Peds & Police
    updateTrafficAndPeds(dt, false);
    updatePoliceAndHeli(dt);

    // Wanted calculation
    prevWanted = state.wanted;
    state.wanted = Math.min(WANTED.max, Math.floor(state.wantedHeat));
    if (state.wanted > prevWanted) {
      events |= EVENT_WANTED;
    }

    // Wanted decay out of sight
    if (state.police.length === 0 && state.wanted > 0) {
      state.wantedHeat = Math.max(0, state.wantedHeat - WANTED.decayRate * dt);
    }

    // Check Health / Busted
    if (state.health <= 0) {
      state.over = true;
      return events | EVENT_OVER;
    }

    // Check Missions
    updateMissions(dt, events);

    // Camera follow player
    state.camera.x += (state.player.x - state.camera.x) * 5 * dt;
    state.camera.y += (state.player.y - state.camera.y) * 5 * dt;

    return events;
  }

  function checkBuildingCollision(x, y, radius) {
    if (y > state.water.y) return true; // Water barrier
    for (const b of state.buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(y - b.y) < b.h / 2 + radius) {
        return true;
      }
    }
    return false;
  }

  function updateTrafficAndPeds(dt, isAttract) {
    // Traffic AI
    for (const car of state.cars) {
      if (car.stolen || car.isPolice) continue;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;

      // Wrap around or bounce at world bounds
      if (car.x < 100 || car.x > WORLD.width - 100 || car.y < 100 || car.y > WORLD.height - 250) {
        car.angle += Math.PI;
      }
    }

    // Pedestrians
    for (const ped of state.peds) {
      const speed = ped.flee ? ped.speed * 2.2 : ped.speed;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;

      if (Math.random() < 0.02) {
        ped.angle += (Math.random() - 0.5) * Math.PI;
      }

      if (ped.x < 100 || ped.x > WORLD.width - 100 || ped.y < 100 || ped.y > WORLD.height - 250) {
        ped.angle += Math.PI;
      }
    }
  }

  function updatePoliceAndHeli(dt) {
    const targetCount = state.wanted;
    while (state.police.length < targetCount) {
      const spawnX = state.player.x + (Math.random() - 0.5) * POLICE.spawnDistance;
      const spawnY = state.player.y + (Math.random() - 0.5) * POLICE.spawnDistance;
      const policeCar = {
        id: nextCarId++,
        x: spawnX,
        y: spawnY,
        angle: 0,
        speed: POLICE.chaseSpeed,
        color: PALETTE.police,
        isPolice: true,
        stolen: false,
        driver: true
      };
      state.cars.push(policeCar);
      state.police.push({ carId: policeCar.id });
    }

    while (state.police.length > targetCount && state.police.length > 0) {
      const removed = state.police.pop();
      const idx = state.cars.findIndex(c => c.id === removed.carId);
      if (idx !== -1) state.cars.splice(idx, 1);
    }

    // Police chase AI
    for (const pRef of state.police) {
      const pCar = state.cars.find(c => c.id === pRef.carId);
      if (!pCar) continue;
      const angleToPlayer = Math.atan2(state.player.y - pCar.y, state.player.x - pCar.x);
      pCar.angle = angleToPlayer;
      pCar.x += Math.cos(pCar.angle) * pCar.speed * dt;
      pCar.y += Math.sin(pCar.angle) * pCar.speed * dt;

      // Check busted condition
      const dist = Math.hypot(state.player.x - pCar.x, state.player.y - pCar.y);
      if (dist < 45 && state.player.onFoot) {
        state.busted = true;
        state.money = Math.floor(state.money * 0.7);
        state.wantedHeat = 0;
        state.wanted = 0;
        state.message = 'BUSTED! Lost 30% cash.';
        state.messageTimer = 5;
      }
    }

    // Helicopter
    if (state.wanted >= 3) {
      state.heli.active = true;
      state.heli.x += (state.player.x - state.heli.x) * 2 * dt;
      state.heli.y += (state.player.y - state.heli.y) * 2 * dt;
    } else {
      state.heli.active = false;
    }
  }

  function updateMissions(dt, events) {
    const m = state.mission;
    const missionDef = MISSIONS[m.index];
    if (!missionDef) return;

    m.timer -= dt;

    // Check cash drop collection in mission 3
    if (m.index === 3) {
      for (const drop of cashDrops) {
        if (!drop.collected && Math.hypot(drop.x - state.player.x, drop.y - state.player.y) < 30) {
          drop.collected = true;
          state.money += 1500;
          state.message = 'Cash drop collected!';
          state.messageTimer = 3;
        }
      }
    }

    const distToTarget = Math.hypot(m.target.x - state.player.x, m.target.y - state.player.y);

    let completed = false;
    if (missionDef.target.kind === 'car' && !state.player.onFoot) {
      completed = true;
    } else if (missionDef.target.kind === 'place' && distToTarget < 50) {
      completed = true;
    } else if (missionDef.target.kind === 'evade' && state.wanted >= 3 && m.timer <= 35) {
      completed = true;
    } else if (missionDef.target.kind === 'collect' && cashDrops.every(d => d.collected)) {
      completed = true;
    } else if (missionDef.target.kind === 'escape' && distToTarget < 60 && state.wanted === 0) {
      completed = true;
    } else if (missionDef.target.kind === 'pickup' && distToTarget < 50) {
      completed = true;
    }

    if (completed) {
      state.money += missionDef.reward;
      state.score += missionDef.reward;
      state.message = 'Mission Complete: ' + missionDef.title + '! Reward: $' + missionDef.reward;
      state.messageTimer = 5;
      events |= EVENT_MISSION;

      m.index++;
      if (m.index >= MISSIONS.length) {
        state.win = true;
      } else {
        const nextM = MISSIONS[m.index];
        m.target = { ...nextM.target };
        m.timer = nextM.timeLimit;
        m.text = nextM.title + ': ' + nextM.brief;
      }
    } else if (m.timer <= 0) {
      // Time out restart mission
      m.timer = missionDef.timeLimit;
      state.message = 'Too slow — Mara gives you another shot.';
      state.messageTimer = 4;
    }
  }

  return {
    reset,
    step,
    get state() { return state; }
  };
}
