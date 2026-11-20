// ───────────── world outside the window: terrain, city, complex, trees, water, lights, traffic
const WORLD = { casters: [] };
const LAMP = 0.015;       // absolute radiance of a lit window relative to sun units
let demN, demF;
function groundY(x, z) {
  const HN = W.HN, NN = W.NN;
  if (Math.abs(x) < HN - 20 && Math.abs(z) < HN - 20) {
    const fx = (x + HN) / (2 * HN) * NN - 0.5, fz = (z + HN) / (2 * HN) * NN - 0.5;
    const i = clamp(Math.floor(fx), 0, NN - 2), j = clamp(Math.floor(fz), 0, NN - 2), a = clamp(fx - i, 0, 1), b = clamp(fz - j, 0, 1);
    return (lerp(lerp(demN[j * NN + i], demN[j * NN + i + 1], a), lerp(demN[(j + 1) * NN + i], demN[(j + 1) * NN + i + 1], a), b)) * 0.1;
  }
  const HF = W.HF, NF = W.NF;
  const fx = (x + HF) / (2 * HF) * NF - 0.5, fz = (z + HF) / (2 * HF) * NF - 0.5;
  const i = clamp(Math.floor(fx), 0, NF - 2), j = clamp(Math.floor(fz), 0, NF - 2), a = clamp(fx - i, 0, 1), b = clamp(fz - j, 0, 1);
  return (lerp(lerp(demF[j * NF + i], demF[j * NF + i + 1], a), lerp(demF[(j + 1) * NF + i], demF[(j + 1) * NF + i + 1], a), b)) * 0.1;
}

