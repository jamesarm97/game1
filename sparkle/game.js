/* Sparkle Island — a cozy blocky open world: ride unicorns, dinosaurs and toy cars, build with blocks. */
(() => {
'use strict';
const T = THREE;
const $ = id => document.getElementById(id);
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
  23: [0xffa64d, 0xffa64d], 24: [0x5fd35f, 0x5fd35f], 25: [0x555560, 0x555560],
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
    const r = Math.hypot(dx, dy); if (r < 7 || r >= 13) continue;
    const b = [20, 23, 21, 24, 22, 16][Math.floor(13 - r)];
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
const water = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshLambertMaterial({ color: 0x4fc3f7, transparent: true, opacity: .78 }));
water.rotation.x = -Math.PI / 2; water.position.set(72, SEA, 72); scene.add(water);
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
const chunkMat = new T.MeshLambertMaterial({ vertexColors: true });
const NCX = W / CS, NCZ = D / CS, chunks = [];
const tmpC = new T.Color();
function buildChunk(cx, cz) {
  const pos = [], col = [], nor = [], ind = [];
  for (let z = cz * CS; z < cz * CS + CS; z++) for (let x = cx * CS; x < cx * CS + CS; x++) for (let y = 0; y < H; y++) {
    const b = blocks[(y * D + z) * W + x]; if (!b) continue;
    const jit = .93 + .14 * hash2(x * 1.7 + y * 3.1, z * 2.3 + y);
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi], n = f.n;
      if (getB(x + n[0], y + n[1], z + n[2])) continue;
      if (y === 0 && fi === 3) continue;
      let r, g, bl;
      if (b === 13) { tmpC.setHSL(((x + y + z) % 12) / 12, .95, .62); r = tmpC.r; g = tmpC.g; bl = tmpC.b; }
      else { const c = LIN[b][fi === 2 ? 0 : 1]; r = c[0]; g = c[1]; bl = c[2]; }
      const base = pos.length / 3, aos = [];
      for (let k = 0; k < 4; k++) {
        const c = f.c[k], o = f.ao[k];
        const s1 = getB(x + o[0][0], y + o[0][1], z + o[0][2]) ? 1 : 0, s2 = getB(x + o[1][0], y + o[1][1], z + o[1][2]) ? 1 : 0, s3 = getB(x + o[2][0], y + o[2][1], z + o[2][2]) ? 1 : 0;
        const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3); aos.push(ao);
        const sh = f.s * jit * (.62 + .38 * ao / 3);
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
  g.setIndex(ind);
  const i = cx + cz * NCX;
  if (chunks[i]) { chunks[i].geometry.dispose(); chunks[i].geometry = g; }
  else { chunks[i] = new T.Mesh(g, chunkMat); scene.add(chunks[i]); }
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
  setRaw(x, y, z, b);
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS), lx = x % CS, lz = z % CS;
  buildChunk(cx, cz);
  if (lx === 0 && cx > 0) buildChunk(cx - 1, cz); if (lx === CS - 1 && cx < NCX - 1) buildChunk(cx + 1, cz);
  if (lz === 0 && cz > 0) buildChunk(cx, cz - 1); if (lz === CS - 1 && cz < NCZ - 1) buildChunk(cx, cz + 1);
  mapPixel(x, z);
}

