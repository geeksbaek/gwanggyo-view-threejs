function pip(x, z, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; }

// Each row follows the numbered stacks on the published site plan, west/east
// and north/south retained. Coordinates are plan pixels after a 55 px top crop.
// Entries are [x, y, type, first residential floor, last residential floor].
const STACKS = {
  1701: [[354,965,'59B',3,18],[345,1017,'84B',1,19],[303,1052,'84B',1,20],[270,1019,'84B',1,20],[269,970,'59B',1,20]],
  1702: [[373,757,'59B',3,17],[367,804,'84B',1,17],[322,843,'84B',1,18],[301,818,'84C',1,18]],
  1703: [[394,501,'59B',3,17],[384,554,'84B',1,17],[342,588,'84B',1,18],[308,556,'84B',1,18],[308,507,'59B',2,18]],
  1704: [[428,294,'59B',3,12],[423,344,'84B',1,18],[376,379,'84B',1,18],[346,353,'84B',1,18],[344,299,'59B',1,12]],
  1705: [[651,315,'84A',1,15],[603,356,'84B',1,15],[572,328,'84B',1,16],[570,273,'59B',3,16]],
  1706: [[746,464,'84C',1,10],[715,499,'84A',1,10],[686,538,'59A',1,11],[651,563,'59C',1,11],[625,533,'59C',3,11]],
  1707: [[680,689,'59C',1,10],[653,720,'59A',1,10],[629,755,'59A',1,11],[588,789,'59C',1,12],[560,764,'59D',1,12],[562,717,'59B',3,12]],
  1708: [[598,900,'59A',3,13],[554,938,'84B',1,14],[532,912,'84C',1,14]],
  1709: [[602,1073,'84A',1,15],[558,1112,'84B',1,16],[524,1080,'84B',1,16],[523,1030,'59B',3,16]],
};

// Nine plan control points, fitted from tower centres. Scene axes match pipeline/frame.py.
function planPoint(u, v) {
  const y = v + 55;
  const east = 0.271449*u + 0.000662*y - 112.097991;
  const north = -0.002727*u - 0.275150*y + 170.052137;
  const f = W.frame;
  return [east*f.rE + north*f.rN, -east*f.nE - north*f.nN];
}

function registerStacks() {
  return Object.fromEntries(Object.entries(STACKS).map(([name, rows]) => [name,
    rows.map(([u,v,type,first,last], i) => {
      const [x,z] = planPoint(u,v);
      return {x,z,line:i+1,type,first,last};
    }),
  ]));
}

// Plan-traced inner threshold and an interior sample on the open side of each piloti.
// Cutting only the relevant wing retains the adjacent occupied ground-floor homes.
const PILOTIS = {
  1701:[[1,333,975,351,994]], 1702:[[1,350,770,369,789]],
  1703:[[1,371,514,388,533],[5,310,532,328,514]],
  1704:[[1,406,306,425,325]], 1705:[[4,572,299,591,283]],
  1706:[[5,625,550,642,536]], 1707:[[6,565,744,586,729]],
  1708:[[1,577,910,596,929]], 1709:[[4,527,1053,546,1037]],
};

function pilotiForWing(t) {
  for (const [line,u,v,u2,v2] of PILOTIS[t.name]) {
    const unit = WORLD.units[t.name][line-1];
    if (unit.last !== t.levels || !pip(unit.x,unit.z,t.p)) continue;
    const a = planPoint(u,v), b = planPoint(u2,v2);
    const side = p => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
    const sign = Math.sign(side([unit.x,unit.z]));
    return {side: p => side(p)*sign, ceiling: 0.9 + (unit.first-1)*FLOOR_H - 0.25};
  }
  return null;
}

function nearestStack(t, x, z) {
  return WORLD.units[t.name].filter(s => s.last === t.levels).reduce((a,b) =>
    Math.hypot(a.x-x,a.z-z) <= Math.hypot(b.x-x,b.z-z) ? a : b);
}

function nearestStreet(x, z, ways = NEIGHBORHOOD.roads) {
  let best = null, distance = Infinity;
  for (const road of ways) {
    if (road.tunnel === 'yes' || Number(road.layer) < 0) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i-1], b = road.p[i], dx = b[0]-a[0], dz = b[1]-a[1];
      const length2 = dx*dx + dz*dz;
      if (!length2) continue;
      const t = clamp(((x-a[0])*dx + (z-a[1])*dz)/length2, 0, 1);
      const px = a[0]+t*dx, pz = a[1]+t*dz, d = Math.hypot(x-px,z-pz);
      if (d < distance) { distance = d; best = {road, distance:d, angle:Math.atan2(-dz,dx), px, pz}; }
    }
  }
  return best;
}

// Match both quantized endpoints before applying newer local OSM direction tags.
function roadDirection(pts, fallback) {
  const first = pts[0], last = pts[pts.length-1];
  const close = (p,q) => Math.hypot(p[0]-q[0],p[1]-q[1]) < 0.5;
  for (const way of NEIGHBORHOOD.roads) {
    if (!way.oneway) continue;
    const a = way.p[0], b = way.p[way.p.length-1];
    const order = close(a,first) && close(b,last) ? 1 : close(a,last) && close(b,first) ? -1 : 0;
    if (order && ['yes','1','true','-1','no'].includes(way.oneway)) {
      return way.oneway === 'no' ? 0 : way.oneway === '-1' ? -order : order;
    }
  }
  return fallback ? 1 : 0;
}

