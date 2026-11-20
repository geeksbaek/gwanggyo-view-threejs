import { createRequire } from 'module'; const { chromium } = createRequire('/opt/node-tools/')('playwright');
const args = process.argv.slice(2); const W = +(args[0] || 1280), H = +(args[1] || 720);
const shots = JSON.parse(args[2] || '[{"n":"a"}]');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 1500)); });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 800)));
await p.goto('http://127.0.0.1:8377/index.html?shot' + (args[3] || ''));
await p.waitForFunction(() => window.__gg, null, { timeout: 180000 });
for (const s of shots) {
  const t0 = Date.now();
  await p.evaluate((s) => { const g = window.__gg; if (s.view) g.goView(s.view, true); if (s.s) g.set(s.s); if (s.v) Object.assign(g.view, s.v), Object.assign(g.view, { tyaw: g.view.yaw, tpitch: g.view.pitch, tfov: g.view.fov }); if (s.pos) { g.view.pos.set(...s.pos); g.view.tpos.set(...s.pos); } if (s.hud === false) { document.getElementById('hud').style.display = 'none'; document.getElementById('top').style.display = 'none'; } else { document.getElementById('hud').style.display = ''; document.getElementById('top').style.display = ''; } g.frame(s.frames || 2); }, s);
  await p.screenshot({ timeout: 180000, path: `shots/${s.n}.jpg`, quality: 90, type: 'jpeg' });
  if (s.pick) { const r = await p.evaluate((pk) => pk.map(([x, y]) => { const h = window.__pick(x, y); return h ? h.name + ' ' + h.sub + ' ' + Math.round(h.dist) : null; }), s.pick); console.log('pick', JSON.stringify(r)); }
  console.log('shot', s.n, Date.now() - t0, 'ms', JSON.stringify(await p.evaluate(() => ({ ...window.__gg.info(), exp: window.__gg.ENV.exp }))));
}
await b.close();