let HAS_PAINT = false;
const DET_H = 640;   // half extent of the painted detail ground (m)
function paintDetail() {
  const N = 4096, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const P = (x, z) => [(x + DET_H) / (2 * DET_H) * N, (z + DET_H) / (2 * DET_H) * N], k = N / (2 * DET_H);
  const path = (pts) => { g.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); };
  const rnd = (() => { let s = 99; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

  // Outside complex: parking lots & fallback landuse (crisp vector roads, pitches & trails come from roadpaint.png!)
  const lo = arr('l_off'), lx = arr('l_xy'), lk = arr('l_k');
  for (let i = 0; i < lk.length; i++) {
    if (lk[i] !== 2) continue; // parking stalls + parked cars
    const pts = []; for (let v = lo[i]; v < lo[i + 1]; v++) pts.push([lx[v * 2] / 4, lx[v * 2 + 1] / 4]);
    path(pts); g.closePath();
    g.fillStyle = '#474a50'; g.fill();
    g.save(); g.clip();
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]); const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, [px, pz] = P(cx, cz);
    g.translate(px, pz); g.rotate(ang); const R = Math.hypot(x1 - x0, z1 - z0) / 2 + 5;
    for (let row = -R; row < R; row += 17) for (let s = -R; s < R; s += 2.6) for (const side of [0, 1]) {
      const yy = row + side * 5.4;
      g.strokeStyle = 'rgba(232,232,230,.52)'; g.lineWidth = 0.12 * k; g.strokeRect(s * k, yy * k, 2.6 * k, 5.2 * k);
      if (rnd() < 0.58) {
        g.fillStyle = ['#e8e8e6', '#1c1d20', '#8d9094', '#f4f4f2', '#3a3d45', '#7b1e1e', '#23344f', '#c9c9c9'][Math.floor(rnd() * 8)];
        g.fillRect((s + 0.4) * k, (yy + 0.45) * k, 1.8 * k, 4.3 * k);
        g.fillStyle = 'rgba(20,25,30,.75)'; g.fillRect((s + 0.55) * k, (yy + 1.3) * k, 1.5 * k, 2.2 * k);
      }
    }
    g.restore();
  }

  // Fallback OSM roads ONLY if roadpaint.png is absent
  if (!HAS_PAINT) {
    const ro = arr('r_off'), rx = arr('r_xy'), rw = arr('r_w'), rc = arr('r_c');
    const stroke = (i, w, col, dash) => {
      const pts = []; for (let v = ro[i]; v < ro[i + 1]; v++) pts.push([rx[v * 2] / 4, rx[v * 2 + 1] / 4]);
      path(pts); g.lineWidth = w * k; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash(dash ? dash.map(d => d * k) : []); g.stroke(); g.setLineDash([]);
    };
    const near = (i) => { for (let v = ro[i]; v < ro[i + 1]; v++) if (Math.abs(rx[v * 2] / 4) < DET_H + 30 && Math.abs(rx[v * 2 + 1] / 4) < DET_H + 30) return true; return false; };
    const ids = []; for (let i = 0; i < rw.length; i++) if (near(i) && !(rc[i] & 8)) ids.push(i);
    for (const i of ids) { const c2 = rc[i] & 7, w = rw[i] / 5; if (c2 >= 1 && c2 <= 5) stroke(i, w + 5.5, '#a8a298'); }
    for (const i of ids) { const c2 = rc[i] & 7, w = rw[i] / 5; if (c2 >= 1 && c2 <= 5) stroke(i, w, '#3c3e43'); }
  }

  // ── 광교 자연앤 센트레빌 Complex Grounds (1:1 Digital Twin of Official 단지배치도 using exact 0.80m-fit affine transform!)
  const site = W.site; path(site); g.closePath(); g.save(); g.clip();
  // Exact mapping from official 단지배치도 pixel (u, v) -> scene (x, z) meters!
  const U2S = (u, v) => [-0.25210532 * u + 0.20415737 * v - 14.13187687, -0.20250471 * u - 0.25586374 * v + 196.07265457];
  const pathUV = (uvs) => path(uvs.map(([u, v]) => U2S(u, v)));
  const PUV = (u, v) => P(...U2S(u, v));
  const strokeUV = (uvs, w_m, col, close = false, dash = null) => {
    pathUV(uvs); if (close) g.closePath();
    g.lineWidth = w_m * k; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
    if (dash) g.setLineDash(dash.map(d => d * k));
    g.stroke(); if (dash) g.setLineDash([]);
  };
  const fillUV = (uvs, fill, stroke = null, sw = 0.6) => {
    pathUV(uvs); g.closePath(); g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = sw * k; g.strokeStyle = stroke; g.stroke(); }
  };

  // 1) Lush landscaped green ground base with subtle organic turf mottling
  g.fillStyle = '#476a2e'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 3600; i++) {
    const p = site[Math.floor(rnd() * site.length)], q = site[Math.floor(rnd() * site.length)], t = rnd();
    const [x, y] = P(lerp(p[0], q[0], t), lerp(p[1], q[1], t));
    g.fillStyle = rnd() < 0.5 ? 'rgba(54,84,34,.35)' : 'rgba(98,136,58,.24)';
    g.beginPath(); g.arc(x, y, (1.4 + rnd() * 4.5) * k, 0, 7); g.fill();
  }
  const granLight = '#d6d1c6', granMid = '#bfb9ad', granDark = '#989389', curb = '#e2ded5';

  // 2) Exact Outer Curved Perimeter Promenade / Fire-Lane Loop (traced 1:1 from 단지배치도!)
  const outerLoop = [
    [338, 932], [412, 972], [486, 996], [562, 964], [596, 892], [608, 825],
    [556, 762], [588, 706], [642, 646], [696, 586], [734, 526], [712, 466],
    [662, 408], [608, 342], [582, 266], [546, 198], [480, 174], [412, 196],
    [352, 224], [252, 268], [226, 342], [216, 434], [214, 512], [234, 566],
    [206, 650], [186, 738], [160, 824], [168, 896], [244, 948], [318, 976],
  ];
  strokeUV(outerLoop, 7.2, curb, true);
  strokeUV(outerLoop, 5.8, granLight, true);
  strokeUV(outerLoop, 4.6, '#cbc6bc', true, [1.6, 0.35]);

  // 3) Exact Inner Courtyard Walkways & Loops (connecting all 9 towers & parks!)
  const innerLoops = [
    // Around ② 센트레 커넥트 파크 & 웰컴라운지
    [[338, 932], [312, 872], [318, 804], [344, 748], [386, 686], [448, 668], [430, 738], [414, 814], [462, 868], [540, 826], [604, 824]],
    // Between 1707 & 1708 connecting to 펀 그라운드
    [[448, 668], [492, 718], [556, 762]],
    // Between 1706 & 1707 connecting to 바이탈그라운드
    [[486, 516], [568, 558], [634, 594], [696, 586]],
    // Around ⑤ 아너스가든 & 1704/1705/1706
    [[268, 378], [332, 372], [396, 304], [442, 248], [478, 178]],
    [[332, 372], [398, 444], [488, 372], [442, 248]],
    [[488, 372], [564, 326], [608, 342]],
    // Around 1702 & 1703 lobbies
    [[234, 566], [306, 578], [382, 646], [386, 686]],
    [[382, 646], [326, 706], [268, 764], [186, 738]],
    // South plaza connecting 1701 & 웰컴라운지
    [[244, 948], [292, 902], [312, 872]],
  ];
  for (const lp of innerLoops) {
    strokeUV(lp, 5.2, curb);
    strokeUV(lp, 4.1, granLight);
  }

  // Tower granite apron plazas around all 9 towers
  for (const t of W.towers) {
    path(t.p); g.closePath(); g.lineWidth = 7.4 * k; g.strokeStyle = granMid; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = granMid; g.fill();
  }

  // 4) ① 비스타애비뉴 (Grand Straight Diagonal Axis from 51.5M 도로 to 사색공원!) + 블루아트갤러리 + 선큰 라운지
  strokeUV([[165, 694], [268, 614], [388, 502], [574, 326]], 11.4, curb);
  strokeUV([[165, 694], [268, 614], [388, 502], [574, 326]], 9.6, '#d8d3c8');
  strokeUV([[165, 694], [268, 614], [388, 502], [574, 326]], 3.6, '#b6b0a4', false, [1.2, 1.0]);
  // Sunken timber lounge & emerald sculpture lawn in front of Vista waterfall (sp2_vista.jpg!)
  fillUV([[240, 628], [274, 598], [300, 624], [266, 654]], '#c9c3b8', curb, 0.8);
  fillUV([[252, 622], [274, 602], [292, 620], [270, 640]], '#8e6944'); // warm timber lounge deck
  fillUV([[236, 636], [254, 620], [270, 638], [252, 654]], '#588438', '#dcd7cd', 0.6); // rectangular emerald sculpture lawn
  // 블루아트갤러리 turquoise reflecting canal beside Vista Avenue (between 1703 & 그로잉그라운드!)
  fillUV([[302, 566], [392, 480], [412, 500], [322, 586]], '#387e94', '#e5e1d8', 1.1);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const [sx, sz] = PUV(lerp(312, 398, t), lerp(574, 492, t));
    g.fillStyle = '#ddd8ce'; g.fillRect(sx - 1.0 * k, sz - 0.8 * k, 2.0 * k, 1.6 * k);
  }

  // 5) ② 센트레 커넥트 파크 (Sculpted Emerald Central Lawn) + 석가산 연못 & 데크 (sp3_connect.jpg!)
  fillUV([[348, 766], [344, 712], [374, 656], [428, 652], [442, 706], [412, 774], [374, 794]], '#5a8739', '#d8d3c7', 1.5);
  // Subtle mowed turf stripes across 센트레 커넥트 파크
  const [cpX, cpZ] = PUV(392, 722);
  g.save(); pathUV([[348, 766], [344, 712], [374, 656], [428, 652], [442, 706], [412, 774], [374, 794]]); g.closePath(); g.clip();
  for (let s = -28; s < 28; s += 2.8) { g.fillStyle = 'rgba(130,174,78,.22)'; g.fillRect(cpX + s * k, cpZ - 34 * k, 1.4 * k, 68 * k); }
  g.restore();
  // 석가산 & Reflecting Pond + Timber Viewing Deck right between 1701 & 웰컴라운지 (sp3_connect.jpg!)
  fillUV([[326, 858], [344, 822], [386, 820], [394, 852], [362, 874]], '#2e758a', '#9c968a', 1.0);
  fillUV([[348, 824], [388, 818], [392, 800], [352, 804]], '#916c47', '#d8d2c6', 0.6); // cantilevered timber teahouse deck

  // 6) ③ 펀 그라운드 (65m Curved Multi-Zone Water & Family Adventure Playground, sp4_fun.jpg!)
  fillUV([[554, 742], [584, 686], [628, 636], [668, 598], [692, 616], [656, 668], [614, 728], [582, 768]], '#3b8394', '#dbd6ca', 1.8);
  fillUV([[568, 738], [596, 692], [634, 648], [652, 662], [616, 712], [586, 750]], '#59a6b5');
  fillUV([[582, 726], [612, 684], [628, 694], [598, 736]], '#7bb666');
  fillUV([[622, 656], [652, 620], [666, 630], [636, 666]], '#dcc47c');

  // 7) ④ 그로잉 그라운드 & 어린이집(1F) (sp5_growing.jpg!)
  fillUV([[384, 608], [434, 562], [462, 592], [412, 638]], '#609242', '#dad5ca', 1.2); // kids' lawn
  fillUV([[396, 598], [418, 578], [434, 594], [412, 614]], '#d8c28c'); // soft EPDM play pad
  fillUV([[442, 548], [488, 506], [516, 536], [470, 578]], '#cec8bc', curb, 0.8); // 어린이집 plaza
  // Linear reflecting water strip along 그로잉 그라운드 (sp5_growing.jpg right!)
  fillUV([[388, 562], [442, 512], [450, 520], [396, 570]], '#3c7f92', '#e0dcd2', 0.6);

  // 8) ⑤ 아너스가든 & 아너스라운지(경로당 1F) (sp6_honors.jpg!)
  fillUV([[344, 412], [412, 348], [458, 394], [390, 458]], '#5e8c40', '#dcd7cc', 1.4); // putting/garden lawn
  fillUV([[360, 408], [408, 364], [422, 378], [374, 422]], '#4e9684'); // turquoise activity track border
  fillUV([[388, 426], [426, 392], [442, 408], [404, 442]], '#8c7256'); // raised herb/vegetable beds

  // 9) 바이탈그라운드 (Multi-Sport Court + Herb Garden), 보타닉라운지, 킨포크라운지!
  fillUV([[642, 558], [692, 512], [716, 536], [666, 582]], '#3d7d6e', '#e2ded4', 1.0); // badminton/multi-sport court
  fillUV([[652, 556], [690, 522], [704, 536], [666, 570]], '#2d6a8c', '#f0f0ec', 0.35); // inner court lines
  fillUV([[616, 504], [662, 462], [686, 488], [640, 530]], '#567e38', '#c8c2b6', 0.8); // geometric herb garden
  fillUV([[468, 224], [526, 178], [554, 212], [496, 250]], '#4f7a34', '#d2cdc1', 1.0); // 보타닉라운지
  fillUV([[524, 858], [568, 818], [596, 848], [552, 888]], '#8d6c49', '#d8d3c7', 0.8); // 킨포크라운지 timber deck

  // 10) 주출입구 진입도로 + 원형 회전광장 (Roundabout) + 지하주차장 하강 램프 (1:1 with siteplan_fit.jpg & sp1_maingate.jpg!)
  strokeUV([[312, 1022], [326, 976], [338, 932]], 9.6, '#383a40');
  strokeUV([[312, 1022], [326, 976], [338, 932]], 0.28, '#e0b83c');
  // Circular roundabout ring road around emerald center island at (338, 932)!
  const [rbX, rbZ] = PUV(338, 932);
  g.beginPath(); g.arc(rbX, rbZ, 11.2 * k, 0, 7); g.fillStyle = '#383a40'; g.fill();
  g.lineWidth = 1.6 * k; g.strokeStyle = curb; g.stroke();
  g.beginPath(); g.arc(rbX, rbZ, 5.2 * k, 0, 7); g.fillStyle = '#568036'; g.fill();
  g.lineWidth = 0.8 * k; g.strokeStyle = '#dfd9ce'; g.stroke();
  // Underground parking ramp branching off roundabout toward 웰컴라운지/1709동!
  strokeUV([[352, 954], [380, 936], [408, 916]], 7.8, '#2b2d32');
  strokeUV([[352, 954], [380, 936], [408, 916]], 0.25, '#e0b83c');

  // 11) 부출입구 진입도로 + 부채꼴 지하주차장 램프 (1:1 with siteplan_fit.jpg!)
  strokeUV([[152, 436], [208, 434], [248, 422], [284, 404]], 10.6, curb);
  strokeUV([[152, 436], [208, 434], [248, 422], [284, 404]], 7.6, '#36383e');
  strokeUV([[152, 436], [208, 434], [248, 422], [284, 404]], 0.26, '#e0b83c');

  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function paintNightMap() {
  // Higher-resolution near night road glow (covers +-2048m at 2m/px with smooth anti-aliased falloff — zero blocky pixels!)
  const N = 2048, H = 2048, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const ro = arr('r_off'), rx = arr('r_xy'), rw = arr('r_w'), rc = arr('r_c'), k = N / (2 * H);
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1, 2]) for (let i = 0; i < rw.length; i++) {
    const c2 = rc[i] & 7; if (c2 < 1 || c2 > 5 || (rc[i] & 8)) continue;
    g.beginPath();
    let vis = false;
    for (let v = ro[i]; v < ro[i + 1]; v++) {
      const wx = rx[v * 2] / 4, wz = rx[v * 2 + 1] / 4;
      if (Math.abs(wx) < H + 40 && Math.abs(wz) < H + 40) vis = true;
      const x = (wx + H) * k, y = (wz + H) * k; v === ro[i] ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    if (!vis) continue;
    const w = rw[i] / 5, major = c2 >= 2;
    if (pass === 0) { g.lineWidth = (w + 18) * k; g.strokeStyle = major ? 'rgba(255,160,82,.045)' : 'rgba(255,175,100,.022)'; }
    else if (pass === 1) { g.lineWidth = (w + 7) * k; g.strokeStyle = major ? 'rgba(255,180,105,.10)' : 'rgba(255,190,120,.045)'; }
    else { g.lineWidth = Math.max((w + 1.5) * k, 1.4); g.strokeStyle = major ? 'rgba(255,205,145,.20)' : 'rgba(255,212,160,.09)'; }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

const TERRAIN_FS = /* glsl */`
precision highp float;
${GLSL_COMMON}
uniform sampler2D uSat, uSatInner, uDetail, uNightMap, uPaint; uniform float uHalf, uIsFar, uDetH, uNearH, uPaintH, uInnerH;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  if(uIsFar>0.5 && max(abs(vW.x),abs(vW.z))<uNearH-60.0) discard;
  vec3 sat=texture2D(uSat,vUv).rgb;
  // Blend ultra-sharp z17 aerial ortho (0.88m/px) inside +-900m for crisp neighborhood detail!
  if(uIsFar<0.5 && uInnerH>1.0){
    vec2 iuv=(vW.xz+uInnerH)/(2.0*uInnerH);
    if(iuv.x>0.0&&iuv.x<1.0&&iuv.y>0.0&&iuv.y<1.0){
      float ie=smoothstep(0.0, 0.08, min(min(iuv.x,1.0-iuv.x), min(iuv.y,1.0-iuv.y)));
      sat=mix(sat, texture2D(uSatInner, iuv).rgb, ie);
    }
  }
  float d=distance(vW,uCamPos);
  // vegetation estimate from the summer aerial/satellite image
  float veg=smoothstep(0.004,0.032,sat.g-max(sat.r,sat.b)*0.96)*smoothstep(0.32,0.12,dot(sat,vec3(.33)));
  float n1=texture2D(uNoise,vW.xz*0.021).r, n2=texture2D(uNoise,vW.xz*0.37).g, n3=texture2D(uNoise,vW.xz*0.0031).b;
  vec3 alb=sat;
  // seasonal vegetation tint
  vec3 autumn=mix(vec3(0.30,0.17,0.035),vec3(0.24,0.085,0.03),n3)*(0.7+0.6*n1);
  vec3 bare=vec3(0.115,0.095,0.075)*(0.75+0.5*n1);
  vec3 fresh=vec3(0.16,0.24,0.05)*(0.8+0.4*n1);
  vec3 vg=alb*(0.84+0.32*n1);
  vg=mix(vg,fresh,uFresh*0.58);
  vg=mix(vg,autumn,clamp(uAutumn*1.5-n3*0.5,0.0,1.0)*0.88);
  vg=mix(bare,vg,max(uLeaf,0.24*step(0.60,n3)));
  alb=mix(alb,vg,veg);

  float isAsphalt=0.0;
  float g1=texture2D(uNoise,vW.xz*0.11).r, g2=texture2D(uNoise,vW.xz*1.7).g, g3=texture2D(uNoise,vW.xz*6.0).b;

  // Crisp vector roads, sidewalks, crosswalks, park trails & sports pitches (RGBA roadpaint.png)
  if(uIsFar<0.5 && uPaintH>1.0){
    vec2 puv=(vW.xz+uPaintH)/(2.0*uPaintH);
    if(puv.x>0.002&&puv.x<0.998&&puv.y>0.002&&puv.y<0.998){
      vec4 pt=texture2D(uPaint,puv);
      float pe=smoothstep(0.0,0.025,min(min(puv.x,1.0-puv.x),min(puv.y,1.0-puv.y)))*pt.a;
      if(pe>0.002){
        float lumP=dot(pt.rgb,vec3(0.3,0.59,0.11));
        float satP=max(pt.r,max(pt.g,pt.b))-min(pt.r,min(pt.g,pt.b));
        float asph=step(satP,0.025)*step(lumP,0.12);
        float greenP=step(pt.r*1.12,pt.g)*step(pt.b*1.08,pt.g);
        float paveP=(1.0-asph)*(1.0-greenP)*step(satP,0.06)*step(0.12,lumP)*step(lumP,0.55);
        // Micro-detail: asphalt grain + tire wear, paving block joints, turf blades
        vec3 pc=pt.rgb;
        if(asph>0.5){
          pc=pc*(0.84+0.30*g2)*(1.0-0.14*smoothstep(0.45,0.72,g1));
          isAsphalt=max(isAsphalt, pe);
        } else if(greenP>0.5){
          pc=pc*(0.80+0.40*g3)*(0.88+0.24*g1);
        } else {
          vec2 tb=vW.xz/vec2(0.55,0.28); tb.x+=0.5*floor(tb.y); float tid=hash21(floor(tb)); vec2 tf=abs(fract(tb)-0.5);
          float joint=smoothstep(0.5,0.45,max(tf.x,tf.y)), nearK=smoothstep(140.0,35.0,d)*paveP;
          pc=pc*(0.89+0.20*g2)*mix(1.0,(0.92+0.16*tid)*mix(0.84,1.0,joint),nearK);
        }
        alb=mix(alb,pc,pe);
        veg*=1.0-pe*(1.0-greenP*0.3);
      }
    }
  }

  // Painted complex detail (site paving, lawns, playgrounds, water basins, parking lots)
  vec2 duv=(vW.xz+uDetH)/(2.0*uDetH);
  if(uIsFar<0.5 && duv.x>0.0&&duv.x<1.0&&duv.y>0.0&&duv.y<1.0){
    vec4 det=texture2D(uDetail,duv);
    float edge=smoothstep(0.0,0.03,min(min(duv.x,1.0-duv.x),min(duv.y,1.0-duv.y)))*det.a;
    if(edge>0.002){
      float isGreen=step(det.r*1.08,det.g)*step(det.b,det.g);
      float isWater=step(det.r*1.25,det.b)*step(det.r*1.15,det.g);
      vec2 tb=vW.xz/vec2(0.6,0.3); tb.x+=0.5*floor(tb.y); float tid=hash21(floor(tb)); vec2 tf=abs(fract(tb)-0.5);
      float joint=smoothstep(0.5,0.45,max(tf.x,tf.y)), nearK=smoothstep(150.0,35.0,d)*step(0.14,dot(det.rgb,vec3(.33)))*(1.0-isWater);
      vec3 hard=det.rgb*(0.88+0.20*g2)*(1.0-0.12*smoothstep(0.48,0.72,g1))*mix(1.0,(0.91+0.18*tid)*mix(0.82,1.0,joint),nearK);
      vec3 grass=mix(vec3(0.042,0.068,0.022),vec3(0.088,0.122,0.040),g1*0.55+g2*0.45)*(0.76+0.48*g3)*(0.74+1.4*det.g);
      grass=mix(grass,vec3(0.13,0.12,0.06),smoothstep(0.64,0.82,g1*0.5+n1*0.5)*0.4);
      vec3 tan=vec3(0.28,0.23,0.13)*(0.82+0.36*n2);
      grass=mix(tan,grass,uGrass);
      vec3 dc=mix(hard,grass,isGreen);
      alb=mix(alb,dc,edge);
      veg*=1.0-edge*(1.0-isGreen);
    }
  }

  alb*=0.91+0.18*n2*smoothstep(900.0,60.0,d);
  float sn=uSnow*smoothstep(0.55,0.8,vN.y)*(0.82+0.18*n1);
  alb=mix(alb,vec3(0.86,0.89,0.94),sn*mix(0.95,0.72,veg));
  alb=mix(alb,alb*0.55,uWet*(1.0-veg));
  vec3 Nn=normalize(vN);
  float sh=shadowAt(vW,0.0011);
  vec3 col=lit(alb,Nn,sh,1.0);
  // Subtle wet road & damp paving sky reflections
  if(uWet>0.01 && isAsphalt>0.1){
    vec3 V=normalize(uCamPos-vW); vec3 R=reflect(-V,Nn);
    float fr=0.04+0.96*pow(1.0-max(dot(V,Nn),0.0),5.0);
    col+=sampleSky(R)*fr*uWet*isAsphalt*0.55;
  }
  // Night street glow (smooth +-2048m high-res map)
  if(uNight>0.001){
    if(uIsFar<0.5){
      vec2 nuv=(vW.xz+2048.0)/4096.0;
      if(nuv.x>0.0&&nuv.x<1.0&&nuv.y>0.0&&nuv.y<1.0){
        float ne=smoothstep(0.0,0.06,min(min(nuv.x,1.0-nuv.x),min(nuv.y,1.0-nuv.y)));
        vec3 nm=texture2D(uNightMap,nuv).rgb; col+=nm*uNight*ne*${(LAMP * 0.42).toFixed(5)};
      }
    } else {
      float built=(1.0-veg)*smoothstep(0.10,0.22,dot(sat,vec3(.33)));
      float sp=step(0.83,texture2D(uNoise,vW.xz*0.0029).r*0.6+texture2D(uNoise,vW.xz*0.017).g*0.5);
      col+=vec3(1.0,0.72,0.42)*built*(0.25+2.2*sp)*uNight*${(LAMP * 0.30).toFixed(5)};
    }
  }
  gl_FragColor=vec4(col,1.0);
}`;

function buildTerrain(satN, satF, detail, nightMap, paint, satInner) {
  const grp = new THREE.Group();
  const mk = (H, N, dem, seg, tex, far) => {
    const geo = new THREE.BufferGeometry(); const n = seg + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), nor = new Float32Array(n * n * 3);
    const hAt = (x, z) => {
      const fx = (x + H) / (2 * H) * N - 0.5, fz = (z + H) / (2 * H) * N - 0.5;
      const i = clamp(Math.floor(fx), 0, N - 2), j = clamp(Math.floor(fz), 0, N - 2), a = clamp(fx - i, 0, 1), b = clamp(fz - j, 0, 1);
      return lerp(lerp(dem[j * N + i], dem[j * N + i + 1], a), lerp(dem[(j + 1) * N + i], dem[(j + 1) * N + i + 1], a), b) * 0.1;
    };
    (WORLD.hFns = WORLD.hFns || []).push({ H, hAt }); WORLD.hFns.sort((p, q) => p.H - q.H);
    const e = 2 * H / seg;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -H + i * e, z = -H + j * e, k = j * n + i; let y = hAt(x, z);
      if (far) { const d2 = x * x + z * z; y -= d2 / (2 * 6360000) + (Math.max(Math.abs(x), Math.abs(z)) < W.HN ? 6 : 0); }
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = i / seg; uv[k * 2 + 1] = j / seg;
      const sx = hAt(x + e, z) - hAt(x - e, z), sz = hAt(x, z + e) - hAt(x, z - e); const l = Math.hypot(sx, 2 * e, sz);
      nor[k * 3] = -sx / l; nor[k * 3 + 1] = 2 * e / l; nor[k * 3 + 2] = -sz / l;
    }
    const idx = new Uint32Array(seg * seg * 6); let q = 0;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    tex.flipY = false; tex.needsUpdate = true;
    const paintH = W.paintH || 640;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uSat: { value: tex }, uSatInner: { value: satInner || tex }, uInnerH: { value: satInner ? 900 : 0 }, uDetail: { value: detail }, uNightMap: { value: nightMap }, uHalf: { value: H }, uIsFar: { value: far ? 1 : 0 }, uDetH: { value: DET_H }, uPaint: { value: paint || detail }, uPaintH: { value: paint ? paintH : 0 }, uNearH: { value: W.HN } },
      vertexShader: `varying vec3 vW; varying vec3 vN; varying vec2 vUv; void main(){ vW=position; vN=normal; vUv=uv; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`,
      fragmentShader: TERRAIN_FS,
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
  };
  grp.add(mk(W.HF, W.NF, demF, 256, satF, true));
  const near = mk(W.HN, W.NN, demN, 400, satN, false); grp.add(near);
  WORLD.terrain = near;
  return grp;
}

