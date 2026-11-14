'use strict';
/* Penthouse Desk — Plash 라이브 바탕화면
 * 좌표계: 원본 이미지 1672×941 px. 장면을 화면에 cover로 맞춘다. */

const W = 1672, H = 941;
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const pad2 = n => String(n).padStart(2, '0');
const hhmm = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 미리보기용 오버라이드 (?debug=1 / ?weather=rain&hour=21&month=12) ---------------- */
const override = { kind: params.get('weather') || '', hour: params.has('hour') ? +params.get('hour') : -1, month: params.get('month') || '' };
function now() {
  const d = new Date();
  if (override.hour >= 0) { d.setHours(Math.floor(override.hour), Math.round((override.hour % 1) * 60), d.getSeconds()); }
  if (override.month) d.setMonth(+override.month - 1, 15);
  return d;
}

/* ---------------- 장면 스케일 ---------------- */
const scene = $('#scene');
let scale = 1;
function fit() {
  scale = Math.max(innerWidth / W, innerHeight / H);
  let x = (innerWidth - W * scale) / 2, y = (innerHeight - H * scale) / 2;
  const view = params.get('view')?.split(',').map(Number); // 확대 점검용: ?view=x,y,width
  if (view?.length === 3) { scale = innerWidth / view[2]; x = -view[0] * scale; y = -view[1] * scale; }
  scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  sizeCanvases();
}

/* ---------------- 원근 변환 (사각형 → 실측 사각형) ---------------- */
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
function grow(q, px) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy); return [x + dx / l * px, y + dy / l * px]; });
}
function mapToQuad(el, quad) {
  const w = el.offsetWidth, h = el.offsetHeight;
  const src = [[0, 0], [w, 0], [w, h], [0, h]], A = [], b = [];
  src.forEach(([x, y], i) => {
    const [X, Y] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  });
  const [a, bb, c, d, e, f, g, hh] = solve(A, b);
  el.style.transform = `matrix3d(${a},${d},0,${g},${bb},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}
// 전경 이미지 구멍을 측정한 꼭짓점 (TL, TR, BR, BL)
const QUADS = {
  board: grow([[1478, 396], [1608, 387], [1579, 614], [1464, 606]], 4),
  frame: grow([[1356, 516], [1450, 517], [1438, 604], [1343, 599]], 4),
  calendar: grow([[223, 680], [315, 674], [336, 805], [253, 815]], 4)
};
function placeQuads() { for (const [id, q] of Object.entries(QUADS)) mapToQuad($('#' + id), q); }

/* ---------------- 태양/달 ---------------- */
const LOC = { lat: 37.5665, lon: 126.978 };
function sunPos(date, lat = LOC.lat, lon = LOC.lon) {
  const rad = Math.PI / 180, d = date / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 3.6e-7 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = (gmst * 15 + lon) * rad - ra;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat * rad) - Math.sin(lat * rad) * Math.cos(ha));
  return { el: el / rad, az: (az / rad + 360) % 360 };
}
const moonAge = d => (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588 + 29.530588) % 29.530588;

/* ---------------- 상태 ---------------- */
const state = {
  weather: { kind: 'clear', intensity: 0, cloud: 20, wind: 8, temp: 12 },
  env: {}            // 매 프레임 계산되는 하늘/조명 값
};
const KIND_KO = { clear: '맑음', partly: '구름 조금', cloudy: '구름 많음', overcast: '흐림', fog: '안개', drizzle: '이슬비', rain: '비', snow: '눈', sleet: '진눈깨비', storm: '뇌우' };
const ICON = { clear: '☀︎', partly: '⛅︎', cloudy: '☁︎', overcast: '☁︎', fog: '≋', drizzle: '☂︎', rain: '☂︎', snow: '❄︎', sleet: '❄︎', storm: 'ϟ' };
function weatherNow() {
  const w = { ...state.weather };
  if (override.kind) { w.kind = override.kind; w.intensity = { drizzle: .3, rain: .7, storm: 1, snow: .7, sleet: .5, fog: .7 }[w.kind] ?? 0; w.cloud = { clear: 5, partly: 40, cloudy: 70, overcast: 95 }[w.kind] ?? 95; }
  return w;
}

/* ---------------- 하늘 팔레트 (태양 고도별) ---------------- */
const SKY = [ // [고도, 천정, 중간, 지평선]
  [-18, '#04060d', '#080d1c', '#111a30'],
  [-10, '#070c22', '#141f44', '#2a3460'],
  [-5, '#141f4d', '#33427c', '#9a6a86'],
  [-1, '#25397a', '#6a6fa8', '#f08f62'],
  [3, '#3a5da6', '#8ea6d6', '#ffbf86'],
  [10, '#3772c4', '#79a9e2', '#d8e6f2'],
  [30, '#2c6ac6', '#66a2e8', '#c4def6'],
  [60, '#2563c2', '#5f9de8', '#bcd9f6']
];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')},${a})`;
function skyColors(el) {
  let i = 0; while (i < SKY.length - 2 && el > SKY[i + 1][0]) i++;
  const [e0, ...c0] = SKY[i], [e1, ...c1] = SKY[i + 1], t = clamp((el - e0) / (e1 - e0));
  return c0.map((c, k) => mix(hex(c), hex(c1[k]), t));
}

function computeEnv() {
  const d = now(), w = weatherNow();
  const sun = sunPos(d), el = sun.el;
  const month = d.getMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'spring' : month <= 8 && month >= 6 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
  const day = smooth(-7, 7, el);                         // 0 밤 → 1 낮
  const golden = clamp(1 - Math.abs(el - 1.5) / 8) * (1 - 0.8 * clamp((w.cloud - 50) / 50)); // 해질녘/해뜰녘
  const wet = ['drizzle', 'rain', 'storm', 'sleet'].includes(w.kind) ? Math.max(.3, w.intensity) : 0;
  const cover = { clear: w.cloud / 100 * .35, partly: .4, cloudy: .68, overcast: .92, fog: .7, drizzle: .9, rain: .95, storm: 1, snow: .92, sleet: .95 }[w.kind] ?? .5;
  let [top, midc, hor] = skyColors(el);
  // 흐림/비/눈이면 하늘을 회색으로
  const grey = clamp((cover - .45) / .5);
  const lum = c => (c[0] + c[1] + c[2]) / 3;
  const toGrey = (c, k) => { const l = lum(c) * (0.9 + .25 * day); return mix(c, [l * .96, l, l * 1.06], k); };
  top = toGrey(top, grey * .85); midc = toGrey(midc, grey * .85); hor = toGrey(hor, grey * .75);
  if (w.kind === 'fog') { const f = [lerp(40, 196, day), lerp(44, 200, day), lerp(52, 206, day)]; top = mix(top, f, .55); midc = mix(midc, f, .7); hor = mix(hor, f, .85); }
  state.env = { d, el, az: sun.az, day, golden, wet, cover, grey, season, month, w, top, midc, hor, night: 1 - day };
  return state.env;
}

/* ---------------- 캔버스 ---------------- */
const skyC = $('#sky'), outC = $('#outside'), glassC = $('#glass');
const sctx = skyC.getContext('2d'), octx = outC.getContext('2d'), gctx = glassC.getContext('2d');
let K = 1; // 캔버스 해상도 배율
function sizeCanvases() {
  K = Math.min(2, Math.max(.6, scale * (devicePixelRatio || 1)));
  skyC.width = W * K; skyC.height = 340 * K;
  outC.width = glassC.width = Math.round(W * K * .75); outC.height = glassC.height = Math.round(H * K * .75);
  beads.dirty = true;
}

/* 구름 스프라이트 (2D 애니메이션 풍의 뭉게구름) */
function makeCloud(wd, ht, puffs, seed) {
  const c = document.createElement('canvas'); c.width = wd; c.height = ht;
  const x = c.getContext('2d');
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const blobs = [];
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1);
    const r = ht * (.18 + .22 * Math.sin(Math.PI * t) + rnd() * .1);
    blobs.push([wd * (.12 + .76 * t) + (rnd() - .5) * wd * .08, ht * .72 - r * (.55 + rnd() * .35), r]);
  }
  // 그림자 몸통 → 밝은 윗면
  x.fillStyle = 'rgba(150,160,180,1)';
  for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx, by + r * .12, r, 0, 7); x.fill(); }
  x.fillRect(wd * .1, ht * .6, wd * .8, ht * .15);
  x.globalCompositeOperation = 'source-atop';
  for (const [bx, by, r] of blobs) {
    const g = x.createRadialGradient(bx - r * .25, by - r * .45, r * .1, bx, by, r * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(236,240,248,.9)'); g.addColorStop(1, 'rgba(236,240,248,0)');
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, r * 1.1, 0, 7); x.fill();
  }
  // 가장자리 부드럽게
  const out = document.createElement('canvas'); out.width = wd; out.height = ht;
  const o = out.getContext('2d'); o.filter = 'blur(2px)'; o.drawImage(c, 0, 0);
  return out;
}
const cloudSprites = Array.from({ length: 7 }, (_, i) => makeCloud(260 + i * 40, 110 + (i % 3) * 22, 6 + (i % 4), 1234 + i * 977));
let clouds = [];
function seedClouds(cover) {
  const n = Math.round(2 + cover * 14);
  clouds = Array.from({ length: n }, (_, i) => ({
    sp: cloudSprites[i % cloudSprites.length],
    x: Math.random() * (W + 600) - 300, y: 10 + Math.random() * 200 + (i % 3) * 10,
    s: .55 + Math.random() * .75, v: 3 + Math.random() * 6, a: .75 + Math.random() * .25
  })).sort((a, b) => a.s - b.s);
}
const stars = Array.from({ length: 170 }, () => ({ x: Math.random() * W, y: Math.random() * 300, r: Math.random() ** 3 * 1.3 + .3, p: Math.random() * 6.3, f: .5 + Math.random() * 2 }));

