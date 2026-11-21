import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({
  YEAR:2029, lerp:(a,b,t)=>a+(b-a)*t, clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
});
for (const file of ['18_site','19_junction','21_traffic']) {
  vm.runInContext(fs.readFileSync(new URL('../src/'+file+'.js',import.meta.url),'utf8'),context);
}
const {trafficDemand,makeJunctionTraffic,junctionGreen}=context;
const weekday=0, saturday=5, sunday=6;
assert.ok(trafficDemand(weekday,8.5)>trafficDemand(weekday,3.5)*10);
assert.ok(trafficDemand(weekday,8.5)>trafficDemand(saturday,8.5));
assert.ok(trafficDemand(saturday,8.5)>trafficDemand(sunday,8.5));
assert.equal(trafficDemand(4,24),trafficDemand(5,0));
assert.ok(Math.abs(trafficDemand(sunday,23.999)-trafficDemand(7,0))<0.001);
for (let t=0;t<184;t++) assert.ok(!(junctionGreen(t,0)&&junctionGreen(t,1)));

function simulate(hour) {
  const traffic=makeJunctionTraffic(), demand=trafficDemand(weekday,hour);
  let total=0, stopped=false, released=false;
  const wasStopped=new Set(), previous=new Map();
  for (let k=0;k<1800;k++) {
    const dt=0.1;
    traffic.update(dt,weekday,hour,false,demand);
    const signalTime=Math.floor(hour*3600)+120+(k+1)*dt;
    for (const [i,lane] of traffic.lanes.entries()) {
      total+=lane.queue.length;
      for (const [n,car] of lane.queue.entries()) {
        const id=i+'-'+car.serial;
        for (const gate of lane.stops) {
          if (previous.get(id)<=gate.t && car.t>gate.t && !junctionGreen(signalTime-1e-5,gate.group)) {
            assert.ok(junctionGreen(signalTime+1e-5,gate.group),'crossed a closed stop line');
          }
        }
        previous.set(id,car.t);
        if (n) assert.ok(lane.queue[n-1].t-car.t>=6.4-1e-6);
        if (car.v>2 && wasStopped.has(id)) released=true;
        if (car.v<0.1) {
          assert.ok(lane.keepClear.every(c=>car.t<=c.before+0.2 || car.t>=c.after-0.2));
          if (lane.stops.some(s=>Math.abs(s.t-car.t)<0.35 && !junctionGreen(signalTime,s.group))) {
            stopped=true;
            wasStopped.add(id);
          }
        }
      }
    }
  }
  return {total,stopped,released};
}
const quiet=simulate(3.5), rush=simulate(8.5);
assert.ok(rush.total>quiet.total*5);
assert.ok(rush.stopped && rush.released);
console.log('Verified hourly and weekend demand, midnight interpolation, red-light queues, spacing and crosswalk clearance.');

const playback=makeJunctionTraffic(), playbackCounts={};
for (let step=0;step<1920;step++) {
  const hour=step/40%24;
  playback.update(0.05,weekday,hour,true,trafficDemand(weekday,hour));
  if (step>=960 && [3.5,8.5,17.5].includes(hour)) {
    playbackCounts[hour]=playback.lanes.reduce((sum,lane)=>sum+lane.queue.length,0);
  }
}
assert.ok(playbackCounts[8.5]>playbackCounts[3.5]*3);
assert.ok(playbackCounts[17.5]>playbackCounts[3.5]*3);
