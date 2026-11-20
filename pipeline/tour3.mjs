import { createRequire } from 'module'; const require = createRequire('/opt/node-tools/'); const { chromium } = require('playwright');
const rooms = JSON.parse(process.argv[2]); const N = 8;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto('https://player.xroo.io/space/014117ef5f0140b39cd62aad434d65c8/6', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(16000);
for (const [name, tag] of rooms) {
  await p.getByText('Key spot').click().catch(() => {}); await p.waitForTimeout(1200);
  await p.getByText(name, { exact: true }).first().click().catch(e => console.log('noclick', name)); await p.waitForTimeout(7000);
  await p.evaluate(() => { let st = document.getElementById('hh'); if (!st) { st = document.createElement('style'); st.id = 'hh'; document.head.appendChild(st); } st.textContent = 'body *{visibility:hidden} canvas{visibility:visible!important}'; });
  for (let k = 0; k < 6; k++) { await p.mouse.move(640, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(120); }
  for (let i = 0; i < N; i++) {
    await p.screenshot({ path: `v_${tag}_${i}.jpg`, type: 'jpeg', quality: 80 });
    await p.mouse.move(830, 300); await p.mouse.down(); await p.mouse.move(640, 300, { steps: 6 }); await p.mouse.move(450, 300, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(2200);
  }
  await p.evaluate(() => { document.getElementById('hh').textContent = ''; });
  console.log('done', name);
}
await b.close();
