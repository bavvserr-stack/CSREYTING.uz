// CS2 Rating Hub — DEMO v3
// Qoidalar: g'alaba +2 yulduz; 10 ta joylashtirish matchidan keyin o'yin ko'rsatkichiga qarab
// boshlang'ich reyting (0-50 yulduz); keyin g'alaba +2, mag'lubiyat -2. Daraja 1-10 (FACEIT kabi).
// Tashqi paketlarsiz: faqat Node.js (18+).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

// ---- Sozlanadigan qoidalar ----
const PLACEMENT = 10;       // joylashtirish matchlari soni
const MAX_STARS = 50;       // umumiy maksimum
const WIN_STARS = 2;        // g'alaba uchun
const LOSS_STARS = 2;       // mag'lubiyat uchun (joylashtirishdan keyin)
const STARS_PER_LEVEL = 10; // 1-10 = 1-daraja, 11-20 = 2-daraja ... 41-50 = 5-daraja
const LEVEL_NAMES = ['Bronza', 'Kumush', 'Oltin', 'Platina', 'Master']; // 5-daraja = FACEIT 10-level ekvivalenti
const MAX_LEVEL = LEVEL_NAMES.length;
const MAPS = ['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_ancient', 'de_anubis', 'de_overpass'];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Bitta match ko'rsatkichi 0..1 (ADR 40%, K/D 35%, g'alaba 25%)
function perfOf(m) {
  const kdN = clamp(m.kills / Math.max(m.deaths, 1) / 2.0, 0, 1);   // K/D 2.0 = maksimum
  const adrN = clamp(m.adr / 110, 0, 1);                           // ADR 110 = maksimum
  return 0.40 * adrN + 0.35 * kdN + 0.25 * (m.win ? 1 : 0);
}
const levelOf = stars => clamp(Math.ceil(stars / STARS_PER_LEVEL), 1, MAX_LEVEL);   // 0-10 -> 1, 11-20 -> 2 ...
const levelName = lvl => (lvl ? LEVEL_NAMES[lvl - 1] : '');

// Reytingni matchlar tarixidan qayta hisoblaymiz (har doim bir xil natija)
function ratingOf(p) {
  const ms = isBanned(p) ? p.matches.filter(m => !m.ban) : p.matches, n = ms.length;
  const wins = ms.filter(m => m.win).length;
  if (n < PLACEMENT) {
    return { placed: false, played: n, needed: PLACEMENT, stars: clamp(wins * WIN_STARS, 0, MAX_STARS),
      level: null, wins, losses: n - wins, perfAvg: 0, deltas: ms.map(() => null) };
  }
  const first = ms.slice(0, PLACEMENT);
  const avg = first.reduce((s, m) => s + perfOf(m), 0) / PLACEMENT;
  let stars = clamp(Math.round(MAX_STARS * avg), 0, MAX_STARS);
  const deltas = first.map(() => null);
  for (const m of ms.slice(PLACEMENT)) {
    const d = m.win ? WIN_STARS : -LOSS_STARS;
    const next = clamp(stars + d, 0, MAX_STARS);
    deltas.push(next - stars); stars = next;
  }
  const recent = ms.slice(-PLACEMENT);
  return { placed: true, played: n, needed: PLACEMENT, stars, level: levelOf(stars), wins, losses: n - wins,
    perfAvg: recent.reduce((s, m) => s + perfOf(m), 0) / recent.length, deltas };
}

// ---------- Baza ----------
let db = { players: {}, sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { /* yangi */ }
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));

