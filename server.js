// Plash 라이브 바탕화면용 로컬 데이터 서버
// 실행: npm start  →  Plash에서 http://localhost:8777 열기
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
// 개인 설정(config.json)이 없으면 예시 설정으로 실행
const CONFIG_FILE = ['config.json', 'config.example.json'].map(f => path.join(ROOT, f)).find(f => fs.existsSync(f));
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const CACHE_DIR = path.join(ROOT, '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });
const home = p => p.replace(/^~(?=$|\/)/, os.homedir());
const log = (...a) => console.log(new Date().toLocaleTimeString('ko-KR'), ...a);

/* ---------- 작은 캐시 도우미: 같은 데이터를 ttl 동안 재사용, 실패 시 이전 값 유지 ---------- */
const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = loader()
    .then(value => { cache.set(key, { at: Date.now(), value }); return value; })
    .catch(err => {
      log(`[${key}]`, err.message);
      if (hit?.value) { cache.set(key, { ...hit, pending: null, at: Date.now() - ttlMs + 30_000 }); return { ...hit.value, stale: true }; }
      cache.delete(key);
      return { error: err.message };
    });
  cache.set(key, { ...(hit || {}), pending });
  return pending;
}

async function fetchJSON(url, ms = 10_000) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) PlashDesk/2.0' }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/* ---------- 네이버 증권 ---------- */
const num = s => Number(String(s ?? '').replace(/,/g, '')) || 0;
function mapQuote(d) {
  const code = d.compareToPreviousPrice?.code; // 1 상한 2 상승 3 보합 4 하한 5 하락
  const dir = code === '1' || code === '2' ? 'up' : code === '4' || code === '5' ? 'down' : 'flat';
  const sign = dir === 'down' ? -1 : 1;
  return {
    code: d.itemCode, name: d.stockName, price: d.closePrice,
    change: Math.abs(num(d.compareToPreviousClosePrice)) * sign, ratio: Math.abs(num(d.fluctuationsRatio)) * sign,
    dir, open: num(d.openPrice), high: num(d.highPrice), low: num(d.lowPrice), last: num(d.closePrice),
    volume: d.accumulatedTradingVolume, status: d.marketStatus, tradedAt: d.localTradedAt
  };
}
const stocks = () => cached('stocks', 60_000, async () => {
  const codes = CONFIG.stocks.map(s => s.code).join(',');
  // 1순위: polling.finance.naver.com (한 번에 조회) / 2순위: m.stock.naver.com (종목별 조회)
  const mobile = (kind, ids) => Promise.all(ids.map(id => fetchJSON(`https://m.stock.naver.com/api/${kind}/${id}/basic`, 8000)));
  const [items, idx] = await Promise.all([
    fetchJSON(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes}`, 6000).then(j => j.datas)
      .catch(() => mobile('stock', CONFIG.stocks.map(s => s.code))),
    CONFIG.indices?.length
      ? fetchJSON(`https://polling.finance.naver.com/api/realtime/domestic/index/${CONFIG.indices.join(',')}`, 6000).then(j => j.datas)
          .catch(() => mobile('index', CONFIG.indices)).catch(() => [])
      : []
  ]);
  return { items: items.map(mapQuote), indices: idx.map(mapQuote), updated: new Date().toISOString(), source: 'naver' };
});

