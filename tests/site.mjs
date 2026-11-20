// Dependency-free checks of the plan registration and the published unit schedule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const read = path => fs.readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8');
const W = JSON.parse(read('world.json'));
const NEIGHBORHOOD = JSON.parse(read('data/neighborhood.json'));
const context = {W, NEIGHBORHOOD, WORLD:{}, FLOOR_H:3, clamp:(x,a,b)=>Math.max(a,Math.min(b,x)), lerp:(a,b,t)=>a+(b-a)*t};
vm.createContext(context);
vm.runInContext(read('src/18_site.js')+
  '\nWORLD.units=registerStacks(); W.site=SITE_OUTLINE.map(p=>planPoint(...p));',context);
const {units} = context.WORLD;
const totals = {};
let stacks=0, openings=0;
for (const [name,rows] of Object.entries(units)) {
  for (const u of rows) {
    totals[u.type]=(totals[u.type]||0)+u.last-u.first+1;
    stacks++;
    assert.ok(W.towers.some(t=>t.name===name && t.levels===u.last && context.pip(u.x,u.z,t.p)), name+' line '+u.line);
  }
}
assert.equal(stacks,41);
assert.deepEqual(totals,{'59A':43,'59B':143,'59C':42,'59D':12,'84A':40,'84B':278,'84C':42});
for (const t of W.towers) {
  assert.ok(t.p.every(p=>context.pip(...p,W.site)));
  const cut=context.pilotiForWing(t);
  if (!cut) continue;
  const crossings=t.p.filter((p,i)=>(cut.side(p)>=0)!==(cut.side(t.p[(i+1)%t.p.length])>=0));
  assert.equal(crossings.length,2,t.name+' disconnected soffit');
  assert.equal(units[t.name].filter(u=>u.last===t.levels && context.pip(u.x,u.z,t.p) && cut.side([u.x,u.z])>=0).length,1);
  openings++;
}
assert.equal(openings,10);
for (const w of NEIGHBORHOOD.roads.filter(w=>w.oneway==='yes')) {
  assert.equal(context.roadDirection(w.p,false),1);
  assert.equal(context.roadDirection([...w.p].reverse(),false),-1);
}
assert.equal(new Set(NEIGHBORHOOD.fixtures.map(f=>f.id)).size,NEIGHBORHOOD.fixtures.length);
assert.ok(NEIGHBORHOOD.fixtures.every(f=>f.p.length===2 && f.p.every(Number.isFinite)));
for (const [u,v,name] of [[365,1190,'월드컵로'],[199,489,'광교중앙로']]) {
  const point=context.planPoint(u,v);
  assert.equal(context.nearestStreet(...point).road.name,name);
}
const stations=context.rampStations(36);
assert.equal(stations.length,37);
assert.ok(Math.hypot(stations.at(-1).x-57.75,stations.at(-1).z-48.6)<0.1);
assert.ok(stations.every(s=>s.halfW>0 && Number.isFinite(s.z)));
console.log('Verified 9 towers, 41 stacks, 600 homes, 10 piloti, road direction and tunnel alignment.');