/* ---------- model helpers ---------- */
const matCache = {};
const mat = c => matCache[c] || (matCache[c] = new T.MeshLambertMaterial({ color: c }));
const boxGeo = {};
function box(parent, w, h, d, x, y, z, c) {
  const k = w + '|' + h + '|' + d, g = boxGeo[k] || (boxGeo[k] = new T.BoxGeometry(w, h, d));
  const m = new T.Mesh(g, typeof c === 'number' ? mat(c) : c); m.position.set(x, y, z); parent.add(m); return m;
}
function pivot(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
const texMat = t => new T.MeshLambertMaterial({ map: t });
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
  unicorn: { speed: 10.5, jump: 11.5, hw: .4, h: 1.9, glide: true, seat: [1.3, 0], label: 'unicorn', emoji: '🦄', cam: 6.5 },
  rex: { speed: 8.5, jump: 9.5, hw: .55, h: 2.6, stomp: true, seat: [2.12, -.1], label: 'T-rex', emoji: '🦖', cam: 8 },
  bronto: { speed: 6, jump: 8.6, hw: .7, h: 2.6, seat: [2.42, .2], label: 'long-neck', emoji: '🦕', cam: 10 },
  ptero: { speed: 6, airSpeed: 13, jump: 9, hw: .45, h: 1.5, fly: true, seat: [1.1, 0], label: 'pterodactyl', emoji: '🪽', cam: 7.5 },
  car: { speed: 15, jump: 8.6, hw: .7, h: 1.3, car: true, seat: [.72, -.3], label: 'car', emoji: '🚗', cam: 7.5 },
  baby: { speed: 7.5, jump: 9, hw: .25, h: .8 },
};
function eye(parent, x, y, z, s) { for (const sd of [-1, 1]) { box(parent, .04, s, s, sd * x, y, z, 0xffffff); box(parent, .05, s * .55, s * .55, sd * (x + .01), y - s * .1, z + s * .1, 0x1b1b2f); } }
function buildUnicorn(c) {
  const g = new T.Group(), parts = { legs: [] };
  box(g, .6, .55, 1.25, 0, 1.05, 0, c);
  for (const [x, z] of [[-.2, .45], [.2, .45], [-.2, -.45], [.2, -.45]]) { const l = pivot(g, x, .8, z); box(l, .17, .72, .17, 0, -.36, 0, c); box(l, .19, .1, .19, 0, -.75, 0, 0xffb7dc); parts.legs.push(l); }
  const neck = pivot(g, 0, 1.15, .5); neck.rotation.x = .45; box(neck, .28, .75, .3, 0, .32, 0, c);
  RAINBOW.forEach((rc, i) => box(neck, .1, .14, .16, 0, .08 + i * .12, -.2, rc));
  const head = parts.head = pivot(g, 0, 1.82, .82);
  box(head, .32, .32, .55, 0, 0, .12, c); box(head, .27, .22, .14, 0, -.04, .44, 0xffc9de);
  eye(head, .16, .04, .14, .11);
  for (const s of [-1, 1]) box(head, .08, .14, .06, s * .11, .22, -.08, c);
  box(head, .1, .12, .14, 0, .2, .02, RAINBOW[5]);
  const horn = new T.Mesh(new T.ConeGeometry(.065, .45, 6), mat(0xffd23f)); horn.position.set(0, .36, .2); horn.rotation.x = .35; head.add(horn);
  const tail = parts.tail = pivot(g, 0, 1.22, -.62); RAINBOW.forEach((rc, i) => box(tail, .13, .15, .15, 0, -i * .11, -.06 - i * .05, rc));
  return { g, parts };
}
function buildRex(c, belly) {
  const g = new T.Group(), parts = { legs: [] };
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
  const g = new T.Group(), parts = { legs: [] };
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
  const g = new T.Group(), parts = { legs: [], wheels: [] };
  box(g, 1.3, .4, 2.5, 0, .52, 0, c); box(g, 1.3, .26, .85, 0, .84, .8, c); box(g, 1.3, .26, .5, 0, .84, -1.0, c);
  box(g, 1.2, .42, .06, 0, 1.12, .38, new T.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: .55 }));
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
const blobGeo = new T.CircleGeometry(1, 16), blobMat = new T.MeshBasicMaterial({ color: 0x1b1030, transparent: true, opacity: .22, depthWrite: false });
function addShadow(e) { const m = new T.Mesh(blobGeo, blobMat); m.rotation.x = -Math.PI / 2; m.scale.setScalar(e.stats.hw * 1.7); scene.add(m); e.shadow = m; }

