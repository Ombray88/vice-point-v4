/**
 * @file render.js
 * @description WebGL2 3D scene renderer and 2D HUD overlay for Vice Point 3D.
 * Exports createRenderer(canvas), SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN.
 */

import { createGL } from './gl.js';
import { PALETTE, WORLD, CAR, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

export function createRenderer(canvas) {
  const gl3D = createGL(canvas);

  // Create 2D overlay canvas
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.style.position = 'fixed';
  overlayCanvas.style.inset = '0';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';
  overlayCanvas.style.pointerEvents = 'none';
  overlayCanvas.style.zIndex = '10';
  canvas.parentNode.insertBefore(overlayCanvas, canvas.nextSibling);

  const ctx = overlayCanvas.getContext('2d');

  // The last frame draw() painted, so a resize can repaint it (setting
  // canvas.width clears the bitmap; in shot mode nothing repaints otherwise).
  let lastDraw = null;
  function resizeOverlay() {
    const dpr = window.devicePixelRatio || 1;
    const w = 1280 * dpr, h = 720 * dpr;
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  resizeOverlay();
  window.addEventListener('resize', () => { resizeOverlay(); if (lastDraw) draw(lastDraw.state, lastDraw.screen, lastDraw.best); });

  // Mesh cache: key -> mesh
  const meshCache = new Map();

  function getBoxMesh(w, h, d, color) {
    const key = `box_${w}_${h}_${d}_${color}`;
    if (!meshCache.has(key)) {
      meshCache.set(key, gl3D.box(w, h, d, color));
    }
    return meshCache.get(key);
  }

  function getQuadMesh(w, d, color) {
    const key = `quad_${w}_${d}_${color}`;
    if (!meshCache.has(key)) {
      meshCache.set(key, gl3D.quad(w, d, color));
    }
    return meshCache.get(key);
  }

  function getCylinderMesh(rTop, rBottom, h, segments, color) {
    const key = `cyl_${rTop}_${rBottom}_${h}_${segments}_${color}`;
    if (!meshCache.has(key)) {
      meshCache.set(key, gl3D.cylinder(rTop, rBottom, h, segments, color));
    }
    return meshCache.get(key);
  }

  function getConeMesh(r, h, segments, color) {
    const key = `cone_${r}_${h}_${segments}_${color}`;
    if (!meshCache.has(key)) {
      meshCache.set(key, gl3D.cone(r, h, segments, color));
    }
    return meshCache.get(key);
  }

  // Camera state storage
  let camEyeX = WORLD.width / 2;
  let camEyeY = 400;
  let camEyeZ = WORLD.height / 2 + 500;
  let camTargetX = WORLD.width / 2;
  let camTargetY = 0;
  let camTargetZ = WORLD.height / 2;
  let firstDraw = true;

  function draw(state, screen, best) {
    lastDraw = { state, screen, best };
    const time = state.time || 0;
    const player = state.player || { x: WORLD.width / 2, y: WORLD.height / 2, angle: 0, speed: 0, onFoot: true };
    const forwardX = Math.cos(player.angle);
    const forwardZ = Math.sin(player.angle);

    let targetEyeX, targetEyeY, targetEyeZ;
    let targetTargetX, targetTargetY, targetTargetZ;

    if (screen === SCREEN_TITLE) {
      // Cinematic camera for title
      targetTargetX = player.x;
      targetTargetY = 10;
      targetTargetZ = player.y;
      targetEyeX = player.x - forwardX * 260;
      targetEyeY = 110;
      targetEyeZ = player.y - forwardZ * 260;
    } else if (player.onFoot) {
      targetTargetX = player.x + forwardX * 6;
      targetTargetY = 1.2;
      targetTargetZ = player.y + forwardZ * 6;
      targetEyeX = player.x - forwardX * 9;
      targetEyeY = 5;
      targetEyeZ = player.y - forwardZ * 9;
    } else {
      // In car — chase cam. The car is 46 long, so an eye closer than ~50
      // behind sits so near the rear bumper that the rear face fills the
      // whole frame (verified: at 32 behind, the violet rear face lit 0.3
      // was the entire frame). 70 behind / 32 up frames the car in the
      // lower centre with the road and city visible around it.
      targetTargetX = player.x + forwardX * 22;
      targetTargetY = 3;
      targetTargetZ = player.y + forwardZ * 22;
      targetEyeX = player.x - forwardX * 70;
      targetEyeY = 32;
      targetEyeZ = player.y - forwardZ * 70;
    }

    const dx = targetEyeX - camEyeX;
    const dy = targetEyeY - camEyeY;
    const dz = targetEyeZ - camEyeZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (firstDraw || dist > 800) {
      camEyeX = targetEyeX;
      camEyeY = targetEyeY;
      camEyeZ = targetEyeZ;
      camTargetX = targetTargetX;
      camTargetY = targetTargetY;
      camTargetZ = targetTargetZ;
      firstDraw = false;
    } else {
      const lerp = 0.12;
      camEyeX += (targetEyeX - camEyeX) * lerp;
      camEyeY += (targetEyeY - camEyeY) * lerp;
      camEyeZ += (targetEyeZ - camEyeZ) * lerp;
      camTargetX += (targetTargetX - camTargetX) * lerp;
      camTargetY += (targetTargetY - camTargetY) * lerp;
      camTargetZ += (targetTargetZ - camTargetZ) * lerp;
    }

    gl3D.setCamera(
      { x: camEyeX, y: camEyeY, z: camEyeZ },
      { x: camTargetX, y: camTargetY, z: camTargetZ },
      { x: 0, y: 1, z: 0 },
      62
    );

    gl3D.begin(PALETTE.skyTop, PALETTE.skyBottom, PALETTE.fog);

    // --- Ground & World Geometry ---
    // Sidewalk ground quad covering the world
    const groundMesh = getQuadMesh(WORLD.width * 1.5, WORLD.height * 1.5, PALETTE.sidewalk);
    gl3D.drawMesh(groundMesh, { x: WORLD.width / 2, y: 0, z: WORLD.height / 2, ry: 0 }, 0);

    // Beach at south edge
    if (state.beach && typeof state.beach.y === 'number') {
      const beachMesh = getQuadMesh(WORLD.width, 300, PALETTE.sand);
      gl3D.drawMesh(beachMesh, { x: WORLD.width / 2, y: 1, z: state.beach.y + 150, ry: 0 }, 0);
    }

    // Water below beach
    if (state.water && typeof state.water.y === 'number') {
      const waterMesh = getQuadMesh(WORLD.width, 600, PALETTE.water);
      gl3D.drawMesh(waterMesh, { x: WORLD.width / 2, y: -1, z: state.water.y + 300, ry: 0 }, 0.15);
    }

    // Roads
    if (state.roads) {
      if (state.roads.vertical) {
        for (let i = 0; i < state.roads.vertical.length; i++) {
          const rx = state.roads.vertical[i];
          const roadMesh = getQuadMesh(64, WORLD.height, PALETTE.asphalt);
          gl3D.drawMesh(roadMesh, { x: rx, y: 2, z: WORLD.height / 2, ry: 0 }, 0);
          const lineMesh = getQuadMesh(4, WORLD.height, PALETTE.roadLine);
          gl3D.drawMesh(lineMesh, { x: rx, y: 3, z: WORLD.height / 2, ry: 0 }, 0.5);
        }
      }
      if (state.roads.horizontal) {
        for (let i = 0; i < state.roads.horizontal.length; i++) {
          const ry_coord = state.roads.horizontal[i];
          const roadMesh = getQuadMesh(WORLD.width, 64, PALETTE.asphalt);
          gl3D.drawMesh(roadMesh, { x: WORLD.width / 2, y: 2, z: ry_coord, ry: 0 }, 0);
          const lineMesh = getQuadMesh(WORLD.width, 4, PALETTE.roadLine);
          gl3D.drawMesh(lineMesh, { x: WORLD.width / 2, y: 3, z: ry_coord, ry: 0 }, 0.5);
        }
      }
    }

    // Buildings
    if (state.buildings) {
      for (let i = 0; i < state.buildings.length; i++) {
        const b = state.buildings[i];
        const bx = b.x + b.w / 2;
        const bz = b.y + b.h / 2;
        const bh = b.height || 120;
        const bCol = b.color || PALETTE.buildings[i % PALETTE.buildings.length];
        const boxMesh = getBoxMesh(b.w, bh, b.h, bCol);
        gl3D.drawMesh(boxMesh, { x: bx, y: bh / 2, z: bz, ry: 0 }, 0);

        // Roof
        const roofMesh = getBoxMesh(b.w, 4, b.h, b.roof || '#2b3040');
        gl3D.drawMesh(roofMesh, { x: bx, y: bh + 2, z: bz, ry: 0 }, 0);

        // Antenna on tall buildings
        if (bh > 250) {
          const antMesh = getCylinderMesh(2, 2, 60, 6, '#9ca3af');
          gl3D.drawMesh(antMesh, { x: bx, y: bh + 32, z: bz, ry: 0 }, 0.2);
        }
      }
    }

    // Parks
    if (state.parks) {
      for (let i = 0; i < state.parks.length; i++) {
        const p = state.parks[i];
        const px = p.x + p.w / 2;
        const pz = p.y + p.h / 2;
        const parkMesh = getQuadMesh(p.w, p.h, PALETTE.park);
        gl3D.drawMesh(parkMesh, { x: px, y: 1.5, z: pz, ry: 0 }, 0);

        // Trees in park
        const trunkMesh = getCylinderMesh(4, 5, 30, 6, '#8b5a2b');
        const canopyMesh = getConeMesh(18, 45, 7, '#2e7d32');
        gl3D.drawMesh(trunkMesh, { x: px - p.w / 4, y: 15, z: pz - p.h / 4, ry: 0 }, 0);
        gl3D.drawMesh(canopyMesh, { x: px - p.w / 4, y: 50, z: pz - p.h / 4, ry: 0 }, 0);
        gl3D.drawMesh(trunkMesh, { x: px + p.w / 4, y: 15, z: pz + p.h / 4, ry: 0 }, 0);
        gl3D.drawMesh(canopyMesh, { x: px + p.w / 4, y: 50, z: pz + p.h / 4, ry: 0 }, 0);
      }
    }

    // Mission target marker
    if (state.mission && state.mission.target) {
      const tx = state.mission.target.x;
      const tz = state.mission.target.y;
      const bob = Math.sin(time * 6) * 10;
      const diamondMesh = getConeMesh(16, 32, 8, PALETTE.objective);
      gl3D.drawMesh(diamondMesh, { x: tx, y: 60 + bob, z: tz, ry: time * 2 }, 0.9);
      const ringMesh = getCylinderMesh(24, 24, 4, 16, PALETTE.objective);
      gl3D.drawMesh(ringMesh, { x: tx, y: 4, z: tz, ry: 0 }, 0.9);
    }

    // Cash drops
    if (state.cashDrops) {
      for (let i = 0; i < state.cashDrops.length; i++) {
        const drop = state.cashDrops[i];
        if (!drop.taken) {
          const cashMesh = getBoxMesh(16, 12, 16, PALETTE.money);
          const bob = Math.sin(time * 8 + i) * 6;
          gl3D.drawMesh(cashMesh, { x: drop.x, y: 10 + bob, z: drop.y, ry: time * 3 }, 0.8);
        }
      }
    }

    // Shops
    if (state.shops) {
      for (let i = 0; i < state.shops.length; i++) {
        const shop = state.shops[i];
        const color = shop.kind === 'paint' ? '#4fc3f7' : shop.kind === 'safehouse' ? '#7ee787' : '#ffd166';
        const bob = Math.sin(time * 6 + i) * 10;
        const diamondMesh = getConeMesh(16, 32, 8, color);
        gl3D.drawMesh(diamondMesh, { x: shop.x, y: 60 + bob + 16, z: shop.y, ry: time * 2 }, 0.8);
        gl3D.drawMesh(diamondMesh, { x: shop.x, y: 60 + bob - 16, z: shop.y, ry: time * 2, sy: -1 }, 0.8);
        const ringScale = 1 + Math.sin(time * 6 + i) * 0.15;
        const ringMesh = getCylinderMesh(24, 24, 4, 16, color);
        gl3D.drawMesh(ringMesh, { x: shop.x, y: 4, z: shop.y, ry: 0, sx: ringScale, sz: ringScale }, 0.8);
      }
    }

    // Cars
    if (state.cars) {
      for (let i = 0; i < state.cars.length; i++) {
        const car = state.cars[i];
        const carCol = car.color || '#3b82f6';
        const bodyMesh = getBoxMesh(CAR.length, 16, CAR.width, carCol);
        const cabinMesh = getBoxMesh(CAR.length * 0.5, 14, CAR.width * 0.85, '#1a2233');
        const wheelMesh = getBoxMesh(8, 8, 6, '#111827');
        const headMesh = getBoxMesh(4, 4, 4, '#fef08a');

        const ry = -car.angle;
        gl3D.drawMesh(bodyMesh, { x: car.x, y: 12, z: car.y, ry }, 0);
        gl3D.drawMesh(cabinMesh, { x: car.x - 4, y: 24, z: car.y, ry }, 0);

        // Wheels
        gl3D.drawMesh(wheelMesh, { x: car.x + 14, y: 4, z: car.y + CAR.width / 2, ry }, 0);
        gl3D.drawMesh(wheelMesh, { x: car.x - 14, y: 4, z: car.y + CAR.width / 2, ry }, 0);
        gl3D.drawMesh(wheelMesh, { x: car.x + 14, y: 4, z: car.y - CAR.width / 2, ry }, 0);
        gl3D.drawMesh(wheelMesh, { x: car.x - 14, y: 4, z: car.y - CAR.width / 2, ry }, 0);

        // Headlights
        gl3D.drawMesh(headMesh, { x: car.x + CAR.length / 2, y: 12, z: car.y + CAR.width / 3, ry }, 1);
        gl3D.drawMesh(headMesh, { x: car.x + CAR.length / 2, y: 12, z: car.y - CAR.width / 3, ry }, 1);

        // Police light bar
        if (car.isPolice) {
          const flash = Math.floor(time * 8) % 2 === 0;
          const lightMeshA = getBoxMesh(6, 6, 12, flash ? PALETTE.policeLightA : '#111827');
          const lightMeshB = getBoxMesh(6, 6, 12, flash ? '#111827' : PALETTE.policeLightB);
          gl3D.drawMesh(lightMeshA, { x: car.x, y: 34, z: car.y - 4, ry }, 1);
          gl3D.drawMesh(lightMeshB, { x: car.x, y: 34, z: car.y + 4, ry }, 1);
        }
      }
    }

    // Player (on foot or ring)
    if (player.onFoot) {
      const pBody = getBoxMesh(12, 28, 12, PALETTE.player);
      const pHead = getBoxMesh(8, 8, 8, '#fbcfe8');
      const ry = -player.angle;
      gl3D.drawMesh(pBody, { x: player.x, y: 18, z: player.y, ry }, 0);
      gl3D.drawMesh(pHead, { x: player.x, y: 36, z: player.y, ry }, 0);
    }
    const playerRing = getCylinderMesh(18, 18, 2, 16, PALETTE.player);
    gl3D.drawMesh(playerRing, { x: player.x, y: 2, z: player.y, ry: 0 }, 0.8);

    // Pedestrians
    if (state.peds) {
      for (let i = 0; i < state.peds.length; i++) {
        const ped = state.peds[i];
        const pedCol = ped.color || PALETTE.peds[i % PALETTE.peds.length];
        const pBody = getBoxMesh(10, 24, 10, pedCol);
        const ry = -ped.angle;
        gl3D.drawMesh(pBody, { x: ped.x, y: 14, z: ped.y, ry }, 0);
      }
    }

    // Helicopter
    if (state.heli && state.heli.active) {
      const h = state.heli;
      const hMesh = getBoxMesh(50, 18, 24, PALETTE.heli);
      const tailMesh = getBoxMesh(40, 8, 8, PALETTE.heli);
      const rotorMesh = getBoxMesh(120, 2, 8, '#9ca3af');
      const ry = -h.angle;
      gl3D.drawMesh(hMesh, { x: h.x, y: h.alt, z: h.y, ry }, 0);
      gl3D.drawMesh(tailMesh, { x: h.x - 35, y: h.alt + 4, z: h.y, ry }, 0);
      gl3D.drawMesh(rotorMesh, { x: h.x, y: h.alt + 12, z: h.y, ry: time * 20 }, 0.5);

      // Searchlight pool on ground
      const searchLight = getCylinderMesh(70, 70, 2, 16, '#fef08a');
      gl3D.drawMesh(searchLight, { x: player.x, y: 2.5, z: player.y, ry: 0 }, 0.9);
    }

    gl3D.end();

    // --- 2D HUD Overlay ---
    ctx.clearRect(0, 0, 1280, 720);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      // Top-Left: Money & Health
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.fillRect(20, 20, 260, 85);
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 260, 85);

      ctx.fillStyle = PALETTE.money;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText(`$ ${state.money || 0}`, 35, 55);

      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      ctx.fillText('HEALTH', 35, 78);

      // Health bar
      const hp = Math.max(0, Math.min(100, state.health !== undefined ? state.health : 100));
      ctx.fillStyle = '#374151';
      ctx.fillRect(110, 66, 150, 14);
      ctx.fillStyle = hp > 30 ? '#10b981' : '#ef4444';
      ctx.fillRect(110, 66, 150 * (hp / 100), 14);

      // Top-Centre: Wanted Stars
      const wanted = state.wanted || 0;
      if (wanted > 0) {
        ctx.fillStyle = PALETTE.hudPanel;
        ctx.fillRect(520, 20, 240, 50);
        ctx.strokeStyle = '#374151';
        ctx.strokeRect(520, 20, 240, 50);

        ctx.fillStyle = '#ffd166';
        ctx.font = `24px ${FONT}`;
        let starsStr = '';
        for (let s = 1; s <= 5; s++) {
          starsStr += s <= wanted ? '★ ' : '☆ ';
        }
        ctx.textAlign = 'center';
        ctx.fillText(starsStr, 640, 53);
        ctx.textAlign = 'left';
      }

      // Top-Right: Minimap
      const mmX = 1060, mmY = 20, mmW = 200, mmH = 150;
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = '#374151';
      ctx.strokeRect(mmX, mmY, mmW, mmH);

      // Minimap content
      ctx.save();
      ctx.beginPath();
      ctx.rect(mmX, mmY, mmW, mmH);
      ctx.clip();

      const scaleMapX = mmW / WORLD.width;
      const scaleMapZ = mmH / WORLD.height;

      // Draw roads on minimap
      ctx.strokeStyle = PALETTE.asphalt;
      ctx.lineWidth = 4;
      if (state.roads && state.roads.vertical) {
        for (let i = 0; i < state.roads.vertical.length; i++) {
          const rx = state.roads.vertical[i] * scaleMapX + mmX;
          ctx.beginPath();
          ctx.moveTo(rx, mmY);
          ctx.lineTo(rx, mmY + mmH);
          ctx.stroke();
        }
      }
      if (state.roads && state.roads.horizontal) {
        for (let i = 0; i < state.roads.horizontal.length; i++) {
          const rz = state.roads.horizontal[i] * scaleMapZ + mmY;
          ctx.beginPath();
          ctx.moveTo(mmX, rz);
          ctx.lineTo(mmX + mmW, rz);
          ctx.stroke();
        }
      }

      // Draw player on minimap
      const pxMap = player.x * scaleMapX + mmX;
      const pzMap = player.y * scaleMapZ + mmY;
      ctx.fillStyle = PALETTE.player;
      ctx.beginPath();
      ctx.arc(pxMap, pzMap, 5, 0, Math.PI * 2);
      ctx.fill();

      // Draw mission target on minimap
      if (state.mission && state.mission.target) {
        const txMap = state.mission.target.x * scaleMapX + mmX;
        const tzMap = state.mission.target.y * scaleMapZ + mmY;
        ctx.fillStyle = PALETTE.objective;
        ctx.beginPath();
        ctx.arc(txMap, tzMap, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Bottom-Centre: Mission Banner
      if (state.mission) {
        ctx.fillStyle = PALETTE.hudPanel;
        ctx.fillRect(340, 610, 600, 80);
        ctx.strokeStyle = '#374151';
        ctx.strokeRect(340, 610, 600, 80);

        ctx.fillStyle = PALETTE.objective;
        ctx.font = `bold 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(state.mission.text || 'MISSION OBJECTIVE', 640, 638);

        ctx.fillStyle = PALETTE.text;
        ctx.font = `14px ${FONT}`;
        const targetLabel = (state.mission.target && state.mission.target.label) || '';
        ctx.fillText(targetLabel, 640, 668);
        ctx.textAlign = 'left';
      }

      // Bottom-Left: Contextual Hint
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.fillRect(20, 630, 300, 60);
      ctx.strokeStyle = '#374151';
      ctx.strokeRect(20, 630, 300, 60);

      ctx.fillStyle = PALETTE.text;
      ctx.font = `13px ${FONT}`;
      let hint = 'WASD — Move / Drive  |  Space — Handbrake';
      if (!player.onFoot) {
        hint = 'E — Exit Car  |  R — Radio  |  P — Pause';
      } else {
        hint = 'E — Enter Car / Action  |  WASD — Walk';
      }
      ctx.fillText(hint, 35, 665);
    }

    // --- Screen Overlays ---
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(11, 15, 25, 0.65)';
      ctx.fillRect(0, 0, 1280, 720);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText('VICE POINT 3D', 640, 240);

      ctx.fillStyle = PALETTE.text;
      ctx.font = `22px ${FONT}`;
      ctx.fillText('A small-time driver. A neon city. Seven jobs.', 640, 300);

      ctx.fillStyle = PALETTE.objective;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press Space or Click to Start', 640, 420);

      if (best > 0) {
        ctx.fillStyle = PALETTE.money;
        ctx.font = `18px ${FONT}`;
        ctx.fillText(`Best Money: $ ${best}`, 640, 480);
      }
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(11, 15, 25, 0.75)';
      ctx.fillRect(0, 0, 1280, 720);

      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 48px ${FONT}`;
      ctx.fillText('GAME PAUSED', 640, 320);

      ctx.fillStyle = PALETTE.objective;
      ctx.font = `20px ${FONT}`;
      ctx.fillText('Press Space to Resume', 640, 380);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(20, 10, 15, 0.85)';
      ctx.fillRect(0, 0, 1280, 720);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText(state.busted ? 'BUSTED' : 'WASTED', 640, 260);

      ctx.fillStyle = PALETTE.text;
      ctx.font = `22px ${FONT}`;
      ctx.fillText(`Money: $ ${state.money || 0}`, 640, 340);

      ctx.fillStyle = PALETTE.objective;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press Space to Try Again', 640, 440);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_WIN) {
      ctx.fillStyle = 'rgba(10, 20, 15, 0.85)';
      ctx.fillRect(0, 0, 1280, 720);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#10b981';
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText('KINGPIN OF VICE POINT', 640, 240);

      ctx.fillStyle = PALETTE.money;
      ctx.font = `26px ${FONT}`;
      ctx.fillText(`Final Money: $ ${state.money || 0}`, 640, 320);

      ctx.fillStyle = PALETTE.text;
      ctx.font = `18px ${FONT}`;
      ctx.fillText('All 7 missions completed successfully!', 640, 370);

      ctx.fillStyle = PALETTE.objective;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press Space to Play Again', 640, 460);
      ctx.textAlign = 'left';
    }
  }

  return {
    draw
  };
}