let bolt = null;
function drawSky(t, dt) {
  const E = state.env, k = K;
  sctx.setTransform(k, 0, 0, k, 0, 0);
  const g = sctx.createLinearGradient(0, 0, 0, 330);
  g.addColorStop(0, rgb(E.top)); g.addColorStop(.55, rgb(E.midc)); g.addColorStop(1, rgb(E.hor));
  sctx.fillStyle = g; sctx.fillRect(0, 0, W, 340);

  // 별 (맑은 밤)
  const starA = clamp(1 - E.day * 1.6) * clamp(1 - E.cover * 1.2);
  if (starA > .02) {
    for (const s of stars) {
      const tw = .55 + .45 * Math.sin(t / 1000 * s.f + s.p);
      sctx.fillStyle = `rgba(235,240,255,${starA * tw * (1 - s.y / 330)})`;
      sctx.beginPath(); sctx.arc(s.x, s.y, s.r, 0, 7); sctx.fill();
    }
  }
  // 해 — 방위각을 창 가로 위치로 (동→왼쪽, 서→오른쪽)
  const sx = (az) => 260 + clamp((az - 80) / 200) * 1380;
  if (E.el > -4) {
    const x = sx(E.az), y = 300 - E.el * 7.2, a = clamp((E.el + 4) / 5) * (1 - E.grey * .85);
    const halo = sctx.createRadialGradient(x, y, 4, x, y, 210);
    const warm = clamp(1 - E.el / 14);
    halo.addColorStop(0, `rgba(255,${lerp(250, 200, warm)},${lerp(230, 140, warm)},${.75 * a})`);
    halo.addColorStop(.2, `rgba(255,${lerp(235, 170, warm)},${lerp(200, 110, warm)},${.25 * a})`);
    halo.addColorStop(1, 'rgba(255,200,150,0)');
    sctx.fillStyle = halo; sctx.fillRect(x - 220, y - 220, 440, 440);
    sctx.fillStyle = `rgba(255,${lerp(252, 226, warm)},${lerp(240, 180, warm)},${a})`;
    sctx.beginPath(); sctx.arc(x, y, 13, 0, 7); sctx.fill();
  }
  // 달
  const age = moonAge(E.d), frac = age / 29.530588;
  const mp = sunPos(new Date(+E.d - frac * 24.84 * 3600e3));
  if (mp.el > -2 && E.day < .85) {
    const x = sx((mp.az + 360) % 360), y = 300 - mp.el * 6.4, r = 11, a = clamp(1 - E.day * 1.2) * (1 - E.grey * .9);
    if (a > .02 && y > -20) {
      const mg = sctx.createRadialGradient(x, y, r, x, y, r * 6);
      mg.addColorStop(0, `rgba(210,220,255,${.22 * a})`); mg.addColorStop(1, 'rgba(210,220,255,0)');
      sctx.fillStyle = mg; sctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      sctx.save(); sctx.globalAlpha = a;
      sctx.fillStyle = rgb(mix(E.top, [70, 80, 110], .3)); sctx.beginPath(); sctx.arc(x, y, r, 0, 7); sctx.fill();
      const waxing = frac < .5, kx = Math.cos(frac * 2 * Math.PI) * r;
      sctx.fillStyle = '#f4f1e4';
      sctx.beginPath();
      sctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);           // 밝은 반원
      sctx.ellipse(x, y, Math.abs(kx), r, 0, Math.PI / 2, -Math.PI / 2, (kx > 0) === waxing ? !waxing : waxing);
      sctx.fill();
      sctx.restore();
    }
  }
  // 비 오는 흐린 날: 두꺼운 층운 덮기
  if (E.cover > .8) {
    const st = sctx.createLinearGradient(0, 0, 0, 330);
    const base = mix(E.top, [lerp(52, 150, E.day), lerp(48, 155, E.day), lerp(56, 165, E.day)], .75);
    const k2 = (E.cover - .8) * 5;
    st.addColorStop(0, rgb(base, .92 * k2)); st.addColorStop(1, rgb(mix(base, [120, 90, 80], E.night * .35), .45 * k2));
    sctx.fillStyle = st; sctx.fillRect(0, 0, W, 340);
  }
  // 밤의 도시 광해
  const lp = sctx.createLinearGradient(0, 180, 0, 330);
  lp.addColorStop(0, 'rgba(255,170,110,0)'); lp.addColorStop(1, `rgba(255,170,110,${.22 * E.night * (.5 + E.cover)})`);
  sctx.fillStyle = lp; sctx.fillRect(0, 180, W, 160);
  // 번개
  if (bolt) {
    sctx.strokeStyle = `rgba(235,240,255,${bolt.a})`; sctx.lineWidth = 2; sctx.shadowColor = '#bcd0ff'; sctx.shadowBlur = 14;
    sctx.beginPath(); bolt.pts.forEach(([x, y], i) => i ? sctx.lineTo(x, y) : sctx.moveTo(x, y)); sctx.stroke();
    sctx.shadowBlur = 0;
  }
}
/* 구름 색: 스프라이트는 흰색이라 tint를 따로 칠한다 (source-atop을 쓰면 하늘까지 덮이므로 별도 캔버스 사용) */
const cloudLayer = document.createElement('canvas');
function drawClouds(dt) {
  const E = state.env;
  if (cloudLayer.width !== skyC.width) { cloudLayer.width = skyC.width; cloudLayer.height = skyC.height; }
  const c = cloudLayer.getContext('2d');
  c.setTransform(K, 0, 0, K, 0, 0); c.clearRect(0, 0, W, 340);
  for (const cl of clouds) {
    cl.x += cl.v * (1 + E.w.wind / 25) * dt / 1000;
    const wd = cl.sp.width * cl.s, ht = cl.sp.height * cl.s;
    if (cl.x > W + 40) { cl.x = -wd - Math.random() * 200; cl.y = 10 + Math.random() * 210; }
    c.globalAlpha = cl.a * (.6 + .4 * E.cover);
    c.drawImage(cl.sp, cl.x, cl.y, wd, ht);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-atop';
  const lit = mix(mix([58, 64, 88], [255, 255, 255], E.day), [255, 170, 130], E.golden * .55);
  const dim = 1 - E.grey * .42 - (E.w.kind === 'storm' ? .22 : 0);
  const tg = c.createLinearGradient(0, 0, 0, 330);
  tg.addColorStop(0, rgb(lit.map(v => v * dim), .72)); tg.addColorStop(1, rgb(mix(lit, [255, 150, 100], E.night * .3 + E.golden * .3).map(v => v * dim * .8), .85));
  c.fillStyle = tg; c.fillRect(0, 0, W, 340);
  c.globalCompositeOperation = 'source-over';
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.drawImage(cloudLayer, 0, 0);
}

/* ---------------- 창밖 날씨: 비/눈/안개/꽃잎·낙엽 ---------------- */
let rain = [], flakes = [], leaves = [], fogBands = [];
function seedWeather() {
  const E = state.env, w = E.w;
  const rainN = ['drizzle', 'rain', 'storm'].includes(w.kind) ? Math.round(80 + w.intensity * 520) : w.kind === 'sleet' ? 200 : 0;
  rain = Array.from({ length: rainN }, () => newDrop(true));
  const snowN = w.kind === 'snow' ? Math.round(120 + w.intensity * 380) : w.kind === 'sleet' ? 120 : 0;
  flakes = Array.from({ length: snowN }, () => newFlake(true));
  const leafy = (E.season === 'spring' || E.season === 'autumn') && ['clear', 'partly', 'cloudy'].includes(w.kind);
  leaves = leafy ? Array.from({ length: 9 }, () => newLeaf(true)) : [];
  fogBands = w.kind === 'fog' || w.kind === 'drizzle' ? Array.from({ length: 6 }, (_, i) => ({ y: 120 + i * 80, x: Math.random() * W, w: 700 + Math.random() * 600, h: 70 + Math.random() * 60, v: 4 + Math.random() * 6 })) : [];
}
function newDrop(init) {
  const z = Math.random();        // 0 먼 곳 → 1 가까운 곳
  return { x: Math.random() * (W + 200) - 100, y: init ? Math.random() * H : -30 - Math.random() * 200, z, v: 520 + z * 900, len: 10 + z * 30 };
}
function newFlake(init) {
  const z = Math.random();
  return { x: Math.random() * W, y: init ? Math.random() * H : -10, z, r: .7 + z * 2.6, v: 18 + z * 45, p: Math.random() * 6.3, sw: 8 + Math.random() * 18 };
}
function newLeaf(init) {
  return { x: init ? Math.random() * W : -20, y: Math.random() * 500, r: 3 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - .5) * 3, vx: 25 + Math.random() * 35, vy: 12 + Math.random() * 18, p: Math.random() * 6 };
}
let lightningAt = 0, flash = 0;
function drawOutside(t, dt) {
  const E = state.env, w = E.w, k = outC.width / W, s = dt / 1000;
  octx.setTransform(k, 0, 0, k, 0, 0);
  octx.clearRect(0, 0, W, H);
  const wind = clamp(w.wind / 40, 0, 1) * (w.kind === 'storm' ? 1.4 : 1);
  // 안개
  if (fogBands.length) {
    const fc = rgb([lerp(70, 220, E.day), lerp(75, 224, E.day), lerp(88, 230, E.day)]);
    octx.fillStyle = rgb([lerp(70, 220, E.day), lerp(75, 224, E.day), lerp(88, 230, E.day)], w.kind === 'fog' ? .28 : .1);
    octx.fillRect(0, 0, W, 720);
    for (const b of fogBands) {
      b.x += b.v * s; if (b.x - b.w > W) b.x = -b.w;
      const g = octx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.w / 2);
      g.addColorStop(0, fc.replace(',1)', `,${w.kind === 'fog' ? .35 : .15})`)); g.addColorStop(1, fc.replace(',1)', ',0)'));
      octx.save(); octx.translate(b.x, b.y); octx.scale(1, b.h / b.w * 2.2); octx.translate(-b.x, -b.y);
      octx.fillStyle = g; octx.fillRect(b.x - b.w / 2, b.y - b.w / 2, b.w, b.w); octx.restore();
    }
  }
  // 비 (깊이감 있는 가는 빗줄기)
  if (rain.length) {
    const slant = .18 + wind * .35, light = lerp(150, 225, E.day);
    octx.lineCap = 'round';
    for (let i = 0; i < rain.length; i++) {
      const d = rain[i];
      d.y += d.v * s; d.x += d.v * slant * s;
      if (d.y > 720) { rain[i] = newDrop(false); continue; }
      octx.strokeStyle = `rgba(${light},${light + 10},${light + 25},${.10 + d.z * .32})`;
      octx.lineWidth = .5 + d.z * 1.1;
      octx.beginPath(); octx.moveTo(d.x, d.y); octx.lineTo(d.x - d.len * slant, d.y - d.len); octx.stroke();
    }
  }
  // 눈
  if (flakes.length) {
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += f.v * s; f.p += s * .9; f.x += (Math.sin(f.p) * f.sw * .6 + wind * 40) * s;
      if (f.y > 720) { flakes[i] = newFlake(false); continue; }
      if (f.x > W + 10) f.x = -10;
      const g = octx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(255,255,255,${.55 + f.z * .4})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      octx.fillStyle = g; octx.beginPath(); octx.arc(f.x, f.y, f.r, 0, 7); octx.fill();
    }
  }
  // 꽃잎(봄) / 낙엽(가을)
  if (leaves.length) {
    const spring = E.season === 'spring';
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.p += s; l.x += (l.vx + Math.sin(l.p * 1.3) * 18) * s; l.y += (l.vy + Math.cos(l.p) * 10) * s; l.rot += l.vr * s;
      if (l.x > W + 20 || l.y > 700) { leaves[i] = newLeaf(false); continue; }
      octx.save(); octx.translate(l.x, l.y); octx.rotate(l.rot); octx.scale(1, Math.abs(Math.sin(l.p * 2)) * .7 + .3);
      octx.fillStyle = spring ? `rgba(255,${190 + (i % 3) * 15},${210 + (i % 2) * 20},${.75 - E.night * .4})` : ['#d9822b', '#c4512c', '#e3b23c'][i % 3];
      octx.globalAlpha = spring ? 1 : .85 - E.night * .45;
      octx.beginPath(); octx.ellipse(0, 0, l.r * 1.4, l.r * .8, 0, 0, 7); octx.fill(); octx.restore();
    }
    octx.globalAlpha = 1;
  }
  // 번개
  if (w.kind === 'storm' && !reduced) {
    if (t > lightningAt) {
      lightningAt = t + 5000 + Math.random() * 11000;
      flash = 1;
      let x = 300 + Math.random() * 1250, y = 0; const pts = [[x, y]];
      while (y < 260) { y += 14 + Math.random() * 26; x += (Math.random() - .5) * 46; pts.push([x, y]); }
      bolt = { pts, a: 1 };
    }
  }
  if (flash > 0) {
    flash = Math.max(0, flash - s * 2.2);
    const f = flash > .6 ? 1 : flash > .45 ? .25 : flash > .3 ? .8 : flash;
    octx.fillStyle = `rgba(220,230,255,${f * .35})`; octx.fillRect(0, 0, W, 720);
    $('#flash').style.opacity = (f * .16).toFixed(3);
    if (bolt) bolt.a = f;
    if (flash === 0) bolt = null;
  }
}