function newMatch(x) {
  return { id: crypto.randomBytes(4).toString('hex'), date: Date.now(), map: x.map || MAPS[0],
    kills: x.kills, deaths: x.deaths, assists: x.assists, adr: x.adr, win: !!x.win,
    rounds: x.rounds || 24, hs: x.hs == null ? 45 : x.hs };
}
function randomMatch(skill) {          // skill 0..1
  const win = Math.random() < 0.3 + 0.4 * skill;
  const rounds = 20 + Math.floor(Math.random() * 10);
  const kills = Math.max(0, Math.round(rounds * (0.45 + 0.7 * skill) * (0.7 + Math.random() * 0.6)));
  const deaths = Math.max(1, Math.round(rounds * (1.0 - 0.3 * skill) * (0.75 + Math.random() * 0.5) * 0.85));
  return newMatch({ kills, deaths, assists: Math.floor(Math.random() * 8),
    adr: Math.round(clamp(45 + 70 * skill + (Math.random() - 0.5) * 40, 25, 140)), win,
    rounds, hs: Math.round(clamp(28 + 30 * skill + (Math.random() - 0.5) * 16, 10, 80)),
    map: MAPS[Math.floor(Math.random() * MAPS.length)] });
}
const NICK_A = ['Shadow', 'Alpha', 'Toshkent', 'Samarqand', 'Silent', 'Nova', 'Rush', 'Ghost', 'Viper', 'Zero', 'Turbo', 'Storm', 'Frost', 'Blaze', 'Karakal', 'Dragon', 'Buxoro', 'Neon', 'Lucky', 'Iron'];
const NICK_B = ['Wolf', 'AWP', 'Sniper', 'King', 'Pro', 'X', 'Hunter', 'Ace', 'Boss', 'UZ', 'Flash', 'Cobra', 'Kid', 'Fox'];
const botName = i => NICK_A[i % NICK_A.length] + NICK_B[(i * 7) % NICK_B.length] + (10 + (i * 37) % 90);
function renameBots() {   // eski "Demo O'yinchi 001" nomlarini xilma-xil nikneymlarga almashtiradi
  let ch = false;
  for (const p of Object.values(db.players)) {
    if (p.bot && /^Demo O'yinchi/.test(p.name)) { p.name = botName(parseInt(p.steamId.replace('bot_', ''), 10) || 1); ch = true; }
  }
  if (ch) save();
}
function seedBots() {
  if (Object.values(db.players).some(p => p.bot)) return;
  for (let i = 1; i <= 120; i++) {
    const skill = Math.random();
    db.players['bot_' + i] = { steamId: 'bot_' + i, name: botName(i), avatar: '', bot: true,
      matches: Array.from({ length: PLACEMENT + Math.floor(Math.random() * 30) }, () => randomMatch(skill)) };
  }
  save();
}
seedBots(); renameBots();

// ---------- Jadval ----------
const REAL_TARGET = 100;   // shuncha haqiqiy o'yinchi bo'lgach namuna (bot) o'yinchilar jadvaldan yo'qoladi
function leaderboard() {
  const all = Object.values(db.players).map(p => ({ p, r: ratingOf(p) })).filter(x => x.r.placed);
  const cmp = (a, b) => b.r.stars - a.r.stars || b.r.perfAvg - a.r.perfAvg || b.r.wins - a.r.wins;
  const real = all.filter(x => !x.p.bot).sort(cmp);
  real.forEach((x, i) => { x.realRank = i + 1; });
  const list = (real.length < REAL_TARGET ? all : real).slice().sort(cmp);
  return list.map((x, i) => {
    const rr = x.realRank || null;
    return { rank: i + 1, realRank: rr, tier: rr ? (rr <= 10 ? 'Top 10' : rr <= 100 ? 'Top 100' : rr <= 1000 ? 'Top 1000' : '') : '',
      steamId: x.p.steamId, name: x.p.name, bot: !!x.p.bot, premium: isPremium(x.p), banned: isBanned(x.p), creator: isCreator(x.p), country: x.p.country || '',
      level: x.r.level, levelName: levelName(x.r.level), stars: x.r.stars, wins: x.r.wins, losses: x.r.losses };
  });
}
// ---------- Qo'shimcha: Steam ID, FACEIT, statistika, daraja taqsimoti ----------
const FACEIT_API_KEY = process.env.FACEIT_API_KEY || '';   // ixtiyoriy: haqiqiy FACEIT ma'lumoti uchun
const isRealSteam = id => /^\d{17}$/.test(id);
function steam64Of(p) {            // demo/bot uchun soxta (lekin doimiy) ID
  if (isRealSteam(p.steamId)) return { id64: p.steamId, fake: false };
  const n = parseInt(crypto.createHash('sha1').update(p.steamId).digest('hex').slice(0, 8), 16);
  return { id64: String(76561198000000000n + BigInt(n)), fake: true };
}
function steam32Of(id64) {
  const z = BigInt(id64) - 76561197960265728n;
  return `STEAM_1:${z % 2n}:${z / 2n}`;
}
const FACEIT_LEVELS = [500, 750, 900, 1050, 1200, 1350, 1530, 1750, 2000];   // 10 daraja chegaralari
const faceitLevel = elo => FACEIT_LEVELS.filter(t => elo > t).length + 1;
function fakeFaceit(p) {           // demo: ism bo'yicha doimiy tasodifiy qiymat
  const h = parseInt(crypto.createHash('sha1').update('fc' + p.steamId).digest('hex').slice(0, 8), 16);
  const elo = 600 + (h % 1800);
  return { nickname: p.name, elo, level: faceitLevel(elo), demo: true };
}
const faceitCache = {};
async function loadFaceit(p) {     // fonda yuklanadi, natija keyingi so'rovda ko'rinadi
  const { id64, fake } = steam64Of(p);
  if (fake || !FACEIT_API_KEY) return;
  const c = faceitCache[id64];
  if (c && Date.now() - c.t < 3600e3) return;
  faceitCache[id64] = { t: Date.now(), data: null };
  try {
    const r = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${id64}`,
      { headers: { Authorization: `Bearer ${FACEIT_API_KEY}` } });
    if (r.ok) {
      const j = await r.json(); const g = (j.games || {}).cs2 || {};
      faceitCache[id64].data = { nickname: j.nickname, elo: g.faceit_elo || 0, level: g.skill_level || 0, demo: false };
    }
  } catch (e) { console.warn('FACEIT olinmadi:', e.message); }
}
function faceitOf(p) {
  const { id64, fake } = steam64Of(p);
  if (fake) return null;   // demo/bot uchun soxta FACEIT ko'rsatilmaydi
  const c = faceitCache[id64];
  return c && c.data ? c.data : null;
}
function statsOf(p) {
  const ms = p.matches, n = ms.length;
  const sum = k => ms.reduce((s, m) => s + (m[k] || 0), 0);
  const kills = sum('kills'), deaths = sum('deaths'), assists = sum('assists');
  const rounds = ms.reduce((s, m) => s + (m.rounds || 24), 0);
  const hsKills = ms.reduce((s, m) => s + (m.hs == null ? 45 : m.hs) * m.kills, 0);
  return { matches: n, winRate: n ? Math.round(ms.filter(m => m.win).length / n * 1000) / 10 : 0,
    rounds, kills, deaths, assists, kd: deaths ? Math.round(kills / deaths * 100) / 100 : kills,
    adr: n ? Math.round(sum('adr') / n) : 0, hs: kills ? Math.round(hsKills / kills * 10) / 10 : 0 };
}
function levelDistribution() {     // har darajada nechta o'yinchi bor
  const counts = Array(MAX_LEVEL).fill(0); let unplaced = 0;
  for (const p of Object.values(db.players)) { const r = ratingOf(p); if (r.placed) counts[r.level - 1]++; else unplaced++; }
  return { counts, unplaced, total: counts.reduce((a, b) => a + b, 0) };
}
// ---------- Davlat, Premium, GIF banner ----------
const COUNTRIES = [['uz', "O'zbekiston"], ['ru', 'Rossiya'], ['kz', "Qozog'iston"], ['kg', "Qirg'iziston"], ['tj', 'Tojikiston'],
  ['tm', 'Turkmaniston'], ['af', "Afg'oniston"], ['tr', 'Turkiya'], ['az', 'Ozarbayjon'], ['ua', 'Ukraina'], ['by', 'Belarus'],
  ['ge', 'Gruziya'], ['am', 'Armaniston'], ['de', 'Germaniya'], ['us', 'AQSH'], ['gb', 'Buyuk Britaniya'], ['kr', 'Janubiy Koreya'], ['ae', 'BAA']];
const PRESETS = ['fire', 'neon', 'matrix', 'ocean'];                     // animatsiyali banner (GIF kerak emas)
const GIF_CATS = { cars: { q: 'sports car', r: 'pg' }, horror: { q: 'horror', r: 'pg-13' }, girls: { q: 'girl', r: 'pg' },
  boys: { q: 'boy', r: 'pg' }, games: { q: 'counter strike', r: 'pg-13' }, memes: { q: 'meme', r: 'pg' } };
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';                 // ixtiyoriy: kategoriya bo'yicha GIF qidirish
const PREMIUM_DEMO = process.env.PREMIUM_DEMO === '1' || (process.env.PREMIUM_DEMO !== '0' && !PUBLIC_URL);   // PUBLIC_URL berilsa demo avtomatik o'chadi                 // demo: to'lovsiz yoqish (haqiqiy to'lov ulanmaguncha)
const PREMIUM_DAYS = 30, PREMIUM_PRICE_USD = 2.99, NAME_COOLDOWN_DAYS = 30;
const GIF_HOSTS = ['media.giphy.com', 'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com',
  'i.giphy.com', 'media.tenor.com', 'c.tenor.com', 'i.imgur.com'];    // faqat shu saytlardagi rasmlarga ruxsat
// Promokodlar: PROMO_CODES="KOD:kun:limit,KOD2:kun:limit" (demo rejimda sinov uchun DEMO7 bor)
const PROMOS = {};
(process.env.PROMO_CODES || (PREMIUM_DEMO ? 'DEMO7:7:1000' : '')).split(',').forEach(x => {
  const [c, d, m] = x.trim().split(':'); if (c && +d > 0) PROMOS[c.toUpperCase()] = { days: +d, max: +m || 1 };
});
// Yaratuvchi (admin): faqat shu Steam ID bilan kirgan akkaunt. Boshqa ID uchun CREATOR_ID muhit o'zgaruvchisi.
const CREATOR_ID = process.env.CREATOR_ID || '76561198678043895';
function isCreator(p) { return p.steamId === CREATOR_ID; }
function isBanned(p) { return (p.bannedUntil || 0) > Date.now(); }   // ban paytida o'ynalgan matchlar yulduzga ban tugaguncha qo'shilmaydi
const REPORT_BAN_AT = 5;   // shuncha turli o'yinchi jalaba qilsa, 24 soatga avtomatik ban
const UPLOAD_DIR = path.join(__dirname, 'uploads');
function dropUpload(b) { try { if (b && /^\/img\/[a-f0-9]{16}\.jpg$/.test(b.value || '')) fs.unlinkSync(path.join(UPLOAD_DIR, b.value.slice(5))); } catch (e) { /* yo'q */ } }
const isPremium = p => isCreator(p) || (p.premiumUntil || 0) > Date.now();   // yaratuvchi: umrbod Premium
function validGifUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && GIF_HOSTS.includes(x.hostname) && String(u).length <= 500; }
  catch (e) { return false; }
}

// ---------- Demo: highlight videolar va MM demolari ----------
const VIDEO_KINDS = ['ace', '4k', '3k', 'clutch', 'boshqa'];
function parseVideo(u) {   // faqat YouTube va Streamable
  try {
    const x = new URL(String(u)); if (x.protocol !== 'https:') return null;
    const h = x.hostname.replace(/^www\./, ''); let id = null;
    if (h === 'youtube.com' || h === 'm.youtube.com') {
      if (x.pathname === '/watch') id = x.searchParams.get('v');
      else { const m = /^\/(shorts|embed)\/([\w-]{11})/.exec(x.pathname); if (m) id = m[2]; }
      return id && /^[\w-]{11}$/.test(id) ? { provider: 'youtube', vid: id } : null;
    }
    if (h === 'youtu.be') { id = x.pathname.slice(1); return /^[\w-]{11}$/.test(id) ? { provider: 'youtube', vid: id } : null; }
    if (h === 'streamable.com') { const m = /^\/(?:e\/)?([a-z0-9]{4,10})$/i.exec(x.pathname); return m ? { provider: 'streamable', vid: m[1] } : null; }
  } catch (e) { /* noto'g'ri havola */ }
  return null;
}
const cleanVideo = v => ({ id: v.id, provider: v.provider, vid: v.vid, title: v.title, kind: v.kind, map: v.map, date: v.date });
const visibleVideos = p => (p.videos || []).filter(v => (v.reports || []).length < 3).map(cleanVideo);   // 3 ta shikoyatdan keyin yashiriladi
const IMG_HOSTS = GIF_HOSTS.concat(['i.postimg.cc', 'i.ibb.co']);
function validImageUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && IMG_HOSTS.includes(x.hostname) && /\.(png|jpe?g|webp|gif)$/i.test(x.pathname) && String(u).length <= 500; }
  catch (e) { return false; }
}

function extras(p, r) {
  loadFaceit(p);
  const s = steam64Of(p), d = levelDistribution();
  return { steamId64: s.fake ? '—' : s.id64, steamId32: s.fake ? '—' : steam32Of(s.id64), steamFake: s.fake, faceit: faceitOf(p), stats: statsOf(p),
    lastMatchAt: p.matches.length ? p.matches[p.matches.length - 1].date : null,
    country: p.country || '', premium: isPremium(p), premiumUntil: isCreator(p) ? 253402300799000 : (p.premiumUntil || 0), banner: isPremium(p) ? (p.banner || null) : null, hidden: !!p.hidden, bot: !!p.bot, bio: p.bio || '', banned: isBanned(p), bannedUntil: p.bannedUntil || 0, creator: isCreator(p), admin: isCreator(p), videos: visibleVideos(p), demos: (p.demos || []).map(({ fileId, ...d }) => d),
    showPremiumPrompt: ratingOf(p).placed && !isPremium(p) && !p.promptSeen && !p.bot,
    nameChangeAt: isPremium(p) ? 0 : (p.nameChangedAt ? p.nameChangedAt + NAME_COOLDOWN_DAYS * 864e5 : 0),
    levelCounts: d.counts, above: r.placed ? d.counts.slice(r.level).reduce((a, b) => a + b, 0) : null,
    sameLevel: r.placed ? d.counts[r.level - 1] : null };
}

function profile(p) {
  const r = ratingOf(p);
  const row = leaderboard().find(x => x.steamId === p.steamId);
  const start = Math.max(0, p.matches.length - 10);
  const matches = p.matches.slice(start).map((m, i) => ({
    ...m, perf: Math.round(perfOf(m) * 100), delta: r.deltas[start + i], placement: start + i < PLACEMENT })).reverse();
  return { steamId: p.steamId, name: p.name, avatar: p.avatar, placed: r.placed, played: r.played, needed: r.needed,
    stars: r.stars, maxStars: MAX_STARS, level: r.level, levelName: levelName(r.level), maxLevel: MAX_LEVEL, starsPerLevel: STARS_PER_LEVEL,
    wins: r.wins, losses: r.losses, rank: row ? row.rank : null, realRank: row ? row.realRank : null, tier: row ? row.tier : '', matches, ...extras(p, r) };
}

// Boshqa o'yinchilar ko'radigan profil: ichki maydonlarsiz
function publicProfile(p) {
  const x = profile(p);
  delete x.premiumUntil; delete x.nameChangeAt; delete x.showPremiumPrompt; delete x.levelCounts; delete x.admin;
  if (p.hidden && !p.bot) Object.assign(x, { matches: [], videos: [], demos: [], bio: '', stats: null, faceit: null, lastMatchAt: null, steamId32: '—', steamId64: '—' });
  if (x.demos) x.demos = x.demos.map(({ name, ...d }) => d);   // fayl nomi faqat egasiga
  return x;
}

// ---------- HTTP yordamchilar ----------
const baseUrl = req => PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(([k, ...v]) => [k, v.join('=')]));
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const redirect = (res, url, headers = {}) => { res.writeHead(302, { Location: url, ...headers }); res.end(); };
const readBody = (req, max = 1e5) => new Promise(resolve => {
  let d = ''; req.on('data', c => { d += c; if (d.length > max) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
});
const sessionId = req => parseCookies(req).sid;
const currentPlayer = req => { const s = db.sessions[sessionId(req)]; return s ? db.players[s] : null; };
function startSession(res, steamId) {
  const sid = crypto.randomBytes(24).toString('hex');
  db.sessions[sid] = steamId; save();
  redirect(res, '/', { 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}` });
}

