// Two-way counts by hour, GITS station 4302-03, 20–26 October 2025.
// Monday–Friday mean, Saturday and Sunday, beginning at 00:00 KST.
const HOURLY_TRAFFIC = [
  [489, 362, 243, 269, 664, 2307, 4471, 5240, 5338, 4883, 4126, 3746, 3854, 4087, 4395, 4744, 5063, 4845, 4650, 3827, 2893, 1985, 1349, 764],
  [668, 523, 327, 308, 471, 1314, 2084, 2866, 4369, 4369, 4081, 4800, 4392, 4417, 4754, 4716, 5167, 4549, 4151, 2664, 2106, 1653, 1085, 727],
  [490, 339, 270, 198, 286, 640, 1054, 1563, 2094, 2565, 2997, 3362, 3572, 3809, 3831, 3791, 3903, 3602, 2908, 2501, 1977, 1528, 935, 511],
];
const PEAK_TRAFFIC = Math.max(...HOURLY_TRAFFIC.flat());
const TRAFFIC_PLAYBACK_RATE = 12; // Vehicle motion in the 48-second day preview.
const JANUARY_FIRST = new Date(Date.UTC(YEAR,0,1)).getUTCDay();

// Each observation covers an hour. Interpolate between bin midpoints,
// including the transition between Friday night and Saturday morning.
function trafficDemand(doy,hour) {
  const time=doy*24 + hour - 0.5, lower=Math.floor(time);
  function count(t) {
    const weekday=((JANUARY_FIRST+Math.floor(t/24))%7+7)%7;
    const profile=HOURLY_TRAFFIC[weekday===0 ? 2 : weekday===6 ? 1 : 0];
    return profile[(t%24+24)%24];
  }
  return lerp(count(lower),count(lower+1),time-lower)/PEAK_TRAFFIC;
}

// Through movements in the registered aerial frame. Gate indices denote
// stop lines. Group 0 is the diagonal/east arm, group 1 the north/south arm.
// Gate 2 controls the separate pedestrian crossing farther along the east arm.
const JUNCTION_LANES = [
  {weight:1.00, gates:[[4,0],[9,2]], points:[[0,1004],[121,860],[247,727],[340,649],[425,586],[490,545],[565,520],[640,508],[726,497],[982,497],[1150,497]]},
  {weight:1.00, gates:[[1,2],[2,0]], points:[[1150,469],[1073,469],[788,469],[717,469],[627,476],[547,482],[461,497],[376,525],[286,586],[181,669],[88,754],[0,838]]},
  {weight:0.85, gates:[[3,1]], points:[[464,0],[510,106],[543,216],[562,288],[575,348],[582,419],[581,493],[577,570],[574,639],[575,779],[559,1100]]},
  {weight:0.85, gates:[[2,1]], points:[[625,1100],[640,800],[639,667],[638,595],[637,526],[637,471],[633,397],[627,341],[615,288],[577,136],[515,0]]},
];

function junctionGreen(time,group) {
  const phase=time%92;
  if (group===2) return (time+12)%92 < 69;
  return group===0 ? phase<39 : phase>=49 && phase<82;
}

function makeJunctionTraffic() {
  const lanes=JUNCTION_LANES.map(({points,gates,weight})=>{
    let L=0;
    const pts=points.map(([u,v],i)=>{
      if (i) L+=Math.hypot(u-points[i-1][0],v-points[i-1][1])/5;
      return [30+u/5,-110+v/5,L];
    });
    // Leave space on both sides of each striped field for the whole vehicle.
    const keepClear=[];
    for (const [a,b,c,d] of JUNCTION_CROSSWALKS) {
      const polygon=[a,b,d,c];
      let first=Infinity,last=-Infinity,segment=1;
      for (let t=0;t<L;t+=0.5) {
        while (segment<pts.length-1 && t>pts[segment][2]) segment++;
        const from=pts[segment-1], to=pts[segment];
        const f=(t-from[2])/(to[2]-from[2]);
        if (!pip((lerp(from[0],to[0],f)-30)*5,(lerp(from[1],to[1],f)+110)*5,polygon)) continue;
        first=Math.min(first,t);
        last=t;
      }
      if (last>=first) keepClear.push({before:first-2.6,after:last+2.6});
    }
    return {path:{pts,L},keepClear,stops:gates.map(([i,group])=>({t:pts[i][2]-2.6,group})),weight,queue:[],next:0,serial:0};
  });
  let time=0, lastHour, lastDay;
  function advance(dt,demand) {
    time+=dt;
    for (const lane of lanes) {
      const queue=lane.queue;
      const cruise=12.3-3.6*demand;
      lane.next-=dt;
      if (lane.next<=0 && (!queue.length || queue.at(-1).t>8)) {
        const serial=lane.serial++;
        queue.push({t:0,v:cruise,serial});
        const variation=0.8+0.4*((serial*0.61803399+lane.weight)%1);
        lane.next=variation*5.4/(Math.max(0.025,demand)*lane.weight);
      }
      let leader=Infinity;
      for (const car of queue) {
        let limit=leader-6.4;
        for (const crossing of lane.keepClear) {
          if (car.t<=crossing.before && limit<crossing.after) limit=Math.min(limit,crossing.before);
        }
        for (const stop of lane.stops) {
          // A vehicle already past the stop line clears the junction.
          if (car.t<=stop.t && !junctionGreen(time,stop.group)) limit=Math.min(limit,stop.t);
        }
        const gap=Math.max(0,limit-car.t);
        const target=Math.min(cruise,Math.sqrt(2*2.4*gap),gap/0.9);
        car.v=clamp(target,Math.max(0,car.v-3.8*dt),car.v+2.0*dt);
        const travel=Math.min(gap,car.v*dt);
        car.t+=travel;
        if (travel===gap) car.v=0;
        leader=car.t;
      }
      while (queue.length && queue[0].t>lane.path.L) queue.shift();
    }
  }
  function update(dt,doy,hour,playing,demand) {
    if (lastDay!==doy || (!playing && hour!==lastHour)) {
      // Populate existing queues on first entry and when seeking to a time.
      // Replay the same arrivals and phase when revisiting the same instant.
      time=Math.floor(hour*3600);
      for (const [i,lane] of lanes.entries()) {
        lane.queue.length=0;
        lane.serial=i*13;
        lane.next=[1.2,4.3,2.7,6.1][i]/Math.max(0.025,demand);
      }
      for (let step=0;step<600;step++) advance(0.2,demand);
    }
    lastDay=doy;
    lastHour=hour;
    const elapsed=dt*(playing ? TRAFFIC_PLAYBACK_RATE : 1);
    const steps=Math.max(1,Math.ceil(elapsed/0.1));
    for (let i=0;i<steps;i++) advance(elapsed/steps,demand);
  }
  return {lanes,update};
}