// ───── buildings: high-detail procedural PBR-inspired facades with true Sky-LUT reflections
const FACADE_FS = /* glsl */`
precision highp float;
${GLSL_COMMON}
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec4 vB; // seed, kind(+16 roof), height, edge length
vec3 skyRefl(vec3 r){
  vec3 rd=vec3(r.x, max(r.y, 0.015), r.z);
  return sampleSky(rd);
}
void main(){
  float seed=floor(vB.x*4096.0+0.5)/4096.0, kind=floor(mod(vB.y,16.0)+0.5), H=vB.z, len=abs(vB.w); bool blank=vB.w<0.0; bool roof=vB.y>=15.5;
  vec3 n=normalize(vN); vec3 V=normalize(uCamPos-vW);
  vec3 h3=hash32(vec2(seed*91.7,seed*13.1+kind));
  vec3 alb; vec3 emit=vec3(0.0); float spec=0.0;
  float sh=shadowAt(vW+n*0.35,0.0014);
  if(roof){
    vec3 green=vec3(0.125,0.225,0.165), grey=vec3(0.38,0.385,0.38), conc=vec3(0.54,0.53,0.50), blue=vec3(0.20,0.30,0.48), warm=vec3(0.46,0.44,0.41);
    alb = kind<0.5 ? (h3.x<0.36?green:(h3.x<0.74?grey:conc))
        : (kind<1.5? mix(grey,conc,h3.y)
        : (kind<2.5? warm
        : (kind<3.5? (h3.x<0.5?blue:grey)
        : (kind<4.5? mix(green,grey,0.45) : vec3(0.66,0.655,0.64)))));
    alb*=0.84+0.32*texture2D(uNoise,vW.xz*0.05).r;
    if(kind>4.5&&kind<5.5){
      alb=vec3(0.64,0.635,0.62)*(0.88+0.24*texture2D(uNoise,vW.xz*0.04).r);
      vec2 g=abs(fract(vW.xz/3.0)-0.5); alb*=mix(0.92,1.0,smoothstep(0.0,0.014,min(0.5-g.x,0.5-g.y)));
    }
    if(kind>5.5&&kind<6.5){ // sleek dark architectural photovoltaic panels
      vec2 q=vUv/vec2(1.0,1.75); vec2 f=fract(q); float fr=step(f.x,0.028)+step(0.972,f.x)+step(f.y,0.016)+step(0.984,f.y);
      vec2 cf=fract(vUv/0.166); float cell=smoothstep(0.0,0.06,cf.x)*smoothstep(0.0,0.06,cf.y);
      alb=mix(vec3(0.016,0.022,0.036),vec3(0.026,0.038,0.062),cell);
      alb=mix(alb,vec3(0.24,0.26,0.29),clamp(fr,0.0,1.0)*(1.0-smoothstep(0.2,0.6,fwidth(q.x))));
      vec3 Rr=reflect(-V,n); float F=0.05+0.95*pow(1.0-max(dot(V,n),0.0),5.0);
      vec3 colp=lit(alb,n,sh,1.0)+skyRefl(Rr)*F*0.65+uLCol*pow(max(dot(Rr,uLDir),0.0),280.0)*4.5*sh*uCloudShade;
      colp=mix(colp,lit(vec3(0.88,0.91,0.95),n,sh,1.0),uSnow*0.9); gl_FragColor=vec4(colp,1.0); return;
    }
    if(kind>6.5){ alb=vec3(0.84,0.835,0.815); }
    alb=mix(alb,vec3(0.88,0.91,0.95),uSnow*0.96);
  } else {
    float u=vUv.x, v=vUv.y; bool isCent=(kind>4.5&&kind<5.5)||(kind>7.5); if(isCent) v-=1.4;
    float fh = kind<0.5?3.0 : kind<1.5?2.88 : kind<2.5?3.7 : kind<3.5?5.0 : kind<4.5?3.5 : 3.0;
    float bwT= kind<0.5?2.7 : kind<1.5?(H>55.0?3.2:3.5) : kind<2.5?1.8 : kind<3.5?6.0 : kind<4.5?2.8 : 3.55;
    float nb=max(1.0,floor(len/bwT+0.5)); float bw=len/nb;
    vec2 cell=vec2(floor(u/bw),floor(v/fh)); vec2 f=vec2(fract(u/bw),fract(v/fh));
    float ch=hash21(cell+seed*57.0), ch2=hash21(cell*1.7+seed*11.0+3.0);
    vec3 wall;
    if(kind<0.5){ // Korean neighborhood villas & commercial low-rise: warm brick, limestone, slate stone, stucco
      wall = h3.x<0.28?vec3(0.42,0.20,0.14): h3.x<0.54?vec3(0.64,0.58,0.48): h3.x<0.78?vec3(0.44,0.45,0.47):vec3(0.76,0.74,0.70);
    } else if(kind<1.5){ // Korean apartments (cohesive per complex!)
      bool modern = H > 55.0; // Gwanggyo high-rise towers (중흥S클래스, 더샵, 힐스테이트, 자이)
      if(modern){
        wall = h3.x<0.33?vec3(0.78,0.77,0.74) : h3.x<0.66?vec3(0.72,0.73,0.75) : vec3(0.82,0.80,0.76);
      } else {
        wall = mix(vec3(0.72,0.69,0.63),vec3(0.83,0.81,0.77),h3.y);
      }
    } else if(kind<2.5){ // Commercial / Hospital / Galleria / Office
      wall = h3.x<0.5 ? vec3(0.48,0.50,0.54) : vec3(0.68,0.65,0.60);
    } else if(kind<3.5){
      wall = mix(vec3(0.56,0.58,0.61),vec3(0.36,0.45,0.58),step(0.6,h3.x));
    } else if(kind<4.5){ // Schools & Public Institutions (소화초, 국토지리정보원, 지도박물관, 원천중, 아주대)
      wall = h3.x<0.42 ? vec3(0.56,0.34,0.24) : vec3(0.78,0.76,0.71);
    } else {
      wall = vec3(0.895,0.892,0.875);
    }
    wall*=0.92+0.16*h3.z;
    float win=0.0; float gable=0.0; float sideWinMask=0.0;
    vec2 w0,w1;
    if(kind<0.5){
      w0=vec2(0.20,0.28); w1=vec2(0.80,0.76); win=step(0.25,ch);
      if(v<fh*1.05){ // Ground floor neighborhood shopfront glazing + awning band
        w0=vec2(0.06,0.06); w1=vec2(0.94,0.82); win=step(0.2,h3.y);
        if(f.y>0.82){ vec3 sc=hash32(vec2(floor(u/4.5)+seed*5.0,1.0)); wall=mix(wall,0.18+0.70*sc,0.8); if(uNight>0.0) emit+=wall*uNight*(1.0-uLate*0.6)*${(LAMP * 1.4).toFixed(5)}; }
      }
    } else if(kind<1.5){
      bool modern = H > 55.0;
      if(len<12.5){ gable=1.0; } else { w0=modern?vec2(0.06,0.18):vec2(0.08,0.26); w1=modern?vec2(0.94,0.88):vec2(0.92,0.84); win=1.0; }
      vec3 acc = modern
        ? (h3.x<0.33?vec3(0.16,0.20,0.28) : h3.x<0.66?vec3(0.24,0.23,0.25) : vec3(0.30,0.26,0.22))
        : (h3.x<0.33?vec3(0.30,0.36,0.46) : h3.x<0.66?vec3(0.48,0.34,0.24) : vec3(0.30,0.42,0.38));
      float band=step(u,bw*0.55)+step(len-bw*0.55,u)+step(H-fh*1.8,v)*0.75;
      wall=mix(wall,acc,clamp(band,0.0,1.0)*0.78);
      if(modern && !bool(gable)){
        wall=mix(wall,acc*0.85,step(0.10,f.x)*step(f.x,0.90)*0.55);
      }
      if(gable>0.5){
        float q=fract(u/len);
        wall=mix(wall,acc,step(0.32,q)*step(q,0.68)*0.65);
        wall=mix(wall,wall*1.12,step(0.48,q)*step(q,0.52)*0.5);
      }
      if(v<fh*2.0) wall=mix(vec3(0.34,0.33,0.32),wall,0.25);
    } else if(kind<2.5){
      w0=vec2(0.04,0.16); w1=vec2(0.96,0.90); win=1.0;
      if(v<fh*3.2 && f.y<0.22){
        vec3 sc=hash32(vec2(floor(u/5.5)+seed*3.0,cell.y));
        wall=mix(wall,0.16+0.78*sc*sc,0.82*step(0.28,sc.x));
        if(uNight>0.0) emit+=wall*uNight*(1.0-uLate*0.65)*${(LAMP * 1.5).toFixed(5)}*step(0.28,sc.x);
      }
    } else if(kind<3.5){ w0=vec2(0.2,0.52); w1=vec2(0.8,0.82); win=step(0.55,ch); }
    else if(kind<4.5){ // Korean schools & public institutions (소화초, 국토지리정보원, 지도박물관)
      w0=vec2(0.06,0.30); w1=vec2(0.94,0.82); win=1.0;
      if(f.y<0.28) wall=mix(wall,vec3(0.80,0.78,0.74),0.45);
      if(len<10.5){ gable=1.0; wall*=0.95; }
    } else if(kind>6.5 && kind<7.5){ wall=vec3(0.86,0.855,0.84); gable=1.0; }
    else {
      // ── 광교 자연앤 센트레빌 (100% faithful to official visual8.jpg, visual9.jpg, site-plan1.jpg & unit plans 84A/B/C, 59A/B/C/D!)
      // Linear-calibrated luxury monochrome palette: bright warm-white pilasters, deep charcoal/navy curtain-wall glazing strips & mid-light ashlar granite 1-2F podium!
      vec3 navy=vec3(0.028,0.038,0.058), darkSlate=vec3(0.058,0.066,0.080), midGrey=vec3(0.20,0.215,0.235), warmWhite=vec3(0.86,0.855,0.835), lightStone=vec3(0.32,0.32,0.312);
      wall=warmWhite;
      float fwx=fwidth(u/bw);
      if(kind>9.5){
        // kind 10: Signature full-height fluted dark-navy feature wall with 5 crisp vertical white pinstripes + integrated architectural line-art C-spiral relief (sp2_vista & visual8!)
        float q=u/len;
        float flute=step(0.06,q)*step(q,0.94);
        float rib=0.5+0.5*sin(u*14.0);
        float fwq=fwidth(q);
        float strip=smoothstep(0.015+fwq,0.008,abs(q-0.20))+smoothstep(0.015+fwq,0.008,abs(q-0.35))+smoothstep(0.015+fwq,0.008,abs(q-0.50))+smoothstep(0.015+fwq,0.008,abs(q-0.65))+smoothstep(0.015+fwq,0.008,abs(q-0.80));
        wall=mix(warmWhite, mix(navy, darkSlate, rib*0.42), flute);
        // Architectural illuminated white nested L/C-frame line-art relief woven seamlessly into the vertical stripes at 3F-7F (v = 9..22m, matching sp2_vista.jpg!)
        float cv = (v - 9.0) / 13.0;
        float cu = (q - 0.12) / 0.76;
        if(cv > 0.0 && cv < 1.0 && cu > 0.0 && cu < 1.0){
          float b1 = max(abs(cu - 0.5)*2.0, abs(cv - 0.5)*2.0);
          float r1 = step(0.86, b1) * step(b1, 0.98) * step(0.10, cv);
          float r2 = step(0.58, b1) * step(b1, 0.70) * step(0.18, cv);
          float r3 = step(0.30, b1) * step(b1, 0.42) * step(0.26, cv);
          // Open top/left side like sp2_vista's geometric nested corner graphic
          float openMask = 1.0 - step(0.86, cv) * step(cu, 0.82);
          float motif = clamp((r1 + r2 + r3) * openMask, 0.0, 1.0);
          wall = mix(wall, warmWhite, motif);
          if(motif > 0.5) emit += vec3(1.0, 0.94, 0.82) * (0.14 + 0.86 * uNight) * ${(LAMP * 2.6).toFixed(5)};
          strip *= 0.12;
        }
        wall=mix(wall, warmWhite, clamp(strip,0.0,1.0)*(1.0-smoothstep(0.06,0.22,fwq)));
        gable=1.0;
      } else if(kind>8.5){
        // kind 9: End-unit side wall WITH exact floor-plan side window column (1703동 1702호 NE wall z=6.25..6.88 + 1702/1707/84B/59B end walls!)
        // Styled cleanly like sp2_vista 1702동 & sp5_growing 1707동: crisp bright warm-white concrete paired with a sleek deep-charcoal vertical window accent band!
        float q=u/len;
        float wc = blank ? 0.635 : 0.360;
        float wh = clamp(0.44 / max(len, 4.0), 0.038, 0.085);
        float accW = wh * 3.1;
        float inBand = smoothstep(wc - accW - 0.010, wc - accW + 0.010, q) * smoothstep(wc + accW + 0.010, wc + accW - 0.010, q);
        wall = mix(warmWhite, darkSlate, inBand * 0.96);
        // Subtle crisp architectural panel joint lines on warm-white & charcoal cladding
        wall *= 1.0 - 0.04 * smoothstep(0.010, 0.0, abs(fract(u/2.4) - 0.5));
        float fwU = fwidth(u), fwV = fwidth(v/fh);
        float wx0 = (wc - wh) * len, wx1 = (wc + wh) * len;
        float wy0 = 0.317, wy1 = 0.700; // exact 0.95m..2.10m per 3.0m floor!
        float smx = smoothstep(wx0 - fwU, wx0 + fwU, u) * smoothstep(wx1 + fwU, wx1 - fwU, u);
        float smy = smoothstep(wy0 - fwV, wy0 + fwV, f.y) * smoothstep(wy1 + fwV, wy1 - fwV, f.y);
        sideWinMask = smx * smy;
        w0 = vec2(0.0, wy0); w1 = vec2(1.0, wy1);
        f.x = clamp((u - wx0) / max(wx1 - wx0, 0.1), 0.0, 1.0);
        bw = max(wx1 - wx0, 0.5);
        win = 1.0;
        gable = 1.0 - step(0.001, sideWinMask);
      } else if(kind>7.5){
        // kind 8: Rear / courtyard elevations (sp2_vista 1702동 & sp5_growing 1707동!): smooth warm-white panels + bold deep-charcoal stair/utility vertical core bands!
        float mid=floor(nb*0.5);
        float colh=hash21(vec2(cell.x*5.3+1.0,seed*29.0));
        if(nb>2.5 && abs(cell.x-mid)<0.6){
          w0=vec2(0.24,0.26); w1=vec2(0.76,0.76); win=1.0;
          wall=mix(warmWhite, darkSlate, smoothstep(0.04-fwx,0.04+fwx,f.x)*smoothstep(0.96+fwx,0.96-fwx,f.x));
        } else if(colh>0.24){
          w0=vec2(0.22,0.32); w1=vec2(0.78,0.74); win=1.0;
          float inb=smoothstep(0.10-fwx,0.10+fwx,f.x)*smoothstep(0.90+fwx,0.90-fwx,f.x);
          wall=mix(warmWhite, mix(midGrey, darkSlate, 0.85), inb*step(0.40,colh));
        } else {
          gable=1.0;
          wall=mix(warmWhite, vec3(0.78,0.775,0.76), step(0.45,f.x)*step(f.x,0.55));
        }
      } else {
        // kind 5: Main Living/Bedroom Curtain-Wall-Look Front (1:1 match to sp1_maingate, visual8, visual9!)
        // Crisp bright warm-white vertical pilasters framing continuous floor-to-floor deep charcoal/navy curtain-wall glazing strips!
        bool endPier = (len > 11.0) && (u < 1.35 || u > len - 1.35);
        bool midPier = (len > 18.0) && abs(u - len * 0.5) < 0.72;
        if(endPier || midPier){
          wall = warmWhite; gable = 1.0;
          wall *= 1.0 - 0.035 * smoothstep(0.025, 0.0, abs(f.y - 0.03));
        } else {
          bool wideBay = mod(cell.x, 3.0) < 0.5;
          w0 = wideBay ? vec2(0.10, 0.14) : vec2(0.14, 0.24);
          w1 = wideBay ? vec2(0.90, 0.88) : vec2(0.86, 0.86);
          win = 1.0;
          // Continuous floor-to-floor deep charcoal/navy vertical glazing strip (ZERO white horizontal bars!)
          float padX = wideBay ? 0.075 : 0.115;
          float inb = smoothstep(padX - fwx, padX + fwx, f.x) * smoothstep(1.0 - padX + fwx, 1.0 - padX - fwx, f.x);
          vec3 spandrel = wideBay ? navy : darkSlate;
          wall = mix(warmWhite, spandrel, inb);
          // Slim crisp metallic glass-balustrade rail (유리난간) across window bottom
          float rail = inb * step(0.36, f.y) * step(f.y, 0.382) * (1.0 - smoothstep(0.03, 0.12, fwidth(v/fh)));
          wall = mix(wall, vec3(0.68, 0.71, 0.74), rail);
          // Subtle dark metallic slab mullion hairline
          wall = mix(wall, vec3(0.14, 0.15, 0.17), inb * step(f.y, 0.035) * (1.0 - smoothstep(0.04, 0.14, fwidth(v/fh))));
        }
      }
      // 1F-2F Light Warm-Grey Ashlar Granite Stone Podium Cladding (exact match to sp1_maingate & sp3_connect!)
      if(v<fh*2.05){
        float ashlar=smoothstep(0.02,0.06,fract(v*1.4))*smoothstep(0.015,0.045,fract(u*0.75+0.5*floor(v*1.4)));
        vec3 baseStone = v < fh * 0.45 ? vec3(0.16, 0.165, 0.175) : lightStone;
        wall=baseStone*(0.92+0.16*texture2D(uNoise,vec2(u,v)*0.22).r)*mix(0.74,1.0,ashlar);
        if(kind>8.5 && kind<9.5){ win=0.0; gable=1.0; sideWinMask=0.0; }
        if(kind<5.5 && (cell.x<0.5 || cell.x>nb-1.5) && hash21(vec2(seed*17.0,cell.x))>0.35){
          float opening=step(0.16,f.x)*step(f.x,0.84)*step(v,fh*1.92);
          wall=mix(wall, vec3(0.04,0.045,0.055), opening);
          if(opening>0.5){ win=0.0; gable=1.0; if(uNight>0.0) emit+=vec3(1.0,0.84,0.58)*uNight*${(LAMP * 0.75).toFixed(5)}*smoothstep(0.4,1.9,v/fh); }
        }
      }
      // Crisp white architectural roof parapet fascia & dark metal coping
      if(v>H-2.05||v<0.0){ wall=warmWhite; win=0.0; gable=1.0; sideWinMask=0.0; }
      float big=texture2D(uNoise,vec2(u*0.031+seed*3.0,v*0.017)).g;
      if(v>=fh*2.05) wall*=mix(vec3(0.97,0.968,0.96),vec3(1.02,1.02,1.01),big);
      if(v>H-0.16) wall=vec3(0.24,0.26,0.29);
    }
    if(v<fh && kind<4.5){ wall*=0.78; }
    if(v>H-0.55 && kind<4.5) wall*=0.88;
    float streak=texture2D(uNoise,vec2(u*0.9+seed*7.0,v*0.035)).r;
    wall*=mix(1.0,0.90+0.10*streak,isCent?0.35:0.85);
    wall*=1.0-0.07*smoothstep(0.035,0.0,abs(f.y-0.02))*(1.0-smoothstep(0.1,0.4,fwidth(v/fh)));

    vec2 fw=vec2(fwidth(u/bw),fwidth(v/fh));
    float mx=smoothstep(w0.x-fw.x,w0.x+fw.x,f.x)*smoothstep(w1.x+fw.x,w1.x-fw.x,f.x);
    float my=smoothstep(w0.y-fw.y,w0.y+fw.y,f.y)*smoothstep(w1.y+fw.y,w1.y-fw.y,f.y);
    float m=(kind>8.5 && kind<9.5) ? sideWinMask : (mx*my*win*(1.0-gable));
    float cover=(kind>8.5 && kind<9.5) ? sideWinMask : ((w1.x-w0.x)*(w1.y-w0.y)*win*(1.0-gable));
    float lod=smoothstep(0.35,0.9,max(fw.x,fw.y));
    if(kind<8.5 || kind>9.5) m=mix(m,cover,lod);

    vec3 R=reflect(-V,n); float fr=0.06+0.94*pow(1.0-max(dot(V,n),0.0),5.0);
    float curtainF=step(0.60,ch2);
    vec3 skyR=skyRefl(R);
    vec3 glassFar=skyR*(0.16+0.68*fr)*(isCent?1.42:(kind==2.0?1.35:1.0));
    glassFar=mix(glassFar,vec3(0.58,0.56,0.53)*ambient(n)*0.85+glassFar*0.35,curtainF*0.65*(1.0-lod));
    float sunSpec=pow(max(dot(R,uLDir),0.0),450.0)*36.0*sh*uCloudShade;
    vec3 wallLit=lit(wall,n,sh,mix(0.75,1.0,smoothstep(0.0,14.0,v)));

    float resid=(kind<1.5||isCent)?1.0:0.0;
    float pOn=mix(mix(0.52,0.08,uLate),mix(0.72,0.05,uLate),1.0-resid)*uNight;
    float on=step(1.0-pOn,ch)*step(0.001,uNight);
    vec3 lc=mix(vec3(1.0,0.75,0.45),vec3(0.92,0.96,1.0),step(0.45,ch2))*(0.55+0.95*ch2);
    vec3 opening=glassFar;
    if(lod<0.98 && m>0.001){
      vec3 T=vec3(-n.z,0.0,n.x); vec3 rd=-V; vec3 d=vec3(dot(rd,T),rd.y,max(-dot(rd,n),0.04));
      vec2 gsz=(w1-w0)*vec2(bw,fh); vec2 gp=(f-w0)*vec2(bw,fh)+d.xy/d.z*(kind>8.5&&kind<9.5?0.24:0.18);
      float sunIn=max(dot(uLDir,n),0.0)*sh*uCloudShade;
      if(gp.x<0.0||gp.x>gsz.x||gp.y<0.0||gp.y>gsz.y){
        bool sill=gp.y<0.0; vec3 rn=sill?vec3(0.0,1.0,0.0):n;
        vec3 rc=(isCent?vec3(0.24,0.26,0.30):wall*0.88);
        rc=mix(rc,vec3(0.88,0.91,0.95),sill?uSnow*0.9:0.0);
        opening=lit(rc,rn,sh*(sill?1.0:0.35),sill?0.82:0.48);
      } else {
        vec2 g=gp/gsz;
        float nx = (kind>8.5&&kind<9.5)?2.0:(isCent?3.0:(kind<0.5?2.0:(kind<2.5&&kind>1.5?1.0:4.0)));
        float fx=abs(fract(g.x*nx+0.5)-0.5)*gsz.x/nx;
        float pxm=max(fwidth(u),fwidth(v)), fine=1.0-smoothstep(0.035,0.10,pxm);
        float bar=step(fx,0.032)+step(min(g.x,1.0-g.x)*gsz.x,0.045)+step(min(g.y,1.0-g.y)*gsz.y,0.045);
        if(kind<5.5 && (isCent||kind<1.5)) bar+=step(abs(g.y*gsz.y-1.08),0.028);
        bar*=fine;
        float headSh=step((1.0-g.y)*gsz.y, 0.18*uLDir.y/max(dot(uLDir,n),0.06));
        float sunG=sunIn*(1.0-headSh);
        float D=3.4+2.2*ch, cy=fh-0.30; vec3 p=vec3(f.x*bw+d.x/d.z*0.18,clamp(f.y*fh+d.y/d.z*0.18,0.02,cy-0.02),0.0);
        vec3 tt=vec3(d.x>0.0?(bw-p.x)/d.x:-p.x/min(d.x,-1e-4), d.y>0.0?(cy-p.y)/d.y:-p.y/min(d.y,-1e-4), D/d.z);
        float t=min(tt.x,min(tt.y,tt.z)); vec3 hp=p+d*t;
        vec3 ic; float lampK=1.0;
        vec3 tint=mix(vec3(0.84,0.80,0.74),vec3(0.75,0.77,0.80),ch2*0.45);
        if(t==tt.z){ ic=tint; float fu=hash21(cell*3.1+seed); if(hp.y<0.75+0.9*fu && abs(hp.x/bw-0.5)<0.18+0.25*fu) ic=mix(vec3(0.14,0.12,0.11),vec3(0.32,0.28,0.24),fu*0.5); }
        else if(t==tt.y){ if(d.y>0.0){ ic=vec3(0.85); lampK=1.5; } else { ic=vec3(0.40,0.31,0.21); lampK=0.8; } }
        else ic=tint*0.92;
        float fall=exp(-hp.z*0.42);
        vec3 inter=ic*ambient(n)*(0.12+0.40*fall);
        if(t==tt.y && d.y<=0.0) inter+=ic*uLCol*sunG*0.32*smoothstep(1.6,0.2,hp.z*max(uLDir.y,0.15)/max(dot(uLDir,n),0.15)*0.5);
        inter+=ic*lc*on*lampK*${(LAMP * 1.3).toFixed(5)};
        float open=curtainF>0.5? 0.15+0.5*hash21(cell+seed*3.0) : 1.0;
        float cz=step(open*0.5,abs(g.x-0.5));
        float fold=mix(0.91,0.82+0.18*sin((f.x*bw)*42.0+seed*20.0),fine);
        vec3 cur=vec3(0.80,0.78,0.74)*fold*(ambient(n)*0.58+uLCol*sunG*0.44)+vec3(0.62,0.58,0.52)*lc*on*${(LAMP * 0.78).toFixed(5)};
        if((kind>1.5&&kind<3.5) || (kind>8.5&&kind<9.5)) cz=0.0;
        inter=mix(inter,cur,cz*0.88);
        float F=0.08+0.92*pow(1.0-max(dot(V,n),0.0),5.0);
        vec3 tintG = (isCent || (kind==1.0 && H>55.0) || kind==2.0) ? vec3(0.86,0.93,1.02) : vec3(0.96,0.98,1.0);
        vec3 gl=inter*(1.0-F)*0.80+skyR*tintG*F*0.95+uLCol*sunSpec*0.025;
        vec3 frame=lit(isCent?vec3(0.10,0.11,0.13):(kind<1.5?vec3(0.76):wall*0.55),n,sh*(1.0-headSh),0.82);
        opening=mix(gl,frame,clamp(bar,0.0,1.0)*(1.0-lod));
      }
      opening=mix(opening,glassFar,lod);
    }
    vec3 col=mix(wallLit,opening,m);
    if(uNight>0.001){
      col+=lc*pOn*cover*lod*${LAMP.toFixed(5)};
      col+=emit;
      col+=wall*vec3(1.0,0.64,0.32)*uNight*${(LAMP * 0.11).toFixed(5)}*smoothstep(9.0,0.0,v);
    }
    gl_FragColor=vec4(col,1.0); return;
  }
  vec3 col=lit(alb,n,sh,1.0);
  vec3 R=reflect(-V,n); col+=uLCol*spec*pow(max(dot(R,uLDir),0.0),200.0)*2.0*sh;
  gl_FragColor=vec4(col,1.0);
}`;
const FACADE_VS = /* glsl */`
attribute vec4 aB; varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec4 vB;
void main(){ vW=position; vN=normal; vUv=uv; vB=aB; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`;
const DEPTH_VS = `void main(){ gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`;
const DEPTH_FS = `void main(){ gl_FragColor=vec4(1.0); }`;

