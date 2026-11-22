/* Sparkle Island — a cozy blocky open world: ride unicorns, dinosaurs and toy cars, build with blocks. */
(() => {
'use strict';
const T = THREE;
const $ = id => document.getElementById(id);
// Graphics mode: classic blocks, or HD (textures, soft shadows, sky and water shaders, smooth models)
let gfxPref = null; try { gfxPref = localStorage.getItem('sparkle-gfx'); } catch (e) { /* no storage */ }
const HD = location.hash === '#hd' || (location.hash !== '#classic' && gfxPref === 'hd');
const LM = o => HD ? new T.MeshStandardMaterial(Object.assign({ roughness: .72, metalness: 0 }, o)) : new T.MeshLambertMaterial(o);
const W = 144, D = 144, H = 40, CS = 16, SEA = 5.8, TOWN_Y = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rngMaker(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = rngMaker(20261120);
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

/* ---------- blocks ---------- */
const BL = { // id: [top colour, side colour]
  1: [0x7ed957, 0x8a6a44], 2: [0x9b7653, 0x9b7653], 3: [0x9aa0a6, 0x9aa0a6], 4: [0xf4e3a1, 0xf0dc94],
  6: [0xa0703a, 0x8b5a2b], 7: [0x4caf50, 0x43a047], 8: [0xff9ed2, 0xff8cc8], 9: [0x5a5a66, 0x50505a],
  10: [0xffd84d, 0x50505a], 11: [0xff8fb8, 0xff8fb8], 12: [0xffffff, 0xf4f4fa], 13: [0xffffff, 0xffffff],
  14: [0xd9a066, 0xcf9558], 15: [0xbfe9ff, 0xbfe9ff], 16: [0xb388ff, 0xb388ff], 18: [0xffd700, 0xf5c400],
  19: [0x5fd3c4, 0x5fd3c4], 20: [0xff5a5a, 0xff5a5a], 21: [0xffe066, 0xffe066], 22: [0x6fa8ff, 0x6fa8ff],
  23: [0xffa64d, 0xffa64d], 24: [0x5fd35f, 0x5fd35f], 26: [0x4b4fc9, 0x4b4fc9], 25: [0x555560, 0x555560],
};
const RAINBOW = [0xff5a5a, 0xffa64d, 0xffe066, 0x5fd35f, 0x6fa8ff, 0xb388ff];
const HOTBAR = [11, 13, 12, 16, 22, 21, 1, 14, 18];
const LIN = {};
for (const id in BL) LIN[id] = BL[id].map(h => { const c = new T.Color(h); return [c.r, c.g, c.b]; });
const css = h => '#' + h.toString(16).padStart(6, '0');

const blocks = new Uint8Array(W * D * H);
const hmap = new Uint8Array(W * D), occ = new Uint8Array(W * D);
const getB = (x, y, z) => { if (y < 0) return 25; if (y >= H || x < 0 || z < 0 || x >= W || z >= D) return 0; return blocks[(y * D + z) * W + x]; };
const setRaw = (x, y, z, b) => { if (x < 0 || z < 0 || x >= W || z >= D || y < 0 || y >= H) return; blocks[(y * D + z) * W + x] = b; };
const hAt = (x, z) => { x = Math.floor(x); z = Math.floor(z); return (x < 0 || z < 0 || x >= W || z >= D) ? 0 : hmap[x + z * W]; };
const mark = (x, z, r = 0) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const X = x + a, Z = z + b; if (X >= 0 && Z >= 0 && X < W && Z < D) occ[X + Z * W] = 1; } };

/* ---------- world generation ---------- */
const hash2 = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7 + 7.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v); }
const fbm = (x, z) => vnoise(x / 38, z / 38) * .6 + vnoise(x / 17, z / 17) * .3 + vnoise(x / 7, z / 7) * .1;
const MEADOW = new T.Vector3(28.5, 9, 112.5), VALLEY = new T.Vector3(116.5, 9, 112.5), CLOUD = new T.Vector3(36.5, 29, 36.5), BAKERY = new T.Vector3(59, 8, 54.5);
const ZONES = [{ p: MEADOW, r: 15 }, { p: VALLEY, r: 15 }];
const zoneW = (zn, x, z) => 1 - sstep(zn.r * .55, zn.r, Math.hypot(x - zn.p.x, z - zn.p.z));
const cheb = (x, z) => Math.max(Math.abs(x - 72), Math.abs(z - 72));

function genWorld() {
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = 6.5 + (fbm(x, z) - .35) * 16;
    h -= sstep(.72, .98, cheb(x, z) / 72) * 12;
    for (const zn of ZONES) h = lerp(h, 9, zoneW(zn, x, z));
    h = lerp(h, TOWN_Y, 1 - sstep(24, 34, cheb(x, z)));
    h = clamp(Math.round(h), 1, 24);
    hmap[x + z * W] = h;
    const sandy = h <= 6 || zoneW(ZONES[1], x, z) > .5;
    for (let y = 0; y < h; y++) setRaw(x, y, z, y === 0 ? 25 : y < h - 3 ? 3 : y < h - 1 ? (sandy ? 4 : 2) : (sandy ? 4 : 1));
  }
  // town roads
  const RL = [52, 72, 92];
  for (let z = 51; z <= 93; z++) for (let x = 51; x <= 93; x++) {
    const nx = RL.find(c => Math.abs(x - c) <= 1), nz = RL.find(c => Math.abs(z - c) <= 1);
    if (nx === undefined && nz === undefined) continue;
    let b = 9;
    if (nx !== undefined && nz === undefined && x === nx && z % 4 < 2) b = 10;
    if (nz !== undefined && nx === undefined && z === nz && x % 4 < 2) b = 10;
    setRaw(x, TOWN_Y - 1, z, b);
  }
  // houses
  const walls = [12, 19, 21, 22, 11, 12, 21, 19], roofs = [11, 16, 20, 16, 16, 20, 22, 11];
  let hi = 0;
  for (const qx of [55, 75]) for (const qz of [55, 75]) {
    house(qx + 1, qz + 1, walls[hi], roofs[hi]); hi++;
    house(qx + 8, qz + 8, walls[hi], roofs[hi]); hi++;
    tree(qx + 11, qz + 3, hi % 2 === 0); tree(qx + 3, qz + 11, hi % 2 === 1);
  }
  // rainbow arch in the unicorn meadow
  for (let dx = -13; dx <= 13; dx++) for (let dy = 0; dy <= 13; dy++) {
    const r = Math.hypot(dx, dy); if (r < 6 || r >= 13) continue;
    const b = [20, 23, 21, 24, 22, 26, 16][Math.floor(13 - r)]; // red, orange, yellow, green, blue, indigo, violet
    for (const z of [104, 105]) { setRaw(28 + dx, 9 + dy, z, b); mark(28 + dx, z, 1); }
  }
  // cloud island
  for (let dx = -8; dx <= 8; dx++) for (let dz = -6; dz <= 6; dz++) {
    const e = dx * dx / 64 + dz * dz / 36; if (e >= 1) continue;
    setRaw(36 + dx, 28, 36 + dz, 12);
    if (e < .55) setRaw(36 + dx, 27, 36 + dz, 12);
    if (e > .6 && hash2(dx, dz) > .55) setRaw(36 + dx, 29, 36 + dz, 12);
  }
  for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy <= 3; dy++) { const r = Math.hypot(dx, dy); if (r >= 1.5 && r < 3.5) setRaw(36 + dx, 29 + dy, 31, [20, 21, 22][Math.floor(3.5 - r)] || 20); }
  // volcano + nest in dino valley
  const vx = 126, vz = 124, vb = hAt(vx, vz);
  for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
    const r = Math.hypot(dx, dz), top = Math.round(9 - r * 1.25); if (top < 0) continue;
    const base = Math.min(hAt(vx + dx, vz + dz), vb);
    for (let y = base; y <= vb + top; y++) setRaw(vx + dx, y, vz + dz, r < 1.6 && y >= vb + 6 ? (y === vb + top ? 23 : 20) : 3);
    mark(vx + dx, vz + dz);
  }
  for (let a = 0; a < 16; a++) { const x = Math.round(116 + Math.cos(a / 16 * 6.283) * 2.6), z = Math.round(112 + Math.sin(a / 16 * 6.283) * 2.6); setRaw(x, hAt(x, z), z, 6); }
  mark(116, 112, 4);
  // trees and boulders
  for (let i = 0; i < 420; i++) {
    const x = 4 + Math.floor(rng() * (W - 8)), z = 4 + Math.floor(rng() * (D - 8)), h = hAt(x, z);
    if (h <= 6 || cheb(x, z) < 26 || occ[x + z * W]) continue;
    const inMeadow = zoneW(ZONES[0], x, z), inValley = zoneW(ZONES[1], x, z);
    if (Math.hypot(x - MEADOW.x, z - MEADOW.z) < 6) continue;
    if (inValley > .3) { if (rng() < .35) { setRaw(x, h, z, 3); if (rng() < .5) setRaw(x + 1, h, z, 3); mark(x, z, 1); } continue; }
    tree(x, z, inMeadow > .2 || rng() < .18);
  }
}
function house(x0, z0, wall, roof) {
  const y0 = TOWN_Y;
  for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 6; dz++) {
    setRaw(x0 + dx, y0 - 1, z0 + dz, 14);
    const edge = dx === 0 || dx === 5 || dz === 0 || dz === 5; if (!edge) continue;
    for (let y = 0; y < 4; y++) {
      let b = wall;
      const mid = (dx === 2 || dx === 3) || (dz === 2 || dz === 3), corner = (dx === 0 || dx === 5) && (dz === 0 || dz === 5);
      if (dz === 0 && (dx === 2 || dx === 3)) b = y < 2 ? 0 : wall;       // door
      else if (mid && !corner && (y === 1 || y === 2)) b = 15;            // windows
      setRaw(x0 + dx, y0 + y, z0 + dz, b);
    }
  }
  for (let k = 0; k < 4; k++) for (let x = x0 - 1 + k; x <= x0 + 6 - k; x++) for (let z = z0 - 1 + k; z <= z0 + 6 - k; z++) setRaw(x, y0 + 4 + k, z, roof);
  for (let dx = -1; dx <= 6; dx++) for (let dz = -1; dz <= 6; dz++) mark(x0 + dx, z0 + dz);
}
function tree(x, z, pink) {
  const h = hAt(x, z), L = pink ? 8 : 7, th = 4 + (hash2(x, z) > .5 ? 1 : 0);
  for (let y = 0; y < th; y++) setRaw(x, h + y, z, 6);
  const put = (X, Y, Z) => { if (!getB(X, Y, Z)) setRaw(X, Y, Z, L); };
  for (let dy = 0; dy < 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) < 4) put(x + dx, h + th - 1 + dy, z + dz);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(x + dx, h + th + 1, z + dz);
  put(x, h + th + 2, z);
  mark(x, z, 1);
}
genWorld();

/* ---------- saved progress ---------- */
const SAVE_KEY = 'sparkle-island-v1';
let save = null; try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* no storage */ }
const edits = (save && save.edits) || {};
for (const k in edits) if (+k >= W * D && +k < blocks.length) blocks[+k] = edits[k];

