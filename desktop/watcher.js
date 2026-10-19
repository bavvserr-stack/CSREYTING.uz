// CS2 demo kuzatuvchi: replays papkasidagi yangi .dem fayllarni topib, tahlil qiladi va saytga yuboradi.
// Faylning o'zi yuborilmaydi, faqat natija (xarita, K/D/A, highlight'lar).
// Ishga tushirish: node watcher.js  (yoki Electron ilova ochilganda avtomatik)
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https');
let dp = null; try { dp = require('@laihoe/demoparser2'); } catch (e) { /* ixtiyoriy: o'rnatilmasa tahlilsiz yuboriladi */ }
const SEEN = path.join(__dirname, 'seen.json');

function cfg() {
  let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch (e) { /* config yo'q */ }
  return {
    server: process.env.RATING_URL || c.server || 'http://localhost:3000',
    token: process.env.CS2_TOKEN || c.token || '',
    folder: process.env.CS2_REPLAYS || c.folder || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\replays'
  };
}
function call(c, method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, c.server), data = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ Authorization: 'Bearer ' + c.token }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {});
    const rq = (u.protocol === 'https:' ? https : http).request(u, { method, headers }, res => {
      let s = ''; res.on('data', d => { s += d; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(s || '{}'); } catch (e) { /* bo'sh */ } resolve({ status: res.statusCode, body: j }); });
    });
    rq.on('error', reject); if (data) rq.write(data); rq.end();
  });
}
function analyze(file, sid) {
  const out = { map: '', kills: 0, deaths: 0, assists: 0, rounds: 0, highlights: [], parsed: false };
  if (!dp) return out;
  try {
    out.map = (dp.parseHeader(file) || {}).map_name || '';
    const ev = dp.parseEvent(file, 'player_death', [], ['total_rounds_played']) || [], per = {}; let maxR = 0;
    for (const e of ev) {
      const r = e.total_rounds_played || 0; if (r > maxR) maxR = r;
      if (String(e.attacker_steamid) === sid && String(e.user_steamid) !== sid) { out.kills++; per[r] = (per[r] || 0) + 1; }
      if (String(e.user_steamid) === sid) out.deaths++;
      if (String(e.assister_steamid) === sid) out.assists++;
    }
    out.rounds = maxR + 1;
    for (const [r, k] of Object.entries(per)) if (k >= 3) out.highlights.push({ kind: k >= 5 ? 'ace' : k + 'k', round: +r + 1, kills: k });
    out.parsed = true;
  } catch (e) { console.log('[demo] Tahlil xatosi:', e.message); }
  return out;
}
function start() {
  const c = cfg();
  if (!c.token) { console.log('[demo] Kalit yo\'q. Saytdagi ⋯ menyusidan "Ilova kaliti" ni oling va desktop/config.json ga {"token":"..."} deb yozing.'); return; }
  let seen = {}; try { seen = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch (e) { /* birinchi ishga tushish */ }
  const sizes = {}; let sid = null, busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      if (!sid) { const r = await call(c, 'GET', '/api/ingest/whoami'); if (r.status !== 200) { console.log('[demo] Kalit qabul qilinmadi'); return; } sid = r.body.steamId; }
      const files = fs.existsSync(c.folder) ? fs.readdirSync(c.folder).filter(f => /\.dem$/i.test(f)).map(f => { const st = fs.statSync(path.join(c.folder, f)); return { f, size: st.size, mtime: st.mtimeMs }; }).sort((a, b) => b.mtime - a.mtime).slice(0, 10) : [];
      for (const x of files) {
        const id = x.f + ':' + x.size; if (seen[id]) continue;
        if (sizes[x.f] !== x.size) { sizes[x.f] = x.size; continue; }   // fayl hali yozilyapti, keyingi tekshiruvda
        const a = analyze(path.join(c.folder, x.f), sid);
        const r = await call(c, 'POST', '/api/ingest/demo', Object.assign({ fileId: id, name: x.f, mtime: Math.round(x.mtime) }, a));
        if (r.status === 200) { seen[id] = 1; fs.writeFileSync(SEEN, JSON.stringify(seen)); console.log('[demo] Yuklandi:', x.f, a.parsed ? `${a.kills}/${a.deaths}/${a.assists}` : '(tahlilsiz)'); }
        else console.log('[demo] Server xatosi', r.status);
      }
    } catch (e) { console.log('[demo]', e.message); } finally { busy = false; }
  };
  setInterval(tick, +process.env.POLL_MS || 10000); tick();
  console.log('[demo] Kuzatilmoqda:', c.folder);
}
module.exports = { start };
if (require.main === module) start();