const mounts = [];
function spot(x, z) { // nearest free land cell
  for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
    if (X > 2 && Z > 2 && X < W - 3 && Z < D - 3 && !occ[X + Z * W] && hAt(X, Z) > 6) return new T.Vector3(X + .5, hAt(X, Z), Z + .5);
  }
  return new T.Vector3(x, hAt(x, z), z);
}
function addMount(kind, x, z, yaw, a, b) {
  const built = kind === 'unicorn' ? buildUnicorn(a) : kind === 'rex' ? buildRex(a, b) : kind === 'bronto' ? buildBronto(a, b) : kind === 'ptero' ? buildPtero(a, b) : buildCar(a);
  const e = { kind, stats: STATS[kind], group: built.g, parts: built.parts, pos: kind === 'car' ? new T.Vector3(x, hAt(x, z), z) : spot(x, z), vel: new T.Vector3(), yaw, onGround: false, ph: rng() * 6, carSpeed: 0, ai: { t: rng() * 3, moving: false, dx: 0, dz: 1 }, range: 10 };
  e.home = e.pos.clone(); scene.add(e.group); addShadow(e); mounts.push(e); return e;
}
const UC = [0xffffff, 0xffd9ee, 0xe6dcff, 0xfff6d6];
addMount('unicorn', 72.5, 66.5, 0, UC[0]).range = 5;
for (let i = 0; i < 6; i++) addMount('unicorn', MEADOW.x + Math.cos(i) * 7, MEADOW.z + 3 + Math.sin(i) * 6, i, UC[i % 4]);
addMount('unicorn', 100, 50, 1, UC[1]); addMount('unicorn', 44, 60, 2, UC[2]);
addMount('rex', VALLEY.x - 7, VALLEY.z - 5, 0, 0x6fcf6f, 0xd8f5a2); addMount('rex', VALLEY.x + 5, VALLEY.z + 8, 2, 0xff9a76, 0xffe0b5); addMount('rex', 98, 96, 1, 0x4fc1e0, 0xc9f1ff).range = 5;
const mama = addMount('bronto', VALLEY.x + 6, VALLEY.z - 1, -1.2, 0x9aa8ff, 0x7d88e8); mama.range = 3;
addMount('bronto', VALLEY.x - 5, VALLEY.z + 8, 1, 0xc59bff, 0xa57be8);
addMount('ptero', VALLEY.x - 9, VALLEY.z + 2, 0, 0xffb347, 0xff8a5c); addMount('ptero', VALLEY.x + 2, VALLEY.z - 9, 3, 0x7fd6c2, 0x4bb8a3);
addMount('ptero', 80, 97, 2, 0xff9ed2, 0xe670b0).range = 4; addMount('ptero', 50, 46, 2, 0xffe066, 0xffa64d).range = 5;
const CARC = [0xff6fae, 0x36cfa9, 0xffd23f, 0x9b7bff, 0x5fa8ff, 0xff8a5c];
[[66.5, 72.5, -Math.PI / 2], [60.5, 52.5, Math.PI / 2], [84.5, 92.5, -Math.PI / 2], [52.5, 64.5, 0], [92.5, 80.5, Math.PI], [72.5, 84.5, 0]].forEach((c, i) => addMount('car', c[0], c[1], c[2], CARC[i]));

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
  const s = e.stats, inWater = e.pos.y < SEA - .85;
  if (!direct) {
    let sp = s.speed * (sprint ? 1.4 : 1); if (s.fly && !e.onGround) sp = s.airSpeed; if (inWater) sp *= .6;
    const k = Math.min(1, (e.onGround ? 12 : 6) * dt);
    e.vel.x += (wx * sp - e.vel.x) * k; e.vel.z += (wz * sp - e.vel.z) * k;
  }
  if (inWater) { e.vel.y += (2.5 - e.vel.y) * Math.min(1, 5 * dt); if (jumpHeld) e.vel.y = 4.5; }
  else {
    e.vel.y -= (s.fly && !e.onGround ? 11 : 26) * dt;
    if (jumpPressed && e.onGround) { e.vel.y = s.jump; if (e === player || e === riding) sfx.jump(); }
    else if (s.fly && jumpHeld && !e.onGround) e.vel.y = Math.min(7.5, e.vel.y + 42 * dt);
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
let AC = null, soundOn = true;
function tone(f, d, type = 'sine', v = .1, delay = 0, f2) {
  if (!AC || !soundOn) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .03);
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
function initAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no sound */ } } if (AC && AC.state === 'suspended') AC.resume(); }

/* ---------- stars, markers, items ---------- */
const starShape = new T.Shape();
for (let i = 0; i < 10; i++) { const r = i % 2 ? .23 : .52, a = i / 10 * Math.PI * 2 + Math.PI / 2; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
const starGeo = new T.ExtrudeGeometry(starShape, { depth: .16, bevelEnabled: false }); starGeo.center();
const starMat = new T.MeshLambertMaterial({ color: 0xffd633, emissive: 0x9a6a00 });
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
const clouds = [], cloudMat = new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .92, fog: false });
for (let i = 0; i < 16; i++) {
  const g = new T.Group(); const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) box(g, 5 + rng() * 6, 2 + rng() * 2, 4 + rng() * 4, k * 4 - n * 2, rng() * 1.5, rng() * 3, cloudMat);
  g.position.set(rng() * 300 - 80, 44 + rng() * 14, rng() * 300 - 80); scene.add(g); clouds.push(g);
}