/* ---------------- 창문 유리 위 빗방울 (맺힌 물방울 + 흘러내리는 물줄기) ---------------- */
const beads = { canvas: document.createElement('canvas'), dirty: true, list: [] };
let rivulets = [];
function dropShape(c, x, y, r, stretch = 1) {
  // 물방울: 아래쪽 어두운 테두리, 위쪽 반사광, 가운데는 투명 렌즈
  const E = state.env, bright = lerp(.8, 1, E.day);
  const g = c.createRadialGradient(x - r * .25, y - r * .3, r * .1, x, y, r * 1.05);
  g.addColorStop(0, `rgba(255,255,255,${.38 * bright})`);
  g.addColorStop(.35, `rgba(210,225,240,${.08 * bright})`);
  g.addColorStop(.8, 'rgba(10,18,30,.20)');
  g.addColorStop(1, 'rgba(10,18,30,0)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, r, r * stretch, 0, 0, 7); c.fill();
  c.fillStyle = `rgba(255,255,255,${.75 * bright})`;
  c.beginPath(); c.arc(x - r * .3, y - r * .38 * stretch, Math.max(.35, r * .22), 0, 7); c.fill();
}
function renderBeads() {
  const E = state.env, wet = E.wet, c = beads.canvas;
  c.width = glassC.width; c.height = glassC.height;
  const x = c.getContext('2d'), k = c.width / W;
  x.setTransform(k, 0, 0, k, 0, 0);
  const n = Math.round(wet * 900);
  beads.list = Array.from({ length: n }, () => ({ x: 115 + Math.random() * (W - 115), y: Math.random() * 700, r: .4 + Math.random() ** 2.4 * 2.6 }));
  for (const b of beads.list) dropShape(x, b.x, b.y, b.r);
  beads.dirty = false;
}
function newRivulet() {
  return { x: 140 + Math.random() * (W - 160), y: -10 - Math.random() * 300, r: 1.8 + Math.random() * 1.8, v: 0, wait: Math.random() * 2, trail: [] };
}
function drawGlass(t, dt) {
  const E = state.env, s = dt / 1000;
  const k = glassC.width / W;
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, glassC.width, glassC.height);
  if (E.wet <= 0) return;
  if (beads.dirty) { renderBeads(); rivulets = Array.from({ length: Math.round(4 + E.wet * 14) }, newRivulet); }
  gctx.drawImage(beads.canvas, 0, 0);
  gctx.setTransform(k, 0, 0, k, 0, 0);
  const bx = beads.canvas.getContext('2d');
  for (let i = 0; i < rivulets.length; i++) {
    const d = rivulets[i];
    // 멈칫멈칫 흘러내리기
    if (d.wait > 0) d.wait -= s;
    else {
      d.v = Math.min(160, d.v + 260 * s);
      d.y += d.v * s; d.x += Math.sin(d.y * .05 + i) * .25;
      if (Math.random() < s * 1.4) { d.wait = .2 + Math.random() * 1.2; d.v = 0; }
      if (d.trail.length === 0 || d.y - d.trail[d.trail.length - 1][1] > 3) d.trail.push([d.x, d.y, t]);
      // 지나간 자리의 작은 물방울 지우기 + 잔여 물방울 남기기
      bx.save(); bx.setTransform(k, 0, 0, k, 0, 0); bx.globalCompositeOperation = 'destination-out';
      bx.beginPath(); bx.arc(d.x, d.y, d.r * 1.6, 0, 7); bx.fill(); bx.restore();
      if (Math.random() < .08) { bx.save(); bx.setTransform(k, 0, 0, k, 0, 0); dropShape(bx, d.x + (Math.random() - .5) * 2, d.y - d.r * 2, .5 + Math.random() * .8); bx.restore(); }
    }
    // 물줄기 자국
    d.trail = d.trail.filter(p => t - p[2] < 6000);
    if (d.trail.length > 1) {
      gctx.lineCap = 'round';
      for (let j = 1; j < d.trail.length; j++) {
        const a = 1 - (t - d.trail[j][2]) / 6000;
        gctx.strokeStyle = `rgba(200,220,240,${.07 * a})`; gctx.lineWidth = d.r * 1.1;
        gctx.beginPath(); gctx.moveTo(d.trail[j - 1][0], d.trail[j - 1][1]); gctx.lineTo(d.trail[j][0], d.trail[j][1]); gctx.stroke();
      }
    }
    dropShape(gctx, d.x, d.y, d.r, 1.25);
    if (d.y > 720) rivulets[i] = newRivulet();
  }
  // 새로 맺히는 물방울
  if (Math.random() < s * 25 * E.wet) { const b = { x: 115 + Math.random() * (W - 115), y: Math.random() * 700, r: .4 + Math.random() ** 2.4 * 2.2 }; bx.save(); bx.setTransform(k, 0, 0, k, 0, 0); dropShape(bx, b.x, b.y, b.r); bx.restore(); }
}