class GeoBuf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.b = []; this.i = []; this.nv = 0; }
  wall(x0, z0, x1, z1, y0, y1, seed, kind, H, u0 = 0, lenOverride) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) return;
    const nx = dz / L, nz = -dx / L, len = lenOverride || L;
    this.p.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
    for (let k = 0; k < 4; k++) { this.n.push(nx, 0, nz); this.b.push(seed, kind, H, len); }
    this.uv.push(u0, 0, u0 + L, 0, u0 + L, y1 - y0, u0, y1 - y0);
    const v = this.nv; this.i.push(v, v + 2, v + 1, v, v + 3, v + 2); this.nv += 4;
  }
  roof(pts, y, seed, kind, H) {
    const c = pts.map(p => new THREE.Vector2(p[0], p[1])); let tri;
    try { tri = THREE.ShapeUtils.triangulateShape(c, []); } catch (e) { return; }
    const v = this.nv; for (const p of pts) { this.p.push(p[0], y, p[1]); this.n.push(0, 1, 0); this.uv.push(p[0], p[1]); this.b.push(seed, kind + 16, H, 0); }
    for (const t of tri) this.i.push(v + t[0], v + t[2], v + t[1]); this.nv += pts.length;
  }
  prism(pts, y0, y1, seed, kind, H) {
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.wall(a[0], a[1], b[0], b[1], y0, y1, seed, kind, H); }
    this.roof(pts, y1, seed, kind, H);
  }
  // Roof with recessed roof slab + 3D parapet inner rim so nearby buildings never look paper-flat!
  prismParapet(pts, y0, y1, seed, kind, H, pH = 0.85) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.wall(a[0], a[1], b[0], b[1], y0, y1 + pH, seed, kind, H + pH);
      this.wall(b[0], b[1], a[0], a[1], y1, y1 + pH, seed, 7, H); // inner parapet face
    }
    this.roof(pts, y1, seed, kind, H);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2)); g.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(this.b), 4));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1)); this.p = this.n = this.uv = this.b = this.i = null; return g;
  }
}
const facadeMat = () => new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: FACADE_VS, fragmentShader: FACADE_FS, extensions: { derivatives: true } });
const depthMat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, side: THREE.DoubleSide });