// ---------- Steam login (OpenID 2.0) ----------
function steamStart(req, res) {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${baseUrl(req)}/auth/steam/return`,
    'openid.realm': baseUrl(req),
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  });
  redirect(res, `${STEAM_OPENID}?${params}`);
}
// Steam nikneymi va avatarini olish. API kalit bo'lsa — Web API, bo'lmasa ochiq profil XML.
function parseSteamXml(x) {
  const nm = /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(x);
  const av = /<avatarFull><!\[CDATA\[([\s\S]*?)\]\]><\/avatarFull>/.exec(x);
  return { name: nm && nm[1].trim() ? nm[1].trim().slice(0, 32) : '', avatar: av ? av[1].trim() : '' };
}
async function refreshSteamProfile(p) {
  try {
    let name = '', avatar = '';
    if (STEAM_API_KEY) {
      const sr = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${p.steamId}`);
      const u = (await sr.json()).response.players[0];
      if (u) { name = u.personaname; avatar = u.avatarfull; }
    }
    if (!name) {
      const r = await fetch(`https://steamcommunity.com/profiles/${p.steamId}/?xml=1`);
      ({ name, avatar } = parseSteamXml(await r.text()));
    }
    if (name && !p.customName) p.name = name;
    if (avatar) p.avatar = avatar;
  } catch (e) { console.warn('Steam profil olinmadi:', e.message); }
}