/* ---------------- 조명/색보정 적용 ---------------- */
let lastLook = '';
function applyLook() {
  const E = state.env, w = E.w;
  const key = [E.day.toFixed(2), E.golden.toFixed(2), E.wet.toFixed(2), w.kind, E.season].join();
  if (key === lastLook) return; lastLook = key;
  const day = E.day;
  $('.city.day').style.opacity = day.toFixed(3);
  const wet = E.wet, snow = w.kind === 'snow' ? 1 : 0, fog = w.kind === 'fog' ? 1 : 0;
  const seasonSat = { spring: 1.04, summer: 1.1, autumn: 1.02, winter: .88 }[E.season];
  const f = `brightness(${(1 - wet * .2 - E.grey * .08 + snow * .05 + fog * .06).toFixed(3)}) saturate(${(seasonSat * (1 - wet * .3 - E.grey * .2 - fog * .3)).toFixed(3)}) contrast(${(1 + day * .12 - fog * .25 - wet * .06).toFixed(3)})` + (wet ? ` blur(${(wet * .7).toFixed(2)}px)` : '');
  document.querySelectorAll('.city').forEach(el => { el.style.filter = f; });
  // 색감: 노을=주황, 블루아워=푸른빛, 흐림=회색, 겨울 낮=차가운 톤, 가을=따뜻한 톤
  const g = $('#grade');
  let col = [128, 128, 128], a = 0;
  if (E.golden > .05) { col = [255, 140, 70]; a = E.golden * .55; }
  else if (E.el > -10 && E.el < -1) { col = [70, 100, 200]; a = .35; }
  else if (day > .5 && E.season === 'winter') { col = [150, 180, 220]; a = .3; }
  else if (day > .5 && E.season === 'autumn') { col = [220, 170, 110]; a = .25; }
  if (E.grey > .3) { col = mix(col, [110, 115, 125], E.grey); a = Math.max(a, E.grey * .4); }
  g.style.backgroundColor = rgb(col, a);
  // 실내: 낮에는 창으로 들어오는 서늘한 빛, 밤에는 스탠드의 따뜻한 빛 그대로
  const rl = $('#roomlight');
  rl.style.background = `radial-gradient(120% 90% at 55% 10%, rgba(215,230,255,.9), rgba(215,230,255,.25) 60%, rgba(215,230,255,0))`;
  rl.style.opacity = (day * (.42 - E.grey * .18)).toFixed(3);
  $('.foreground').style.filter = `brightness(${(1 + day * .05 - wet * .04).toFixed(3)}) saturate(${(1 - day * .06).toFixed(3)})`;
  document.querySelectorAll('.glow').forEach(el => { el.style.opacity = (.25 + E.night * .75).toFixed(2); });
  // 곰돌이 zzZ (자정~6시)
  const hr = E.d.getHours();
  $('#zzz').hidden = !(hr < 6) || !$('#bubble').hidden;
}