function buildCity() {
  const off = arr('b_off'), xy = arr('b_xy'), bh = arr('b_h'), bb = arr('b_base'), bk = arr('b_kind');
  const bc = W.idx.b_comp ? arr('b_comp') : null;
  const N = bh.length; const nearB = new GeoBuf(), farB = new GeoBuf();
  WORLD.beacons = []; // aviation obstruction lights on tall surrounding towers
  for (let i = 0; i < N; i++) {
    const pts = []; for (let v = off[i]; v < off[i + 1]; v++) pts.push([xy[v * 2] / 4, xy[v * 2 + 1] / 4]);
    if (pts.length < 3) continue;
    const d = Math.hypot(pts[0][0], pts[0][1]); const G = d < 850 ? nearB : farB;
    let y0 = bb[i] / 10 - 0.5, h = bh[i] / 10; const kind = bk[i];
    // Cohesive complex seed so every dong in the same apartment complex shares its unified architectural style!
    const compId = bc ? bc[i] : 0;
    const seed = compId > 0 ? ((compId * 0.6180339) % 1) : ((i * 0.61803) % 1);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    if (d < 1500) {
      let gmax = -1e9, gmin = 1e9;
      for (const q of pts) for (const f of [1, 0.66, 0.33, 0]) { const gy = groundY(lerp(cx, q[0], f), lerp(cz, q[1], f)); gmax = Math.max(gmax, gy); if (f === 1) gmin = Math.min(gmin, gy); }
      // Never bury hillside buildings (소화초등학교, 지도박물관, 합동신학대학원, 광교호수초, 에일린의뜰): seat roof cleanly above terrace pad while foundation extends below downhill grade!
      const origH = h;
      const gPad = lerp(gmin, gmax, 0.62);
      const yTopWant = Math.max(y0 + origH, gPad + origH);
      y0 = Math.min(y0, gmin - 1.6);
      h = Math.max(origH, yTopWant - y0);
    }
    const yTop = y0 + h + ((i * 0.13) % 0.08);
    if (d < 680 && h > 5.5) {
      G.prismParapet(pts, y0, yTop, seed, kind, h, kind === 1 ? 1.05 : 0.72);
    } else {
      G.prism(pts, y0, yTop, seed, kind, h);
    }
    if ((kind === 1 && h > 26) || (kind === 2 && h > 16) || (kind === 4 && d < 650 && h > 9)) {
      const f1 = kind === 4 ? 0.24 : 0.36, f2 = kind === 4 ? 0.28 : 0.48;
      const mH = kind === 1 && h > 55 ? 4.4 : 3.2;
      G.prism(pts.map(p => [cx + (p[0] - cx) * f1, cz + (p[1] - cz) * f2]), yTop, yTop + mH, seed, kind === 1 ? 7 : kind, mH);
    }
    if (h > 65 && d < 3500) WORLD.beacons.push(cx, yTop + 4.8, cz);
  }
  const mat = facadeMat(); const g = new THREE.Group();
  const mn = new THREE.Mesh(nearB.build(), mat), mf = new THREE.Mesh(farB.build(), mat); mn.frustumCulled = mf.frustumCulled = false;
  g.add(mn, mf); WORLD.casters.push({ mesh: mn, mat: depthMat });
  return g;
}

