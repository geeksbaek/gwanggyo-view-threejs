// Registered aerial detail at 정보과학고사거리. Coordinates follow the rotated
// scene frame at 5 trace pixels per metre, with (0,0) at world (30,-110).
// Each crosswalk has two curb ends. Each pair runs parallel to vehicle travel.
const JUNCTION_CROSSWALKS = [
  [[547,310],[553,344],[646,297],[651,334]],
  [[501,306],[500,325],[529,307],[527,328]],
  [[413,509],[447,489],[475,596],[508,578]],
  [[556,596],[556,634],[665,597],[665,635]],
  [[484,620],[484,642],[515,625],[514,645]],
  [[720,418],[765,429],[721,534],[765,530]],
  [[1005,425],[1048,422],[1006,534],[1048,534]],
  [[1069,543],[1069,561],[1150,546],[1150,564]],
];

function junctionMarkings(satInner) {
  const canvas = document.createElement('canvas');
  canvas.width = 2300;
  canvas.height = 2200;
  const ctx = canvas.getContext('2d');
  ctx.scale(2,2);
  clipJunctionRoad(ctx);
  if (satInner) {
    const im=satInner.image, k=im.width/1800;
    ctx.drawImage(im,930*k,790*k,230*k,220*k,0,0,1150,1100);
  }
  const paint = 'rgba(230,226,211,0.84)';
  function line(points, color, width, dash = []) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const p of points.slice(1)) ctx.lineTo(...p);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
  }
  // The approach dividers terminate before the pedestrian crossings.
  const dividers = [
    [[478,0],[527,115],[557,219],[571,283]],
    [[503,0],[551,112],[577,211],[588,282]],
    [[551,0],[598,111],[625,211],[640,282]],
    [[613,665],[613,777],[602,1100]],
    [[642,666],[642,780],[629,1100]],
    [[584,646],[585,765],[573,1100]],
    [[801,454],[911,452],[981,450]],
    [[786,508],[885,509],[978,510]],
    [[1079,450],[1150,451]], [[1058,508],[1150,509]],
    [[0,1000],[156,835],[294,701],[431,591]],
    [[34,1030],[175,861],[314,725],[446,609]],
    [[130,685],[240,585],[335,522],[397,494]],
  ];
  for (const pts of dividers) line(pts,paint,1.15,[13,20]);
  // Yellow centre line on the arm with the two successive crossings.
  for (const [start,end] of [[769,1000],[1054,1150]]) {
    line([[start,484],[end,484]],'rgba(216,178,81,0.86)',1.7);
    line([[start,487],[end,487]],'rgba(216,178,81,0.76)',1.4);
  }
  // Oblique blue paint and turning guidance are independently visible inside
  // the junction. They do not extend the approach lane dividers through it.
  line([[453,486],[531,477],[625,466],[709,455]],'rgba(82,143,167,0.72)',3.4);
  line([[456,495],[537,485],[632,475],[704,463]],paint,1.15,[5,6]);
  line([[591,587],[600,553],[622,522],[653,499],[681,475],[712,466]],paint,1.3,[6,7]);
  line([[493,551],[529,532],[551,514],[576,483],[601,444],[622,400],[640,350]],paint,1.1,[5,8]);

  const at = (a,b,t) => [lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
  for (const [a,b,c,d] of JUNCTION_CROSSWALKS) {
    const span = Math.hypot(c[0]-a[0],c[1]-a[1]);
    const count = Math.max(2,Math.round(span/5.5));
    for (let i=0; i<count; i++) {
      const start = (i+0.10)/count, end = (i+0.57)/count;
      const corners = [at(a,c,start),at(b,d,start),at(b,d,end),at(a,c,end)];
      ctx.beginPath();
      ctx.moveTo(...corners[0]);
      for (const point of corners.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
      ctx.fillStyle = paint;
      ctx.fill();
    }
  }
  // Stop lines are specific to the incoming half of each carriageway.
  for (const pts of [
    [[539,291],[587,284]], [[613,667],[665,667]], [[409,564],[451,620]],
    [[788,426],[788,480]], [[1073,427],[1073,480]], [[982,489],[982,532]],
  ]) line(pts,paint,2.8);
  softenJunctionEdge(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 8;
  return texture;
}

// Footprint of the existing public road including the pedestrian refuges.
// Clipping here keeps the photograph off the planned apartment grounds.
const JUNCTION_ROAD = [
  [380,0],[545,0],[609,130],[651,291],[675,364],[707,401],[777,417],
  [1150,407],[1150,577],[1071,574],[1055,544],[768,544],[716,557],
  [683,586],[669,648],[668,742],[652,1100],[534,1100],[548,735],
  [545,687],[530,660],[505,650],[466,656],[417,619],[335,683],
  [232,766],[128,901],[0,1074],[0,757],[96,675],[229,557],[345,473],
  [420,431],[474,395],[500,365],[499,328],[490,279],[451,143],
];

function junctionRoadPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(...JUNCTION_ROAD[0]);
  for (const point of JUNCTION_ROAD.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

function withinJunctionRoad(x,z) {
  return x>=30 && x<=260 && z>=-110 && z<=110 && pip((x-30)*5,(z+110)*5,JUNCTION_ROAD);
}

function clipJunctionRoad(ctx) {
  junctionRoadPath(ctx);
  ctx.clip();
}

function softenJunctionEdge(ctx) {
  ctx.save();
  ctx.setTransform(2,0,0,2,0,0);
  ctx.globalCompositeOperation='destination-out';
  ctx.strokeStyle='black';
  ctx.lineJoin='round';
  ctx.setLineDash([]);
  junctionRoadPath(ctx);
  for (const [width,opacity] of [[34,0.12],[22,0.28],[12,0.5],[5,0.84]]) {
    ctx.lineWidth=width;
    ctx.globalAlpha=opacity;
    ctx.stroke();
  }
  ctx.restore();
}

// Global tile pixels in the same Web Mercator service used for sat_inner.
function junctionTilePoint(x,z,frame) {
  const lat=frame.lat+(x*frame.rN-z*frame.nN)/110950;
  const lon=frame.lon+(x*frame.rE-z*frame.nE)/(111320*Math.cos(frame.lat*Math.PI/180));
  const size=256*2**19;
  return [(lon+180)*size/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)*size/2];
}

async function loadJunctionPhoto(texture,frame) {
  const origin=junctionTilePoint(30,-110,frame);
  const right=junctionTilePoint(260,-110,frame);
  const bottom=junctionTilePoint(30,110,frame);
  const corners=[origin,right,bottom,junctionTilePoint(260,110,frame)];
  const ctx=document.createElement('canvas').getContext('2d');
  ctx.canvas.width=texture.image.width;
  ctx.canvas.height=texture.image.height;
  ctx.scale(2,2);
  clipJunctionRoad(ctx);
  // Transform tile-pixel offsets relative to the registered origin to the
  // rotated trace frame. The local affine error is below a source pixel.
  const sceneToMercator=new DOMMatrix([
    (right[0]-origin[0])/1150,(right[1]-origin[1])/1150,
    (bottom[0]-origin[0])/1100,(bottom[1]-origin[1])/1100,0,0,
  ]);
  const projection=sceneToMercator.inverse();
  ctx.transform(projection.a,projection.b,projection.c,projection.d,0,0);
  const tiles=[];
  const indices = axis => corners.map(p=>Math.floor(p[axis]/256));
  const xs=indices(0), ys=indices(1);
  const x0=Math.min(...xs), y0=Math.min(...ys);
  const columns=Math.max(...xs)-x0+1, rows=Math.max(...ys)-y0+1;
  const mosaic=document.createElement('canvas').getContext('2d');
  mosaic.canvas.width=columns*256;
  mosaic.canvas.height=rows*256;
  const mask=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  mask.canvas.width=columns*16;
  mask.canvas.height=rows*16;
  mask.scale(1/16,1/16);
  mask.translate(origin[0]-x0*256,origin[1]-y0*256);
  mask.transform(sceneToMercator.a,sceneToMercator.b,sceneToMercator.c,sceneToMercator.d,0,0);
  clipJunctionRoad(mask);
  mask.fillRect(0,0,1150,1100);
  for (let row=0; row<rows; row++) {
    for (let col=0; col<columns; col++) {
      const coverage=mask.getImageData(col*16,row*16,16,16).data;
      if (coverage.some((v,i)=>i%4===3 && v>0)) tiles.push([x0+col,y0+row]);
    }
  }
  const controller=new AbortController();
  async function worker() {
    while (tiles.length) {
      const [x,y]=tiles.pop();
      const url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/19/'+y+'/'+x;
      const deadline=setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetch(url,{signal:controller.signal});
        if (!response.ok) throw new Error('Imagery tile unavailable');
        const tile=await createImageBitmap(await response.blob());
        mosaic.drawImage(tile,(x-x0)*256,(y-y0)*256);
        tile.close();
      } finally {
        clearTimeout(deadline);
      }
    }
  }
  try {
    await Promise.all(Array.from({length:4},worker));
    ctx.drawImage(mosaic.canvas,x0*256-origin[0],y0*256-origin[1]);
    softenJunctionEdge(ctx);
    texture.image=ctx.canvas;
    texture.needsUpdate=true;
    $('imageryCredit').dataset.detail='loaded';
  } catch {
    controller.abort(); // Keep the entire registered offline surface on failure.
  }
}