/* ---------- 날씨 (Open-Meteo, 실패 시 wttr.in) ---------- */
function fromWMO(c) {
  if (c === 0) return ['clear', 0];
  if (c <= 2) return ['partly', 0];
  if (c === 3) return ['overcast', 0];
  if (c === 45 || c === 48) return ['fog', .7];
  if (c >= 51 && c <= 57) return ['drizzle', .3];
  if (c >= 61 && c <= 67) return ['rain', c === 61 ? .4 : c === 63 ? .65 : 1];
  if (c >= 71 && c <= 77) return ['snow', c === 71 ? .4 : c === 73 ? .7 : 1];
  if (c >= 80 && c <= 82) return ['rain', c === 80 ? .45 : c === 81 ? .75 : 1];
  if (c === 85 || c === 86) return ['snow', c === 85 ? .5 : 1];
  if (c >= 95) return ['storm', 1];
  return ['cloudy', 0];
}
function fromWWO(c) {
  const has = (...l) => l.includes(c);
  if (c === 113) return ['clear', 0];
  if (c === 116) return ['partly', 0];
  if (c === 119) return ['cloudy', 0];
  if (c === 122) return ['overcast', 0];
  if (has(143, 248, 260)) return ['fog', .7];
  if (has(176, 263, 266, 293, 296, 353)) return [c === 176 ? 'drizzle' : 'rain', c === 176 ? .25 : .4];
  if (has(299, 302, 356)) return ['rain', .7];
  if (has(305, 308, 359)) return ['rain', 1];
  if (has(200, 386, 389, 392, 395)) return ['storm', 1];
  if (has(182, 185, 281, 284, 311, 314, 317, 320, 350, 362, 365, 374, 377)) return ['sleet', .5];
  if (has(179, 227, 230, 323, 326, 329, 332, 335, 338, 368, 371)) return ['snow', has(329, 332, 335, 338, 371, 230) ? 1 : .5];
  return ['cloudy', 0];
}
const KIND_KO = { clear: '맑음', partly: '구름 조금', cloudy: '구름 많음', overcast: '흐림', fog: '안개', drizzle: '이슬비', rain: '비', snow: '눈', sleet: '진눈깨비', storm: '뇌우' };
function hm12(s, base) { // "07:10 AM" → ISO
  const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(s || ''); if (!m) return null;
  const d = new Date(base); let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  d.setHours(h, +m[2], 0, 0); return d.toISOString();
}
const weather = () => cached('weather', 10 * 60_000, async () => {
  const { lat, lon, name } = CONFIG.location;
  try {
    const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m,apparent_temperature,is_day,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto`, 6000);
    const c = j.current, [kind, intensity] = fromWMO(c.weather_code);
    return { source: 'open-meteo', place: name, kind, label: KIND_KO[kind], intensity, temp: c.temperature_2m, feels: c.apparent_temperature,
      cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, humidity: c.relative_humidity_2m, precip: c.precipitation,
      sunrise: new Date(j.daily.sunrise[0]).toISOString(), sunset: new Date(j.daily.sunset[0]).toISOString(),
      max: j.daily.temperature_2m_max[0], min: j.daily.temperature_2m_min[0], updated: new Date().toISOString() };
  } catch (e) {
    const j = await fetchJSON(`https://wttr.in/${lat},${lon}?format=j1`);
    const c = j.current_condition[0], today = j.weather[0], [kind, intensity] = fromWWO(+c.weatherCode);
    const base = new Date();
    return { source: 'wttr.in', place: name, kind, label: KIND_KO[kind], intensity, temp: +c.temp_C, feels: +c.FeelsLikeC,
      cloud: +c.cloudcover, wind: +c.windspeedKmph, windDir: +c.winddirDegree, humidity: +c.humidity, precip: +c.precipMM,
      sunrise: hm12(today.astronomy[0].sunrise, base), sunset: hm12(today.astronomy[0].sunset, base),
      max: +today.maxtempC, min: +today.mintempC, moon: +today.astronomy[0].moon_illumination, updated: new Date().toISOString() };
  }
});

/* ---------- 메일 (IMAP) ---------- */
async function mailPassword() {
  if (process.env.PLASH_MAIL_PASSWORD) return process.env.PLASH_MAIL_PASSWORD;
  const { stdout } = await run('security', ['find-generic-password', '-s', CONFIG.mail.keychainService, '-a', CONFIG.mail.user, '-w']);
  return stdout.trim();
}
const mail = () => cached('mail', 3 * 60_000, async () => {
  const { ImapFlow } = await import('imapflow');
  let pass;
  try { pass = await mailPassword(); } catch { return { needsSetup: true, account: CONFIG.mail.user, items: [] }; }
  const client = new ImapFlow({ host: CONFIG.mail.host, port: CONFIG.mail.port, secure: CONFIG.mail.secure, auth: { user: CONFIG.mail.user, pass, loginMethod: CONFIG.mail.loginMethod || 'LOGIN' }, logger: false, socketTimeout: 30_000 });
  client.on('error', e => log('[mail] 연결 오류', e.code || e.message)); // 처리 안 된 error 이벤트로 서버가 죽지 않게
  try { await client.connect(); }
  catch (e) {
    client.close();
    const detail = e.responseText || e.serverResponseCode || e.code || e.message;
    throw new Error(e.authenticationFailed ? `로그인 거절: ${detail}` : `연결 실패: ${detail}`);
  }
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const uids = (await client.search({ since }, { uid: true })) || [];
    const unseenToday = (await client.search({ since, seen: false }, { uid: true })) || [];
    const pick = uids.slice(-CONFIG.mail.maxItems);
    const items = [];
    if (pick.length) {
      for await (const m of client.fetch(pick, { envelope: true, flags: true, internalDate: true }, { uid: true })) {
        const from = m.envelope.from?.[0] || {};
        items.push({ uid: m.uid, from: from.name || from.address || '(알 수 없음)', address: from.address, subject: m.envelope.subject || '(제목 없음)',
          date: (m.internalDate || m.envelope.date)?.toISOString(), seen: m.flags?.has('\\Seen'), flagged: m.flags?.has('\\Flagged') });
      }
    }
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { account: CONFIG.mail.user, todayCount: uids.length, unread: unseenToday.length, items, updated: new Date().toISOString() };
  } finally { lock.release(); await client.logout().catch(() => {}); }
});