// A fixed north-up plan keeps the camera bearing readable as the drone turns.
function drawSiteMap(g,w,h,heading) {
  const f=W.frame, scale=Math.min(w/445,h/390);
  const screen=(x,z) => [w/2+(x*f.rE-z*f.nE-12)*scale,h/2-(x*f.rN-z*f.nN+24)*scale];
  const path = pts => {
    g.beginPath();
    pts.forEach(([x,z],i) => { const p=screen(x,z); if (i) g.lineTo(...p); else g.moveTo(...p); });
  };
  g.fillStyle='#1c2a25'; g.fillRect(0,0,w,h);
  path(W.site); g.closePath(); g.fillStyle='#425a45'; g.fill();
  // Separate footpaths and access streets remain legible behind the arterials.
  for (const way of NEIGHBORHOOD.otherWays) {
    path(way.p);
    g.strokeStyle=['footway','path','steps','pedestrian'].includes(way.highway) ? '#516952' : '#536364';
    g.lineWidth=0.75; g.stroke();
  }
  for (const road of NEIGHBORHOOD.roads) {
    path(road.p);
    g.strokeStyle=road.tunnel==='yes' ? '#889aa4' : '#758083';
    g.setLineDash(road.tunnel==='yes' ? [2,3] : []);
    g.lineWidth=road.tunnel==='yes' ? 1 : Math.max(1,(Number(road.width)||(Number(road.lanes)||2)*3.1)*scale);
    g.stroke();
  }
  g.setLineDash([]);
  for (const t of W.towers) {
    path(t.p); g.closePath(); g.fillStyle=t.name==='1703'?'#f3b765':'#d4dcda'; g.fill();
  }
  g.font='bold 9px sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  for (const [name,units] of Object.entries(WORLD.units)) {
    const x=units.reduce((n,u)=>n+u.x,0)/units.length, z=units.reduce((n,u)=>n+u.z,0)/units.length;
    const [px,py]=screen(x,z); g.lineWidth=2; g.strokeStyle='#e7e9dc'; g.strokeText(name,px,py); g.fillStyle='#172123'; g.fillText(name,px,py);
  }
  const [px,py]=screen(cam.position.x,cam.position.z);
  const aim=screen(cam.position.x+heading.x,cam.position.z+heading.z);
  g.save(); g.translate(clamp(px,5,w-5),clamp(py,5,h-5)); g.rotate(Math.atan2(aim[1]-py,aim[0]-px));
  g.beginPath(); g.moveTo(6,0); g.lineTo(-4,-3.5); g.lineTo(-4,3.5); g.closePath();
  g.fillStyle='#ffa34e'; g.fill(); g.strokeStyle='#192221'; g.lineWidth=1; g.stroke(); g.restore();
  g.fillStyle='#f0f3ee'; g.fillText('↑ N',w-16,10);
  g.fillRect(9,h-8,50*scale,1.5); g.fillText('50 m',9+25*scale,h-15);
  drawMap.inv=(px,py) => {
    const east=(px-w/2)/scale+12, north=(h/2-py)/scale-24;
    return [east*f.rE+north*f.rN,-east*f.nE-north*f.nN];
  };
}

// Equal-distance samples pair the opposing ramp axes even when OSM node counts differ.
function rampStations(count) {
  const open = W.underpass.filter(w => !w.tun);
  const portal = W.underpass.filter(w => w.tun).flatMap(w => [w.p[0],w.p.at(-1)]);
  const distanceToPortal = p => Math.min(...portal.map(q=>Math.hypot(q[0]-p[0],q[1]-p[1])));
  const axes = open.map(way => {
    const p = way.p.slice();
    if (distanceToPortal(p[0]) < distanceToPortal(p.at(-1))) p.reverse();
    const cumulative=[0];
    for (let i=1;i<p.length;i++) cumulative.push(cumulative.at(-1)+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));
    return fraction => {
      const distance = cumulative.at(-1)*fraction;
      let i=1;
      while (i < p.length-1 && cumulative[i] < distance) i++;
      const t=(distance-cumulative[i-1])/(cumulative[i]-cumulative[i-1]);
      return [lerp(p[i-1][0],p[i][0],t),lerp(p[i-1][1],p[i][1],t)];
    };
  });
  return Array.from({length:count+1},(_,i)=>{
    const [a,b]=axes.map(sample=>sample(i/count));
    return {x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,
      halfW:(Math.hypot(a[0]-b[0],a[1]-b[1])+(open[0].w+open[1].w)/2)/2};
  });
}

// Red landscape perimeter on the plan, including the two gate recesses.
const SITE_OUTLINE = [[279,203],[362,228],[557,79],[594,115],[733,121],[749,132],[754,143],[753,186],[740,223],[735,257],[735,297],[744,333],[766,370],[890,515],[899,540],[946,606],[860,681],[689,1185],[480,1167],[408,1155],[398,1181],[372,1177],[324,1160],[332,1133],[278,1113],[220,1083],[152,1041],[121,1014],[117,1004],[152,945],[183,864],[203,776],[235,531],[209,527],[217,451],[245,453]];