async function steamReturn(req, res, url) {
  try {
    const q = Object.fromEntries(url.searchParams);
    if (!String(q['openid.return_to'] || '').startsWith(baseUrl(req))) { res.writeHead(400); return res.end("Noto'g'ri return_to"); }
    q['openid.mode'] = 'check_authentication';
    const r = await fetch(STEAM_OPENID, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(q).toString() });
    if (!/is_valid\s*:\s*true/.test(await r.text())) { res.writeHead(401); return res.end('Steam tasdiqlamadi'); }
    const m = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(q['openid.claimed_id'] || '');
    if (!m) { res.writeHead(401); return res.end('SteamID topilmadi'); }
    const steamId = m[1];
    const p = db.players[steamId] || (db.players[steamId] = { steamId, name: 'Player ' + steamId.slice(-4), avatar: '', matches: [] });
    await refreshSteamProfile(p);
    save();
    startSession(res, steamId);
  } catch (e) { console.error(e); res.writeHead(500); res.end('Kirishda xato'); }
}
function demoLogin(res, url) {   // Steam'siz sinash uchun
  const name = (url.searchParams.get('name') || 'Demo').trim().slice(0, 24) || 'Demo';
  const id = 'demo_' + crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 10);
  if (!db.players[id]) db.players[id] = { steamId: id, name, avatar: '', matches: [] };
  startSession(res, id);
}