/* ---------- 캘린더 + 미리 알림 (EventKit 헬퍼) ---------- */
const HELPER = path.join(ROOT, 'helpers', 'eventkit');
async function ensureHelper() {
  if (fs.existsSync(HELPER)) return;
  log('EventKit 헬퍼 컴파일 중…');
  await run('swiftc', ['-O', 'eventkit.swift', '-o', 'eventkit', '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', 'Info.plist'], { cwd: path.dirname(HELPER) });
}
const agenda = () => cached('agenda', 5 * 60_000, async () => {
  await ensureHelper();
  const { stdout } = await run(HELPER, [], { timeout: 60_000 });
  return { ...JSON.parse(stdout), updated: new Date().toISOString() };
});

/* ---------- 사진 (지정 폴더에서 한 시간마다 랜덤) ---------- */
const IMG = /\.(jpe?g|png|heic|heif|webp|gif)$/i;
async function listPhotos(dir, depth = 0, out = []) {
  if (depth > 4 || out.length > 8000) return out;
  let entries; try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || /\.(photoslibrary|app|photolibrary)$/i.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await listPhotos(p, depth + 1, out);
    else if (IMG.test(e.name)) out.push(p);
  }
  return out;
}
const photoFiles = () => cached('photo-list', 30 * 60_000, async () => ({ files: await listPhotos(home(CONFIG.photoDir)) }));
async function photo() {
  const slot = Math.floor(Date.now() / (CONFIG.photoIntervalMinutes * 60_000));
  return cached(`photo-${slot}`, 24 * 3600_000, async () => {
    const { files = [] } = await photoFiles();
    if (!files.length) return { empty: true, dir: CONFIG.photoDir };
    const src = files[Math.floor(Math.random() * files.length)];
    const id = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
    const out = path.join(CACHE_DIR, `photo-${id}.jpg`);
    if (!fs.existsSync(out)) await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '1100', src, '--out', out], { timeout: 30_000 });
    return { url: `/photo/${id}.jpg`, name: path.basename(src), slot };
  });
}