function buildTowers() {
  const G = new GeoBuf(); WORLD.towerInfo = {}; WORLD.towerSigns = [];
  const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
  const quad = (a, b, c, d, n, uvs, seed, kind, H) => {
    const v = G.nv; for (let k = 0; k < 4; k++) { const q = [a, b, c, d][k]; G.p.push(q[0], q[1], q[2]); G.n.push(n[0], n[1], n[2]); G.uv.push(uvs[k][0], uvs[k][1]); G.b.push(seed, kind, H, 0); }
    G.i.push(v, v + 1, v + 2, v, v + 2, v + 3); G.nv += 4;
  };
  const SOUTH = [0.63, -0.78];
  const seenDong = new Set();
  for (const t of W.towers) {
    const pts = t.p, HR = 0.9 + t.levels * FLOOR_H, H = HR + 1.35, seed = (parseInt(t.name) * 0.137) % 1, n = pts.length;
    const cx = pts.reduce((s, p) => s + p[0], 0) / n, cz = pts.reduce((s, p) => s + p[1], 0) / n;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const eL = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = (b[1] - a[1]) / (eL || 1), nz = -(b[0] - a[0]) / (eL || 1);
      const front = (nx * SOUTH[0] + nz * SOUTH[1]) > 0.14;
      // Classify each tower edge accurately against official unit floor plans (84A/B/C, 59A/B/C/D) & visual9.jpg!
      // kind 5: main living/bedroom front | kind 8: rear courtyard/core | kind 9: end-unit side wall WITH exact kitchen/dress side window | kind 10: signature fluted dark-navy landmark gable!
      const isFlutedLandmark =
        (t.name === '1701' && t.levels === 20 && i === 10) || // 1701 NW Vista-facing emblem wall (visual9.jpg!)
        (t.name === '1704' && t.levels === 18 && eL < 11.0 && nx > 0.5 && nz > 0.2); // 1704 road crown dark return
      const is1703HomeNE = (t.name === '1703' && t.levels === 17 && i === 3); // OUR UNIT 1703동 1702호 NE wall with kitchen side window at z=6.25..6.88!
      let eKind = 5, lenArg = undefined;
      if (isFlutedLandmark) {
        eKind = 10;
      } else if (is1703HomeNE) {
        eKind = 9; lenArg = eL; // exact kitchen side window at u=3.37..4.03m (z=6.25..6.88, y=0.95..2.10m!)
      } else if (front && eL >= 8.5) {
        eKind = 5;
      } else if (eL >= 6.8 && eL <= 11.4 && !front) {
        // End-unit side wall (84B/59B/84A/59D): bright warm-white wall WITH side window column (never a blind solid navy gable!)
        eKind = 9; lenArg = (nx < -0.5) ? eL : -eL;
      } else if (!front) {
        eKind = 8; lenArg = -eL;
      } else {
        // Short front return / corner bay (e.g. 84C/59C dual-aspect side return)
        eKind = eL < 6.8 ? 8 : 5;
        if (eL < 6.8) lenArg = -eL;
      }
      // Special split for 1703동 SW road-facing elevation (e7: [26.68,-0.01] -> [28.96,23.07], L=23.19m):
      // First 4.1m (SE Vista-facing corner) is the signature fluted dark-navy pinstripe feature wall (kind 10) from sp2_vista & visual8 — NO ugly pasted stickers!
      if (t.name === '1703' && t.levels === 18 && i === 7) {
        const sp = 4.1 / eL;
        const mx = lerp(a[0], b[0], sp), mz = lerp(a[1], b[1], sp);
        G.wall(a[0], a[1], mx, mz, -0.5, H, seed, 10, H, 0, 4.1);
        G.wall(mx, mz, b[0], b[1], -0.5, H, seed, 5, H, 0, eL - 4.1);
        G.wall(b[0], b[1], a[0], a[1], HR, H, seed, 7, H);
        continue;
      }
      G.wall(a[0], a[1], b[0], b[1], -0.5, H, seed, eKind, H, 0, lenArg);
      G.wall(b[0], b[1], a[0], a[1], HR, H, seed, 7, H);
    }
    G.roof(pts, HR + 0.02, seed, 5, H);
    // Local frame along longest edge
    let L = 0, ux = 1, uz = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > L) { L = l; ux = (b[0] - a[0]) / l; uz = (b[1] - a[1]) / l; } }
    const vx = -uz, vz = ux, W2 = (x, z) => [(x - cx) * ux + (z - cz) * uz, (x - cx) * vx + (z - cz) * vz], S2 = (a, b) => [cx + a * ux + b * vx, cz + a * uz + b * vz];
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const p of pts) { const [a, b] = W2(p[0], p[1]); a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const inside = (a, b, m) => [[-m, -m], [m, -m], [m, m], [-m, m], [0, 0]].every(([da, db]) => { const q = S2(a + da, b + db); return pip(q[0], q[1], pts); });
    // Architectural stair / lift overrun on tallest wing
    let mr = null;
    if (t.top !== false) {
      let best = 1e9;
      for (let a = a0 + 3; a < a1 - 3; a += 1) for (let b = b0 + 3; b < b1 - 3; b += 1) {
        if (!inside(a, b, 3.3)) continue;
        const q = S2(a, b), d = Math.hypot(q[0] - cx, q[1] - cz);
        if (d < best) { best = d; mr = [a, b]; }
      }
      if (mr) {
        const c = [[-3.1, -2.3], [3.1, -2.3], [3.1, 2.3], [-3.1, 2.3]].map(([da, db]) => S2(mr[0] + da, mr[1] + db));
        const sgn = (c[1][0] - c[0][0]) * (c[2][1] - c[1][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[1][0]);
        const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % n]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
        if ((sgn > 0) !== (area > 0)) c.reverse();
        G.prism(c, HR, HR + 3.6, seed, 7, 3.6);
      }
    }
    // Neatly inset rooftop solar arrays (cleaner & more proportionate to official overview1_261026.jpg)
    const du = ux * SOUTH[0] + uz * SOUTH[1], dv = vx * SOUTH[0] + vz * SOUTH[1];
    const alongU = Math.abs(du) > Math.abs(dv), sg = (alongU ? du : dv) > 0 ? 1 : -1;
    const PW = alongU ? 3.1 : 4.6, PD = alongU ? 4.6 : 3.1, gap = 1.4, rise = 0.72;
    for (let a = a0 + 1.8 + PW / 2; a < a1 - 1.8 - PW / 2 + 0.01; a += PW + gap) for (let b = b0 + 1.8 + PD / 2; b < b1 - 1.8 - PD / 2 + 0.01; b += PD + gap) {
      if (![[-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]].every(([da, db]) => { const q = S2(a + da, b + db); return pip(q[0], q[1], pts); })) continue;
      if (mr && Math.abs(a - mr[0]) < 3.6 + PW / 2 && Math.abs(b - mr[1]) < 2.8 + PD / 2) continue;
      const yl = HR + 0.42, yh = yl + rise;
      const hgt = (da, db) => { const k = alongU ? da / PW : db / PD; return lerp(yh, yl, clamp(k * sg + 0.5, 0, 1)); };
      const c = [[-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]].map(([da, db]) => { const q = S2(a + da, b + db); return [q[0], hgt(da, db), q[1]]; });
      const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]], e2 = [c[3][0] - c[0][0], c[3][1] - c[0][1], c[3][2] - c[0][2]];
      let nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...nn); nn = nn.map(v => v / nl);
      const uvs = [[0, 0], [PW, 0], [PW, PD], [0, PD]];
      if (nn[1] < 0) { nn = nn.map(v => -v); quad(c[0], c[3], c[2], c[1], nn, [uvs[0], uvs[3], uvs[2], uvs[1]], seed, 6 + 16, H); quad(c[0], c[1], c[2], c[3], nn.map(v => -v), uvs, seed, 7 + 16, H); }
      else { quad(c[0], c[1], c[2], c[3], nn, uvs, seed, 6 + 16, H); quad(c[0], c[3], c[2], c[1], nn.map(v => -v), [uvs[0], uvs[3], uvs[2], uvs[1]], seed, 7 + 16, H); }
    }
    // Collect prominent street/courtyard faces for architectural crowns, logos & dong numbers
    if (!WORLD.towerInfo[t.name] || H > WORLD.towerInfo[t.name].H) {
      WORLD.towerInfo[t.name] = { cx, cz, H, HR, pts, ux, uz, vx, vz, a0, a1, b0, b1 };
    }
    if (t.top !== false && !seenDong.has(t.name)) {
      seenDong.add(t.name);
      // Record longest prominent exterior edge for dong-number plaque + side gable edge for logos
      let bestFront = null, bestGable = null;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], eL = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let nx = (b[1] - a[1]) / (eL || 1), nz = -(b[0] - a[0]) / (eL || 1);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        if (eL > 11 && (!bestFront || eL > bestFront.eL)) bestFront = { a, b, eL, nx, nz, mx, mz };
        if (eL >= 6.5 && eL <= 14.5 && (!bestGable || eL > bestGable.eL)) bestGable = { a, b, eL, nx, nz, mx, mz };
      }
      WORLD.towerSigns.push({ name: t.name, HR, H, cx, cz, front: bestFront, gable: bestGable });
    }
  }
  const m = new THREE.Mesh(G.build(), facadeMat()); m.frustumCulled = false;
  WORLD.casters.push({ mesh: m, mat: depthMat }); WORLD.towers = m;
  return m;
}