/* ---------- baby dino friend ---------- */
let baby = null;
function hatchBaby(p) {
  const b = buildRex(0xa8e6a1, 0xfff3c4); b.g.scale.setScalar(.32);
  baby = { stats: STATS.baby, group: b.g, parts: b.parts, pos: p.clone(), vel: new T.Vector3(), yaw: 0, onGround: false, ph: 0 };
  scene.add(b.g); addShadow(baby); burst(p.clone().add(new T.Vector3(0, 1, 0)), 60, null, 3, 5);
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
  { t: () => 'Fly a pterodactyl up to the cloud island ☁️', start() { setMarker(new T.Vector3(CLOUD.x, hAt(CLOUD.x, CLOUD.z), CLOUD.z)); }, done: () => near(CLOUD, 8) && body().pos.y >= 28.5 },
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
press('tRide', rideAction); press('tBreak', breakBlock); press('tPlace', placeBlock);
$('bOutfit').addEventListener('click', () => { toggleOutfit(); canvas.focus(); });
$('bSound').addEventListener('click', () => { soundOn = !soundOn; $('bSound').textContent = soundOn ? '🔊' : '🔇'; canvas.focus(); });
$('bHelp').addEventListener('click', () => { if (locked()) document.exitPointerLock(); $('start').hidden = false; $('play').textContent = 'Keep playing'; });
$('play').addEventListener('click', startGame);
$('keys').innerHTML = (isTouch
  ? [['Stick', 'Walk and run'], ['Drag', 'Look around'], ['⬆️', 'Jump · hold to glide or fly'], ['🦄', 'Hop on or off a ride'], ['⛏️ 🧱', 'Break or place a block'], ['👗', 'Change outfit']]
  : [['W A S D', 'Walk · Shift to run'], ['Mouse', 'Look around'], ['Space', 'Jump · hold to glide or fly'], ['E', 'Hop on or off a ride'], ['Click', 'Break a block (or F)'], ['Right-click', 'Place a block (or R)'], ['1–9', 'Pick a block'], ['C', 'Change outfit']]
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
    player.vel.set(0, 3, 0); player.yaw = m.yaw; m.carSpeed = 0; m.home.copy(m.pos); sfx.pop();
    return;
  }
  const m = nearestMount(); if (!m) return;
  riding = m; m.group.add(player.group); player.group.position.set(0, m.stats.seat[0] - .5, m.stats.seat[1]); player.group.rotation.y = 0;
  m.vel.set(0, 0, 0); sfx.ride(); burst(m.pos.clone().add(new T.Vector3(0, m.stats.h, 0)), 30, null, 3);
  if (!hinted[m.kind]) { hinted[m.kind] = 1; toast(m.kind === 'unicorn' ? 'Hold jump in the air to rainbow-glide! 🌈' : m.kind === 'ptero' ? 'Hold jump to flap and fly! 🪽' : m.kind === 'car' ? 'Vroom! Steer left and right 🚗' : m.kind === 'rex' ? 'Stomp stomp! 🦖' : 'So tall! 🦕'); }
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
  if (hits(body()) || mounts.some(hits) || (baby && hits(baby))) return;
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
      const car = riding.stats.car;
      P.legs[0].rotation.set(-1.45, 0, car ? 0 : -.35); P.legs[1].rotation.set(-1.45, 0, car ? 0 : .35);
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
  if (P.tail) P.tail.rotation.y = Math.sin(m.ph * .7) * .25;
  if (P.head) P.head.rotation.x = Math.sin(m.ph * .5) * .05;
  if (P.wings) { const f = m.onGround ? .15 : Math.sin(clock.elapsedTime * 11) * .65; P.wings[0].rotation.z = -f; P.wings[1].rotation.z = f; }
  if (P.wheels) for (const w of P.wheels) w.rotation.x += m.carSpeed * dt / .33;
  m.group.position.copy(m.pos); m.group.rotation.y = m.yaw;
  if (m.kind === 'unicorn' && m === riding && sp > 6 && Math.random() < .7) burst(new T.Vector3(m.pos.x - Math.sin(m.yaw) * .8, m.pos.y + 1.1, m.pos.z - Math.cos(m.yaw) * .8), 1, null, .6, 1);
}
function placeShadow(e, hidden) {
  const s = e.shadow; if (hidden) { s.visible = false; return; }
  let y = Math.floor(e.pos.y + .2); while (y > 0 && !getB(Math.floor(e.pos.x), y - 1, Math.floor(e.pos.z))) y--;
  s.visible = e.pos.y - y < 12; s.position.set(e.pos.x, Math.max(y, SEA) + .03, e.pos.z);
}
function wander(m, dt) {
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
  if (baby) {
    const b = body(), dx = b.pos.x - baby.pos.x, dz = b.pos.z - baby.pos.z, d = Math.hypot(dx, dz);
    if (d > 40) baby.pos.copy(spot(b.pos.x + 2, b.pos.z + 2));
    const go = d > 2.6 + b.stats.hw; drive(baby, dt, go ? dx / d : 0, go ? dz / d : 0, false, false, d > 8, false);
    baby.ph += dt * (3 + Math.hypot(baby.vel.x, baby.vel.z) * 2); const s = Math.sin(baby.ph) * (go ? .7 : 0);
    baby.parts.legs[0].rotation.x = s; baby.parts.legs[1].rotation.x = -s; baby.parts.tail.rotation.y = Math.sin(time * 5) * .3;
    baby.group.position.copy(baby.pos); baby.group.rotation.y = baby.yaw; placeShadow(baby);
  }

  // stars, items, missions
  const b = body();
  for (const st of stars) {
    if (!st.visible) continue;
    st.rotation.y = time * 2; st.position.y += Math.sin(time * 3 + st.position.x) * .003;
    if (started && Math.abs(st.position.x - b.pos.x) < b.stats.hw + 1.1 && Math.abs(st.position.z - b.pos.z) < b.stats.hw + 1.1 && st.position.y > b.pos.y - 1 && st.position.y < b.pos.y + b.stats.h + 1.2) {
      st.visible = false; S.stars++; $('starN').textContent = S.stars; sfx.star(); burst(st.position, 26, 0xffe14d, 3, 4);
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
  if (started) { if (riding) pr = isTouch ? '' : 'E — hop off'; else { const m = nearestMount(); if (m) pr = (isTouch ? 'Tap 🦄 to ride the ' : 'E — ride the ') + m.stats.label + ' ' + m.stats.emoji; } }
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

  updateTarget(); updateParticles(dt);
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 240) c.position.x = -100; }
  drawMap(b, time);
  renderer.render(scene, camera);
}
function drawMap(b, time) {
  const g = mapCtx; g.drawImage(mapBase, 0, 0);
  for (const st of stars) if (st.visible) { g.fillStyle = '#fff36b'; g.fillRect(st.position.x - 1, st.position.z - 1, 2, 2); }
  for (const m of mounts) { g.fillStyle = m.kind === 'unicorn' ? '#ff4fa3' : m.kind === 'car' ? '#3a2352' : '#1f8a3b'; g.fillRect(m.pos.x - 1.5, m.pos.z - 1.5, 3, 3); }
  for (const r of rings) if (r.visible) { g.strokeStyle = '#ff4fa3'; g.lineWidth = 2; g.beginPath(); g.arc(r.position.x, r.position.z, 3, 0, 7); g.stroke(); }
  if (marker) { g.strokeStyle = '#fff'; g.fillStyle = '#ffb300'; g.lineWidth = 2; g.beginPath(); g.arc(marker.x, marker.z, 4 + Math.sin(time * 5) * 1.5, 0, 7); g.fill(); g.stroke(); }
  const yaw = riding ? riding.yaw : player.yaw;
  g.save(); g.translate(b.pos.x, b.pos.z); g.rotate(-yaw); g.fillStyle = '#fff'; g.strokeStyle = '#3a2352'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(4.5, -4.5); g.lineTo(0, -2); g.lineTo(-4.5, -4.5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
window.__game = { player, mounts, S, startGame, rideAction, get riding() { return riding; }, setCam(y, p) { camYaw = y; camPitch = p; }, toggleOutfit, input };
frame();
})();