/* ---------------- 메인 루프 ---------------- */
let prev = performance.now(), lastKind = '', lastSeason = '', envAt = 0, frameSkip = 0;
function loop(t) {
  const dt = Math.min(64, t - prev); prev = t;
  if (t - envAt > 2000 || !state.env.d) {
    envAt = t; computeEnv();
    const sig = state.env.w.kind + state.env.w.intensity + state.env.season;
    if (sig !== lastKind) { lastKind = sig; seedWeather(); seedClouds(state.env.cover); beads.dirty = true; }
    applyLook();
  }
  // 하늘은 15fps, 비/눈은 30fps 정도로 가볍게
  frameSkip = (frameSkip + 1) % 4;
  if (frameSkip === 0) { drawSky(t, dt * 4); drawClouds(dt * 4); }
  if (frameSkip % 2 === 0) { drawOutside(t, dt * 2); drawGlass(t, dt * 2); }
  if (!reduced) requestAnimationFrame(loop);
}

/* ---------------- 시계 ---------------- */
(function buildDial() {
  const ticks = $('#ticks'), nums = $('#numerals');
  let html = '';
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = big ? 40.5 : 42.5, r2 = 45;
    html += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * r2).toFixed(2)}" y2="${(-Math.cos(a) * r2).toFixed(2)}" stroke="#2a211b" stroke-width="${big ? 1.3 : .45}"/>`;
  }
  ticks.innerHTML = html;
  nums.innerHTML = Array.from({ length: 12 }, (_, i) => { const n = i + 1, a = n * 30 * Math.PI / 180; return `<text x="${(Math.sin(a) * 33.5).toFixed(2)}" y="${(-Math.cos(a) * 33.5).toFixed(2)}">${n}</text>`; }).join('');
})();
const DOW = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
function tickClock() {
  const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60;
  $('#h-hour').setAttribute('transform', `rotate(${h * 30})`);
  $('#h-min').setAttribute('transform', `rotate(${m * 6})`);
  // 누적 각도로 회전시켜 59→0초에서 거꾸로 돌지 않게
  const total = Math.floor(d / 1000);
  $('#h-sec').style.transform = `rotate(${total * 6}deg)`;
  $('#clock-date').textContent = `${d.getDate()} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}`;
  $('#mb-clock').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()][0]}) ${hhmm(d)}`;
  // 달력
  const cd = $('#cal-date'), dow = $('#cal-dow');
  cd.textContent = d.getDate(); dow.textContent = DOW[d.getDay()];
  $('#cal-month').textContent = `${d.getMonth() + 1}월`;
  $('#cal-year').textContent = `${d.toLocaleString('en', { month: 'long' }).toUpperCase()} ${d.getFullYear()}`;
  const cls = d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '';
  cd.className = 'cal-date ' + cls; dow.className = 'cal-dow ' + cls;
  $('#board-date').textContent = `${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}`;
}
function startClock() {
  tickClock();
  setTimeout(() => { tickClock(); setInterval(tickClock, 1000); }, 1000 - (Date.now() % 1000) + 5);
}

/* ---------------- 데이터 ---------------- */
// ?demo=1 — 개인 데이터 대신 샘플 데이터 (스크린샷·GIF 촬영용)
function demoData(name) {
  const t = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const q = (code, name, price, change, ratio, low, high) => ({ code, name, price: price.toLocaleString('ko-KR'), change, ratio, dir: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', low, high, last: price, volume: '1,204,331', status: 'OPEN' });
  return {
    config: { location: LOC },
    weather: { kind: 'partly', label: '구름 조금', intensity: 0, cloud: 35, wind: 9, temp: 18 },
    stocks: { updated: new Date().toISOString(), indices: [q('KOSPI', '코스피', 2650.12, 12.3, .47, 0, 0), q('KOSDAQ', '코스닥', 870.55, -3.1, -.36, 0, 0)],
      items: [q('000001', '하늘전자', 58200, 900, 1.57, 57100, 58900), q('000002', '구름자동차', 102500, -1500, -1.44, 101800, 104600), q('000003', '무지개화학', 33450, 0, 0, 33100, 33800)] },
    mail: { account: 'me@example.com', todayCount: 5, unread: 2, updated: new Date().toISOString(), items: [
      { from: '김하늘', subject: '[회의] 다음 주 디자인 리뷰 일정 공유드립니다', date: t(16, 42), seen: false },
      { from: 'GitHub', subject: 'Your repository has a new star ⭐', date: t(15, 8), seen: false, flagged: true },
      { from: '이구름', subject: 'RE: 견적서 확인 부탁드립니다', date: t(13, 55), seen: true },
      { from: '박무지개', subject: '점심 메뉴 투표 결과 🍜', date: t(11, 20), seen: true },
      { from: 'Newsletter', subject: '이번 주 테크 소식 모음', date: t(8, 3), seen: true }] },
    agenda: { calendarAccess: true, reminderAccess: true,
      events: [{ title: '주간 회의', start: t(10, 0), end: t(11, 0) }, { title: '디자인 리뷰', start: t(15, 30), end: t(16, 30) }, { title: '운동 🏃', start: t(19, 0), end: t(20, 0) }],
      reminders: [{ title: '택배 반품 신청', due: t(18, 0) }, { title: '책 반납하기' }] },
    photo: { url: 'demo-photo.jpg' },
    imessage: { message: { id: 1, from: '엄마', text: '저녁 먹었어? 오늘 일찍 들어와~ 🍲', date: new Date().toISOString() }, showMinutes: 60 }
  }[name];
}
async function api(name) {
  if (params.has('demo')) return structuredClone(demoData(name));
  const r = await fetch('/api/' + name, { cache: 'no-store' });
  if (!r.ok) throw new Error(name + ' ' + r.status);
  return r.json();
}
const every = (ms, fn) => { const go = () => fn().catch(e => console.warn(e)); go(); return setInterval(go, ms); };
const timeOf = iso => iso ? hhmm(new Date(iso)) : '';

// 날씨 (10분)
async function loadWeather() {
  const w = await api('weather');
  if (w.error) return;
  state.weather = { kind: w.kind, intensity: w.intensity, cloud: w.cloud, wind: w.wind, temp: w.temp };
  $('#mb-weather').textContent = `${ICON[w.kind] || ''} ${Math.round(w.temp)}° ${w.label}`;
  envAt = 0;
}

// 증권 (1분)
let lastPrices = {};
function fmtPct(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%'; }
function fmtChg(q) { const a = Math.abs(q.change).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); return (q.dir === 'up' ? '▲' : q.dir === 'down' ? '▼' : '–') + ' ' + a; }
async function loadStocks() {
  const s = await api('stocks');
  if (s.error) { $('#mk-note').textContent = '연결 실패 · 재시도 중'; return; }
  { const u = new Date(s.updated); $('#mk-updated').textContent = `${hhmm(u)}:${pad2(u.getSeconds())}`; }
  const open = s.items.some(q => q.status === 'OPEN');
  const st = $('#mk-state'); st.textContent = open ? '장중' : '장마감'; st.className = 'mk-badge' + (open ? ' open' : '');
  $('#mk-note').textContent = s.stale ? '지연된 데이터' : (s.items[0]?.tradedAt ? '체결 ' + timeOf(s.items[0].tradedAt) : '');
  $('#mk-index').innerHTML = s.indices.map(q => `<span>${esc(q.name)}<b>${esc(q.price)}</b><em class="${q.dir}">${fmtPct(q.ratio)}</em></span>`).join('');
  $('#mk-rows').innerHTML = s.items.map(q => {
    const span = q.high - q.low, pos = span > 0 ? (q.last - q.low) / span * 100 : 50;
    const prevP = lastPrices[q.code], tick = prevP == null || prevP === q.last ? '' : prevP < q.last ? ' tick-up' : ' tick-down';
    lastPrices[q.code] = q.last;
    return `<div class="mk-row${tick}">
      <div class="mk-name"><b>${esc(q.name)}</b><small>${esc(q.code)}${q.volume ? ' · 거래량 ' + esc(q.volume) : ''}</small></div>
      <div class="mk-price ${q.dir}">${esc(q.price)}</div>
      <div class="mk-chg ${q.dir}">${fmtChg(q)}<br><span class="r">${fmtPct(q.ratio)}</span></div>
      <div class="mk-range" title="저가-고가"><i style="left:calc(${pos.toFixed(1)}% - 1px)"></i></div></div>`;
  }).join('');
}

// 메일 (3분)
const AV = ['#5b8def', '#e8735a', '#43b581', '#a374db', '#f2a93b', '#3fb6c6', '#e0607e'];
async function loadMail() {
  const m = await api('mail');
  const list = $('#mail-list');
  $('#mail-account').textContent = m.account || '';
  if (m.needsSetup) {
    $('#mail-summary').textContent = '설정 필요';
    list.innerHTML = `<li class="empty">메일 비밀번호를 키체인에 저장하면<br>오늘 받은 메일이 여기에 표시됩니다.<br><code>npm run mail-setup</code></li>`;
    $('#mail-status').textContent = 'IMAP 연결 대기';
    return;
  }
  if (m.error) { $('#mail-status').textContent = '⚠︎ 메일 서버 연결 실패: ' + m.error.slice(0, 60); return; }
  $('#mail-summary').textContent = `오늘 ${m.todayCount}통 · 읽지 않음 ${m.unread}`;
  $('#mail-unread').textContent = m.unread || '';
  list.innerHTML = m.items.length ? m.items.map((it, i) => {
    const initial = (it.from || '?').trim()[0]?.toUpperCase() || '?';
    const col = AV[[...it.from].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length];
    return `<li class="${it.seen ? '' : 'unread'} ${it.flagged ? 'flag' : ''}" style="animation-delay:${i * 60}ms">
      <span class="av" style="background:${col}">${esc(initial)}</span><span class="who">${esc(it.from)}</span><time>${timeOf(it.date)}</time>
      <span class="subj">${esc(it.subject)}</span></li>`;
  }).join('') : `<li class="empty">오늘 받은 메일이 없습니다 ✨</li>`;
  $('#mail-status').textContent = `${m.stale ? '⚠︎ 지연 · ' : ''}마지막 확인 ${timeOf(m.updated)} · imap`;
}

// 캘린더 + 미리 알림 (5분)
async function loadAgenda() {
  const a = await api('agenda');
  const ul = $('#todo');
  if (a.error || (!a.calendarAccess && !a.reminderAccess)) {
    ul.innerHTML = `<li class="hint">캘린더·미리 알림 접근을 허용해 주세요 :)</li>`;
    $('#cal-next').textContent = '';
    return;
  }
  const nowD = new Date();
  const ev = (a.events || []).map(e => ({ kind: 'ev', title: e.title, time: e.allDay ? '종일' : timeOf(e.start), start: new Date(e.start), end: new Date(e.end), allDay: e.allDay }));
  const rem = (a.reminders || []).map(r => ({ kind: 'rem', title: r.title, time: r.due ? timeOf(r.due) : '', start: r.due ? new Date(r.due) : null, priority: r.priority }));
  const items = [...ev.map(e => ({ ...e, done: !e.allDay && e.end < nowD })), ...rem].sort((x, y) => (x.done - y.done) || ((x.start?.getTime() ?? 9e15) - (y.start?.getTime() ?? 9e15)));
  const max = 8;
  ul.innerHTML = items.length ? items.slice(0, max).map(it =>
    `<li class="${it.kind}${it.done ? ' done' : ''}"><span class="box"></span><span>${it.time ? `<span class="t">${esc(it.time)}</span>` : ''}${esc(it.title)}</span></li>`).join('')
    + (items.length > max ? `<li class="more">… 외 ${items.length - max}개</li>` : '')
    : `<li class="hint">오늘은 일정이 없어요 ☺︎<br>여유로운 하루!</li>`;
  const next = ev.find(e => !e.allDay && e.end > nowD) || ev.find(e => e.allDay);
  $('#cal-next').innerHTML = next ? `<b>${esc(next.time)}</b> ${esc(next.title)}` : '오늘 일정 없음';
}

// 사진 (서버가 한 시간 단위로 랜덤 선택)
let photoUrl = '', photoFlip = false;
async function loadPhoto() {
  const p = await api('photo');
  $('#photo-empty').hidden = !(p.empty || p.error);
  if (!p.url || p.url === photoUrl) return;
  photoUrl = p.url;
  const next = photoFlip ? $('#photo-a') : $('#photo-b'), cur = photoFlip ? $('#photo-b') : $('#photo-a');
  const img = next.querySelector('img');
  img.onload = () => { next.querySelector('.bg').style.backgroundImage = `url("${p.url}")`; next.classList.add('show'); cur.classList.remove('show'); };
  img.src = p.url; photoFlip = !photoFlip;
}

// iMessage (15초)
let shownMsg = null;
function showBubble(from, text, date) {
  $('#bubble-from').textContent = from;
  $('#bubble-text').textContent = text;
  const mins = Math.round((Date.now() - new Date(date)) / 60000);
  $('#bubble-time').textContent = mins < 1 ? '방금' : mins < 60 ? `${mins}분 전` : hhmm(new Date(date));
  const b = $('#bubble');
  if (b.hidden) { b.hidden = false; }
  $('#zzz').hidden = true;
}
async function loadMessage() {
  const r = await api('imessage');
  const m = r.message;
  if (!m) return;
  const age = (Date.now() - new Date(m.date)) / 60000;
  if (age <= (r.showMinutes || 20)) {
    if (shownMsg !== m.id) { $('#bubble').hidden = true; void $('#bubble').offsetWidth; }
    shownMsg = m.id;
    showBubble(m.chat ? `${m.from} · ${m.chat}` : m.from, m.text, m.date);
  } else if (shownMsg) { $('#bubble').hidden = true; shownMsg = null; }
}

/* ---------------- 미리보기 패널 ---------------- */
function setupDebug() {
  if (!params.has('debug')) return;
  const f = $('#debug'); f.hidden = false;
  f.kind.value = override.kind; f.month.value = override.month; f.hour.value = override.hour;
  const sync = () => {
    override.kind = f.kind.value; override.month = f.month.value; override.hour = +f.hour.value;
    f.hourOut.value = override.hour < 0 ? '실시간' : `${Math.floor(override.hour)}:${pad2(Math.round(override.hour % 1 * 60))}`;
    envAt = 0; lastLook = '';
  };
  f.addEventListener('input', sync); sync();
  $('#debug-bubble').onclick = () => { const b = $('#bubble'); if (!b.hidden) { b.hidden = true; return; } showBubble('엄마', '저녁 먹었어? 오늘 일찍 들어와~ 🍲', new Date().toISOString()); };
}

/* ---------------- 시작 ---------------- */
async function init() {
  try { const c = await api('config'); Object.assign(LOC, c.location || {}); } catch {}
  fit(); addEventListener('resize', fit);
  placeQuads();
  setupDebug();
  startClock();
  computeEnv(); seedClouds(state.env.cover); seedWeather(); applyLook();
  requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.add('ready')));
  requestAnimationFrame(t => { prev = t; loop(t); });
  if (reduced) setInterval(() => { computeEnv(); applyLook(); const t = performance.now(); drawSky(t, 0); drawClouds(0); drawOutside(t, 0); drawGlass(t, 0); }, 60000);
  every(10 * 60e3, loadWeather);
  every(60e3, loadStocks);
  every(3 * 60e3, loadMail);
  every(5 * 60e3, loadAgenda);
  every(5 * 60e3, loadPhoto);
  every(15e3, loadMessage);
  // 자정이 지나면 오늘 데이터 새로고침
  let today = new Date().getDate();
  setInterval(() => { if (new Date().getDate() !== today) { today = new Date().getDate(); loadAgenda(); loadMail(); } }, 60e3);
}
document.fonts?.ready.then(placeQuads);
init();