// ───── trees: instanced crowns + grounded 3D bark trunks + subtle breeze sway
const TREE_VS = /* glsl */`
attribute vec4 aT; attribute vec2 aK; // xyz + crown radius ; kind, random
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vK; varying float vAO;
uniform float uInner, uLeaf, uBlossom, uTime;
#ifdef CARD
attribute vec3 aC; varying vec3 vC;
#endif
void main(){
  float a=aK.y*6.2831; float c=cos(a), s=sin(a);
  float evg=step(0.5,aK.x)*step(aK.x,1.5); float lfV=max(evg,max(uLeaf,(aK.x>1.5&&aK.x<2.5)?uBlossom:0.0));
  vec3 p=position*mix(1.0,uInner,smoothstep(0.25,0.7,lfV)); vec3 n=normal;
#ifdef CARD
  vC=aC;
#endif
  p.xz=mat2(c,-s,s,c)*p.xz; n.xz=mat2(c,-s,s,c)*n.xz;
  float conifer=step(0.5,aK.x)*step(aK.x,1.5);
  vec3 sc=mix(vec3(1.0,0.82+0.30*aK.y,1.0), vec3(0.76,1.15+0.32*aK.y,0.76), conifer)*aT.w;
  vL=p; p*=sc; n=normalize(n/sc);
  float trunk=mix(aT.w*0.72, aT.w*0.58, conifer);
  // Subtle natural breeze sway on upper foliage
  float sway=sin(uTime*1.35 + aT.x*0.09 + aT.z*0.07 + aK.y*6.28)*0.07*max(position.y+0.4, 0.0)*min(aT.w*0.3, 1.2);
  vW=p+vec3(aT.x+sway, aT.y+trunk+sc.y*0.52, aT.z+sway*0.6); vN=n; vK=aK; vAO=smoothstep(-1.0,0.65,position.y);
  gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);
}`;
const TREE_FS = /* glsl */`
precision highp float;
${GLSL_COMMON}
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vK; varying float vAO;
uniform float uDepthOnly, uInner;
#ifdef CARD
uniform sampler2D uLeafTex; varying vec3 vC;
#endif
void main(){
  float kind=vK.x, r=vK.y; float r2=fract(r*7.31);
  bool evergreen=kind>0.5&&kind<1.5;
  float leaf=evergreen?1.0:uLeaf;
  float bl=(kind>1.5&&kind<2.5)?uBlossom:0.0;
  float lf=clamp(leaf*1.35-r2*0.35,0.0,1.0); lf=max(lf,bl);
  float nz=texture2D(uNoise,vL.xz*0.33+vL.y*0.21+r*5.0).r;
  float nz2=texture2D(uNoise,vL.xy*1.1+r*9.0).g;
  float dens=mix(0.30,1.0,lf);
  float dth=hash21(gl_FragCoord.xy+floor(r*64.0));
#ifdef CARD
  vec4 lt=texture2D(uLeafTex,vC.xy);
  if(lt.a<mix(0.5,0.2,smoothstep(50.0,380.0,distance(uCamPos,vW)))) discard;
  if(vC.z>lf*1.12) discard;
#else
  if(dens<0.999 && nz*0.6+dth*0.6>dens*1.15+0.02) discard;
  if(uDepthOnly>0.5){ gl_FragColor=vec4(1.0); return; }
  { vec3 Vv=normalize(uCamPos-vW); float rim=abs(dot(normalize(vN),Vv)); float cut=texture2D(uNoise,vL.xy*1.9+vL.z*1.3+r*4.0).a; if(rim<0.42 && cut*0.9+dth*0.25>rim*2.1+0.12) discard; }
#endif
  vec3 summer = kind<0.5? mix(vec3(0.044,0.086,0.022),vec3(0.072,0.118,0.030),r2)
              : kind<1.5? mix(vec3(0.024,0.052,0.024),vec3(0.038,0.068,0.028),r2)
              : kind<2.5? vec3(0.058,0.102,0.030) : kind<3.5? vec3(0.076,0.120,0.028) : kind<4.5? vec3(0.052,0.096,0.026) : vec3(0.064,0.100,0.026);
  summer=mix(vec3(dot(summer,vec3(0.3,0.6,0.1))),summer,0.86)*0.92;
  vec3 fresh=vec3(0.14,0.22,0.048);
  vec3 oak = r2<0.38? vec3(0.245,0.155,0.040) : r2<0.72? vec3(0.195,0.088,0.032) : r2<0.88? vec3(0.135,0.130,0.035) : vec3(0.305,0.210,0.045);
  vec3 aut = kind<0.5? oak : kind<2.5? vec3(0.310,0.110,0.045) : kind<3.5? vec3(0.540,0.415,0.045) : kind<4.5? vec3(0.310,0.140,0.040) : vec3(0.360,0.055,0.032);
  vec3 twig=vec3(0.110,0.094,0.080);
  vec3 alb=summer;
  if(!evergreen){
    alb=mix(alb,fresh,uFresh*(0.6+0.4*r2));
    alb=mix(alb,aut,clamp(uAutumn*1.7-r*0.7,0.0,1.0));
    alb=mix(twig,alb,smoothstep(0.15,0.5,lf));
    alb=mix(alb,mix(vec3(0.84,0.70,0.74),vec3(0.92,0.84,0.86),r2),bl*0.94);
  }
  float nz3=texture2D(uNoise,vL.xz*2.3+vL.y*1.7+r*3.0).b;
  alb*=0.56+0.88*nz*nz2*2.0; alb*=0.72+0.56*nz3;
  vec3 n=normalize(vN+ (vec3(nz,nz2,texture2D(uNoise,vL.zy*0.9).b)-0.5)*0.85);
  float sn=uSnow*smoothstep(0.1,0.7,n.y)*(evergreen?0.85:0.6);
  alb=mix(alb,vec3(0.88,0.91,0.95),sn);
  float sh=shadowAt(vW+vN*0.8,0.0018);
  float ndl=max((dot(n,uLDir)+0.42)/1.42,0.0);
  float clump=texture2D(uNoise,vL.xz*0.8+vL.y*0.6+r*2.0).g, fineL=texture2D(uNoise,vL.xy*4.3+vL.z*3.1+r).r;
  float hole=smoothstep(0.34,0.58,clump*0.55+nz3*0.25+fineL*0.2);
  float ao=mix(0.32,1.0,vAO)*(0.58+0.42*nz3)*mix(0.24,1.0,hole);
  alb*=0.84+0.34*fineL;
#ifdef CARD
  float dep=smoothstep(0.45,1.05,length(vL));
  hole=mix(0.36,1.0,dep); ao=mix(0.36,1.0,vAO)*mix(0.32,1.0,dep);
  alb*=(0.52+0.74*lt.r)*(0.82+0.44*vC.z); alb=mix(alb,alb*vec3(1.12,1.06,0.74),step(0.8,fract(vC.z*13.7))*0.5);
#else
  if(uInner<0.99){ float k=smoothstep(0.25,0.7,lf); alb*=mix(1.0,0.46,k); ao*=mix(1.0,0.62,k); }
#endif
  vec3 V=normalize(uCamPos-vW);
  float back=pow(max(dot(-V,uLDir),0.0),3.0)*0.40*lf;
  vec3 col=alb*(uLCol*(ndl*mix(0.36,1.0,hole)+back)*sh*uCloudShade + ambient(n)*ao);
  col+=uLCol*sh*uCloudShade*0.015*lf*pow(max(dot(reflect(-V,n),uLDir),0.0),14.0)*hole;
  gl_FragColor=vec4(col,1.0);
}`;
function blobGeo(detail, seed, lobes, conifer = false) {
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const parts = [];
  if (conifer && detail >= 1) {
    // Tiered Korean pine / spruce conical silhouette
    for (let t = 0; t < 3; t++) {
      let g = new THREE.ConeGeometry(0.95 - t * 0.22, 0.92, 8 + detail * 2, 1);
      g.deleteAttribute('uv'); g.translate(0, -0.35 + t * 0.48, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 0.86 + 0.28 * rnd(); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
      g.computeVertexNormals(); parts.push(g);
    }
    return mergeGeometries(parts);
  }
  for (let l = 0; l < lobes; l++) {
    let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-3);
    const p = g.attributes.position;
    const hsh = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, w = t => t * t * (3 - 2 * t), ux = w(fx), uy = w(fy), uz = w(fz); let r = 0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hsh(xi + a, yi + b, zi + c) * (a ? ux : 1 - ux) * (b ? uy : 1 - uy) * (c ? uz : 1 - uz); return r; };
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i); const k = detail >= 2 ? 0.62 + 0.42 * vn(X * 2.1 + l * 9, Y * 2.1, Z * 2.1) + 0.30 * vn(X * 5.3, Y * 5.3 + l * 5, Z * 5.3) : 0.8 + rnd() * 0.4; let y = p.getY(i) * k; if (y < -0.5) y = -0.5 - (y + 0.5) * 0.2; p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k); }
    if (lobes > 1) { const a = l / lobes * 6.283 + rnd(), r = l === 0 ? 0 : 0.45 + rnd() * 0.2, sc = l === 0 ? 0.9 : 0.55 + rnd() * 0.2; g.scale(sc, sc * (0.85 + rnd() * 0.3), sc); g.translate(Math.cos(a) * r, l === 0 ? 0.15 : (rnd() - 0.5) * 0.5, Math.sin(a) * r); }
    g.computeVertexNormals(); parts.push(g);
  }
  return lobes > 1 ? mergeGeometries(parts) : parts[0];
}
function cardGeo(nCards, seed, lobes, size) {
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const Lb = []; for (let l = 0; l < lobes; l++) { const a = l / lobes * 6.283 + rnd(), r = l === 0 ? 0 : 0.42 + rnd() * 0.22, sc = l === 0 ? 0.88 : 0.52 + rnd() * 0.22; Lb.push([Math.cos(a) * r, l === 0 ? 0.15 : (rnd() - 0.5) * 0.5, Math.sin(a) * r, sc]); }
  const P = [], Nn = [], C = [], I = []; let nv = 0;
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  for (let k = 0; k < nCards; k++) {
    const lb = Lb[k % lobes], dy = rnd() * 1.45 - 0.45, ph = rnd() * 6.283, dr = Math.sqrt(Math.max(0, 1 - dy * dy)), d = [Math.cos(ph) * dr, dy, Math.sin(ph) * dr];
    const rad = lb[3] * (0.74 + 0.30 * rnd()); const c = [lb[0] + d[0] * rad, Math.max(lb[1] + d[1] * rad * 0.92, -0.42), lb[2] + d[2] * rad];
    const n = nrm([d[0] + (rnd() - 0.5) * 1.1, d[1] + (rnd() - 0.5) * 1.1 + 0.25, d[2] + (rnd() - 0.5) * 1.1]);
    const up = nrm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]); let t = nrm([n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]]); const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    const h = size * (0.75 + 0.5 * rnd()), cn = nrm([c[0], c[1] - 0.05, c[2]]), cr = rnd(), cu = k % 2, cv = (k >> 1) % 2;
    for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(c[0] + (t[0] * a + b[0] * e) * h, c[1] + (t[1] * a + b[1] * e) * h, c[2] + (t[2] * a + b[2] * e) * h); Nn.push(cn[0], cn[1], cn[2]); C.push((cu + (a + 1) / 2) / 2, (cv + (e + 1) / 2) / 2, cr); }
    I.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); return g;
}
function paintLeaves() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = 'rgba(170,170,170,0.02)'; g.fillRect(0, 0, N, N);
  let s = 777; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 256 + 128, oy = (cell >> 1) * 256 + 128; const leaves = [];
    for (let i = 0; i < 150; i++) { const a = rnd() * 6.283, r = Math.pow(rnd(), 0.62) * (104 - 26 * Math.abs(Math.sin(a * (2 + cell) + cell))); leaves.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r, rnd() * 6.283, 9 + rnd() * 9, 120 + rnd() * 135]); }
    leaves.sort((p, q) => p[4] - q[4]);
    for (const [x, y, rot, len, v] of leaves) {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.beginPath(); g.ellipse(0, 0, len, len * 0.46, 0, 0, 7); g.fill();
      g.fillStyle = `rgba(0,0,0,0.16)`; g.beginPath(); g.ellipse(0, len * 0.2, len * 0.95, len * 0.24, 0, 0, 7); g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t;
}
function buildTrees() {
  const xy = arr('t_xy'), ty = arr('t_y'), ts = arr('t_s'), tk = arr('t_k'); const N = ts.length;
  const sets = { nrB: [], nrC: [], hiB: [], hiC: [], loB: [], loC: [] };
  const trunks = []; // x, y, z, s, kind for grounded 3D trunks on near & mid trees!
  for (let i = 0; i < N; i++) {
    const x = xy[i * 2] / 4, z = xy[i * 2 + 1] / 4, d = Math.hypot(x, z + 40); const con = tk[i] === 1;
    const key = (d < 200 ? 'nr' : d < 450 ? 'hi' : 'lo') + (con ? 'C' : 'B');
    if (d > 1250 && (i % 3) === 0) continue;
    const r = ((i * 2654435761) >>> 0) / 4294967296;
    const sc = ts[i] / 20 * (d > 1250 ? 1.25 : 1);
    const y = ty[i] / 10;
    sets[key].push(x, y, z, sc, tk[i], r);
    if (d < 440) trunks.push(x, y, z, sc, con ? 1 : 0, r);
  }
  const grp = new THREE.Group(); let tris = 0;
  const leafTex = paintLeaves();
  const mk = (geo, list, inner = 1) => {
    const n = list.length / 6; if (!n) return;
    const ig = new THREE.InstancedBufferGeometry(); ig.index = geo.index; ig.setAttribute('position', geo.attributes.position); ig.setAttribute('normal', geo.attributes.normal);
    const aT = new Float32Array(n * 4), aK = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { aT.set(list.slice(i * 6, i * 6 + 4), i * 4); aK[i * 2] = list[i * 6 + 4]; aK[i * 2 + 1] = list[i * 6 + 5]; }
    ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4)); ig.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 2)); ig.instanceCount = n;
    if (geo.attributes.aC) ig.setAttribute('aC', geo.attributes.aC);
    const card = !!geo.attributes.aC;
    const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uDepthOnly: { value: 0 }, uInner: { value: inner }, uLeafTex: { value: leafTex } }, vertexShader: TREE_VS, fragmentShader: TREE_FS, defines: card ? { CARD: 1 } : {}, side: card ? THREE.DoubleSide : THREE.FrontSide });
    const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; grp.add(m);
    tris += n * (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  };

  // Instanced 3D tapered bark trunks + upper fork branches so near/mid trees are grounded!
  if (trunks.length) {
    const nt = trunks.length / 6;
    const trunkMain = new THREE.CylinderGeometry(0.06, 0.13, 1.0, 6); trunkMain.deleteAttribute('uv'); trunkMain.translate(0, 0.5, 0);
    const b1 = new THREE.CylinderGeometry(0.025, 0.055, 0.45, 5); b1.deleteAttribute('uv'); b1.translate(0, 0.22, 0); b1.rotateZ(0.45); b1.translate(0, 0.72, 0);
    const b2 = new THREE.CylinderGeometry(0.025, 0.052, 0.42, 5); b2.deleteAttribute('uv'); b2.translate(0, 0.21, 0); b2.rotateZ(-0.42); b2.rotateY(2.1); b2.translate(0, 0.68, 0);
    const tGeo = mergeGeometries([trunkMain, b1, b2]);
    const ig = new THREE.InstancedBufferGeometry(); ig.index = tGeo.index; ig.setAttribute('position', tGeo.attributes.position); ig.setAttribute('normal', tGeo.attributes.normal);
    const aT = new Float32Array(nt * 4), aK = new Float32Array(nt * 2);
    for (let i = 0; i < nt; i++) { aT.set(trunks.slice(i * 6, i * 6 + 4), i * 4); aK[i * 2] = trunks[i * 6 + 4]; aK[i * 2 + 1] = trunks[i * 6 + 5]; }
    ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4)); ig.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 2)); ig.instanceCount = nt;
    const tMat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: `attribute vec4 aT; attribute vec2 aK; varying vec3 vW; varying vec3 vN; varying float vR;
        void main(){ float a=aK.y*6.2831; float c=cos(a), s=sin(a); vec3 p=position; vec3 n=normal;
          p.xz=mat2(c,-s,s,c)*p.xz; n.xz=mat2(c,-s,s,c)*n.xz;
          float h=aT.w*mix(1.15, 0.92, aK.x); float r=aT.w*0.85;
          vW=vec3(p.x*r+aT.x, p.y*h+aT.y-0.3, p.z*r+aT.z); vN=normalize(n); vR=aK.y;
          gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0); }`,
      fragmentShader: `precision highp float; ${GLSL_COMMON} varying vec3 vW; varying vec3 vN; varying float vR;
        void main(){ vec3 n=normalize(vN); float b=texture2D(uNoise,vec2(vW.x+vW.z,vW.y*0.6)*0.8).r;
          vec3 alb=mix(vec3(0.09,0.072,0.056),vec3(0.15,0.125,0.098),b*0.7+vR*0.3);
          float sh=shadowAt(vW+n*0.2,0.0015); gl_FragColor=vec4(lit(alb,n,sh,0.72),1.0); }`,
    });
    const tm = new THREE.Mesh(ig, tMat); tm.frustumCulled = false; grp.add(tm);
    tris += nt * tGeo.index.count / 3;
  }

  const dm = new THREE.ShaderMaterial({ uniforms: { ...U, uDepthOnly: { value: 1 }, uInner: { value: 0.92 } }, vertexShader: TREE_VS, fragmentShader: TREE_FS, side: THREE.DoubleSide });
  const a = mk(blobGeo(1, 11, 4, false), sets.hiB, 0.74), b = mk(blobGeo(1, 23, 3, true), sets.hiC, 0.78);
  mk(cardGeo(64, 311, 4, 0.36), sets.hiB); mk(cardGeo(44, 323, 3, 0.32), sets.hiC);
  mk(blobGeo(0, 5, 1, false), sets.loB); mk(blobGeo(0, 7, 1, true), sets.loC);
  {
    const na = mk(blobGeo(2, 31, 6, false), sets.nrB, 0.72), nb = mk(blobGeo(2, 47, 4, true), sets.nrC, 0.78);
    mk(cardGeo(190, 131, 6, 0.27), sets.nrB); mk(cardGeo(120, 147, 4, 0.24), sets.nrC);
    if (na) WORLD.casters.push({ mesh: na, mat: dm }); if (nb) WORLD.casters.push({ mesh: nb, mat: dm });
    WORLD.nearTrees = sets.nrB.length / 6 + sets.nrC.length / 6;
  }
  if (a) WORLD.casters.push({ mesh: a, mat: dm }); if (b) WORLD.casters.push({ mesh: b, mat: dm });
  WORLD.treeTris = tris;
  return grp;
}