/* ---------- iMessage (최근 수신 메시지) ---------- */
function decodeAttributed(buf) {
  if (!buf) return null;
  buf = Buffer.from(buf);
  const i = buf.indexOf('NSString'); if (i < 0) return null;
  let p = buf.indexOf(0x2b, i) + 1; if (p <= 0) return null;
  let len = buf[p++];
  if (len === 0x81) { len = buf.readUInt16LE(p); p += 2; } else if (len === 0x82) { len = buf.readUIntLE(p, 3); p += 3; }
  return buf.subarray(p, p + len).toString('utf8');
}
let contactMap = null, contactAt = 0;
async function contacts() {
  if (contactMap && Date.now() - contactAt < 3600_000) return contactMap;
  const { DatabaseSync } = await import('node:sqlite');
  contactMap = new Map(); contactAt = Date.now();
  const base = path.join(os.homedir(), 'Library/Application Support/AddressBook');
  const dbs = [path.join(base, 'AddressBook-v22.abcddb')];
  try { for (const s of await fsp.readdir(path.join(base, 'Sources'))) dbs.push(path.join(base, 'Sources', s, 'AddressBook-v22.abcddb')); } catch {}
  for (const f of dbs) {
    if (!fs.existsSync(f)) continue;
    try {
      const db = new DatabaseSync(f, { readOnly: true });
      const nm = r => [r.ZLASTNAME, r.ZFIRSTNAME].filter(Boolean).join('') || r.ZNICKNAME || r.ZORGANIZATION;
      for (const r of db.prepare('SELECT r.ZFIRSTNAME, r.ZLASTNAME, r.ZNICKNAME, r.ZORGANIZATION, p.ZFULLNUMBER v FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON r.Z_PK=p.ZOWNER').all()) {
        const d = String(r.v || '').replace(/\D/g, '').slice(-8); if (d && nm(r)) contactMap.set(d, nm(r));
      }
      for (const r of db.prepare('SELECT r.ZFIRSTNAME, r.ZLASTNAME, r.ZNICKNAME, r.ZORGANIZATION, e.ZADDRESS v FROM ZABCDEMAILADDRESS e JOIN ZABCDRECORD r ON r.Z_PK=e.ZOWNER').all()) {
        if (r.v && nm(r)) contactMap.set(String(r.v).toLowerCase(), nm(r));
      }
      db.close();
    } catch {}
  }
  return contactMap;
}
const imessage = () => cached('imessage', 15_000, async () => {
  const { DatabaseSync } = await import('node:sqlite');
  let db;
  try { db = new DatabaseSync(path.join(os.homedir(), 'Library/Messages/chat.db'), { readOnly: true }); }
  catch (e) { return { needsAccess: true, error: '전체 디스크 접근 권한이 필요합니다' }; }
  try {
    const r = db.prepare(`SELECT m.ROWID id, m.text, m.attributedBody body, (CASE WHEN m.date > 1000000000000 THEN m.date / 1000000000 ELSE m.date END) secs, m.cache_has_attachments att, h.id handle, c.display_name chat
      FROM message m LEFT JOIN handle h ON h.ROWID=m.handle_id
      LEFT JOIN chat_message_join j ON j.message_id=m.ROWID LEFT JOIN chat c ON c.ROWID=j.chat_id
      WHERE m.is_from_me=0 AND (m.associated_message_type IS NULL OR m.associated_message_type=0)
      ORDER BY m.date DESC LIMIT 1`).get();
    if (!r) return { message: null };
    const secs = Number(r.secs);
    const map = await contacts().catch(() => new Map());
    const handle = String(r.handle || '');
    const prettyNum = h => { const d = h.replace(/\D/g, '').replace(/^82/, '0'); return /^01\d{8,9}$/.test(d) ? d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') : h; };
    const name = map.get(handle.toLowerCase()) || map.get(handle.replace(/\D/g, '').slice(-8)) || prettyNum(handle);
    const text = (r.text || decodeAttributed(r.body) || (r.att ? '📎 첨부 파일' : '')).replace(/￼/g, '').trim();
    return { message: { id: r.id, from: name, chat: r.chat || null, text, date: new Date((secs + 978307200) * 1000).toISOString() }, showMinutes: CONFIG.imessage.showMinutes, contacts: map.size };
  } finally { db.close(); }
});

/* ---------- HTTP ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const STATIC = new Set(['index.html', 'style.css', 'app.js', 'city-day.png', 'city-night.png', 'sky-mask.png', 'foreground.png', 'foreground-clean.png']);
const API = { stocks, weather, mail, agenda, photo, imessage,
  config: async () => ({ location: CONFIG.location, stocks: CONFIG.stocks, photoIntervalMinutes: CONFIG.photoIntervalMinutes }) };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = 'application/json; charset=utf-8', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body); };
  try {
    if (url.pathname.startsWith('/api/')) {
      const fn = API[url.pathname.slice(5)];
      if (!fn) return send(404, '{"error":"not found"}');
      return send(200, JSON.stringify(await fn()));
    }
    const pm = /^\/photo\/([0-9a-f]{16})\.jpg$/.exec(url.pathname);
    if (pm) {
      const f = path.join(CACHE_DIR, `photo-${pm[1]}.jpg`);
      if (!fs.existsSync(f)) return send(404, 'no photo', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' });
      return fs.createReadStream(f).pipe(res);
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!STATIC.has(name)) return send(404, 'not found', 'text/plain');
    const body = await fsp.readFile(path.join(ROOT, name));
    send(200, body, TYPES[path.extname(name)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  } catch (e) {
    log('요청 실패', url.pathname, e.message);
    send(500, JSON.stringify({ error: e.message }));
  }
});
server.listen(CONFIG.port, '127.0.0.1', () => log(`Plash 바탕화면 서버: http://localhost:${CONFIG.port}`));
