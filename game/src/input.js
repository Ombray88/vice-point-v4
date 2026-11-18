/**
 * @file input.js
 * @description Keyboard and mouse input handling for Vice Point 3D.
 * Exports createInput(canvas).
 */

export function createInput(canvas) {
  const keys = new Map();
  const pressed = new Map(); // Edge-triggered flags
  const mouseState = { x: 0, y: 0, clicked: false, rawClicked: false };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key) || e.code === 'Space') {
      e.preventDefault();
    }
    const code = e.code || e.key;
    if (!keys.get(code)) {
      pressed.set(code, true);
    }
    keys.set(code, true);

    // Also map standard key identifiers
    keys.set(e.key.toLowerCase(), true);
  }

  function onKeyUp(e) {
    const code = e.code || e.key;
    keys.set(code, false);
    keys.set(e.key.toLowerCase(), false);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / (rect.width || 1280);
    const scaleY = 720 / (rect.height || 720);
    mouseState.x = (e.clientX - rect.left) * scaleX;
    mouseState.y = (e.clientY - rect.top) * scaleY;
  }

  function onMouseDown(e) {
    onMouseMove(e);
    mouseState.rawClicked = true;
  }

  function attach() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
  }

  function detach() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    keys.clear();
    pressed.clear();
  }

  function isDown(k1, k2) {
    return !!(keys.get(k1) || keys.get(k2) || keys.get(k1.toLowerCase()) || keys.get(k2?.toLowerCase()));
  }

  function checkEdge(k1, k2) {
    const active = isDown(k1, k2);
    // Edge triggered: if down now and not consumed, or if pressed event registered
    const code1 = k1;
    const code2 = k2;
    let isPressed = pressed.get(code1) || pressed.get(code2) || pressed.get(k1.toLowerCase()) || pressed.get(k2?.toLowerCase());
    if (isPressed) {
      pressed.set(code1, false);
      if (code2) pressed.set(code2, false);
      pressed.set(k1.toLowerCase(), false);
      if (k2) pressed.set(k2.toLowerCase(), false);
      return true;
    }
    return false;
  }

  return {
    attach,
    detach,
    read() {
      // Axes mx, my (-1..1)
      let mx = 0;
      let my = 0;
      if (isDown('ArrowLeft', 'KeyA')) mx -= 1;
      if (isDown('ArrowRight', 'KeyD')) mx += 1;
      if (isDown('ArrowUp', 'KeyW')) my -= 1;
      if (isDown('ArrowDown', 'KeyS')) my += 1;

      const enter = checkEdge('KeyE', 'Enter');
      const action = checkEdge('KeyF', 'KeyE'); // Or F
      const radio = checkEdge('KeyR', 'KeyR');
      const pause = checkEdge('KeyP', 'Escape');
      const mute = checkEdge('KeyM', 'KeyM');
      const handbrake = isDown('Space', 'Space');

      mouseState.clicked = mouseState.rawClicked;
      mouseState.rawClicked = false; // consume mouse click

      return {
        mx,
        my,
        enter,
        action,
        handbrake,
        radio,
        pause,
        mute
      };
    },
    get mouse() {
      const clicked = mouseState.clicked;
      mouseState.clicked = false;
      return {
        x: mouseState.x,
        y: mouseState.y,
        clicked
      };
    }
  };
}