// ---------- Statik ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const escH = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Google uchun: bosh sahifa va har bir profil o'z sarlavha/tavsifi bilan beriladi
function renderIndex(req, res, pid) {
  fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8', (err, html) => {
    if (err) { res.writeHead(404); return res.end('Topilmadi'); }
    const base = baseUrl(req);
    let title = "csreyting.uz — CS2 reyting va statistika (O'zbekiston)", url = base + '/', img = '', robots = 'index,follow',
      desc = "CS2 o'yinchilari uchun reyting, statistika va MM demolar. O'zbekiston va Markaziy Osiyo o'yinchilari reytingi.";
    if (pid) {
      const t = db.players[pid];
      if (t && !t.bot && !t.hidden) {
        const row = leaderboard().find(x => x.steamId === t.steamId);
        title = `${t.name} — CS2 reyting | csreyting.uz`;
        desc = row ? `${t.name}: ${row.levelName} daraja, ${row.stars}/50 yulduz${row.realRank ? ', reyting #' + row.realRank : ''}. csreyting.uz` : `${t.name} — CS2 o'yinchi profili. csreyting.uz`;
        url = `${base}/u/${encodeURIComponent(t.steamId)}`; img = /^https:\/\//.test(t.avatar || '') ? t.avatar : '';
      } else robots = 'noindex,nofollow';   // bot, yashirin yoki topilmagan profil indekslanmaydi
    }
    const gv = process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${escH(process.env.GOOGLE_SITE_VERIFICATION)}">\n` : '';
    const seo = `${gv}<meta name="description" content="${escH(desc)}">\n<meta name="robots" content="${robots}">\n<link rel="canonical" href="${escH(url)}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="csreyting.uz">\n<meta property="og:title" content="${escH(title)}">\n<meta property="og:description" content="${escH(desc)}">\n<meta property="og:url" content="${escH(url)}">\n${img ? `<meta property="og:image" content="${escH(img)}">\n` : ''}<meta name="twitter:card" content="summary">\n`;
    html = html.replace('<title>csreyting.uz</title>', `<title>${escH(title)}</title>\n${seo}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
}
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Topilmadi'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- Server ----------
const num = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, a, b) : null; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const me = currentPlayer(req);

  if (p === '/auth/steam') return steamStart(req, res);
  if (p === '/auth/steam/return') return steamReturn(req, res, url);
  if (p === '/auth/demo') return demoLogin(res, url);
  if (p === '/auth/logout') { delete db.sessions[sessionId(req)]; save(); return redirect(res, '/', { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }); }

  if (p === '/api/me') return json(res, 200, me ? profile(me) : null);
  if (p === '/api/config') return json(res, 200, { maps: MAPS, countries: COUNTRIES, presets: PRESETS, gifCats: Object.keys(GIF_CATS),
    priceUsd: PREMIUM_PRICE_USD, premiumDays: PREMIUM_DAYS, nameCooldownDays: NAME_COOLDOWN_DAYS, giphy: !!GIPHY_API_KEY, premiumDemo: PREMIUM_DEMO });
  if (p === '/api/gifs') {         // kategoriya bo'yicha GIF qidirish (faqat Premium)
    if (!me || !isPremium(me)) return json(res, 403, { error: 'Premium kerak' });
    const cat = GIF_CATS[url.searchParams.get('cat')];
    if (!cat) return json(res, 400, { error: 'Kategoriya topilmadi' });
    if (!GIPHY_API_KEY) return json(res, 200, { gifs: [], needKey: true });
    try {
      const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(cat.q)}&limit=12&rating=${cat.r}&lang=en`);
      const j = await r.json();
      const gifs = (j.data || []).map(d => d.images && d.images.fixed_height && d.images.fixed_height.url).filter(validGifUrl);
      return json(res, 200, { gifs });
    } catch (e) { return json(res, 502, { error: "GIF xizmatiga ulanib bo'lmadi" }); }
  }
  if (p === '/api/player') {
    const t = db.players[url.searchParams.get('id') || ''];
    return t ? json(res, 200, publicProfile(t)) : json(res, 404, { error: 'Topilmadi' });
  }
  if (p === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return json(res, 200, { players: [] });
    const out = Object.values(db.players).filter(t => !(t.hidden && !t.bot) && String(t.name).toLowerCase().includes(q)).slice(0, 10).map(t => {
      const r = ratingOf(t); return { steamId: t.steamId, name: t.name, avatar: t.avatar, bot: !!t.bot, premium: isPremium(t), country: t.country || '', level: r.level, levelName: levelName(r.level), stars: r.stars }; });
    return json(res, 200, { players: out });
  }
  const im = /^\/img\/([a-f0-9]{16})\.jpg$/.exec(p);
  if (im) return fs.readFile(path.join(UPLOAD_DIR, im[1] + '.jpg'), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' }); res.end(d);
  });
  if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`); }
  if (p === '/sitemap.xml') {
    const base = baseUrl(req), urls = [base + '/'];
    for (const x of leaderboard().filter(x => !x.bot).slice(0, 5000)) { const t = db.players[x.steamId]; if (t && !t.hidden) urls.push(`${base}/u/${encodeURIComponent(x.steamId)}`); }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${escH(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  }
  if (p === '/') return renderIndex(req, res, null);
  if (p.startsWith('/u/')) { let pid = ''; try { pid = decodeURIComponent(p.slice(3)); } catch (e) { /* noto'g'ri */ } return renderIndex(req, res, pid); }
  if (p === '/api/levels') return json(res, 200, { names: LEVEL_NAMES, ...levelDistribution() });
  if (p === '/api/leaderboard') {
    const limit = clamp(parseInt(url.searchParams.get('limit')) || 100, 1, 1000);
    const lb = leaderboard();
    return json(res, 200, { total: lb.length, real: lb.filter(x => !x.bot).length, rows: lb.slice(0, limit) });
  }

  if (p.startsWith('/api/ingest/')) {   // desktop ilova (kalit bilan, cookie emas)
    const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const who = tok && Object.values(db.players).find(x => x.apiToken === tok);
    if (!who) return json(res, 401, { error: "Kalit noto'g'ri" });
    if (p === '/api/ingest/whoami') return json(res, 200, { steamId: who.steamId, name: who.name });
    if (p === '/api/ingest/demo' && req.method === 'POST') {
      const b = await readBody(req), fid = String(b.fileId || '').slice(0, 80);
      if (!fid) return json(res, 400, { error: 'fileId kerak' });
      who.demos = who.demos || [];
      if (who.demos.some(d => d.fileId === fid)) return json(res, 200, { ok: true, duplicate: true });
      const n = (v, hi) => clamp(parseInt(v) || 0, 0, hi);
      who.demos.unshift({ id: crypto.randomBytes(4).toString('hex'), fileId: fid, name: String(b.name || '').replace(/[^\w.\- ]/g, '').slice(0, 80),
        map: String(b.map || '').replace(/[^\w]/g, '').slice(0, 20), kills: n(b.kills, 200), deaths: n(b.deaths, 200), assists: n(b.assists, 200), rounds: n(b.rounds, 100),
        parsed: !!b.parsed, date: clamp(parseInt(b.mtime) || Date.now(), 0, Date.now()),
        highlights: (Array.isArray(b.highlights) ? b.highlights : []).slice(0, 30).map(h => ({ kind: ['ace', '4k', '3k'].includes(h.kind) ? h.kind : '3k', round: n(h.round, 100), kills: n(h.kills, 5) })) });
      who.demos = who.demos.slice(0, 50); save();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Topilmadi' });
  }
  if (req.method === 'POST' && p.startsWith('/api/')) {
    if (!me) return json(res, 401, { error: 'Kirish kerak' });
    const b = await readBody(req, p === '/api/me/banner/upload' ? 4e5 : 1e5);

    if (p === '/api/match/add') {   // qo'lda match kiritish (demo)
      const kills = num(b.kills, 0, 80), deaths = num(b.deaths, 0, 80), assists = num(b.assists, 0, 80), adr = num(b.adr, 0, 250);
      if ([kills, deaths, assists, adr].includes(null)) return json(res, 400, { error: "Raqamlarni to'g'ri kiriting" });
      me.matches.push(newMatch({ kills, deaths, assists, adr, win: !!b.win, map: MAPS.includes(b.map) ? b.map : MAPS[0],
        rounds: num(b.rounds, 1, 60) ?? 24, hs: num(b.hs, 0, 100) ?? 45 }));
      if (isBanned(me)) me.matches[me.matches.length - 1].ban = true;
      me.matches = me.matches.slice(0, PLACEMENT).concat(me.matches.slice(PLACEMENT).slice(-500)); save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/demo/seed') {   // tasodifiy matchlar: { skill, count, append }
      const skill = num(b.skill, 0, 1) ?? Math.random();
      const count = Math.round(num(b.count, 1, 50) ?? PLACEMENT);
      const fresh = Array.from({ length: count }, () => randomMatch(skill));
      if (isBanned(me)) fresh.forEach(m => { m.ban = true; });
      me.matches = b.append ? me.matches.concat(fresh) : fresh; save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/me/country') {
      if (!COUNTRIES.some(c => c[0] === b.country)) return json(res, 400, { error: "Noto'g'ri davlat" });
      me.country = b.country; save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/premium/activate') {    // DEMO: to'lovsiz yoqiladi. Haqiqiy to'lov (Click/Payme/karta) keyin ulanadi.
      if (!PREMIUM_DEMO) return json(res, 501, { error: "To'lov tizimi hali ulanmagan" });
      me.premiumUntil = Math.max(Date.now(), me.premiumUntil || 0) + PREMIUM_DAYS * 864e5; save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/me/banner') {
      if (b.type === 'none') { me.banner = null; save(); return json(res, 200, profile(me)); }
      if (!isPremium(me)) return json(res, 403, { error: 'Bu imkoniyat Premium uchun' });
      if (b.type === 'preset' && PRESETS.includes(b.value)) me.banner = { type: 'preset', value: b.value };
      else if (b.type === 'gif' && validGifUrl(b.value)) me.banner = { type: 'gif', value: String(b.value) };
      else if (b.type === 'image' && validImageUrl(b.value)) me.banner = { type: 'image', value: String(b.value) };
      else return json(res, 400, { error: "GIF havolasi noto'g'ri. Faqat giphy, tenor yoki imgur havolalari qabul qilinadi" });
      save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/me/bio') { me.bio = String(b.bio || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 160); save(); return json(res, 200, profile(me)); }
    if (p === '/api/me/banner/upload') {
      if (!isPremium(me)) return json(res, 403, { error: 'Rasm banner Premium uchun' });
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.data || ''));
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || buf.length > 300000 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return json(res, 400, { error: "Rasm noto'g'ri yoki katta (300 KB gacha, JPEG)" });
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const id = crypto.randomBytes(8).toString('hex');
      fs.writeFileSync(path.join(UPLOAD_DIR, id + '.jpg'), buf);
      dropUpload(me.banner); me.banner = { type: 'image', value: '/img/' + id + '.jpg' }; save();
      return json(res, 200, profile(me));
    }
    if (p === '/api/report/player') {
      const t = db.players[b.id];
      if (!t || t.bot || t.steamId === me.steamId || isCreator(t)) return json(res, 400, { error: "Jalaba qilib bo'lmaydi" });
      t.reports = t.reports || [];
      if (t.reports.includes(me.steamId)) return json(res, 400, { error: 'Siz allaqachon jalaba qilgansiz' });
      t.reports.push(me.steamId);
      if (t.reports.length >= REPORT_BAN_AT && !isBanned(t)) { t.bannedUntil = Date.now() + 864e5; t.reports = []; }
      save(); return json(res, 200, { ok: true });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isCreator(me)) return json(res, 403, { error: "Ruxsat yo'q" });
      const t = db.players[b.id]; if (!t) return json(res, 404, { error: 'Topilmadi' });
      const days = clamp(parseInt(b.days) || 0, 1, 365);
      if (p === '/api/admin/premium') { t.premiumUntil = Math.max(Date.now(), t.premiumUntil || 0) + days * 864e5; save(); return json(res, 200, { ok: true }); }
      if (p === '/api/admin/ban') { if (isCreator(t)) return json(res, 400, { error: "Yaratuvchini ban qilib bo'lmaydi" }); t.bannedUntil = Date.now() + days * 864e5; t.reports = []; save(); return json(res, 200, { ok: true }); }
      if (p === '/api/admin/unban') { t.bannedUntil = 0; save(); return json(res, 200, { ok: true }); }
    }
    if (p === '/api/me/token') { me.apiToken = me.apiToken || crypto.randomBytes(16).toString('hex'); save(); return json(res, 200, { token: me.apiToken }); }
    if (p === '/api/promo') {
      me.promoTry = (me.promoTry || []).filter(t => Date.now() - t < 3600e3);
      if (me.promoTry.length >= 10) return json(res, 429, { error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring" });
      const code = String(b.code || '').trim().toUpperCase(), pr = PROMOS[code];
      if (!pr) { me.promoTry.push(Date.now()); save(); return json(res, 400, { error: "Promokod noto'g'ri" }); }
      me.promosUsed = me.promosUsed || []; db.promoUses = db.promoUses || {};
      if (me.promosUsed.includes(code)) return json(res, 400, { error: 'Bu promokodni allaqachon ishlatgansiz' });
      if ((db.promoUses[code] || 0) >= pr.max) return json(res, 400, { error: 'Promokod limiti tugagan' });
      me.promosUsed.push(code); db.promoUses[code] = (db.promoUses[code] || 0) + 1;
      me.premiumUntil = Math.max(Date.now(), me.premiumUntil || 0) + pr.days * 864e5; save();
      return json(res, 200, { ...profile(me), promoDays: pr.days });
    }
    if (p === '/api/me/prompt-seen') { me.promptSeen = true; save(); return json(res, 200, { ok: true }); }
    if (p === '/api/me/hidden') { me.hidden = !!b.hidden; save(); return json(res, 200, profile(me)); }
    if (p === '/api/demo/reset') { me.matches = []; save(); return json(res, 200, profile(me)); }
    if (p === '/api/me/name') {     // nikneymni qo'lda o'zgartirish
      const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
      if (name.length < 2) return json(res, 400, { error: 'Nik kamida 2 ta belgi bo\'lsin' });
      const wait = (me.nameChangedAt || 0) + NAME_COOLDOWN_DAYS * 864e5 - Date.now();
      if (!isPremium(me) && wait > 0) return json(res, 400, { error: `Nikni oyda bir marta o'zgartirish mumkin. Keyingi imkoniyat: ${new Date(Date.now() + wait).toLocaleDateString('ru-RU')}. Premium bilan cheklov yo'q.` });
      me.name = name; me.customName = true; me.nameChangedAt = Date.now(); save();
      return json(res, 200, profile(me));
    }
  }

  if (req.method === 'GET') return serveStatic(res, p);
  res.writeHead(404); res.end();
});

if (require.main === module) server.listen(PORT, () => console.log(`CS2 Rating Hub (demo): http://localhost:${PORT}`));
module.exports = { server, perfOf, ratingOf, levelOf };