/* ---------- renderer / scene ---------- */
const canvas = $('game');
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new T.Scene();
scene.background = new T.Color(0x9fd8ff);
scene.fog = new T.Fog(0xc4e8ff, 70, 190);
const camera = new T.PerspectiveCamera(65, 1, .1, 500);
scene.add(new T.HemisphereLight(0xffffff, 0xc9b6e6, 2.5));
const sunL = new T.DirectionalLight(0xfff2cc, 1.1); sunL.position.set(.5, 1, .3); scene.add(sunL);
const sun = new T.Mesh(new T.SphereGeometry(14, 16, 12), new T.MeshBasicMaterial({ color: 0xfff3a0, fog: false }));
sun.position.set(150, 170, 90).add(new T.Vector3(72, 0, 72)); scene.add(sun);
const water = new T.Mesh(new T.PlaneGeometry(900, 900), LM({ color: 0x4fc3f7, transparent: true, opacity: .78 }));
water.rotation.x = -Math.PI / 2; water.position.set(72, SEA, 72); scene.add(water);
const SUN_DIR = new T.Vector3(.5, .78, .38).normalize(); let skyDome = null, waterU = null;
if (HD) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.NoToneMapping;
  scene.fog = new T.Fog(0xa9d4fb, 90, 260);
  scene.children.forEach(l => { if (l.isHemisphereLight) { l.intensity = 1.35; l.color.set(0xd6e9ff); l.groundColor.set(0x9aa67a); } });
  sunL.intensity = 2.5; sunL.color.set(0xfff0d8); sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048);
  const sc = sunL.shadow.camera; sc.left = sc.bottom = -46; sc.right = sc.top = 46; sc.near = 1; sc.far = 240; sc.updateProjectionMatrix();
  sunL.shadow.bias = -.0004; sunL.shadow.normalBias = .06; scene.add(sunL.target); sun.visible = false;
  skyDome = new T.Mesh(new T.SphereGeometry(420, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(vec3(0.66, 0.83, 0.98), vec3(0.13, 0.42, 0.92), pow(h, 0.45));
        float s = max(dot(d, sunDir), 0.0); c += vec3(1.0, 0.86, 0.62) * (pow(s, 420.0) * 4.0 + pow(s, 10.0) * 0.28);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
  waterU = { time: { value: 0 }, sunDir: { value: SUN_DIR }, camPos: { value: new T.Vector3() } };
  water.material = new T.ShaderMaterial({ transparent: true, uniforms: waterU,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; uniform vec3 sunDir; uniform vec3 camPos; varying vec3 vW;
      float hgt(vec2 p){ return sin(p.x * 0.9 + time * 1.3) * 0.5 + sin(p.y * 1.1 - time * 1.1) * 0.5 + sin((p.x + p.y) * 2.3 + time * 2.0) * 0.25 + sin((p.x - p.y) * 3.7 - time * 2.6) * 0.12 + sin(p.x * 7.1 + p.y * 5.3 + time * 3.1) * 0.05; }
      void main(){ vec2 p = vW.xz; float e = 0.12;
        vec3 n = normalize(vec3((hgt(p - vec2(e, 0.0)) - hgt(p + vec2(e, 0.0))) * 0.35, 1.0, (hgt(p - vec2(0.0, e)) - hgt(p + vec2(0.0, e))) * 0.35));
        vec3 v = normalize(camPos - vW); float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 c = mix(vec3(0.03, 0.30, 0.42), vec3(0.62, 0.80, 0.97), clamp(fres, 0.0, 1.0));
        float sp = pow(max(dot(reflect(-v, n), sunDir), 0.0), 240.0); c += vec3(1.0, 0.95, 0.8) * sp * 2.5;
        c = mix(c, vec3(0.66, 0.83, 0.98), smoothstep(90.0, 260.0, length(camPos - vW)));
        gl_FragColor = vec4(c, mix(0.74, 0.98, fres));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();

/* ---------- chunk meshing ---------- */
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: .82 }, { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: .82 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1 }, { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: .6 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: .92 }, { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: .92 },
];
for (const f of FACES) {
  const a = f.n.findIndex(v => v !== 0), u = (a + 1) % 3, v = (a + 2) % 3;
  f.ao = f.c.map(c => { const o = [c[0] ? 1 : -1, c[1] ? 1 : -1, c[2] ? 1 : -1]; const p1 = f.n.slice(), p2 = f.n.slice(), p3 = f.n.slice(); p1[u] += o[u]; p2[v] += o[v]; p3[u] += o[u]; p3[v] += o[v]; return [p1, p2, p3]; });
}
function makeAtlas() { // one detailed 128px tile per block face type (top = id*2, side = id*2+1)
  const TS = 128, c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'), r = rngMaker(99);
  const shade = (h, k) => { const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f((h >> 16) & 255)},${f((h >> 8) & 255)},${f(h & 255)})`; };
  const speck = (col, n, a, sz) => { for (let i = 0; i < n; i++) { g.globalAlpha = a * (.4 + r() * .6); g.fillStyle = shade(col, r() < .5 ? .7 : 1.25); g.fillRect(r() * TS, r() * TS, 1 + r() * sz, 1 + r() * sz); } g.globalAlpha = 1; };
  const blobs = (col, n, a, lo, hi) => { for (let i = 0; i < n; i++) { g.globalAlpha = a; g.fillStyle = shade(col, .6 + r() * .75); g.beginPath(); g.ellipse(r() * TS, r() * TS, lo + r() * (hi - lo), lo + r() * (hi - lo) * .7, r() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; };
  for (const id in BL) for (let k = 0; k < 2; k++) {
    const t = id * 2 + k, col = +id === 13 ? 0xffffff : BL[id][k];
    g.save(); g.translate((t % 8) * TS, Math.floor(t / 8) * TS); g.beginPath(); g.rect(0, 0, TS, TS); g.clip();
    g.fillStyle = css(col); g.fillRect(0, 0, TS, TS);
    switch (+id) {
      case 1:
        if (k === 0) { blobs(col, 60, .25, 4, 12); speck(col, 900, .55, 2); g.lineWidth = 1.5; for (let i = 0; i < 260; i++) { const x = r() * TS, y = r() * TS; g.globalAlpha = .5; g.strokeStyle = shade(col, r() < .5 ? .7 : 1.3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 4 - 2, y - 3 - r() * 5); g.stroke(); } g.globalAlpha = 1; }
        else { blobs(col, 30, .3, 3, 9); speck(col, 500, .45, 4); g.fillStyle = css(BL[1][0]); g.fillRect(0, 0, TS, 18); for (let x = 0; x < TS; x += 5) { g.fillStyle = shade(BL[1][0], .8 + r() * .4); g.beginPath(); g.moveTo(x - 1, 16); g.lineTo(x + 6, 16); g.lineTo(x + 2.5, 22 + r() * 16); g.fill(); } }
        break;
      case 2: case 4: blobs(col, 40, .2, 3, 10); speck(col, 700, .4, 3); blobs(col, 10, .35, 2, 4); break;
      case 3: case 25: blobs(col, 40, .3, 6, 18); speck(col, 500, .35, 3); g.strokeStyle = shade(col, .5); g.lineWidth = 1.5; g.globalAlpha = .5; for (let i = 0; i < 5; i++) { let x = r() * TS, y = r() * TS; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += r() * 30 - 15; y += r() * 30 - 15; g.lineTo(x, y); } g.stroke(); } g.globalAlpha = 1; break;
      case 6:
        if (k === 1) { for (let x = 0; x < TS; x += 3) { g.globalAlpha = .15 + r() * .4; g.fillStyle = shade(col, r() < .6 ? .55 : 1.25); g.fillRect(x + r() * 2, 0, 1 + r() * 2.5, TS); } g.globalAlpha = 1; speck(col, 200, .3, 3); }
        else { g.strokeStyle = shade(col, .65); g.lineWidth = 2; for (let q = 8; q < 90; q += 9) { g.globalAlpha = .5; g.beginPath(); g.arc(64, 64, q, 0, 7); g.stroke(); } g.globalAlpha = 1; }
        break;
      case 7: case 8: blobs(col, 300, .6, 4, 10); speck(col, 300, .4, 3); break;
      case 9: speck(col, 1500, .4, 2); break;
      case 10: if (k === 0) speck(col, 300, .25, 3); else speck(col, 1500, .4, 2); break;
      case 11: for (let row = 0; row < 4; row++) for (let b = -1; b < 2; b++) { const x = b * 64 + (row % 2) * 32, y = row * 32; g.fillStyle = shade(col, .82 + r() * .3); g.fillRect(x + 2, y + 2, 60, 28); g.strokeStyle = shade(col, 1.35); g.lineWidth = 3; g.strokeRect(x, y, 64, 32); } speck(col, 300, .2, 2); break;
      case 14: for (let row = 0; row < 4; row++) { g.fillStyle = shade(col, .88 + r() * .22); g.fillRect(0, row * 32, TS, 32); g.fillStyle = shade(col, .55); g.fillRect(0, row * 32, TS, 2); for (let i = 0; i < 9; i++) { g.globalAlpha = .25; g.fillRect(r() * TS, row * 32 + 4 + r() * 26, 20 + r() * 50, 1); } g.globalAlpha = 1; } break;
      case 15: { g.fillStyle = shade(col, .78); g.fillRect(0, 0, TS, TS); g.fillStyle = css(col); g.fillRect(6, 6, TS - 12, TS - 12); g.globalAlpha = .45; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(20, 100); g.lineTo(70, 16); g.lineTo(86, 16); g.lineTo(36, 100); g.fill(); g.beginPath(); g.moveTo(60, 108); g.lineTo(98, 44); g.lineTo(104, 44); g.lineTo(66, 108); g.fill(); g.globalAlpha = 1; break; }
      case 16: case 20: for (let row = 0; row < 5; row++) for (let b = -1; b < 5; b++) { const x = b * 32 + (row % 2) * 16, y = row * 26; g.fillStyle = shade(col, .82 + r() * .3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 32, y); g.lineTo(x + 32, y + 18); g.quadraticCurveTo(x + 16, y + 34, x, y + 18); g.fill(); g.strokeStyle = shade(col, .55); g.lineWidth = 1.5; g.stroke(); } break;
      case 18: { const gr = g.createLinearGradient(0, 0, TS, TS); gr.addColorStop(0, shade(col, 1.25)); gr.addColorStop(.5, shade(col, .85)); gr.addColorStop(1, shade(col, 1.2)); g.fillStyle = gr; g.fillRect(0, 0, TS, TS); speck(col, 200, .3, 3); g.strokeStyle = shade(col, .7); g.lineWidth = 4; g.strokeRect(2, 2, TS - 4, TS - 4); break; }
      default: blobs(col, 25, .12, 8, 20); speck(col, 400, .18, 4);
    }
    g.restore();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
}
const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
const chunkMat = LM(HD ? { vertexColors: true, map: makeAtlas(), roughness: .9 } : { vertexColors: true });
const NCX = W / CS, NCZ = D / CS, chunks = [];
const tmpC = new T.Color();
function buildChunk(cx, cz) {
  const pos = [], col = [], nor = [], ind = [], uv = [];
  for (let z = cz * CS; z < cz * CS + CS; z++) for (let x = cx * CS; x < cx * CS + CS; x++) for (let y = 0; y < H; y++) {
    const b = blocks[(y * D + z) * W + x]; if (!b) continue;
    const jit = .93 + .14 * hash2(x * 1.7 + y * 3.1, z * 2.3 + y);
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi], n = f.n;
      if (getB(x + n[0], y + n[1], z + n[2])) continue;
      if (y === 0 && fi === 3) continue;
      let r, g, bl;
      if (b === 13) { tmpC.setHSL(((x + y + z) % 12) / 12, .95, .62); r = tmpC.r; g = tmpC.g; bl = tmpC.b; }
      else if (HD) r = g = bl = 1;
      else { const c = LIN[b][fi === 2 ? 0 : 1]; r = c[0]; g = c[1]; bl = c[2]; }
      const tile = b * 2 + (fi === 2 ? 0 : 1), tx = tile % 8, ty = Math.floor(tile / 8);
      const base = pos.length / 3, aos = [];
      for (let k = 0; k < 4; k++) {
        const c = f.c[k], o = f.ao[k];
        const s1 = getB(x + o[0][0], y + o[0][1], z + o[0][2]) ? 1 : 0, s2 = getB(x + o[1][0], y + o[1][1], z + o[1][2]) ? 1 : 0, s3 = getB(x + o[2][0], y + o[2][1], z + o[2][2]) ? 1 : 0;
        const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3); aos.push(ao);
        const sh = HD ? .45 + .55 * ao / 3 : f.s * jit * (.62 + .38 * ao / 3);
        if (HD) uv.push((tx + .02 + UVC[k][0] * .96) / 8, 1 - (ty + .98 - UVC[k][1] * .96) / 8);
        pos.push(x + c[0], y + c[1], z + c[2]); col.push(r * sh, g * sh, bl * sh); nor.push(n[0], n[1], n[2]);
      }
      if (aos[0] + aos[2] >= aos[1] + aos[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  if (HD) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  const i = cx + cz * NCX;
  if (chunks[i]) { chunks[i].geometry.dispose(); chunks[i].geometry = g; }
  else { chunks[i] = new T.Mesh(g, chunkMat); chunks[i].castShadow = chunks[i].receiveShadow = HD; scene.add(chunks[i]); }
}
for (let cz = 0; cz < NCZ; cz++) for (let cx = 0; cx < NCX; cx++) buildChunk(cx, cz);

/* ---------- minimap ---------- */
const mapBase = document.createElement('canvas'); mapBase.width = W; mapBase.height = D;
const mbx = mapBase.getContext('2d'), mapCtx = $('map').getContext('2d');
function mapPixel(x, z) {
  let c = '#4fc3f7';
  for (let y = H - 1; y >= 0; y--) { const b = getB(x, y, z); if (b) { if (y >= 5) c = b === 13 ? '#ff9ed2' : css(BL[b][0]); break; } }
  mbx.fillStyle = c; mbx.fillRect(x, z, 1, 1);
}
for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) mapPixel(x, z);

function setBlock(x, y, z, b) {
  setRaw(x, y, z, b); edits[(y * D + z) * W + x] = b;
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS), lx = x % CS, lz = z % CS;
  buildChunk(cx, cz);
  if (lx === 0 && cx > 0) buildChunk(cx - 1, cz); if (lx === CS - 1 && cx < NCX - 1) buildChunk(cx + 1, cz);
  if (lz === 0 && cz > 0) buildChunk(cx, cz - 1); if (lz === CS - 1 && cz < NCZ - 1) buildChunk(cx, cz + 1);
  mapPixel(x, z);
}

/* ---------- model helpers ---------- */
const matCache = {};
const mat = c => matCache[c] || (matCache[c] = LM({ color: c }));
const boxGeo = {};
function roundedBox(w, h, d) { // box with soft, smoothly shaded edges
  const r = Math.min(w, h, d) * .34, g = new T.BoxGeometry(w, h, d, 4, 4, 4), p = g.attributes.position, n = g.attributes.normal, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), cx = clamp(x, -hx, hx), cy = clamp(y, -hy, hy), cz = clamp(z, -hz, hz), l = Math.hypot(x - cx, y - cy, z - cz);
    if (l > 1e-6) { const nx = (x - cx) / l, ny = (y - cy) / l, nz = (z - cz) / l; p.setXYZ(i, cx + nx * r, cy + ny * r, cz + nz * r); n.setXYZ(i, nx, ny, nz); }
  }
  return g;
}
function box(parent, w, h, d, x, y, z, c) {
  const k = w + '|' + h + '|' + d, g = boxGeo[k] || (boxGeo[k] = HD ? roundedBox(w, h, d) : new T.BoxGeometry(w, h, d));
  const m = new T.Mesh(g, typeof c === 'number' ? mat(c) : c); m.position.set(x, y, z); parent.add(m); return m;
}
function pivot(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function canvasTex(size, draw) {
  const q = HD ? Math.min(4, 512 / size) : 1, c = document.createElement('canvas'); c.width = c.height = size * q; const g = c.getContext('2d'); g.scale(q, q); draw(g, size);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; if (HD) t.anisotropy = 4; return t;
}
const texMat = t => LM({ map: t });
const trng = rngMaker(7);

/* ---------- the girl ---------- */
const SKIN = 0xffd7c2, HAIR = 0xf3dc8f;
const faceTex = fringe => canvasTex(64, (g) => {
  g.fillStyle = '#ffd7c2'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,120,150,.45)'; for (const x of [13, 51]) { g.beginPath(); g.arc(x, 41, 7, 0, 7); g.fill(); }
  for (const x of [20, 44]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 28, 6.5, 7.5, 0, 0, 7); g.fill();
    g.fillStyle = '#4f8fe0'; g.beginPath(); g.arc(x, 29, 4.6, 0, 7); g.fill();
    g.fillStyle = '#16233a'; g.beginPath(); g.arc(x, 29, 2.2, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 1.6, 27.2, 1.3, 0, 7); g.fill();
    g.strokeStyle = '#d2b36a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, 17.5); g.quadraticCurveTo(x, 15, x + 6, 17.5); g.stroke();
  }
  g.fillStyle = '#f2b7a2'; g.beginPath(); g.arc(32, 37, 2.2, 0, 7); g.fill();
  g.fillStyle = '#b5434e'; g.beginPath(); g.moveTo(19, 44); g.quadraticCurveTo(32, 62, 45, 44); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(22, 44.5); g.lineTo(42, 44.5); g.quadraticCurveTo(32, 51, 22, 44.5); g.fill();
  g.fillStyle = '#f3dc8f';
  if (fringe) { g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.lineTo(64, 12); g.quadraticCurveTo(46, 3, 32, 6); g.quadraticCurveTo(18, 3, 0, 12); g.fill(); }
  else { g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64); g.fillRect(8, 0, 2, 30); g.fillRect(53, 0, 2, 34); }
});
const pajamaTex = canvasTex(64, g => {
  g.fillStyle = '#f6b4de'; g.fillRect(0, 0, 64, 64);
  const cs = ['#3fc1c9', '#ffd84d', '#ff5a5a', '#ffffff', '#7b5cff', '#5fd35f', '#2b2b2b'];
  for (let i = 0; i < 46; i++) { g.fillStyle = cs[i % 6]; g.beginPath(); g.ellipse(trng() * 64, trng() * 64, 2 + trng() * 4, 1.5 + trng() * 2.5, trng() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(214,107,170,.8)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { const x = trng() * 64, y = trng() * 64; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 5, y - 5, x + 10, y + 1); g.stroke(); }
});
const daisyTex = canvasTex(64, g => {
  g.fillStyle = '#b9dcf5'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 9; i++) {
    const x = 8 + (i % 3) * 22 + ((i / 3 | 0) % 2) * 9, y = 9 + (i / 3 | 0) * 22;
    g.fillStyle = '#fff'; for (let p = 0; p < 6; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.047) * 4.6, y + Math.sin(p * 1.047) * 4.6, 2.9, 0, 7); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
  }
});
const fuzzTex = canvasTex(64, g => {
  g.fillStyle = '#7a5c3e'; g.fillRect(0, 0, 64, 64);
  const cs = ['#5e452c', '#9b7b56', '#3f2e1d', '#b89a72', '#6d5237'];
  for (let i = 0; i < 520; i++) { g.strokeStyle = cs[i % 5]; g.lineWidth = 1.2; const x = trng() * 64, y = trng() * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x + trng() * 4 - 2, y + 3 + trng() * 5); g.stroke(); }
});
function buildGirl(outfit) {
  const g = new T.Group(), P = {};
  const cloth = texMat(outfit === 0 ? pajamaTex : daisyTex);
  P.legs = [pivot(g, -.12, .5, 0), pivot(g, .12, .5, 0)];
  for (const leg of P.legs) {
    if (outfit === 0) { box(leg, .21, .42, .23, 0, -.21, 0, cloth); box(leg, .17, .08, .26, 0, -.46, .02, SKIN); }
    else { box(leg, .22, .2, .24, 0, -.1, 0, 0xc9a7f5); box(leg, .17, .3, .19, 0, -.35, 0, SKIN); }
  }
  box(g, .48, .5, .28, 0, .75, 0, cloth);
  if (outfit === 1) box(g, .52, .06, .3, 0, .52, 0, cloth);
  P.arms = [pivot(g, -.32, .97, 0), pivot(g, .32, .97, 0)];
  P.arms.forEach((arm, i) => {
    if (outfit === 0) { box(arm, .15, .38, .18, 0, -.19, 0, cloth); box(arm, .13, .1, .15, 0, -.43, 0, SKIN); }
    else { box(arm, .17, .17, .2, 0, -.07, 0, cloth); box(arm, .13, .32, .15, 0, -.31, 0, SKIN); if (i === 0) box(arm, .16, .05, .18, 0, -.4, 0, 0x7a3fd1); }
  });
  const head = P.head = pivot(g, 0, 1.0, 0);
  const sk = mat(SKIN), hr = mat(HAIR);
  box(head, .5, .5, .5, 0, .25, 0, [sk, sk, hr, sk, texMat(faceTex(outfit === 1)), hr]);
  if (outfit === 0) { // long loose hair + fuzzy hat
    box(head, .54, .86, .1, 0, .03, -.28, HAIR);
    for (const s of [-1, 1]) { box(head, .08, .72, .34, s * .28, .06, -.06, HAIR); box(head, .07, .62, .07, s * .25, -.02, .23, HAIR); }
    const fz = texMat(fuzzTex);
    box(head, .64, .3, .64, 0, .5, 0, fz); box(head, .5, .08, .5, 0, .68, 0, fz);
    box(head, .28, .1, .03, 0, .5, .325, 0xdccbae);
    for (const s of [-1, 1]) box(head, .03, .03, .02, s * .1, .5, .345, 0xc9a23a);
  } else { // hair pulled up with a little yellow tie
    box(head, .54, .1, .54, 0, .51, 0, HAIR);
    box(head, .54, .72, .09, 0, .12, -.28, HAIR);
    for (const s of [-1, 1]) box(head, .06, .4, .3, s * .27, .28, -.1, HAIR);
    box(head, .1, .08, .1, .1, .59, .08, 0xffe14d); box(head, .08, .14, .08, .1, .68, .06, HAIR);
    box(head, .16, .5, .12, 0, .1, -.37, HAIR);
  }
  return { g, P };
}

/* ---------- animals & cars ---------- */
const STATS = {
  player: { speed: 6, jump: 8.6, hw: .3, h: 1.6 },
  unicorn: { speed: 10.5, jump: 11.5, hw: .4, h: 1.9, glide: true, airSpeed: 14, seat: [1.3, 0], label: 'unicorn', emoji: '🦄', cam: 6.5 },
  rex: { speed: 8.5, jump: 9.5, hw: .55, h: 2.6, stomp: true, seat: [2.12, -.1], label: 'T-rex', emoji: '🦖', cam: 8 },
  bronto: { speed: 6, jump: 8.6, hw: .7, h: 2.6, seat: [2.42, .2], label: 'long-neck', emoji: '🦕', cam: 10 },
  ptero: { speed: 6, airSpeed: 13, jump: 9, hw: .45, h: 1.5, fly: true, seat: [1.1, 0], label: 'pterodactyl', emoji: '🪽', cam: 7.5 },
  car: { speed: 15, jump: 8.6, hw: .7, h: 1.3, car: true, seat: [.72, -.3], label: 'car', emoji: '🚗', cam: 7.5 },
  dad: { speed: 6.5, jump: 9, hw: .32, h: 2.0, person: true, seat: [1.62, -.3], label: 'Dad', cam: 7 },
  lady: { speed: 6.5, jump: 9, hw: .32, h: 2.0, person: true, seat: [1.62, -.3], label: 'her', cam: 7 },
  baby: { speed: 7.5, jump: 9, hw: .25, h: .8 },
  dog: { speed: 9.5, jump: 9, hw: .24, h: .6 },
};
function eye(parent, x, y, z, s) { for (const sd of [-1, 1]) { box(parent, .04, s, s, sd * x, y, z, 0xffffff); box(parent, .05, s * .55, s * .55, sd * (x + .01), y - s * .1, z + s * .1, 0x1b1b2f); } }
function buildUnicorn(c, mane) {
  const g = new T.Group(), parts = { legs: [], wings: [] };
  box(g, .6, .55, 1.25, 0, 1.05, 0, c);
  for (const s of [-1, 1]) { const w = pivot(g, s * .3, 1.3, .12); box(w, .9, .06, .55, s * .45, 0, 0, 0xffffff); box(w, .55, .06, .4, s * 1.1, 0, -.08, 0xffc9ec); box(w, .3, .06, .28, s * 1.5, 0, -.14, 0xc9b8ff); w.visible = false; parts.wings.push(w); }
  for (const [x, z] of [[-.2, .45], [.2, .45], [-.2, -.45], [.2, -.45]]) { const l = pivot(g, x, .8, z); box(l, .17, .72, .17, 0, -.36, 0, c); box(l, .19, .1, .19, 0, -.75, 0, 0xffb7dc); parts.legs.push(l); }
  const neck = pivot(g, 0, 1.15, .5); neck.rotation.x = .45; box(neck, .28, .75, .3, 0, .32, 0, c);
  for (let i = 0; i < 6; i++) box(neck, .1, .14, .16, 0, .08 + i * .12, -.2, mane);
  const head = parts.head = pivot(g, 0, 1.82, .82);
  box(head, .32, .32, .55, 0, 0, .12, c); box(head, .27, .22, .14, 0, -.04, .44, 0xffc9de);
  eye(head, .16, .04, .14, .11);
  for (const s of [-1, 1]) box(head, .08, .14, .06, s * .11, .22, -.08, c);
  box(head, .1, .12, .14, 0, .2, .02, mane);
  const horn = new T.Mesh(new T.ConeGeometry(.065, .45, 6), mat(0xffd23f)); horn.position.set(0, .36, .2); horn.rotation.x = .35; head.add(horn);
  const tail = parts.tail = pivot(g, 0, 1.22, -.62); for (let i = 0; i < 6; i++) box(tail, .13, .15, .15, 0, -i * .11, -.06 - i * .05, mane);
  return { g, parts };
}
function buildRex(c, belly) {
  const g = new T.Group(), parts = { legs: [], wings: [] };
  box(g, .9, 1.0, 1.5, 0, 1.65, 0, c); box(g, .7, .3, 1.3, 0, 1.12, .05, belly);
  for (const s of [-1, 1]) { const l = pivot(g, s * .33, 1.2, -.1); box(l, .34, 1.0, .42, 0, -.5, 0, c); box(l, .38, .2, .62, 0, -1.1, .1, c); parts.legs.push(l); box(g, .14, .36, .14, s * .5, 1.55, .68, c).rotation.x = -.7; }
  box(g, .6, .6, .5, 0, 2.05, .62, c);
  const head = parts.head = pivot(g, 0, 2.25, .9);
  box(head, .8, .7, .95, 0, .1, .2, c); box(head, .72, .2, .82, 0, -.32, .24, belly);
  eye(head, .4, .25, .3, .26);
  for (let i = 0; i < 4; i++) box(head, .08, .1, .06, -.24 + i * .16, -.2, .68, 0xffffff);
  for (const s of [-1, 1]) box(head, .06, .06, .04, s * .15, .25, .68, 0x2d5a2d);
  const tail = parts.tail = pivot(g, 0, 1.65, -.75);
  box(tail, .7, .7, .7, 0, -.05, -.3, c); box(tail, .5, .5, .7, 0, -.15, -.9, c); box(tail, .3, .3, .6, 0, -.25, -1.5, c);
  for (let i = 0; i < 5; i++) box(g, .12, .22, .2, 0, 2.22, -.55 + i * .26, 0xffa64d);
  return { g, parts };
}
function buildBronto(c, dark) {
  const g = new T.Group(), parts = { legs: [], wings: [] };
  box(g, 1.4, 1.2, 2.3, 0, 1.85, 0, c);
  for (const [x, z] of [[-.45, .75], [.45, .75], [-.45, -.75], [.45, -.75]]) { const l = pivot(g, x, 1.3, z); box(l, .45, 1.3, .45, 0, -.65, 0, c); parts.legs.push(l); }
  for (let i = 0; i < 5; i++) { const w = .52 - i * .03; box(g, w, .72, w, 0, 2.5 + i * .6, 1.1 + i * .28, c); }
  const head = parts.head = pivot(g, 0, 5.45, 2.5);
  box(head, .56, .45, .85, 0, 0, .15, c); eye(head, .28, .08, .25, .16);
  box(head, .4, .05, .04, 0, -.12, .58, dark);
  const tail = parts.tail = pivot(g, 0, 1.9, -1.15);
  for (let i = 0; i < 4; i++) { const w = .72 - i * .14; box(tail, w, w, .65, 0, -i * .25, -.3 - i * .55, c); }
  for (const [x, z] of [[.3, .5], [-.35, .1], [.2, -.5], [-.2, -.8], [.45, -.1]]) box(g, .3, .04, .3, x, 2.46, z, dark);
  return { g, parts };
}
function buildPtero(c, c2) {
  const g = new T.Group(), parts = { legs: [], wings: [] };
  box(g, .5, .45, 1.1, 0, .85, 0, c);
  for (const s of [-1, 1]) { const l = pivot(g, s * .15, .64, -.2); box(l, .1, .64, .1, 0, -.32, 0, c2); parts.legs.push(l); const w = pivot(g, s * .25, 1.0, .05); box(w, 1.7, .07, .75, s * .85, 0, 0, c2); box(w, .7, .07, .5, s * 1.9, 0, -.1, c2); parts.wings.push(w); }
  box(g, .26, .4, .26, 0, 1.1, .5, c);
  const head = parts.head = pivot(g, 0, 1.38, .6);
  box(head, .36, .34, .46, 0, 0, 0, c); box(head, .16, .13, .72, 0, -.06, .55, 0xffe066); box(head, .08, .22, .5, 0, .2, -.36, 0xff5a5a);
  eye(head, .18, .05, .08, .12);
  return { g, parts };
}
function buildCar(c) {
  const g = new T.Group(), parts = { legs: [], wings: [], wheels: [] };
  box(g, 1.3, .4, 2.5, 0, .52, 0, c); box(g, 1.3, .26, .85, 0, .84, .8, c); box(g, 1.3, .26, .5, 0, .84, -1.0, c);
  box(g, 1.2, .42, .06, 0, 1.12, .38, LM({ color: 0xcfefff, transparent: true, opacity: .55 }));
  box(g, 1.05, .55, .16, 0, .98, -.72, 0xffffff);
  for (const s of [-1, 1]) { box(g, .26, .16, .06, s * .42, .84, 1.24, 0xfff3a0); box(g, .22, .12, .05, s * .45, .84, -1.26, 0xff5a5a); }
  box(g, 1.34, .08, 2.54, 0, .36, 0, 0xffffff);
  const wg = new T.CylinderGeometry(.33, .33, .24, 14), hg = new T.CylinderGeometry(.15, .15, .26, 5);
  for (const [x, z] of [[-.68, .8], [.68, .8], [-.68, -.8], [.68, -.8]]) {
    const p = pivot(g, x, .33, z); const w = new T.Mesh(wg, mat(0x33333d)); w.rotation.z = Math.PI / 2; p.add(w);
    const hcap = new T.Mesh(hg, mat(0xffd23f)); hcap.rotation.z = Math.PI / 2; p.add(hcap); parts.wheels.push(p);
  }
  return { g, parts };
}
function adultFace(o) {
  return canvasTex(64, g => {
    g.fillStyle = o.skinCss; g.fillRect(0, 0, 64, 64);
    if (o.stubble) { g.fillStyle = 'rgba(110,80,55,.22)'; g.fillRect(0, 40, 64, 24); g.fillRect(0, 26, 6, 20); g.fillRect(58, 26, 6, 20); g.fillRect(20, 38, 24, 5); }
    g.fillStyle = 'rgba(240,120,130,.3)'; for (const x of [12, 52]) { g.beginPath(); g.arc(x, 40, 6, 0, 7); g.fill(); }
    for (const x of [20, 44]) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 28, 5.5, 5, 0, 0, 7); g.fill();
      g.fillStyle = o.eye; g.beginPath(); g.arc(x, 28.5, 3.6, 0, 7); g.fill();
      g.fillStyle = '#16233a'; g.beginPath(); g.arc(x, 28.5, 1.7, 0, 7); g.fill();
      g.strokeStyle = o.brow; g.lineWidth = o.glasses ? 2 : 3; g.beginPath(); g.moveTo(x - 7, 19); g.quadraticCurveTo(x, 16, x + 7, 19); g.stroke();
    }
    g.fillStyle = 'rgba(190,120,100,.5)'; g.beginPath(); g.arc(32, 37, 2.4, 0, 7); g.fill();
    g.fillStyle = '#a8424c'; g.beginPath(); g.moveTo(21, 46); g.quadraticCurveTo(32, 58, 43, 46); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(23, 46.5); g.lineTo(41, 46.5); g.quadraticCurveTo(32, 51, 23, 46.5); g.fill();
    if (o.glasses) { g.strokeStyle = '#c2274f'; g.lineWidth = 3; g.strokeRect(10.5, 20.5, 19, 15); g.strokeRect(34.5, 20.5, 19, 15); g.beginPath(); g.moveTo(29.5, 26); g.lineTo(34.5, 26); g.stroke(); }
    g.fillStyle = o.hairCss; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0);
    if (o.glasses) { g.lineTo(64, 16); g.quadraticCurveTo(50, 4, 26, 5); g.quadraticCurveTo(10, 6, 0, 18); } else { g.lineTo(64, 9); g.quadraticCurveTo(32, 2, 0, 9); }
    g.fill();
  });
}
function bubble(text) {
  const t = canvasTex(256, g => {
    g.fillStyle = '#fff'; g.strokeStyle = '#3a2352'; g.lineWidth = 8; g.beginPath(); g.roundRect(8, 70, 240, 100, 40); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(108, 168); g.lineTo(128, 200); g.lineTo(148, 168); g.fillStyle = '#fff'; g.fill(); g.stroke(); g.fillRect(104, 150, 48, 16);
    g.fillStyle = '#3a2352'; g.font = '800 40px "Baloo 2", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 122);
  });
  const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(1.9, 1.9, 1); sp.visible = false; return sp;
}
function buildAdult(o) {
  const g = new T.Group(), parts = { legs: [], wings: [], arms: [] }, sk = mat(o.skin), hr = mat(o.hair);
  for (const s of [-1, 1]) {
    const l = pivot(g, s * .14, .9, 0); box(l, .25, .82, .27, 0, -.41, 0, o.pants); box(l, .26, .1, .34, 0, -.85, .03, o.shoe); parts.legs.push(l);
    const a = pivot(g, s * .38, 1.56, 0); parts.arms.push(a);
    if (o.longSleeve) { box(a, .18, .62, .21, 0, -.31, 0, o.shirt); box(a, .15, .09, .17, 0, -.66, 0, sk); }
    else { box(a, .19, .3, .22, 0, -.15, 0, o.shirt); box(a, .15, .4, .17, 0, -.5, 0, sk); }
  }
  box(g, .58, .7, .32, 0, 1.25, 0, o.shirt);
  if (o.logo) logoPlane(g, .5, 0, 1.36, .163, 0);
  const head = parts.head = pivot(g, 0, 1.6, 0);
  box(head, .44, .44, .44, 0, .22, 0, [sk, sk, hr, sk, texMat(adultFace(o)), hr]);
  box(head, .47, .08, .47, 0, .46, 0, o.hair);
  if (o.glasses) { // long straight hair
    box(head, .48, .8, .08, 0, .08, -.25, o.hair);
    for (const s of [-1, 1]) { box(head, .07, .74, .3, s * .245, .1, -.05, o.hair); box(head, .07, .6, .07, s * .21, -.02, .2, o.hair); }
  } else { // slicked back and tied
    box(head, .47, .34, .07, 0, .29, -.235, o.hair); for (const s of [-1, 1]) box(head, .05, .2, .3, s * .235, .34, -.07, o.hair);
    box(head, .14, .26, .12, 0, .1, -.3, o.hair);
  }
  if (o.name) { const tag = parts.tag = nameTag(o.name); tag.position.y = 2.42; g.add(tag); }
  parts.bubble = bubble(o.says); parts.bubble.position.y = 2.95; g.add(parts.bubble);
  return { g, parts };
}
const blobGeo = new T.CircleGeometry(1, 16), blobMat = new T.MeshBasicMaterial({ color: 0x1b1030, transparent: true, opacity: .22, depthWrite: false });
function addShadow(e) { const m = new T.Mesh(blobGeo, blobMat); m.rotation.x = -Math.PI / 2; m.scale.setScalar(e.stats.hw * 1.7); scene.add(m); e.shadow = m; if (HD) e.group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); }

const mounts = [];
function spot(x, z) { // nearest free land cell
  for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
    if (X > 2 && Z > 2 && X < W - 3 && Z < D - 3 && !occ[X + Z * W] && hAt(X, Z) > 6) return new T.Vector3(X + .5, hAt(X, Z), Z + .5);
  }
  return new T.Vector3(x, hAt(x, z), z);
}
function addMount(kind, x, z, yaw, a, b) {
  const built = STATS[kind].person ? buildAdult(a) : kind === 'unicorn' ? buildUnicorn(a, b) : kind === 'rex' ? buildRex(a, b) : kind === 'bronto' ? buildBronto(a, b) : kind === 'ptero' ? buildPtero(a, b) : buildCar(a);
  const e = { kind, stats: STATS[kind], group: built.g, parts: built.parts, pos: kind === 'car' ? new T.Vector3(x, hAt(x, z), z) : spot(x, z), vel: new T.Vector3(), yaw, onGround: false, ph: rng() * 6, carSpeed: 0, ai: { t: rng() * 3, moving: false, dx: 0, dz: 1 }, range: 10 };
  e.home = e.pos.clone(); scene.add(e.group); addShadow(e); mounts.push(e); return e;
}
const UC = [0xffffff, 0xffd9ee, 0xe6dcff, 0xfff6d6], MANE = [0xff6fb5, 0xa67bff, 0x4fc9c0, 0xffb84d];
addMount('unicorn', 72.5, 66.5, 0, UC[0], MANE[0]).range = 5;
for (let i = 0; i < 6; i++) addMount('unicorn', MEADOW.x + Math.cos(i) * 7, MEADOW.z + 3 + Math.sin(i) * 6, i, UC[i % 4], MANE[(i + 1) % 4]);
addMount('unicorn', 100, 50, 1, UC[1], MANE[1]); addMount('unicorn', 44, 60, 2, UC[2], MANE[0]);
addMount('rex', VALLEY.x - 7, VALLEY.z - 5, 0, 0x6fcf6f, 0xd8f5a2); addMount('rex', VALLEY.x + 5, VALLEY.z + 8, 2, 0xff9a76, 0xffe0b5); addMount('rex', 98, 96, 1, 0x4fc1e0, 0xc9f1ff).range = 5;
const mama = addMount('bronto', VALLEY.x + 6, VALLEY.z - 1, -1.2, 0x9aa8ff, 0x7d88e8); mama.range = 3;
addMount('bronto', VALLEY.x - 5, VALLEY.z + 8, 1, 0xc59bff, 0xa57be8);
addMount('ptero', VALLEY.x - 9, VALLEY.z + 2, 0, 0xffb347, 0xff8a5c); addMount('ptero', VALLEY.x + 2, VALLEY.z - 9, 3, 0x7fd6c2, 0x4bb8a3);
addMount('ptero', 80, 97, 2, 0xff9ed2, 0xe670b0).range = 4; addMount('ptero', 50, 46, 2, 0xffe066, 0xffa64d).range = 5;
const logoTex = window.LOGO_SRC ? new T.TextureLoader().load(window.LOGO_SRC) : null; if (logoTex) logoTex.colorSpace = T.SRGBColorSpace;
function logoPlane(parent, w, x, y, z, ry) { if (!logoTex) return; const m = new T.Mesh(new T.PlaneGeometry(w, w * 381 / 1206), new T.MeshBasicMaterial({ map: logoTex })); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); }
const CARC = [0x26262b, 0x36cfa9, 0xffd23f, 0x9b7bff, 0x5fa8ff, 0xff8a5c];
[[66.5, 72.5, -Math.PI / 2], [60.5, 52.5, Math.PI / 2], [84.5, 92.5, -Math.PI / 2], [52.5, 64.5, 0], [92.5, 80.5, Math.PI], [72.5, 84.5, 0]].forEach((c, i) => addMount('car', c[0], c[1], c[2], CARC[i]));
{ // the 24HR Flood Pros truck, parked by the start
  const tr = mounts.find(m => m.kind === 'car'); tr.label = 'Flood Pros truck'; tr.emoji = '🛻';
  box(tr.group, 1.36, .1, 2.56, 0, .62, 0, 0xe2622f); box(tr.group, 1.7, .62, .08, 0, 1.47, -1.2, 0x1c1c1c);
  logoPlane(tr.group, 1.62, 0, 1.47, -1.245, Math.PI); logoPlane(tr.group, 1.62, 0, 1.47, -1.155, 0);
  const bb = new T.Group(); bb.position.set(72.5, TOWN_Y, 49.5); scene.add(bb); // town billboard
  box(bb, 9.6, 3.4, .3, 0, 5.2, 0, 0x1c1c1c); for (const sd of [-1, 1]) box(bb, .4, 3.6, .4, sd * 3.2, 1.8, 0, 0x8b5a2b);
  logoPlane(bb, 9.2, 0, 5.2, .16, 0); logoPlane(bb, 9.2, 0, 5.2, -.16, Math.PI);
}
// grown-ups in town who give shoulder rides
addMount('dad', 75.5, 70.5, Math.PI, { name: 'Dad', says: 'Hi sweetie!', skin: 0xf1c7a8, skinCss: '#f1c7a8', hair: 0x3d2a1e, hairCss: '#3d2a1e', eye: '#7f9db5', brow: '#3d2a1e', stubble: true, shirt: 0x1c1c1f, logo: true, pants: 0x4a6488, shoe: 0x2b2b30 }).range = 4;
addMount('lady', 69.5, 69.5, Math.PI, { says: 'Hello!', skin: 0xf6d3bd, skinCss: '#f6d3bd', hair: 0x7a5236, hairCss: '#7a5236', eye: '#5d6f7a', brow: '#6a4a34', glasses: true, longSleeve: true, shirt: 0xf5efe2, pants: 0x3b4a6b, shoe: 0x8a5a44 }).range = 4;

/* ---------- player ---------- */
const player = { stats: STATS.player, pos: new T.Vector3(72.5, TOWN_Y, 72.5), vel: new T.Vector3(), yaw: Math.PI, onGround: false, ph: 0, group: new T.Group() };
const girls = [buildGirl(0), buildGirl(1)];
girls.forEach(g => player.group.add(g.g)); girls[1].g.visible = false;
scene.add(player.group); addShadow(player);
let outfit = 0, riding = null;
function toggleOutfit() { outfit = 1 - outfit; girls.forEach((g, i) => g.g.visible = i === outfit); sfx.pop(); burst(player.group.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 1, 0)), 30, null, 2.5); }

/* ---------- physics ---------- */
function collides(px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - 1e-4), y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-4), z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - 1e-4);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (getB(x, y, z)) return true;
  return false;
}
function stepBody(e, dt) {
  const s = e.stats, p = e.pos; e.hitWall = false; e.landed = false;
  let guard = 0; while (collides(p.x, p.y, p.z, s.hw, s.h) && guard++ < H) p.y = Math.floor(p.y) + 1;
  const nx = p.x + e.vel.x * dt; if (collides(nx, p.y, p.z, s.hw, s.h)) { e.hitWall = true; e.vel.x = 0; } else p.x = nx;
  const nz = p.z + e.vel.z * dt; if (collides(p.x, p.y, nz, s.hw, s.h)) { e.hitWall = true; e.vel.z = 0; } else p.z = nz;
  const ny = p.y + e.vel.y * dt, was = e.onGround; e.onGround = false;
  if (collides(p.x, ny, p.z, s.hw, s.h)) {
    if (e.vel.y < 0) { const snap = Math.ceil(ny); if (snap <= p.y + 1e-6 && !collides(p.x, snap, p.z, s.hw, s.h)) p.y = snap; e.onGround = true; e.landed = !was && e.vel.y < -9; }
    e.vel.y = 0;
  } else p.y = ny;
  p.x = clamp(p.x, s.hw + .05, W - s.hw - .05); p.z = clamp(p.z, s.hw + .05, D - s.hw - .05);
  if (p.y > H - 2) { p.y = H - 2; e.vel.y = Math.min(0, e.vel.y); }
}
// wx,wz: wish direction (length <= 1) in world space. direct: velocity already set (cars).
function drive(e, dt, wx, wz, jumpHeld, jumpPressed, sprint, direct) {
  const s = e.stats, inWater = e.pos.y < SEA - .85, fly = s.fly || e.flying;
  if (!direct) {
    let sp = s.speed * (sprint ? 1.4 : 1); if (fly && !e.onGround) sp = s.airSpeed; if (inWater) sp *= .6;
    const k = Math.min(1, (e.onGround ? 12 : 6) * dt);
    e.vel.x += (wx * sp - e.vel.x) * k; e.vel.z += (wz * sp - e.vel.z) * k;
  }
  if (inWater) { e.vel.y += (2.5 - e.vel.y) * Math.min(1, 5 * dt); if (jumpHeld) e.vel.y = 4.5; }
  else {
    e.vel.y -= (fly && !e.onGround ? 11 : 26) * dt;
    if (jumpPressed && e.onGround) { e.vel.y = s.jump; if (e === player || e === riding) sfx.jump(); }
    else if (fly && jumpHeld && !e.onGround) e.vel.y = Math.min(7.5, e.vel.y + 42 * dt);
    if (s.glide && jumpHeld && e.vel.y < -1.8) e.vel.y = -1.8;
    if (e.vel.y < -20) e.vel.y = -20;
  }
  stepBody(e, dt);
  const l = Math.hypot(wx, wz);
  if (e.hitWall && (e.onGround || inWater) && l > .05 && !collides(e.pos.x + wx / l * .45, e.pos.y + 1.05, e.pos.z + wz / l * .45, s.hw, s.h)) e.vel.y = Math.max(8.4, s.jump * .8);
  if (l > .1 && !direct) e.yaw = lerpAngle(e.yaw, Math.atan2(wx, wz), Math.min(1, 12 * dt));
}

/* ---------- particles ---------- */
const PN = 700, pPos = new Float32Array(PN * 3).fill(-999), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN);
const pGeo = new T.BufferGeometry(); pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
const points = new T.Points(pGeo, new T.PointsMaterial({ size: .3, vertexColors: true, transparent: true, depthWrite: false })); points.frustumCulled = false; scene.add(points);
let pNext = 0;
function burst(p, n, color, spread = 2, up = 3) {
  for (let i = 0; i < n; i++) {
    const k = pNext; pNext = (pNext + 1) % PN;
    pPos[k * 3] = p.x + (Math.random() - .5) * .5; pPos[k * 3 + 1] = p.y + (Math.random() - .5) * .5; pPos[k * 3 + 2] = p.z + (Math.random() - .5) * .5;
    pVel[k * 3] = (Math.random() - .5) * spread * 2; pVel[k * 3 + 1] = Math.random() * up; pVel[k * 3 + 2] = (Math.random() - .5) * spread * 2;
    tmpC.set(color == null ? RAINBOW[Math.floor(Math.random() * 6)] : color);
    pCol[k * 3] = tmpC.r; pCol[k * 3 + 1] = tmpC.g; pCol[k * 3 + 2] = tmpC.b; pLife[k] = .6 + Math.random() * .7;
  }
}
function updateParticles(dt) {
  for (let k = 0; k < PN; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt; if (pLife[k] <= 0) { pPos[k * 3 + 1] = -999; continue; }
    pVel[k * 3 + 1] -= 6 * dt; pPos[k * 3] += pVel[k * 3] * dt; pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt; pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

/* ---------- sound ---------- */
let AC = null, soundOn = !(save && save.sound === false), musicOn = !(save && save.music === false), musicGain = null, master = null, silentEl = null, nextT = 0, mstep = 0;
function tone(f, d, type = 'sine', v = .1, delay = 0, f2) {
  if (!AC || !soundOn) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .03);
}
const sfx = {
  jump: () => tone(320, .16, 'sine', .08, 0, 620),
  star: () => { tone(988, .12, 'triangle', .12); tone(1319, .25, 'triangle', .12, .09); },
  pop: () => tone(520, .09, 'square', .05, 0, 780),
  dig: () => tone(180, .1, 'square', .06, 0, 90),
  ride: () => [523, 659, 784].forEach((f, i) => tone(f, .14, 'triangle', .1, i * .08)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .12, i * .12)),
  stomp: () => tone(90, .25, 'sawtooth', .12, 0, 40),
};
// background music: a gentle looping tune (C – G – Am – F), scheduled a little ahead of the clock
const CH = [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63]];
const MEL = [659.25, 0, 783.99, 0, 659.25, 0, 523.25, 0, 587.33, 0, 783.99, 0, 587.33, 0, 0, 0, 523.25, 0, 659.25, 0, 880, 0, 659.25, 0, 880, 0, 783.99, 0, 698.46, 0, 0, 0,
  783.99, 659.25, 523.25, 659.25, 783.99, 0, 1046.5, 0, 987.77, 0, 783.99, 0, 587.33, 0, 783.99, 0, 880, 0, 659.25, 0, 523.25, 0, 659.25, 0, 698.46, 0, 880, 0, 783.99, 0, 0, 0];
function mnote(f, d, type, v, t) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + d + .03); }
function musicTick() {
  if (!AC || !musicGain || !musicOn || AC.state !== 'running') return;
  if (nextT < AC.currentTime) nextT = AC.currentTime + .05;
  while (nextT < AC.currentTime + .35) {
    const s8 = mstep % 8, ch = CH[Math.floor(mstep / 8) % 4];
    if (s8 % 4 === 0) mnote(ch[0] / 2, .55, 'triangle', .5, nextT);
    mnote(ch[[0, 1, 2, 1, 0, 2, 1, 2][s8]], .24, 'sine', .22, nextT);
    const m = MEL[mstep % MEL.length]; if (m) mnote(m, .36, 'triangle', .3, nextT);
    nextT += .27; mstep++;
  }
}
// A silent looping <audio> element keeps iPhone/iPad sound on even when the ringer switch is set to silent.
function silentWav() {
  const n = 4000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
  let t = ''; for (const c of b) t += String.fromCharCode(c); return 'data:audio/wav;base64,' + btoa(t);
}
function initAudio() {
  if (!AC) {
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 1.6; master.connect(AC.destination);
      musicGain = AC.createGain(); musicGain.gain.value = .16; musicGain.connect(master); setInterval(musicTick, 100);
      silentEl = document.createElement('audio'); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.src = silentWav();
    } catch (e) { /* no sound */ }
  }
  if (AC && AC.state !== 'running') { try { const p = AC.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* stays silent */ } }
  if (silentEl && silentEl.paused) { try { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* stays silent */ } }
}
// browsers only allow sound to start from a real tap/click/key press, so retry on every one until it is running
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => { if (started && (!AC || AC.state !== 'running' || (silentEl && silentEl.paused))) initAudio(); }, true);
document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.hidden) { AC.suspend(); if (silentEl) silentEl.pause(); } else if (started) initAudio(); });

/* ---------- stars, markers, items ---------- */
const starShape = new T.Shape();
for (let i = 0; i < 10; i++) { const r = i % 2 ? .23 : .52, a = i / 10 * Math.PI * 2 + Math.PI / 2; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
const starGeo = new T.ExtrudeGeometry(starShape, HD ? { depth: .1, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 3 } : { depth: .16, bevelEnabled: false }); starGeo.center();
const starMat = LM(HD ? { color: 0xffd633, emissive: 0x7a4a00, metalness: .5, roughness: .3 } : { color: 0xffd633, emissive: 0x9a6a00 });
const stars = [];
function addStar(x, y, z) { const m = new T.Mesh(starGeo, starMat); m.position.set(x, y, z); scene.add(m); stars.push(m); }
for (let i = 0, n = 0; i < 900 && n < 42; i++) {
  const x = 6 + Math.floor(rng() * (W - 12)), z = 6 + Math.floor(rng() * (D - 12));
  if (hAt(x, z) <= 6 || occ[x + z * W] || cheb(x, z) < 25) continue;
  addStar(x + .5, hAt(x, z) + 1.3, z + .5); n++;
}
for (const qx of [55, 75]) for (const qz of [55, 75]) { addStar(qx + 4, TOWN_Y + 9, qz + 4); addStar(qx + 11.5, TOWN_Y + 1.3, qz + 3.5 - 2); }
for (const [x, z] of [[62, 52.5], [82, 92.5], [52.5, 82], [92.5, 62], [72.5, 78], [78, 72.5]]) addStar(x, TOWN_Y + 1.3, z);
for (let i = 0; i < 5; i++) { const a = Math.PI * (i + .5) / 5; addStar(28.5 + Math.cos(a) * 10, 9 + Math.sin(a) * 10 + 4.4, 105); }
addStar(28.5, 10.5, 105); addStar(22.5, 10.5, 105); addStar(34.5, 10.5, 105);
for (const [dx, dz] of [[0, 0], [-5, 1], [5, -1], [2, 3], [-2, -3]]) addStar(36.5 + dx, 30.6, 36.5 + dz);
addStar(126.5, hAt(126, 124) + 12, 124.5);
const TOTAL_STARS = stars.length;
if (save && save.got) for (const i of save.got) if (stars[i]) stars[i].visible = false;

const beacon = new T.Mesh(new T.CylinderGeometry(1.3, 1.3, 80, 18, 1, true), new T.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: .28, depthWrite: false, side: T.DoubleSide, fog: false }));
beacon.visible = false; scene.add(beacon);
let marker = null;
function setMarker(p) { marker = p ? p.clone() : null; beacon.visible = !!p; if (p) beacon.position.set(p.x, p.y + 38, p.z); }

function buildItem(type) {
  const g = new T.Group();
  if (type === 'cupcake') {
    const base = new T.Mesh(new T.CylinderGeometry(.26, .2, .3, 10), mat(0xffd9a0)); base.position.y = .15; g.add(base);
    const top = new T.Mesh(new T.SphereGeometry(.3, 10, 8), mat(0xff8fc7)); top.position.y = .4; top.scale.y = .75; g.add(top);
    const ch = new T.Mesh(new T.SphereGeometry(.09, 8, 6), mat(0xff3b3b)); ch.position.y = .66; g.add(ch);
  } else {
    const egg = new T.Mesh(new T.SphereGeometry(.34, 12, 10), mat(0xfff4dc)); egg.scale.y = 1.3; egg.position.y = .44; g.add(egg);
    for (const [x, y, z] of [[.2, .5, .22], [-.24, .3, .16], [.05, .75, -.2], [-.1, .55, -.3]]) { const s = new T.Mesh(new T.SphereGeometry(.09, 6, 5), mat(0x7fd6a2)); s.position.set(x, y, z); g.add(s); }
  }
  return g;
}
let item = null; // {type, mesh, pos, held}
function spawnItem(type, p) { clearItem(); item = { type, mesh: buildItem(type), pos: p.clone(), held: false }; item.mesh.position.copy(p); item.mesh.scale.setScalar(1.6); scene.add(item.mesh); }
function clearItem() { if (item) { item.mesh.parent.remove(item.mesh); item = null; } }

const rings = [];
[[72.5, 52.5, 1], [92.5, 62.5, 0], [92.5, 82.5, 0], [72.5, 92.5, 1], [52.5, 82.5, 0], [52.5, 62.5, 0]].forEach((r, i) => {
  const m = new T.Mesh(new T.TorusGeometry(2.1, .24, 8, 28), new T.MeshBasicMaterial({ color: RAINBOW[i] }));
  m.position.set(r[0], TOWN_Y + 2.3, r[1]); if (r[2]) m.rotation.y = Math.PI / 2; m.visible = false; scene.add(m); rings.push(m);
});

/* ---------- clouds ---------- */
const puffGeo = new T.IcosahedronGeometry(1, 2), puffMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xa9bfd9, emissiveIntensity: .45, fog: false });
const clouds = [], cloudMat = LM({ color: 0xffffff, transparent: true, opacity: .92, fog: false });
for (let i = 0; i < 16; i++) {
  const g = new T.Group(); const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    if (!HD) { box(g, 5 + rng() * 6, 2 + rng() * 2, 4 + rng() * 4, k * 4 - n * 2, rng() * 1.5, rng() * 3, cloudMat); continue; }
    for (let j = 0; j < 3; j++) { const m = new T.Mesh(puffGeo, puffMat); m.scale.set(4 + rng() * 4, 2.2 + rng() * 2, 3.5 + rng() * 3.5); m.position.set(k * 4.5 - n * 2.2 + rng() * 3, rng() * 2, rng() * 6 - 3); g.add(m); }
  }
  g.position.set(rng() * 300 - 80, 44 + rng() * 14, rng() * 300 - 80); scene.add(g); clouds.push(g);
}

/* ---------- baby dino friend ---------- */
let baby = null;
function hatchBaby(p) {
  const b = buildRex(0xa8e6a1, 0xfff3c4); b.g.scale.setScalar(.32);
  baby = { stats: STATS.baby, group: b.g, parts: b.parts, pos: p.clone(), vel: new T.Vector3(), yaw: 0, onGround: false, ph: 0 };
  scene.add(b.g); addShadow(baby); burst(p.clone().add(new T.Vector3(0, 1, 0)), 60, null, 3, 5);
}

/* ---------- June Bug the dog ---------- */
const dappleTex = canvasTex(32, g => {
  g.fillStyle = '#8e9197'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 3 ? '#1d1d20' : '#55585e'; g.beginPath(); g.ellipse(trng() * 32, trng() * 32, 1 + trng() * 3.5, 1 + trng() * 2.5, trng() * 3, 0, 7); g.fill(); }
  g.fillStyle = '#d9dadd'; for (let i = 0; i < 70; i++) g.fillRect(trng() * 32, trng() * 32, 1, 1);
});
function nameTag(text) {
  const t = canvasTex(256, g => { g.font = '800 56px "Baloo 2", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#3a2352'; g.strokeText(text, 128, 128); g.fillStyle = '#fff'; g.fillText(text, 128, 128); });
  const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(1.1, 1.1, 1); return sp;
}
function buildDog() {
  const g = new T.Group(), parts = { legs: [], wings: [] }, dp = texMat(dappleTex), WH = 0xfafafa, TAN = 0xc98a4b, BK = 0x1d1d20;
  box(g, .3, .22, .8, 0, .36, 0, dp); box(g, .28, .1, .78, 0, .23, 0, WH);
  box(g, .31, .2, .16, 0, .38, .12, BK); box(g, .31, .21, .2, 0, .375, -.12, BK); box(g, .31, .24, .14, 0, .34, .36, WH);
  for (const [x, z] of [[-.1, .3], [.1, .3], [-.1, -.3], [.1, -.3]]) { const l = pivot(g, x, .2, z); box(l, .09, .2, .09, 0, -.1, 0, WH); box(l, .1, .04, .11, 0, -.18, .01, 0xe9e9ee); parts.legs.push(l); }
  box(g, .2, .22, .18, 0, .52, .38, WH); box(g, .23, .06, .21, 0, .55, .39, 0xf0553c); box(g, .06, .08, .02, 0, .47, .5, 0xc75a8e);
  const head = parts.head = pivot(g, 0, .7, .46);
  box(head, .26, .22, .24, 0, 0, 0, dp); box(head, .265, .1, .12, 0, -.06, .05, TAN);
  box(head, .15, .13, .2, 0, -.05, .2, WH); box(head, .08, .06, .05, 0, -.01, .31, BK); box(head, .05, .2, .02, 0, .02, .122, WH);
  for (const s of [-1, 1]) {
    box(head, .06, .06, .02, s * .075, .02, .124, 0x2a1a12); box(head, .02, .02, .02, s * .085, .035, .132, 0xffffff); box(head, .07, .03, .02, s * .075, .075, .124, TAN);
    const ear = pivot(head, s * .14, .09, -.03); box(ear, .05, .26, .17, s * .02, -.13, 0, dp); box(ear, .052, .1, .15, s * .02, -.21, 0, BK); ear.rotation.z = s * .12;
  }
  const tail = parts.tail = pivot(g, 0, .44, -.4); const tl = box(tail, .05, .05, .32, 0, .08, -.14, WH); tl.rotation.x = .6;
  const tag = nameTag('June Bug'); tag.position.y = 1.05; g.add(tag);
  g.scale.setScalar(1.2);
  return { g, parts };
}
let dog = null;
function follow(e, dt, gap, time) {
  const b = body(), dx = b.pos.x - e.pos.x, dz = b.pos.z - e.pos.z, d = Math.hypot(dx, dz), dy = b.pos.y - e.pos.y;
  if (d > 40 || (b.onGround && Math.abs(dy) > 7 && d < 30)) { if (b.onGround) e.pos.set(b.pos.x + 1.4, b.pos.y + .3, b.pos.z + gap * .5); else e.pos.copy(spot(b.pos.x + 2, b.pos.z + 2)); e.vel.set(0, 0, 0); }
  const go = d > gap + b.stats.hw; drive(e, dt, go ? dx / d : 0, go ? dz / d : 0, false, false, d > 6, false);
  e.ph += dt * (4 + Math.hypot(e.vel.x, e.vel.z) * 2.2); const s = Math.sin(e.ph) * (go ? .75 : 0);
  e.parts.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3) ? s : -s; });
  e.parts.tail.rotation.y = Math.sin(time * (e === dog ? 14 : 5)) * (e === dog ? .5 : .3);
  if (!go && d > .1) e.yaw = lerpAngle(e.yaw, Math.atan2(dx, dz), Math.min(1, 4 * dt));
  e.group.position.copy(e.pos); e.group.rotation.y = e.yaw; placeShadow(e);
}

/* ---------- missions ---------- */
const S = { stars: 0, placed: 0, rings: 0, base: 0, flag: false };
const body = () => riding || player;
const near = (p, r) => Math.hypot(body().pos.x - p.x, body().pos.z - p.z) < r + body().stats.hw;
let eggPos = null;
function findBeach() { for (let i = 0; i < 4000; i++) { const x = 8 + Math.floor(rng() * 60), z = 8 + Math.floor(rng() * 60); if (hAt(x, z) === 6 && !occ[x + z * W] && cheb(x, z) > 36) return new T.Vector3(x + .5, 6, z + .5); } return spot(30, 60); }
const MISSIONS = [
  { t: () => 'Find a unicorn and hop on! 🦄', done: () => riding && riding.kind === 'unicorn' },
  { t: () => `Collect 5 stars ⭐ ${Math.min(5, S.stars - S.base)}/5`, start() { S.base = S.stars; }, done: () => S.stars - S.base >= 5 },
  { t: () => item && item.held ? 'Take the cupcake to the dinosaurs in Dino Valley 🧁' : 'Pick up a cupcake at the bakery 🧁',
    start() { spawnItem('cupcake', BAKERY); setMarker(BAKERY); S.flag = false; },
    tick() { if (item && item.held) { setMarker(VALLEY); if (near(VALLEY, 4)) { clearItem(); S.flag = true; } } }, done: () => S.flag },
  { t: () => 'Ride a dinosaur! 🦖', start() { setMarker(VALLEY); }, done: () => riding && ['rex', 'bronto', 'ptero'].includes(riding.kind) },
  { t: () => `Zoom through the rainbow rings in town 🌈 ${S.rings}/6 (try a car!)`, start() { S.rings = 0; rings.forEach(r => r.visible = true); setMarker(null); },
    tick() { const b = body(); for (const r of rings) if (r.visible && Math.hypot(b.pos.x - r.position.x, b.pos.y + b.stats.h / 2 - r.position.y, b.pos.z - r.position.z) < 2.4) { r.visible = false; S.rings++; sfx.star(); burst(r.position, 40, null, 4, 4); } },
    done: () => S.rings >= 6 },
  { t: () => 'Fly up to the cloud island ☁️ (unicorn wings or a pterodactyl)', start() { setMarker(new T.Vector3(CLOUD.x, hAt(CLOUD.x, CLOUD.z), CLOUD.z)); }, done: () => near(CLOUD, 8) && body().pos.y >= 28.5 },
  { t: () => `Build something! Place 10 blocks 🧱 ${Math.min(10, S.placed - S.base)}/10`, start() { S.base = S.placed; setMarker(null); }, done: () => S.placed - S.base >= 10 },
  { t: () => item && item.held ? 'Bring the egg to the nest in Dino Valley 🥚' : 'Find the lost dino egg on the beach 🥚',
    start() { eggPos = findBeach(); spawnItem('egg', eggPos); setMarker(eggPos); S.flag = false; },
    tick() { if (item && item.held) { setMarker(VALLEY); if (near(VALLEY, 4)) { clearItem(); S.flag = true; hatchBaby(spot(VALLEY.x + 2, VALLEY.z + 2)); toast('A baby dino hatched! 🐣'); } } }, done: () => S.flag },
  { t: () => `You did it! 🎉 Free play — find every star ⭐ ${S.stars}/${TOTAL_STARS}`, start() { setMarker(null); }, done: () => false },
];
let mi = 0, missionShown = '';
function nextMission() {
  mi++; S.stars += 3; $('starN').textContent = S.stars;
  toast(mi === MISSIONS.length - 1 ? 'All missions done! 🎉' : 'Mission complete! 🎉 +3 ⭐'); sfx.win();
  burst(player.group.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 2, 0)), 90, null, 5, 7);
  if (MISSIONS[mi].start) MISSIONS[mi].start();
}
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

/* ---------- save / restore ---------- */
let wiped = false;
if (save) {
  S.stars = save.stars | 0; S.placed = save.placed | 0; mi = clamp(save.mi | 0, 0, MISSIONS.length - 1); $('starN').textContent = S.stars;
  if (save.pos) player.pos.set(save.pos[0], save.pos[1] + .2, save.pos[2]);
  if (save.outfit) { outfit = 1; girls.forEach((g, i) => g.g.visible = i === 1); }
  if (MISSIONS[mi].start) MISSIONS[mi].start();
  if (mi > 7) hatchBaby(spot(player.pos.x + 2, player.pos.z + 2));
}
{ const d = buildDog(); dog = { stats: STATS.dog, group: d.g, parts: d.parts, pos: new T.Vector3(player.pos.x + 1.3, player.pos.y + .2, player.pos.z - .6), vel: new T.Vector3(), yaw: Math.PI, onGround: false, ph: 0 }; scene.add(d.g); addShadow(dog); }
function writeSave() {
  if (wiped || !started) return;
  try {
    const b = body();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ stars: S.stars, placed: S.placed, mi, outfit, got: stars.map((s, i) => s.visible ? -1 : i).filter(i => i >= 0), edits,
      pos: [+b.pos.x.toFixed(1), +b.pos.y.toFixed(1), +b.pos.z.toFixed(1)], music: musicOn, sound: soundOn }));
  } catch (e) { /* storage unavailable: play on without saving */ }
}
setInterval(writeSave, 4000);
window.addEventListener('pagehide', writeSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });

/* ---------- input ---------- */
const keys = {}, input = { jx: 0, jz: 0, jumpHeld: false, jumpPressed: false };
let started = false, camYaw = 0, camPitch = .35, lookedAt = 0;
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
window.addEventListener('keydown', e => {
  if (!started) { if (e.code === 'Enter') startGame(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') input.jumpPressed = true;
  if (e.code === 'KeyE') rideAction();
  if (e.code === 'KeyC') toggleOutfit();
  if (e.code === 'KeyQ') flyAction();
  if (e.code === 'KeyF') breakBlock();
  if (e.code === 'KeyR') placeBlock();
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code[5] - 1);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const look = (dx, dy, s) => { camYaw -= dx * s; camPitch = clamp(camPitch + dy * s, -1.1, 1.45); lookedAt = performance.now(); };
const locked = () => document.pointerLockElement === canvas;
let dragging = false, dragMoved = 0, dragBtn = 0;
canvas.addEventListener('mousedown', e => {
  if (!started) return; canvas.focus();
  if (locked()) { if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock(); return; }
  dragging = true; dragMoved = 0; dragBtn = e.button;
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag-look fallback */ }
});
window.addEventListener('mousemove', e => {
  if (locked()) look(e.movementX, e.movementY, .0026);
  else if (dragging) { look(e.movementX, e.movementY, .005); dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY); }
});
window.addEventListener('mouseup', () => { if (dragging && !locked() && dragMoved < 6 && lockFailed) { if (dragBtn === 0) breakBlock(); else if (dragBtn === 2) placeBlock(); } dragging = false; });
let lockFailed = !('requestPointerLock' in canvas);
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { selectSlot((slot + (e.deltaY > 0 ? 1 : 8)) % 9); }, { passive: true });
// touch look
let lookId = null, lx = 0, ly = 0;
canvas.addEventListener('touchstart', e => { e.preventDefault(); if (lookId === null) { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; } }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === lookId) { look(t.clientX - lx, t.clientY - ly, .0075); lx = t.clientX; ly = t.clientY; } }, { passive: false });
const endLook = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
canvas.addEventListener('touchend', endLook); canvas.addEventListener('touchcancel', endLook);
// joystick
const joy = $('joy'), knob = $('knob'); let joyId = null;
function joyMove(t) { const r = joy.getBoundingClientRect(); let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = 44; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; input.jx = dx / m; input.jz = -dy / m; }
joy.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; joyId = t.identifier; joyMove(t); }, { passive: false });
joy.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
const joyEnd = e => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; input.jx = input.jz = 0; knob.style.transform = ''; } };
joy.addEventListener('touchend', joyEnd); joy.addEventListener('touchcancel', joyEnd);
function press(id, down, up) {
  const el = $(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); }, { passive: false });
  el.addEventListener('mousedown', e => { e.preventDefault(); down(); }); el.addEventListener('mouseup', () => { if (up) up(); });
}
press('tJump', () => { input.jumpHeld = true; input.jumpPressed = true; }, () => { input.jumpHeld = false; });
press('tRide', rideAction); press('tFly', flyAction); press('tBreak', breakBlock); press('tPlace', placeBlock);
$('bOutfit').addEventListener('click', () => { toggleOutfit(); canvas.focus(); });
$('bSound').addEventListener('click', () => { soundOn = !soundOn; $('bSound').textContent = soundOn ? '🔊' : '🔇'; canvas.focus(); });
$('bSound').textContent = soundOn ? '🔊' : '🔇'; $('bMusic').classList.toggle('off', !musicOn);
$('bMusic').addEventListener('click', () => { musicOn = !musicOn; $('bMusic').classList.toggle('off', !musicOn); initAudio(); canvas.focus(); });
if (save) { $('play').textContent = 'Continue'; $('reset').hidden = false; }
let resetArmed = false;
$('reset').addEventListener('click', () => {
  if (!resetArmed) { resetArmed = true; $('reset').textContent = 'Tap again to erase everything'; return; }
  wiped = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing saved */ } location.reload();
});
$('gfx').textContent = HD ? 'Switch to classic blocks' : 'Switch to HD graphics';
$('gfx').addEventListener('click', () => { writeSave(); try { localStorage.setItem('sparkle-gfx', HD ? 'classic' : 'hd'); } catch (e) { /* the #hash below still switches */ } location.hash = HD ? 'classic' : 'hd'; location.reload(); });
if (window.LOGO_SRC) { $('logoImg').src = window.LOGO_SRC; $('sponsor').hidden = false; }
$('bHelp').addEventListener('click', () => { if (locked()) document.exitPointerLock(); $('start').hidden = false; $('play').textContent = 'Keep playing'; });
$('play').addEventListener('click', startGame);
$('keys').innerHTML = (isTouch
  ? [['Stick', 'Walk and run'], ['Drag', 'Look around'], ['⬆️', 'Jump · hold to glide or fly'], ['🦄', 'Hop on or off a ride'], ['🪽', 'Unicorn wings: fly!'], ['⛏️ 🧱', 'Break or place a block'], ['👗', 'Change outfit']]
  : [['W A S D', 'Walk · Shift to run'], ['Mouse', 'Look around'], ['Space', 'Jump · hold to glide or fly'], ['E', 'Hop on or off a ride'], ['Q', 'Unicorn wings: fly!'], ['Click', 'Break a block (or F)'], ['Right-click', 'Place a block (or R)'], ['1–9', 'Pick a block'], ['C', 'Change outfit']]
).map(r => `<b>${r[0]}</b><span>${r[1]}</span>`).join('');
if (isTouch) $('touch').hidden = false;
function startGame() { initAudio(); $('start').hidden = true; if (!started) { started = true; camYaw = 0; camPitch = .3; sfx.ride(); } canvas.focus(); }

// hotbar
let slot = 0;
HOTBAR.forEach((b, i) => {
  const el = document.createElement('button'); el.className = 'slot' + (i === 0 ? ' on' : ''); el.setAttribute('aria-label', 'Block ' + (i + 1));
  el.style.background = b === 13 ? 'linear-gradient(135deg,#ff5a5a,#ffe066,#5fd35f,#6fa8ff,#b388ff)' : css(BL[b][0]);
  el.addEventListener('click', () => { selectSlot(i); canvas.focus(); }); $('hotbar').appendChild(el);
});
function selectSlot(i) { slot = i; [...$('hotbar').children].forEach((c, k) => c.classList.toggle('on', k === i)); }

/* ---------- riding ---------- */
function nearestMount() {
  let best = null, bd = 1e9;
  for (const m of mounts) { const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) - m.stats.hw, dy = Math.abs(m.pos.y - player.pos.y); if (d < 3 && dy < 4 && d < bd) { bd = d; best = m; } }
  return best;
}
const hinted = {};
function rideAction() {
  if (!started) return;
  if (riding) {
    const m = riding, s = m.stats; riding = null;
    scene.add(player.group);
    const offs = [[1, 0], [-1, 0], [0, -1], [0, 1]]; let placed = false;
    for (const [ox, oz] of offs) for (let dy = 0; dy <= 2 && !placed; dy++) {
      const r = s.hw + .6, x = m.pos.x + (ox * Math.cos(m.yaw) + oz * Math.sin(m.yaw)) * r, z = m.pos.z + (-ox * Math.sin(m.yaw) + oz * Math.cos(m.yaw)) * r;
      if (!collides(x, m.pos.y + dy, z, .3, 1.6)) { player.pos.set(x, m.pos.y + dy, z); placed = true; }
    }
    if (!placed) player.pos.set(m.pos.x, m.pos.y + s.h + .1, m.pos.z);
    player.vel.set(0, 3, 0); player.yaw = m.yaw; m.carSpeed = 0; m.flying = false; m.home.copy(m.pos); sfx.pop();
    return;
  }
  const m = nearestMount(); if (!m) return;
  riding = m; m.group.add(player.group); player.group.position.set(0, m.stats.seat[0] - .5, m.stats.seat[1]); player.group.rotation.y = 0;
  m.vel.set(0, 0, 0); m.greet = false; sfx.ride(); burst(m.pos.clone().add(new T.Vector3(0, m.stats.h, 0)), 30, null, 3);
  if (!hinted[m.kind]) { hinted[m.kind] = 1; toast(m.stats.person ? 'Wheee! Shoulder ride! 🎉' : m.kind === 'unicorn' ? (isTouch ? 'Tap 🪽 for wings, then hold jump to fly!' : 'Press Q for wings, then hold Space to fly!') : m.kind === 'ptero' ? 'Hold jump to flap and fly! 🪽' : m.kind === 'car' ? 'Vroom! Steer left and right 🚗' : m.kind === 'rex' ? 'Stomp stomp! 🦖' : 'So tall! 🦕'); }
}

function flyAction() {
  if (!started || !riding || riding.kind !== 'unicorn') return;
  const m = riding; m.flying = !m.flying; sfx.ride();
  burst(m.pos.clone().add(new T.Vector3(0, 1.4, 0)), 40, null, 4, 4);
  if (m.flying) { if (m.onGround) m.vel.y = 10; toast('Wings out! Hold jump to fly up 🦄'); } else toast('Wings away!');
}

/* ---------- building ---------- */
const hi = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.01, 1.01, 1.01)), new T.LineBasicMaterial({ color: 0xffffff })); hi.visible = false; scene.add(hi);
let target = null;
const rayO = new T.Vector3(), rayD = new T.Vector3();
function raycast(o, d, max) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = d.x ? Math.abs(1 / d.x) : Infinity, tdy = d.y ? Math.abs(1 / d.y) : Infinity, tdz = d.z ? Math.abs(1 / d.z) : Infinity;
  let tmx = d.x ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity, tmy = d.y ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity, tmz = d.z ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let t = 0, n = [0, 0, 0];
  while (t < max) {
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    if (y < 0) return null;
    if (getB(x, y, z)) return { x, y, z, n, t };
  }
  return null;
}
function updateTarget() {
  camera.getWorldPosition(rayO); camera.getWorldDirection(rayD);
  const h = raycast(rayO, rayD, 22), b = body();
  target = h && Math.hypot(h.x + .5 - b.pos.x, h.y + .5 - (b.pos.y + 1.2), h.z + .5 - b.pos.z) < 7.5 + b.stats.h ? h : null;
  hi.visible = !!target && started; if (target) hi.position.set(target.x + .5, target.y + .5, target.z + .5);
}
function breakBlock() {
  if (!started || !target || target.y === 0) return;
  const b = getB(target.x, target.y, target.z);
  setBlock(target.x, target.y, target.z, 0); sfx.dig();
  burst(new T.Vector3(target.x + .5, target.y + .5, target.z + .5), 14, b === 13 ? null : BL[b][0], 2, 3);
}
function placeBlock() {
  if (!started || !target) return;
  const x = target.x + target.n[0], y = target.y + target.n[1], z = target.z + target.n[2];
  if (x < 0 || z < 0 || x >= W || z >= D || y < 1 || y >= H - 2 || getB(x, y, z)) return;
  const hits = e => { const s = e.stats, p = e.pos; return x + 1 > p.x - s.hw && x < p.x + s.hw && z + 1 > p.z - s.hw && z < p.z + s.hw && y + 1 > p.y && y < p.y + s.h; };
  if (hits(body()) || mounts.some(hits) || (baby && hits(baby)) || (dog && hits(dog))) return;
  setBlock(x, y, z, HOTBAR[slot]); S.placed++; sfx.pop();
}

/* ---------- animation ---------- */
function animGirl(dt) {
  const sp = riding ? 0 : Math.hypot(player.vel.x, player.vel.z);
  player.ph += dt * (4 + sp * 1.6);
  const amp = riding ? 0 : Math.min(1, sp / 4) * .9, sw = Math.sin(player.ph) * amp;
  for (const g of girls) {
    const P = g.P;
    if (riding) {
      const car = riding.stats.car, sp2 = car ? 0 : riding.stats.person ? .8 : .35;
      P.legs[0].rotation.set(-1.45, 0, -sp2); P.legs[1].rotation.set(-1.45, 0, sp2);
      P.arms[0].rotation.set(-.9, 0, 0); P.arms[1].rotation.set(-.9, 0, 0);
    } else {
      const air = !player.onGround && player.pos.y > SEA;
      P.legs[0].rotation.set(sw, 0, 0); P.legs[1].rotation.set(-sw, 0, 0);
      P.arms[0].rotation.set(air ? -2.6 : -sw, 0, item && item.held ? 0 : 0); P.arms[1].rotation.set(air ? -2.6 : sw, 0, 0);
      if (item && item.held) { P.arms[0].rotation.x = -3; P.arms[1].rotation.x = -3; }
    }
    P.head.rotation.z = Math.sin(clock.elapsedTime * 2) * .04;
  }
}
function animMount(m, dt) {
  const sp = Math.hypot(m.vel.x, m.vel.z), P = m.parts;
  m.ph += dt * (3 + sp * 1.3);
  const amp = Math.min(1, sp / 3) * (m.kind === 'bronto' ? .35 : .7), s = Math.sin(m.ph) * amp;
  if (P.legs.length === 4) { P.legs[0].rotation.x = s; P.legs[3].rotation.x = s; P.legs[1].rotation.x = -s; P.legs[2].rotation.x = -s; }
  else if (P.legs.length === 2) { P.legs[0].rotation.x = s; P.legs[1].rotation.x = -s; }
  if (P.arms) {
    if (m === riding) { P.arms[0].rotation.set(-2.5, 0, .25); P.arms[1].rotation.set(-2.5, 0, -.25); }
    else { P.arms[0].rotation.set(-s, 0, 0); if (m.greet) P.arms[1].rotation.set(-2.9, 0, Math.sin(clock.elapsedTime * 9) * .35); else P.arms[1].rotation.set(s, 0, 0); }
    P.bubble.visible = !!m.greet && m !== riding && camera.position.distanceTo(m.pos) > 4;
    if (P.tag) P.tag.visible = !m.greet && m !== riding;
  }
  if (P.tail) P.tail.rotation.y = Math.sin(m.ph * .7) * .25;
  if (P.head) P.head.rotation.x = Math.sin(m.ph * .5) * .05;
  if (P.wings.length) { if (m.kind === 'unicorn') for (const w of P.wings) w.visible = !!m.flying; const f = m.onGround ? .15 : Math.sin(clock.elapsedTime * 11) * .65; P.wings[0].rotation.z = -f; P.wings[1].rotation.z = f; }
  if (P.wheels) for (const w of P.wheels) w.rotation.x += m.carSpeed * dt / .33;
  m.group.position.copy(m.pos); m.group.rotation.y = m.yaw;
  if (m.kind === 'unicorn' && m === riding && sp > 6 && Math.random() < .7) burst(new T.Vector3(m.pos.x - Math.sin(m.yaw) * .8, m.pos.y + 1.1, m.pos.z - Math.cos(m.yaw) * .8), 1, null, .6, 1);
}
function placeShadow(e, hidden) {
  const s = e.shadow; if (hidden || HD) { s.visible = false; return; }
  let y = Math.floor(e.pos.y + .2); while (y > 0 && !getB(Math.floor(e.pos.x), y - 1, Math.floor(e.pos.z))) y--;
  s.visible = e.pos.y - y < 12; s.position.set(e.pos.x, Math.max(y, SEA) + .03, e.pos.z);
}
function wander(m, dt) {
  if (m.stats.person) { // stop, turn and wave when she comes close
    const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z;
    m.greet = started && !riding && Math.hypot(dx, dz) < 4.5 && Math.abs(player.pos.y - m.pos.y) < 3;
    if (m.greet) { m.yaw = lerpAngle(m.yaw, Math.atan2(dx, dz), Math.min(1, 6 * dt)); drive(m, dt, 0, 0, false, false, false, false); return; }
  }
  const a = m.ai; a.t -= dt;
  if (a.t <= 0) { a.moving = !a.moving; a.t = a.moving ? 1.5 + rng() * 3 : 1 + rng() * 4; const an = rng() * 6.283; a.dx = Math.sin(an); a.dz = Math.cos(an); }
  let wx = 0, wz = 0;
  if (a.moving) {
    const hx = m.pos.x - m.home.x, hz = m.pos.z - m.home.z, hd = Math.hypot(hx, hz);
    if (hd > m.range) { a.dx = -hx / hd; a.dz = -hz / hd; }
    const ah = hAt(m.pos.x + a.dx * 2.5, m.pos.z + a.dz * 2.5);
    if (ah <= 5 || ah > m.pos.y + 1.5) { a.dx = -a.dx; a.dz = -a.dz; a.t = Math.min(a.t, .6); }
    const k = 2.2 / m.stats.speed; wx = a.dx * k; wz = a.dz * k;
  }
  drive(m, dt, wx, wz, false, false, false, false);
}

/* ---------- main loop ---------- */
const clock = new T.Clock();
const camT = new T.Vector3(72.5, 10, 72.5), camPos = new T.Vector3();
let shake = 0, promptShown = '';
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, clock.getDelta()), time = clock.elapsedTime;
  // input → wish vector
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + input.jx;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + input.jz;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  if (!started) mx = mz = 0;
  const jumpHeld = started && (keys.Space || input.jumpHeld), jumpPressed = started && input.jumpPressed; input.jumpPressed = false;
  const sprint = keys.ShiftLeft || keys.ShiftRight || Math.hypot(input.jx, input.jz) > .92;
  const wx = -Math.sin(camYaw) * mz + Math.cos(camYaw) * mx, wz = -Math.cos(camYaw) * mz - Math.sin(camYaw) * mx;

  if (riding) {
    const m = riding;
    if (m.stats.car) {
      const top = m.stats.speed * (mz < 0 ? .45 : 1);
      m.carSpeed += (mz * top - m.carSpeed) * Math.min(1, 1.8 * dt);
      m.yaw -= mx * dt * 2.4 * clamp(m.carSpeed / 5, -1, 1);
      m.vel.x = Math.sin(m.yaw) * m.carSpeed; m.vel.z = Math.cos(m.yaw) * m.carSpeed;
      const sg = Math.sign(m.carSpeed) || 1;
      drive(m, dt, Math.sin(m.yaw) * sg * (Math.abs(m.carSpeed) > .5 ? 1 : 0), Math.cos(m.yaw) * sg * (Math.abs(m.carSpeed) > .5 ? 1 : 0), jumpHeld, jumpPressed, false, true);
      if (m.hitWall) m.carSpeed *= .6;
      if (Math.abs(m.carSpeed) > 2 && performance.now() - lookedAt > 1200) camYaw = lerpAngle(camYaw, m.yaw + Math.PI, Math.min(1, 2.5 * dt));
    } else drive(m, dt, wx, wz, jumpHeld, jumpPressed, sprint, false);
    if (m.landed && m.stats.stomp) { shake = .35; sfx.stomp(); burst(m.pos, 16, 0xd9c7a0, 3, 2); }
    player.pos.copy(m.pos);
  } else {
    drive(player, dt, wx, wz, jumpHeld, jumpPressed, sprint, false);
    player.group.position.copy(player.pos); player.group.rotation.y = player.yaw;
  }
  for (const m of mounts) { if (m !== riding) { if (m.stats.car) { m.vel.x = m.vel.z = 0; m.carSpeed = 0; drive(m, dt, 0, 0, false, false, false, true); } else wander(m, dt); } animMount(m, dt); placeShadow(m); }
  animGirl(dt); placeShadow(player, !!riding);
  if (baby) follow(baby, dt, 3.6, time);
  if (dog) follow(dog, dt, 2, time);

  // stars, items, missions
  const b = body();
  for (const st of stars) {
    if (!st.visible) continue;
    st.rotation.y = time * 2; st.position.y += Math.sin(time * 3 + st.position.x) * .003;
    if (started && Math.abs(st.position.x - b.pos.x) < b.stats.hw + 1.1 && Math.abs(st.position.z - b.pos.z) < b.stats.hw + 1.1 && st.position.y > b.pos.y - 1 && st.position.y < b.pos.y + b.stats.h + 1.2) {
      st.visible = false; S.stars++; $('starN').textContent = S.stars; sfx.star(); if (dog && dog.onGround) { dog.vel.y = 6; tone(900, .07, 'square', .04, .15, 1300); } burst(st.position, 26, 0xffe14d, 3, 4);
    }
  }
  if (item) {
    if (!item.held) { item.mesh.rotation.y = time * 1.5; item.mesh.position.y = item.pos.y + .3 + Math.sin(time * 3) * .15; if (started && near(item.pos, 1.8) && Math.abs(b.pos.y - item.pos.y) < 4) { item.held = true; player.group.add(item.mesh); item.mesh.scale.setScalar(.8); item.mesh.position.set(0, 1.85, 0); item.mesh.rotation.y = 0; sfx.ride(); toast(item.type === 'egg' ? 'You found the egg! 🥚' : 'Yummy cupcake! 🧁'); } }
  }
  if (started) { const M = MISSIONS[mi]; if (M.tick) M.tick(); if (M.done()) nextMission(); }
  const mt = MISSIONS[mi].t(); if (mt !== missionShown) { missionShown = mt; $('missionT').textContent = mt; }
  for (const r of rings) if (r.visible) r.rotation.z = time;
  beacon.material.opacity = .22 + Math.sin(time * 4) * .08;

  // prompt
  let pr = '';
  if (started) { if (riding) pr = isTouch ? '' : 'E — hop off' + (riding.kind === 'unicorn' ? (riding.flying ? ' · Q — wings away' : ' · Q — wings') : ''); else { const m = nearestMount(); if (m) pr = m.stats.person ? (isTouch ? 'Tap 🦄 for a shoulder ride' : 'E — shoulder ride') + (m.kind === 'dad' ? ' with Dad' : '') : (isTouch ? 'Tap 🦄 to ride the ' : 'E — ride the ') + (m.label || m.stats.label) + ' ' + (m.emoji || m.stats.emoji); } }
  $('tFly').hidden = !(riding && riding.kind === 'unicorn');
  if (pr !== promptShown) { promptShown = pr; $('prompt').textContent = pr; $('prompt').hidden = !pr; }

  // camera
  if (!started) { camYaw = time * .12; camPitch = .42; }
  const eyeH = riding ? riding.stats.seat[0] + 1.5 : 1.75, want = started ? (riding ? riding.stats.cam : 5.2) : 26;
  camT.lerp(new T.Vector3(b.pos.x, b.pos.y + eyeH, b.pos.z), 1 - Math.exp(-14 * dt));
  const cdx = Math.sin(camYaw) * Math.cos(camPitch), cdy = Math.sin(camPitch), cdz = Math.cos(camYaw) * Math.cos(camPitch);
  let dist = want;
  for (let d = .4; d <= want; d += .25) { if (getB(Math.floor(camT.x + cdx * d), Math.floor(camT.y + cdy * d), Math.floor(camT.z + cdz * d))) { dist = Math.max(.5, d - .35); break; } }
  camPos.set(camT.x + cdx * dist, Math.max(camT.y + cdy * dist, SEA + .3), camT.z + cdz * dist);
  if (shake > 0) { shake -= dt; camPos.x += (Math.random() - .5) * shake; camPos.y += (Math.random() - .5) * shake; }
  camera.position.copy(camPos); camera.lookAt(camT);
  player.group.visible = dist > 1.2 || !!riding;

  if (HD) {
    sunL.target.position.set(Math.round(b.pos.x), Math.round(b.pos.y), Math.round(b.pos.z)); sunL.position.copy(sunL.target.position).addScaledVector(SUN_DIR, 120);
    skyDome.position.copy(camera.position); waterU.time.value = time; waterU.camPos.value.copy(camera.position);
  }
  updateTarget(); updateParticles(dt);
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 240) c.position.x = -100; }
  drawMap(b, time);
  renderer.render(scene, camera);
}
function drawMap(b, time) {
  const g = mapCtx; g.drawImage(mapBase, 0, 0);
  for (const st of stars) if (st.visible) { g.fillStyle = '#fff36b'; g.fillRect(st.position.x - 1, st.position.z - 1, 2, 2); }
  for (const m of mounts) { g.fillStyle = m.stats.person ? '#2f6bff' : m.kind === 'unicorn' ? '#ff4fa3' : m.kind === 'car' ? '#3a2352' : '#1f8a3b'; g.fillRect(m.pos.x - 1.5, m.pos.z - 1.5, 3, 3); }
  for (const r of rings) if (r.visible) { g.strokeStyle = '#ff4fa3'; g.lineWidth = 2; g.beginPath(); g.arc(r.position.x, r.position.z, 3, 0, 7); g.stroke(); }
  if (marker) { g.strokeStyle = '#fff'; g.fillStyle = '#ffb300'; g.lineWidth = 2; g.beginPath(); g.arc(marker.x, marker.z, 4 + Math.sin(time * 5) * 1.5, 0, 7); g.fill(); g.stroke(); }
  const yaw = riding ? riding.yaw : player.yaw;
  g.save(); g.translate(b.pos.x, b.pos.z); g.rotate(-yaw); g.fillStyle = '#fff'; g.strokeStyle = '#3a2352'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(4.5, -4.5); g.lineTo(0, -2); g.lineTo(-4.5, -4.5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
window.__game = { audio: () => ({ AC, master }), dog, flyAction, player, mounts, S, startGame, rideAction, get riding() { return riding; }, setCam(y, p) { camYaw = y; camPitch = p; }, toggleOutfit, input };
frame();
})();
