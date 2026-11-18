/**
 * @file gl.js
 * @description WebGL2 3D Renderer Core for Vice Point 3D.
 * 
 * Coordinate System: Y-UP, right-handed. World positions map (wx, wy) -> (wx, 0, wy).
 * Transform format for drawMesh(mesh, model, emissive):
 *   `model` can be a transform object: `{x, y, z, ry, sx, sy, sz}`
 *   or a 16-element Float32Array column-major 4x4 matrix.
 * 
 * Exports:
 *   createGL(canvas) -> renderer object with methods:
 *     - setCamera(eye, target, up, fovY)
 *     - begin(skyTop, skyBottom, fogColor)
 *     - box(w, h, d, color)
 *     - quad(w, d, color)
 *     - cylinder(rTop, rBottom, h, segments, color)
 *     - cone(r, h, segments, color)
 *     - makeMesh(positions, normals, colors)
 *     - drawMesh(mesh, model, emissive)
 *     - end()
 */

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true });
  if (!gl) {
    throw new Error('WebGL2 is not supported in this browser or environment.');
  }

  // --- Shaders ---
  const vsSource = `#version 300 es
    layout(location = 0) in vec3 aPosition;
    layout(location = 1) in vec3 aNormal;
    layout(location = 2) in vec3 aColor;

    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform mat4 uModel;

    out vec3 vNormal;
    out vec3 vColor;
    out float vDist;

    void main() {
      vec4 worldPos = uModel * vec4(aPosition, 1.0);
      vec4 viewPos = uView * worldPos;
      gl_Position = uProjection * viewPos;

      // Transform normal (assuming uniform scale or rotation-only matrix)
      vNormal = mat3(uModel) * aNormal;
      vColor = aColor;
      vDist = -viewPos.z;
    }
  `;

  const fsSource = `#version 300 es
    precision highp float;

    in vec3 vNormal;
    in vec3 vColor;
    in float vDist;

    uniform vec3 uSunDir;
    uniform vec3 uFogColor;
    uniform float uEmissive;

    out vec4 fragColor;

    void main() {
      vec3 N = normalize(vNormal);
      float diff = max(dot(N, uSunDir), 0.0);
      float lighting = clamp(0.3 + 0.7 * diff + uEmissive * 0.7, 0.0, 1.0);

      vec3 litColor = vColor * lighting;

      // Distance fog
      float fogStart = 600.0;
      float fogEnd = 2200.0;
      float fogFactor = clamp((vDist - fogStart) / (fogEnd - fogStart), 0.0, 1.0);

      vec3 finalColor = mix(litColor, uFogColor, fogFactor);
      fragColor = vec4(finalColor, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compilation error: ' + info);
    }
    return shader;
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program linking error: ' + gl.getProgramInfoLog(program));
  }

  const uProjectionLoc = gl.getUniformLocation(program, 'uProjection');
  const uViewLoc = gl.getUniformLocation(program, 'uView');
  const uModelLoc = gl.getUniformLocation(program, 'uModel');
  const uSunDirLoc = gl.getUniformLocation(program, 'uSunDir');
  const uFogColorLoc = gl.getUniformLocation(program, 'uFogColor');
  const uEmissiveLoc = gl.getUniformLocation(program, 'uEmissive');

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // --- Utility Math (Matrix / Vector) ---
  function parseColor(css) {
    if (css.startsWith('#')) {
      let hex = css.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const int = parseInt(hex, 16);
      return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
    }
    return [1, 1, 1];
  }

  function mat4Identity() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4Perspective(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
  }

  function mat4LookAt(eye, center, up) {
    const zx = eye.x - center.x, zy = eye.y - center.y, zz = eye.z - center.z;
    let len = Math.hypot(zx, zy, zz);
    const z = [zx / len, zy / len, zz / len];

    let xx = up.y * z[2] - up.z * z[1];
    let xy = up.z * z[0] - up.x * z[2];
    let xz = up.x * z[1] - up.y * z[0];
    len = Math.hypot(xx, xy, xz);
    if (len === 0) { xx = 1; xy = 0; xz = 0; }
    else { xx /= len; xy /= len; xz /= len; }

    const y = [
      z[1] * xz - z[2] * xy,
      z[2] * xx - z[0] * xz,
      z[0] * xy - z[1] * xx
    ];

    const out = new Float32Array(16);
    out[0] = xx; out[4] = xy; out[8] = xz; out[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
    out[1] = y[0]; out[5] = y[1]; out[9] = y[2]; out[13] = -(y[0] * eye.x + y[1] * eye.y + y[2] * eye.z);
    out[2] = z[0]; out[6] = z[1]; out[10] = z[2]; out[14] = -(z[0] * eye.x + z[1] * eye.y + z[2] * eye.z);
    out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
    return out;
  }

  function mat4FromTransform(t) {
    // t = {x, y, z, ry, sx, sy, sz}
    const x = t.x || 0, y = t.y || 0, z = t.z || 0;
    const ry = t.ry || 0;
    const sx = t.sx !== undefined ? t.sx : 1;
    const sy = t.sy !== undefined ? t.sy : 1;
    const sz = t.sz !== undefined ? t.sz : 1;

    const c = Math.cos(ry), s = Math.sin(ry);
    const out = new Float32Array(16);
    out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
    out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
    out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }

  // --- Mesh Creation Helpers ---
  function makeMesh(positions, normals, colors) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return {
      vao,
      count: positions.length / 3
    };
  }

  function box(w, h, d, colorHex) {
    const rgb = parseColor(colorHex);
    const hw = w / 2, hh = h / 2, hd = d / 2;

    const p = [
      // Front
      -hw,-hh, hd,  hw,-hh, hd,  hw, hh, hd,
      -hw,-hh, hd,  hw, hh, hd, -hw, hh, hd,
      // Back
       hw,-hh,-hd, -hw,-hh,-hd, -hw, hh,-hd,
       hw,-hh,-hd, -hw, hh,-hd,  hw, hh,-hd,
      // Left
      -hw,-hh,-hd, -hw,-hh, hd, -hw, hh, hd,
      -hw,-hh,-hd, -hw, hh, hd, -hw, hh,-hd,
      // Right
       hw,-hh, hd,  hw,-hh,-hd,  hw, hh,-hd,
       hw,-hh, hd,  hw, hh,-hd,  hw, hh, hd,
      // Top
      -hw, hh, hd,  hw, hh, hd,  hw, hh,-hd,
      -hw, hh, hd,  hw, hh,-hd, -hw, hh,-hd,
      // Bottom
      -hw,-hh,-hd,  hw,-hh,-hd,  hw,-hh, hd,
      -hw,-hh,-hd,  hw,-hh, hd, -hw,-hh, hd
    ];

    const n = [
      0,0,1,  0,0,1,  0,0,1,   0,0,1,  0,0,1,  0,0,1,
      0,0,-1, 0,0,-1, 0,0,-1,  0,0,-1, 0,0,-1, 0,0,-1,
      -1,0,0, -1,0,0, -1,0,0,  -1,0,0, -1,0,0, -1,0,0,
      1,0,0,  1,0,0,  1,0,0,   1,0,0,  1,0,0,  1,0,0,
      0,1,0,  0,1,0,  0,1,0,   0,1,0,  0,1,0,  0,1,0,
      0,-1,0, 0,-1,0, 0,-1,0,  0,-1,0, 0,-1,0, 0,-1,0
    ];

    const colors = [];
    for (let i = 0; i < 36; i++) colors.push(...rgb);

    return makeMesh(new Float32Array(p), new Float32Array(n), new Float32Array(colors));
  }

  function quad(w, d, colorHex) {
    const rgb = parseColor(colorHex);
    const hw = w / 2, hd = d / 2;
    // CCW winding as seen from above (+y looking down): (-hw, 0, -hd) -> (hw, 0, -hd) -> (hw, 0, hd) etc.
    const p = [
      -hw, 0, -hd,   hw, 0, -hd,   hw, 0,  hd,
      -hw, 0, -hd,   hw, 0,  hd,  -hw, 0,  hd
    ];
    const n = [
      0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, 1, 0,  0, 1, 0,  0, 1, 0
    ];
    const colors = [];
    for (let i = 0; i < 6; i++) colors.push(...rgb);

    return makeMesh(new Float32Array(p), new Float32Array(n), new Float32Array(colors));
  }

  function cylinder(rTop, rBottom, h, segments, colorHex) {
    const rgb = parseColor(colorHex);
    const positions = [];
    const normals = [];
    const colors = [];
    const hh = h / 2;

    for (let i = 0; i < segments; i++) {
      const theta0 = (i / segments) * Math.PI * 2;
      const theta1 = ((i + 1) / segments) * Math.PI * 2;

      const c0 = Math.cos(theta0), s0 = Math.sin(theta0);
      const c1 = Math.cos(theta1), s1 = Math.sin(theta1);

      // Side quad (2 triangles)
      const x0t = c0 * rTop, z0t = s0 * rTop;
      const x0b = c0 * rBottom, z0b = s0 * rBottom;
      const x1t = c1 * rTop, z1t = s1 * rTop;
      const x1b = c1 * rBottom, z1b = s1 * rBottom;

      const nx0 = c0, nz0 = s0;
      const nx1 = c1, nz1 = s1;

      // Tri 1
      positions.push(x0b, -hh, z0b,  x1b, -hh, z1b,  x1t, hh, z1t);
      normals.push(nx0, 0, nz0,    nx1, 0, nz1,    nx1, 0, nz1);
      // Tri 2
      positions.push(x0b, -hh, z0b,  x1t, hh, z1t,  x0t, hh, z0t);
      normals.push(nx0, 0, nz0,    nx1, 0, nz1,    nx0, 0, nz0);

      for (let k = 0; k < 6; k++) colors.push(...rgb);

      // Caps can be added if needed, but for cars/poles side geometry suffices.
    }

    return makeMesh(new Float32Array(positions), new Float32Array(normals), new Float32Array(colors));
  }

  function cone(r, h, segments, colorHex) {
    const rgb = parseColor(colorHex);
    const positions = [];
    const normals = [];
    const colors = [];
    const hh = h / 2;

    for (let i = 0; i < segments; i++) {
      const theta0 = (i / segments) * Math.PI * 2;
      const theta1 = ((i + 1) / segments) * Math.PI * 2;

      const c0 = Math.cos(theta0), s0 = Math.sin(theta0);
      const c1 = Math.cos(theta1), s1 = Math.sin(theta1);

      const x0 = c0 * r, z0 = s0 * r;
      const x1 = c1 * r, z1 = s1 * r;

      positions.push(0, hh, 0,  x0, -hh, z0,  x1, -hh, z1);
      normals.push(0, 1, 0,  c0, 0, s0,  c1, 0, s1);

      for (let k = 0; k < 3; k++) colors.push(...rgb);
    }

    return makeMesh(new Float32Array(positions), new Float32Array(normals), new Float32Array(colors));
  }

  // --- State for drawing ---
  let projectionMatrix = mat4Identity();
  let viewMatrix = mat4Identity();
  const sunDir = [0.4, 0.8, 0.5]; // Normalized warm sun direction
  const sunLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  sunDir[0] /= sunLen; sunDir[1] /= sunLen; sunDir[2] /= sunLen;

  return {
    setCamera(eye, target, up, fovY = Math.PI / 3) {
      const aspect = canvas.width / canvas.height;
      projectionMatrix = mat4Perspective(fovY, aspect, 0.1, 4000.0);
      viewMatrix = mat4LookAt(eye, target, up);
    },

    begin(skyTopHex, skyBottomHex, fogHex) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      const fogRgb = parseColor(fogHex);
      gl.clearColor(fogRgb[0], fogRgb[1], fogRgb[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniformMatrix4fv(uProjectionLoc, false, projectionMatrix);
      gl.uniformMatrix4fv(uViewLoc, false, viewMatrix);
      gl.uniform3f(uSunDirLoc, sunDir[0], sunDir[1], sunDir[2]);
      gl.uniform3f(uFogColorLoc, fogRgb[0], fogRgb[1], fogRgb[2]);
    },

    box,
    quad,
    cylinder,
    cone,
    makeMesh,

    drawMesh(mesh, model, emissive = 0) {
      gl.bindVertexArray(mesh.vao);
      const mat = (model instanceof Float32Array) ? model : mat4FromTransform(model);
      gl.uniformMatrix4fv(uModelLoc, false, mat);
      gl.uniform1f(uEmissiveLoc, emissive);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      gl.bindVertexArray(null);
    },

    end() {
      gl.flush();
    }
  };
}