// ───── water (광교호수공원 원천호수/신대호수 + ponds): true Sky-LUT Fresnel + multi-octave animated ripples
function buildWater() {
  const off = arr('w_off'), xy = arr('w_xy'), lv = arr('w_lv'); const pos = [], idx = []; let nv = 0;
  for (let i = 0; i < lv.length; i++) {
    const pts = []; for (let v = off[i]; v < off[i + 1] - 1; v++) pts.push(new THREE.Vector2(xy[v * 2] / 4, xy[v * 2 + 1] / 4));
    if (pts.length < 3) continue; let tri; try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { continue; }
    const y = lv[i] / 10 + 0.18; for (const p of pts) pos.push(p.x, y, p.y); for (const t of tri) idx.push(nv + t[0], nv + t[1], nv + t[2]); nv += pts.length;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U }, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`precision highp float; ${GLSL_COMMON} varying vec3 vW;
      void main(){
        vec3 V=normalize(uCamPos-vW);
        float d=distance(uCamPos,vW);
        vec2 q1=vW.xz*0.028+uTime*vec2(0.014,0.009);
        vec2 q2=vW.xz*0.085-uTime*vec2(0.018,-0.011);
        float att=mix(0.18, 0.06, smoothstep(80.0, 1400.0, d));
        vec2 wv=(texture2D(uNoise,q1).rg-0.5)*att + (texture2D(uNoise,q2).gb-0.5)*att*0.65;
        vec3 nn=normalize(vec3(wv.x, 1.0, wv.y));
        vec3 R=reflect(-V,nn);
        float fr=0.025+0.975*pow(1.0-max(dot(V,nn),0.0),5.0);
        vec3 sky=sampleSky(vec3(R.x, max(R.y, 0.012), R.z));
        vec3 deep=vec3(0.016,0.042,0.044)*(uLCol*max(uLDir.y,0.0)*0.75 + uSkyUp*2.2);
        vec3 col=mix(deep, sky, clamp(fr*0.92+0.08, 0.0, 1.0));
        // Crisp sun glitter path across lake surface
        float sp=pow(max(dot(R,uLDir),0.0),700.0)*28.0 + pow(max(dot(R,uLDir),0.0),80.0)*0.6;
        col+=uLCol*sp*uCloudShade;
        // Night lakeside warm city light shimmer
        if(uNight>0.001){
          float glt=pow(texture2D(uNoise,vW.xz*0.018+vec2(0.0,uTime*0.02)).r, 4.0);
          col+=vec3(1.0,0.72,0.40)*glt*uNight*${(LAMP * 1.4).toFixed(5)};
        }
        col=mix(col,lit(vec3(0.85,0.88,0.93),vec3(0.0,1.0,0.0),1.0,1.0),uSnow*0.85);
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}

// ───── street lights + aviation beacons + waterfront glow
function buildLamps() {
  const ro = arr('r_off'), rx = arr('r_xy'), rw = arr('r_w'), rc = arr('r_c'); const pos = [], seed = [];
  WORLD.poleSpots = []; // also populate 3D street light poles near complex!
  for (let i = 0; i < rw.length; i++) {
    const c = rc[i] & 7; if (c < 1 || c > 5 || (rc[i] & 8)) continue;
    const w = rw[i] / 5, ow = !!(rc[i] & 16);
    const sp = c >= 2 ? 34 : 46; let acc = sp * ((i * 0.37) % 1), side = 1;
    for (let v = ro[i]; v < ro[i + 1] - 1; v++) {
      const x0 = rx[v * 2] / 4, z0 = rx[v * 2 + 1] / 4, x1 = rx[v * 2 + 2] / 4, z1 = rx[v * 2 + 3] / 4, L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      while (acc < L) {
        const sd = ow ? 1 : side;
        const x = x0 + ux * acc - uz * sd * (w / 2 + 1.1), z = z0 + uz * acc + ux * sd * (w / 2 + 1.1);
        if (Math.abs(x) < 7900 && Math.abs(z) < 7900) {
          const gy = groundY(x, z), lh = c >= 2 ? 9.2 : 6.4;
          pos.push(x, gy + lh, z); seed.push(((i * 31 + v) * 0.6180339) % 1, c);
          if (Math.hypot(x, z) < 520 && c >= 2 && Math.hypot(x - 110, z + 132) > 14 && Math.hypot(x - 28, z - 52) > 12) WORLD.poleSpots.push([x, gy, z, Math.atan2(-uz * sd, ux * sd), lh]);
        }
        acc += sp; side = -side;
      }
      acc -= L;
    }
  }
  // Complex warm bollard & avenue lights
  const [aa, ab] = W.ave;
  for (let k = 0; k <= 14; k++) {
    const t = k / 14, x = lerp(aa[0], ab[0], t), z = lerp(aa[1], ab[1], t);
    pos.push(x, 3.6, z + 5.8, x, 3.6, z - 5.8); seed.push(0.92, 1, 0.92, 1);
  }
  for (let i = 0; i < 48; i++) {
    const p = W.site[i % W.site.length], q = W.site[(i * 7 + 3) % W.site.length], t = (i * 0.618) % 1;
    pos.push(lerp(p[0], q[0], t) * 0.82, 3.8, lerp(p[1], q[1], t) * 0.82 - 12); seed.push(0.95, 1);
  }
  // Red aviation obstruction beacons atop surrounding skyscrapers (>65m)
  const bcn = WORLD.beacons || [];
  for (let i = 0; i < bcn.length; i += 3) { pos.push(bcn[i], bcn[i + 1], bcn[i + 2]); seed.push(2.0, 5); }

  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(seed), 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: U.uNight, uPx: { value: 1 }, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 aS; varying vec3 vC; varying float vI; uniform float uPx, uNight, uTime;
      void main(){ vec4 mv=viewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; float d=-mv.z;
        float isBcn=step(1.5, aS.x);
        float sz=uPx*mix(220.0, 290.0, isBcn)/d;
        float pulse=mix(1.0, 0.35+0.65*smoothstep(-0.2,0.5,sin(uTime*2.8+position.x*0.03)), isBcn);
        vI=min(1.0,sz/2.2)*min(1.0,sz*sz/(2.2*2.2)+0.25)*pulse;
        gl_PointSize=clamp(sz,2.2,26.0)*step(0.001,uNight);
        vec3 stCol=mix(vec3(1.0,0.62,0.26),vec3(0.96,0.94,0.88),step(0.55,aS.x));
        vC=mix(stCol, vec3(1.4,0.12,0.08), isBcn); }`,
    fragmentShader: `precision highp float; varying vec3 vC; varying float vI; uniform float uNight;
      void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p)*2.0; float a=exp(-r*r*7.0)+0.25*exp(-r*2.5); if(r>1.0) discard; gl_FragColor=vec4(vC*a*vI*uNight*${(LAMP * 9).toFixed(4)},1.0); }`,
  });
  const m = new THREE.Points(g, mat); m.frustumCulled = false; WORLD.lamps = m; return m;
}

// ───── traffic: 2-tier 3D cars obeying real one-way / two-way lane directions
function buildCars() {
  const ro = arr('r_off'), rx = arr('r_xy'), rw = arr('r_w'), rc = arr('r_c'); const paths = [];
  for (let i = 0; i < rw.length; i++) {
    const c = rc[i] & 7; if (c < 2 || c > 5) continue;
    const ow = !!(rc[i] & 16);
    const pts = []; let L = 0, nearest = 1e9;
    for (let v = ro[i]; v < ro[i + 1]; v++) {
      const x = rx[v * 2] / 4, z = rx[v * 2 + 1] / 4;
      if (pts.length) L += Math.hypot(x - pts[pts.length - 1][0], z - pts[pts.length - 1][1]);
      pts.push([x, z, L]); nearest = Math.min(nearest, Math.hypot(x, z));
    }
    if (L > 55 && nearest < 2600) paths.push({ pts, L, w: rw[i] / 5, c, tunnel: !!(rc[i] & 8), ow });
  }
  const cars = []; let s = 4242; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const p of paths) {
    const n = Math.round(p.L / (p.c >= 4 ? 52 : 76));
    const dirs = p.ow ? [1] : [1, -1];
    for (let k = 0; k < n; k++) for (const dir of dirs) if (rnd() < 0.56) {
      let laneOff;
      if (p.ow) {
        const nl = Math.max(1, Math.round(p.w / 3.3));
        const li = Math.floor(rnd() * nl);
        laneOff = (-0.5 * (nl - 1) + li) * Math.min(3.2, (p.w - 1.2) / Math.max(nl, 1));
      } else {
        const nl = Math.max(1, Math.floor(p.w / 6.8));
        laneOff = dir * -(0.5 + Math.floor(rnd() * nl)) * 3.1;
      }
      cars.push({ p, t: rnd() * p.L, dir, laneOff, v: (p.c >= 4 ? 13.5 : 9.2) * (0.8 + rnd() * 0.45), col: Math.floor(rnd() * 8) });
    }
  }
  const N = cars.length; WORLD.cars = cars;
  // Two-tier 3D vehicle silhouette (lower body + recessed upper cabin + wheels)
  const body = new THREE.BoxGeometry(1.86, 0.72, 4.55); body.translate(0, 0.54, 0);
  const cab = new THREE.BoxGeometry(1.56, 0.56, 2.25); cab.translate(0, 1.15, -0.18);
  const geo = mergeGeometries([body, cab]);
  const pal = [0xf2f2ef, 0x16181c, 0x7e8288, 0xe2e4e6, 0x2c323b, 0x6e1a1a, 0x1e3552, 0xb8b2a6].map(c => new THREE.Color(c));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vP; void main(){ vP=position; vec4 w=instanceMatrix*vec4(position,1.0); vW=w.xyz; vN=mat3(instanceMatrix)*normal; vC=instanceColor; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `precision highp float; ${GLSL_COMMON} varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vP;
      void main(){
        vec3 n=normalize(vN); vec3 V=normalize(uCamPos-vW);
        float isCab=step(0.92, vP.y)*step(abs(n.y), 0.5);
        vec3 alb=mix(vC, vec3(0.03,0.04,0.055), isCab);
        float sh=shadowAt(vW,0.002);
        vec3 col=lit(alb,n,sh,1.0);
        // Glossy car clearcoat / windshield sky reflection
        vec3 R=reflect(-V,n); float fr=0.05+0.95*pow(1.0-max(dot(V,n),0.0),5.0);
        col+=sampleSky(vec3(R.x,max(R.y,0.02),R.z))*fr*mix(0.22, 0.85, isCab);
        float head=step(2.22,vP.z)*step(vP.y,0.82)*step(0.36,vP.y)*step(0.45,abs(vP.x));
        float tail=step(vP.z,-2.22)*step(vP.y,0.85)*step(0.42,vP.y)*step(0.42,abs(vP.x));
        col+=uNight*(vec3(1.0,0.95,0.85)*head*${(LAMP * 36).toFixed(4)}+vec3(1.0,0.05,0.03)*tail*${(LAMP * 12).toFixed(4)});
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N; i++) m.setColorAt(i, pal[cars[i].col]);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const pm = WORLD.lamps.material.clone(); pm.uniforms.uNight = U.uNight; pm.uniforms.uPx = WORLD.lamps.material.uniforms.uPx; pm.uniforms.uTime = U.uTime;
  pm.vertexShader = pm.vertexShader.replace('vec3 stCol=mix(vec3(1.0,0.62,0.26),vec3(0.96,0.94,0.88),step(0.55,aS.x));', 'vec3 stCol=mix(vec3(1.0,0.06,0.03)*0.45,vec3(1.0,0.96,0.88)*1.5,aS.x);').replace('220.0', '150.0');
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false;
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), cam = new THREE.Vector3();
  WORLD.updateCars = (dt, camera, traffic) => {
    const P = pg.attributes.position.array, A = pg.attributes.aS.array; camera.getWorldPosition(cam);
    for (let i = 0; i < N; i++) {
      const c = cars[i], p = c.p; c.t += c.v * c.dir * dt; if (c.t > p.L) c.t -= p.L; if (c.t < 0) c.t += p.L;
      const active = (i / N) < traffic && !p.tunnel;
      let k = c.k || 1; if (k >= p.pts.length) k = 1; while (k < p.pts.length - 1 && p.pts[k][2] < c.t) k++; while (k > 1 && p.pts[k - 1][2] > c.t) k--; c.k = k;
      const a = p.pts[k - 1], b = p.pts[k], f = (c.t - a[2]) / Math.max(b[2] - a[2], 0.01); const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      const x = lerp(a[0], b[0], f) + nx * c.laneOff, z = lerp(a[1], b[1], f) + nz * c.laneOff;
      const y = active ? groundY(x, z) : -500;
      pos.set(x, y, z); q.setFromAxisAngle(up, Math.atan2(dx * c.dir, dz * c.dir)); M.compose(pos, q, one); m.setMatrixAt(i, M);
      P[i * 3] = x; P[i * 3 + 1] = y + 0.72; P[i * 3 + 2] = z;
      A[i * 2] = ((cam.x - x) * dx + (cam.z - z) * dz) * c.dir > 0 ? 1 : 0;
    }
    m.instanceMatrix.needsUpdate = true; pg.attributes.position.needsUpdate = true; pg.attributes.aS.needsUpdate = true;
  };
  const g = new THREE.Group(); g.add(m, pts); return g;
}

// ───── sun shadow map (expanded smooth coverage)
const SHADOW = {};
function initShadow() {
  SHADOW.rt = new THREE.WebGLRenderTarget(4096, 4096, { depthBuffer: true, depthTexture: new THREE.DepthTexture(4096, 4096, THREE.UnsignedIntType), minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  SHADOW.cam = new THREE.OrthographicCamera(-400, 400, 400, -400, 10, 3200);
  SHADOW.scene = new THREE.Scene(); SHADOW.dirty = true;
  U.uShadowMap.value = SHADOW.rt.depthTexture;
}
function renderShadow(renderer) {
  const L = U.uLDir.value; if (L.y < 0.025) { U.uShadowOn.value = 0; return; }
  U.uShadowOn.value = 1;
  const c = SHADOW.cam, tgt = new THREE.Vector3(10, 10, -55);
  c.position.copy(tgt).addScaledVector(L, 1600); c.up.set(0, 1, 0); c.lookAt(tgt); c.updateMatrixWorld(); c.updateProjectionMatrix();
  U.uShadowMat.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  const saved = [];
  SHADOW.scene.children.length = 0;
  for (const k of WORLD.casters) { saved.push([k.mesh, k.mesh.material, k.mesh.parent]); k.mesh.material = k.mat; SHADOW.scene.children.push(k.mesh); }
  const old = renderer.getRenderTarget(); U.uShadowMap.value = null; renderer.setRenderTarget(SHADOW.rt); renderer.clear(); renderer.render(SHADOW.scene, c); renderer.setRenderTarget(old); U.uShadowMap.value = SHADOW.rt.depthTexture;
  for (const [m, mat] of saved) m.material = mat;
  SHADOW.scene.children.length = 0;
}
