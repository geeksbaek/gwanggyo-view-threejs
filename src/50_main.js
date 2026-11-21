// ───────────── main: environment update, controls, UI, loop
const WEATHER = {
  clear: { cover: 0.05, cirrus: 0.22, haze: 1.5, over: 0, shade: 1.0, precip: 0, snow: 0, wet: 0, k: 0 },
  few: { cover: 0.36, cirrus: 0.45, haze: 1.7, over: 0, shade: 0.96, precip: 0, snow: 0, wet: 0, k: 0 },
  cloudy: { cover: 0.68, cirrus: 0.6, haze: 2.0, over: 0.25, shade: 0.5, precip: 0, snow: 0, wet: 0, k: 0.06 },
  rain: { cover: 1.0, cirrus: 0.6, haze: 2.6, over: 1, shade: 0.0, precip: 0.30, snow: 0, wet: 1, k: 0.040 },
  snow: { cover: 1.0, cirrus: 0.6, haze: 3.0, over: 1, shade: 0.0, precip: 0.55, snow: 1, wet: 0, k: 0.065 },
  dust: { cover: 0.06, cirrus: 0.18, haze: 7.5, over: 0, shade: 0.78, precip: 0, snow: 0, wet: 0, k: 0 },
};
const WX = { ...WEATHER.clear };            // smoothed current weather
const ENV = { exp: 1, expTarget: 1, lampOn: false, sunAlt: 0, sunAz: 0, dirty: true };
let renderer, cam, extScene, homeScene, precip, marker;
const view = { yaw: 0, pitch: -0.04, fov: 62, pos: new THREE.Vector3(0.5, FY + EYE, 3.4), tyaw: 0, tpitch: -0.04, tpos: new THREE.Vector3(0.5, FY + EYE, 3.4), tfov: 62, outdoors: true };
const orbit = { azimuth: 1.65, elevation: 0.68, distance: 405, playing: true };
const VIEWS = {
  living: { p: [0.75, 3.75], yaw: -0.10, pitch: -0.05, label: '거실' },
  window: { p: [0.0, 0.95], yaw: 0.0, pitch: -0.10, label: '창가' },
  kitchen: { p: [0.35, 8.25], yaw: 0.02, pitch: -0.03, label: '주방' },
  bed1: { p: [11.2, 4.45], yaw: -0.45, pitch: -0.04, label: '안방' },
  dress: { p: [10.95, 5.75], yaw: 3.1416, pitch: -0.03, label: '드레스룸' },
  bed2: { p: [3.25, 3.35], yaw: 0.12, pitch: 0.0, label: '침실2' },
  bed3: { p: [6.6, 3.35], yaw: 0.05, pitch: 0.0, label: '침실3' },
  ent: { p: [6.2, 5.9], yaw: 3.1416, pitch: -0.03, label: '현관' },
  bath: { p: [4.9, 5.75], yaw: -2.5, pitch: -0.12, label: '욕실' },
  util: { p: [5.0, 8.1], yaw: -1.75, pitch: -0.05, label: '다용도실' },
};

const _v = new THREE.Vector3(), _c = [0, 0, 0];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function sunBlocked(ox, oy, oz, d) {
  for (let t = 8; t < 420; t += 3) {
    const x = ox + d.x * t, y = oy + d.y * t, z = oz + d.z * t; if (y > 75) return false;
    for (const tw of W.towers) { if (tw.name === '1703') continue; const H = 0.9 + tw.levels * FLOOR_H + 1.4; if (y < H && pip(x, z, tw.p)) return true; }
  }
  return false;
}
// direct sun on the living-room floor over one day
function livingSun(doy) {
  const save = S.doy, d = new THREE.Vector3(); let first = null, last = null, n = 0;
  for (let m = 0; m < 1440; m += 10) {
    const ms = Date.UTC(YEAR, 0, 1) + doy * 864e5 + (m / 60 - 9) * 36e5; const a = AST.at(ms, W.frame.lat, W.frame.lon);
    if (a.sun.alt < 0.02) continue; dirFromAzAlt(a.sun.az, a.sun.alt, d);
    if (d.z > -0.12) continue;                               // sun behind the facade
    const reach = 2.2 / Math.tan(a.sun.alt) * (-d.z);        // how deep the patch reaches (window head 2.2 m)
    if (reach < 0.45) continue;
    if (sunBlocked(0, FY + 1.2, -0.2, d)) continue;
    if (first === null) first = m; last = m; n += 10;
  }
  return { first, last, minutes: n };
}

function updateEnv() {
  const fr = W.frame, a = AST.at(stateMs(), fr.lat, fr.lon), sd = U.uSunDir.value, md = U.uMoonDir.value;
  dirFromAzAlt(a.sun.az, a.sun.alt, sd); dirFromAzAlt(a.moon.az, a.moon.alt, md);
  ENV.sunAlt = a.sun.alt; ENV.sunAz = a.sun.az; ENV.moon = a.moon;
  const turb = 1 + WX.haze * 0.85, sinS = Math.sin(a.sun.alt);
  const Ts = atmTrans(sd, turb), Tm = atmTrans(md, turb);
  const moonUp = a.moon.alt > 0 ? 1 : 0, moonI = SUNI * 9e-6 * a.moon.frac * moonUp;
  // overcast sky luminance: sunlight diffused through the deck + city glow from below at night
  const dayE = SUNI * Math.max(sinS, 0) * (0.3 + 0.7 * Ts[1]) + SUNI * 0.02 * sstep(-0.12, 0.0, sinS);
  const oc = SKY.lutMat.uniforms.uOverCol.value; oc.setRGB(dayE * WX.k + 4.2e-4, dayE * WX.k * 1.02 + 3.3e-4, dayE * WX.k * 1.06 + 2.6e-4);
  SKY.lutMat.uniforms.uTurb.value = turb; SKY.lutMat.uniforms.uMoonI.value = moonI; SKY.lutMat.uniforms.uOvercast.value = WX.over; SKY.lutMat.uniforms.uGlow.value = 1;
  renderer.setRenderTarget(SKY.rt); renderer.render(SKY.scene, SKY.cam);
  renderer.readRenderTargetPixels(SKY.rt, 0, 0, LUT_W, LUT_H, SKY.buf); renderer.setRenderTarget(null);
  // main light
  const sunFade = sstep(-0.012, 0.03, sinS), k = SUNI / Math.PI * 0.8;
  if (sunFade > 0.001) { U.uLDir.value.copy(sd); U.uLCol.value.setRGB(Ts[0] * k * sunFade, Ts[1] * k * sunFade, Ts[2] * k * sunFade); }
  else if (moonUp) { const f = sstep(0, 0.06, Math.sin(a.moon.alt)), q = moonI / Math.PI * 0.8 * f; U.uLDir.value.copy(md); U.uLCol.value.setRGB(Tm[0] * q * 0.9, Tm[1] * q * 0.96, Tm[2] * q); }
  else { U.uLDir.value.set(0, 1, 0); U.uLCol.value.setRGB(0, 0, 0); }
  U.uCloudShade.value = WX.shade;
  // ambient from the sky LUT
  const up = skyIrradiance(0, 1, 0), sides = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(n => skyIrradiance(...n));
  const hor = [0, 1, 2].map(i => (sides[0][i] + sides[1][i] + sides[2][i] + sides[3][i]) / 4);
  const PI = Math.PI, L = U.uLCol.value, Ly = Math.max(U.uLDir.value.y, 0) * WX.shade;
  U.uSkyUp.value.setRGB(up[0] / PI, up[1] / PI, up[2] / PI); U.uSkyHor.value.setRGB(hor[0] / PI * 1.15, hor[1] / PI * 1.15, hor[2] / PI * 1.15);
  const gb = 0.16 + 0.5 * WX.snow * U.uSnow.value; U.uGroundCol.value.setRGB(gb * (up[0] / PI + L.r * Ly), gb * (up[1] / PI + L.g * Ly), gb * (up[2] / PI + L.b * Ly) * 0.95);
  // night factors
  const night = 1 - sstep(-0.115, -0.012, sinS); U.uNight.value = Math.max(night, WX.over * 0.0);
  const h = S.hour; U.uLate.value = h < 6.5 ? (h < 1 ? sstep(-1.5, 1.0, h) : 1 - sstep(4.5, 6.5, h) * 0.55) : sstep(21.5, 25.5, h);
  // dome
  const du = SKY.domeMat.uniforms; du.uSunTr.value.setRGB(Ts[0], Ts[1], Ts[2]).multiplyScalar((1 - WX.over) * (1 - 0.6 * sstep(0.4, 0.9, WX.cover)));
  du.uMoonCol.value.setRGB(0.80, 0.78, 0.72).multiplyScalar(0.12 * SUNI / PI * (1 - WX.over));
  du.uStarVis.value = (1 - sstep(-0.21, -0.07, sinS)) * (1 - WX.over) * (1 - 0.7 * WX.cover) * Math.exp(-WX.haze * 0.12);
  const lat = fr.lat * RAD; dirFromAzAlt(0, lat, du.uPole.value); du.uLst.value = -a.lst;
  du.uCover.value = WX.cover; du.uCirrus.value = WX.cirrus; du.uOvercast.value = WX.over;
  du.uCloudAmb.value.setRGB(up[0] / PI * 0.75, up[1] / PI * 0.75, up[2] / PI * 0.75);
  du.uCloudGlow.value.setRGB(3.4e-4, 2.5e-4, 1.8e-4);
  // seasons
  const se = season(S.doy); U.uLeaf.value = se.leaf; U.uBlossom.value = se.blossom; U.uFresh.value = se.fresh; U.uAutumn.value = se.autumn; U.uGrass.value = se.grass;
  // fog
  POST.fog.uniforms.uHaze.value = WX.haze; POST.fog.uniforms.uPrecip.value = WX.precip;
  ENV.lampOn = S.lights === 'on' || (S.lights === 'auto' && night > 0.35);
  // exposure: luminous crisp daytime, smooth sunset/sunrise, rich night glow
  lutSample(_v.set(0, 0.08, -1).normalize(), _c); const skyH = lum(_c);
  const key = 0.48 * skyH + 0.24 * lum([L.r, L.g, L.b]) * Math.max(U.uLDir.value.y, 0.05) * WX.shade + 0.24 * lum(up) / PI;
  let e = 0.66 / Math.max(key, 1e-6);
  const cap = ENV.lampOn ? 0.55 / 0.012 : 170; e = clamp(e, 0.14, view.outdoors ? 150 : cap);
  ENV.expTarget = e;
  if (HOME.uni) {
    const HU = HOME.uni, facing = skyIrradiance(0, 0, -1);
    const cl = WX.cover * 0.5, cloudL = [L.r, L.g, L.b].map(v => v * 0.22 * Math.max(sd.y, 0.05) + 0);
    const ws = [0, 1, 2].map(i => lerp(facing[i] / (PI / 2), cloudL[i] + up[i] / PI, cl * (1 - WX.over)));
    HU.uWinSky.value.set(ws[0], ws[1], ws[2]);
    const gE = [0, 1, 2].map(i => 0.2 * (up[i] + [L.r, L.g, L.b][i] * PI * Ly) / PI); HU.uWinGnd.value.set(gE[0], gE[1], gE[2]);
    const LL = ENV.lampOn ? 0.42 : 0; HU.uLampL.value.set(LL, LL * 0.93, LL * 0.82);
    for (let i = 0; i < 6; i++) HU.uLampOn.value[i] = ENV.lampOn ? 1 : 0;
    const T = 0.74, rho = 0.62, lamps = HU.uLamp.value, LD = U.uLDir.value;
    const sunIn = LD.z < -0.03 && LD.y > 0 ? 1 : 0;
    HU.uSunIn.value.set(0, 0, 0);
    ROOMS.forEach((r, i) => {
      const w = r.win, A = (w[1] - w[0]) * (w[3] - w[2]), bx = r.box, fa = (bx[1] - bx[0]) * (bx[3] - bx[2]) * (i === 0 ? 0.9 : 1), per = 2 * ((bx[1] - bx[0]) + (bx[3] - bx[2]));
      const Atot = 2 * fa + per * CEIL;
      let blocked = 1; if (sunIn) blocked = sunBlocked((w[0] + w[1]) / 2, FY + 1.3, -0.2, LD) ? 0 : 1;
      if (i === 0 && sunIn && blocked) HU.uSunIn.value.set(L.r * Ly, L.g * Ly, L.b * Ly);
      const lampA = 4 * lamps[i].z * lamps[i].w + (i === 0 ? 4 * (lamps[4].z * lamps[4].w + lamps[5].z * lamps[5].w) : 0);
      const amb = [0, 1, 2].map(c => {
        const phi = (ws[c] + gE[c]) / 2 * PI * A * T + sunIn * blocked * [L.r, L.g, L.b][c] * PI * WX.shade * Math.max(-LD.z, 0) * A * T * 0.8 + [LL, LL * 0.93, LL * 0.82][c] * PI * lampA;
        return phi * rho / (Atot * (1 - rho)) / PI;
      });
      HU.uRoomAmb.value[i].set(amb[0], amb[1], amb[2]);
    });
    const a0 = HU.uRoomAmb.value[0]; HU.uRoomAmb.value[4].set(a0.x * 0.5 + LL * 0.012, a0.y * 0.5 + LL * 0.011, a0.z * 0.5 + LL * 0.010);
    ENV.Lin = 0.06 * lum(ws) + lum([a0.x, a0.y, a0.z]) * 0.8 + (ENV.lampOn ? 0.012 : 0);
    { // camera-like white balance indoors (65 % toward neutral)
      const c = [0, 1, 2].map(i => 0.06 * ws[i] + [a0.x, a0.y, a0.z][i] * 0.8 + (ENV.lampOn ? [0.012, 0.0112, 0.0098][i] : 0)); const g = lum(c) || 1;
      HU.uWB.value.set(lerp(1, g / Math.max(c[0], 1e-9), 0.65), lerp(1, g / Math.max(c[1], 1e-9), 0.65), lerp(1, g / Math.max(c[2], 1e-9), 0.65)); }
  }
  SHADOW.dirty = true; ENV.dirty = false;
  if (!ENV.last || ENV.last !== S.doy) { ENV.last = S.doy; ENV.liv = livingSun(S.doy); }
  updateInfo(a);
}

function fmtH(h) { const m = Math.round(h * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function fmtDate(doy) { const d = new Date(Date.UTC(YEAR, 0, 1 + doy)); return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일'; }
function sunTimes(doy) {
  let rise = null, set = null, prev = -1;
  for (let m = 0; m <= 1440; m += 2) { const al = AST.at(Date.UTC(YEAR, 0, 1) + doy * 864e5 + (m / 60 - 9) * 36e5, W.frame.lat, W.frame.lon).sun.alt + 0.0145; if (prev < 0 && al >= 0 && m > 0 && rise === null) rise = m; if (prev >= 0 && al < 0) set = m; prev = al; }
  return { rise, set };
}
function updateInfo(a) {
  if (!$('info')) return;
  const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'], az = (a.sun.az / RAD % 360 + 360) % 360;
  $('dateLab').textContent = fmtDate(S.doy); $('timeLab').textContent = fmtH(S.hour); $('clock').textContent = fmtDate(S.doy) + ' ' + fmtH(S.hour);
  const weekday=(JANUARY_FIRST+S.doy)%7;
  $('i-traffic').textContent=['일','월','화','수','목','금','토'][weekday]+'요일 · 기준 피크의 '+Math.round(100*trafficDemand(S.doy,S.hour))+'%';
  if (ENV.infoDoy !== S.doy) { ENV.infoDoy = S.doy; ENV.st = sunTimes(S.doy); }
  const st = ENV.st, lv = ENV.liv;
  $('i-rise').textContent = st.rise != null ? fmtH(st.rise / 60) : '–'; $('i-set').textContent = st.set != null ? fmtH(st.set / 60) : '–';
  $('i-sun').textContent = a.sun.alt > 0 ? `${dirs[Math.round(az / 45) % 8]} ${Math.round(az)}° · 고도 ${Math.round(a.sun.alt / RAD)}°` : '지평선 아래';
  $('i-liv').textContent = lv && lv.minutes ? `${fmtH(lv.first / 60)}～${fmtH((lv.last + 10) / 60)} (${Math.floor(lv.minutes / 60)}시간${lv.minutes % 60 ? ' ' + lv.minutes % 60 + '분' : ''})` : '없음';
}

// precipitation: streaks (rain) / flakes (snow) in a box that follows the camera
function buildPrecip() {
  const N = 9000, pos = new Float32Array(N * 2 * 3), sd = new Float32Array(N * 2 * 2);
  for (let i = 0; i < N; i++) { const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random(); for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); sd.set([s, k], (i * 2 + k) * 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCamPos: U.uCamPos, uAmt: { value: 0 }, uSnowy: { value: 0 }, uCol: { value: new THREE.Color() } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec2 aS; uniform float uTime, uSnowy, uAmt; uniform vec3 uCamPos; varying float vA;
      void main(){ vec3 B=vec3(46.0,34.0,46.0); float sp=mix(15.0,1.6+aS.x*1.2,uSnowy);
        vec3 p=position*B; p.y-=uTime*sp; p.x+=uSnowy*sin(uTime*0.7+aS.x*40.0)*0.8+uTime*mix(1.6,0.7,uSnowy);
        p=mod(p-uCamPos+B*0.5,B)-B*0.5; p+=uCamPos; p.y+=aS.y*mix(0.75,0.045,uSnowy); p.x+=aS.y*mix(0.08,0.02,uSnowy);
        vA=step(aS.x,uAmt*1.4); vec4 mv=viewMatrix*vec4(p,1.0); vA*=smoothstep(3.0,5.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `precision highp float; uniform vec3 uCol; uniform float uSnowy; varying float vA; void main(){ if(vA<0.5) discard; gl_FragColor=vec4(uCol,mix(0.16,0.85,uSnowy)); }`,
  });
  const m = new THREE.LineSegments(g, mat); m.frustumCulled = false; return m;
}

// 2D plan (seen from above, windows at the bottom) with the current position; tap or drag on it to move
const PLAN = { x0: -2.64, x1: 12.32, z0: 0, z1: 9.9 };
const RLIST = [['거실', -2.25, 2.25, 0.38, 5.05], ['주방', -2.25, 2.76, 5.05, 9.45], ['침실2', 2.46, 5.15, 0.38, 3.85], ['침실3', 5.30, 8.29, 0.38, 3.85], ['안방', 8.5, 12.13, 1.59, 4.98], ['발코니', 8.5, 12.13, 0.2, 1.59], ['복도', 2.25, 8.5, 3.85, 5.29],
  ['욕실', 2.96, 5.45, 5.29, 7.0], ['다용도실', 2.94, 5.45, 7.0, 9.45], ['현관', 5.6, 7.04, 5.29, 8.6], ['현관창고', 5.6, 7.04, 8.6, 9.45], ['부부욕실', 7.78, 10.12, 5.14, 7.0], ['파우더', 10.27, 12.13, 4.98, 6.65], ['드레스룸', 10.27, 12.13, 6.65, 8.6]];
const roomAt = (x, z) => { for (const r of RLIST) if (x >= r[1] && x <= r[2] && z >= r[3] && z <= r[4]) return r[0]; return ''; };
function walkable(x, z, R = 0.2) { if (x < -2.05 || x > 11.93 || z < 0.6 || z > 9.25) return false; for (const b of HOME.solid) if (x > b[0] - R && x < b[1] + R && z > b[2] - R && z < b[3] + R) return false; return true; }
function drawMap() {
  const c = $('map'); if (!c) return; const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  const heading = view.outdoors ? cam.getWorldDirection(_v) : null;
  const key = w + (view.outdoors ? 'd'+Math.round(cam.position.x)+','+Math.round(cam.position.z)+','+Math.atan2(heading.x,-heading.z).toFixed(2) : view.pos.x.toFixed(2) + ',' + view.pos.z.toFixed(2) + ',' + view.yaw.toFixed(2) + ',' + view.fov.toFixed(0)); if (key === drawMap.k) return; drawMap.k = key;
  const d = Math.min(devicePixelRatio || 1, 3); if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  if (view.outdoors) { drawSiteMap(g,w,h,heading); return; }
  const pad = 6, s = Math.min((w - 2 * pad) / (PLAN.x1 - PLAN.x0), (h - 2 * pad) / (PLAN.z1 - PLAN.z0)), ox = (w - s * (PLAN.x1 - PLAN.x0)) / 2, oz = (h - s * (PLAN.z1 - PLAN.z0)) / 2;
  const X = (x) => ox + (PLAN.x1 - x) * s, Z = (z) => oz + (PLAN.z1 - z) * s, R = (x0, x1, z0, z1) => g.fillRect(X(x1), Z(z1), (x1 - x0) * s, (z1 - z0) * s);
  drawMap.inv = (px, py) => [PLAN.x1 - (px - ox) / s, PLAN.z1 - (py - oz) / s];
  const cur = view.outdoors ? '' : roomAt(view.pos.x, view.pos.z);
  for (const r of RLIST) { g.fillStyle = r[0] === cur ? 'rgba(243,183,101,.36)' : 'rgba(255,255,255,.12)'; R(r[1], r[2], r[3], r[4]); }
  g.fillStyle = 'rgba(255,255,255,.2)'; for (const b of HOME.solid) if ((b[1] - b[0]) > 0.25 && (b[3] - b[2]) > 0.25) R(b[0], b[1], b[2], b[3]);     // cabinets and fixtures
  for (const b of HOME.walls) { g.fillStyle = b[4] > 2 ? 'rgba(255,255,255,.9)' : 'rgba(130,200,255,.9)'; R(b[0], b[1], b[2], b[3]); }
  g.font = '500 9px ' + getComputedStyle(document.body).fontFamily; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.82)';
  for (const r of RLIST) if ((r[2] - r[1]) * s > 30 && (r[4] - r[3]) * s > 18) g.fillText(r[0], X((r[1] + r[2]) / 2), Z((r[3] + r[4]) / 2));
  if (!view.outdoors) { const px = X(view.pos.x), py = Z(view.pos.z), a = Math.atan2(Math.cos(view.yaw), -Math.sin(view.yaw)), hf = view.fov * RAD * 0.62;
    const gr = g.createRadialGradient(px, py, 0, px, py, 22); gr.addColorStop(0, 'rgba(243,183,101,.75)'); gr.addColorStop(1, 'rgba(243,183,101,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(px, py); g.arc(px, py, 22, a - hf, a + hf); g.closePath(); g.fill();
    g.fillStyle = '#f3b765'; g.strokeStyle = '#1d1406'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, 3.6, 0, 6.2832); g.fill(); g.stroke(); }
}
function goView(name, instant) {
  const street=name==='street';
  const gate=name==='main-gate' ? WORLD.gates.main : name==='west-gate' ? WORLD.gates.west : null;
  if (!street && !gate && !Object.hasOwn(VIEWS,name)) name='overview';
  view.outdoors=!!gate || street || name==='overview';
  if (view.outdoors && HOME.group) releaseHome();
  if (!view.outdoors && !HOME.group) homeScene.add(buildHome(HOME.floorLight));
  S.room=name; const v=VIEWS[name];
  if (!view.outdoors) { view.tpos.set(v.p[0], FY + EYE, v.p[1]); view.tyaw = v.yaw; view.tpitch = v.pitch; view.tfov = 62; if (instant) { view.pos.copy(view.tpos); view.yaw = view.tyaw; view.pitch = view.tpitch; } }
  if (name === 'overview') orbit.playing = true;
  if (street) {
    // Look west from the sidewalk along the arm with the two crossings.
    view.tpos.set(176,streetDeckY(176,-30.7)+2.15,-30.7);
    view.tyaw=-2.11; view.tpitch=-0.055; view.tfov=65;
    view.pos.copy(view.tpos); view.yaw=view.tyaw; view.pitch=view.tpitch; view.fov=view.tfov;
  }
  if (gate) {
    const [x,z]=gate.mouth, dx=Math.sin(gate.heading), dz=-Math.cos(gate.heading);
    const lateral=name==='west-gate'?4:7;
    const px=x-13*dx+lateral*dz, pz=z-13*dz-lateral*dx;
    view.tpos.set(px,entranceFloor(x,z)+6.2,pz);
    const vx=gate.gate[0]-px,vz=gate.gate[1]-pz;
    view.tyaw=Math.atan2(vx,-vz); view.tpitch=-0.20; view.tfov=63;
    view.pos.copy(view.tpos); view.yaw=view.tyaw; view.pitch=view.tpitch; view.fov=view.tfov;
  }
  $('overview').setAttribute('aria-pressed',name==='overview');
  $('living').setAttribute('aria-pressed',!view.outdoors);
  $('street').setAttribute('aria-pressed',street);
  $('orbit').hidden = name !== 'overview';
  $('orbit').setAttribute('aria-pressed',orbit.playing);
  $('stick').classList.toggle('off',view.outdoors);
  $('map').classList.toggle('site-map',view.outdoors);
  drawMap.inv = null;
  drawMap.k = null;
  $('mapcredit').hidden = !view.outdoors;
  $('map').setAttribute('aria-label',view.outdoors ? '북쪽 기준 단지와 주변 도로 배치도' : '평면도. 눌러서 이동');
  if (marker) marker.visible = view.outdoors; ENV.dirty = true;
}

function setupUI() {
  const mkChips = (id, items, cur, on) => { const el = $(id); items.forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.v = k; b.setAttribute('aria-pressed', k === cur); b.onclick = () => { el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); on(k); }; el.appendChild(b); }); };
  mkChips('wx', [['clear', '맑음'], ['few', '구름 조금'], ['cloudy', '흐림'], ['rain', '비'], ['snow', '눈'], ['dust', '미세먼지']], S.weather, k => { S.weather = k; });
  mkChips('lights', [['auto', '자동'], ['on', '켬'], ['off', '끔']], S.lights, k => { S.lights = k; ENV.dirty = true; });
  const seasons = [['봄', 106, 10.5], ['여름', 201, 14], ['가을', 306, 16.2], ['겨울', 14, 8.6]];
  const se = $('seasons'); seasons.forEach(([label, d, h]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { S.doy = d; $('doy').value = d; ENV.dirty = true; }; se.appendChild(b); });
  $('doy').value = S.doy; $('hr').value = S.hour;
  $('doy').oninput = (e) => { S.doy = +e.target.value; ENV.dirty = true; };
  $('hr').oninput = (e) => { S.hour = +e.target.value; ENV.dirty = true; };
  $('play').onclick = () => { S.playing = !S.playing; $('play').setAttribute('aria-pressed', S.playing); $('play').textContent = S.playing ? '멈춤' : '하루 재생'; };
  $('hide').onclick = () => { const h = $('hud').classList.toggle('min'); $('hide').setAttribute('aria-pressed', !h); };
  $('title').onclick = () => { const f = $('facts'); f.hidden = !f.hidden; $('title').setAttribute('aria-expanded', !f.hidden); };
  $('orbit').onclick = () => {
    orbit.playing = !orbit.playing;
    $('orbit').setAttribute('aria-pressed',orbit.playing);
  };
  for (const button of document.querySelectorAll('[data-gate-view]'))
    button.onclick=()=>{goView(button.dataset.gateView,true); $('facts').hidden=true; $('title').setAttribute('aria-expanded',false);};
  $('street').onclick = () => goView('street',true);
  $('overview').onclick = () => goView('overview',true);
  $('living').onclick = () => goView('living',true);
  { const mp = $('map'); const go = (e) => { if (view.outdoors || !drawMap.inv) return; const r = mp.getBoundingClientRect(), [x, z] = drawMap.inv(e.clientX - r.left, e.clientY - r.top); let best = null;
      for (let rad = 0; rad <= 1.2 && !best; rad += 0.15) for (let a = 0; a < 12; a++) { const px = x + Math.cos(a * 0.5236) * rad, pz = z + Math.sin(a * 0.5236) * rad; if (walkable(px, pz) && roomAt(px, pz)) { best = [px, pz]; break; } }
      if (!best) return;
      const far = Math.hypot(best[0] - view.pos.x, best[1] - view.pos.z) > 1.2; view.tpos.x = best[0]; view.tpos.z = best[1]; if (far) { view.pos.x = best[0]; view.pos.z = best[1]; } };
    mp.addEventListener('pointerdown', (e) => { e.preventDefault(); mp.setPointerCapture(e.pointerId); go(e); }); mp.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') go(e); }); }
  // look controls
  const cv = renderer.domElement; let drag = null, pinch = 0; const pts = new Map();
  // name of the building under the cursor (hover) or finger (tap)
  const tip = $('tip'); let tipT = 0, down = null, lastPick = 0;
  const showTip = (cx, cy, hold) => {
    const r = cv.getBoundingClientRect(), hit = pickAt(cam, (cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1), !view.outdoors);
    clearTimeout(tipT); if (!hit) { tip.hidden = true; return; }
    const dm = hit.dist < 950 ? Math.round(hit.dist / 10) * 10 + 'm' : (hit.dist / 1000).toFixed(1) + 'km';
    tip.firstChild.textContent = hit.name; tip.lastChild.textContent = (hit.sub ? hit.sub + ' · ' : '') + dm; tip.hidden = false;
    const w = tip.offsetWidth, x = clamp(cx - r.left + 14, 8, r.width - w - 8), y = clamp(cy - r.top - 40, 8, r.height - 40); tip.style.transform = `translate(${x}px,${y}px)`;
    if (hold) tipT = setTimeout(() => { tip.hidden = true; }, 3500);
  };
  cv.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || pts.size) return; const t = performance.now(); if (t - lastPick < 60) return; lastPick = t; showTip(e.clientX, e.clientY, false); });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  cv.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, performance.now()]; tip.hidden = true; });
  cv.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 8 && performance.now() - down[2] < 500) showTip(e.clientX, e.clientY, e.pointerType !== 'mouse'); down = null; });
  window.__pick = (x, y) => pickAt(cam, x, y, !view.outdoors);
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; if (pts.size === 2) { const p = [...pts.values()]; pinch = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); } });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const p = [...pts.values()], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); if (pinch) { if (S.room === 'overview') orbit.distance = clamp(orbit.distance * pinch / d, 60, 600); else view.tfov = clamp(view.tfov * pinch / d, 18, 85); } pinch = d; return; }
    const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; const k = 0.0032 * view.fov / 62;
    if (S.room === 'overview') { orbit.azimuth -= dx * 0.005; orbit.elevation = clamp(orbit.elevation + dy * 0.004, 0.03, 1.4); }
    else { const sg = e.pointerType === 'mouse' ? -1 : 1; view.tyaw += dx * k * sg; view.tpitch = clamp(view.tpitch - dy * k * sg, -1.2, 1.2); }   // touch: look toward the drag; mouse: grab the scene (owner 2026-11-17)
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (S.room === 'overview') orbit.distance = clamp(orbit.distance * (1 + e.deltaY * 0.001), 60, 600); else view.tfov = clamp(view.tfov * (1 + e.deltaY * 0.0012), 18, 85); }, { passive: false });
  const keys = {}; const MOVE = /^(Arrow(Up|Down|Left|Right)|Key[WASD])$/;
  // hide every control: button or H; H, Esc or a double tap brings them back
  const toast = (t) => { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600); };
  const setClean = (on) => { $('stage').classList.toggle('clean', on); if (on) toast(matchMedia('(pointer:coarse)').matches ? '화면을 두 번 탭하면 돌아옵니다' : 'H 키나 더블클릭으로 돌아옵니다'); else $('toast').hidden = true; };
  $('clean').onclick = () => setClean(true);
  { const de = document.documentElement, fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    { // background music: an original bright piano-and-strings piece synthesised in the browser (no recording is shipped)
      let ac = null, out = null, timer = 0, next = 0, bar = 0, on = false;
      const BPM = 96, B = 60 / BPM, hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const CH = [[38, [62, 66, 69, 74]], [37, [61, 64, 69, 73]], [35, [59, 62, 66, 71]], [31, [59, 62, 67, 71]], [42, [62, 66, 69, 74]], [40, [59, 62, 67, 71]], [43, [59, 62, 67, 71]], [45, [61, 64, 69, 73]]];
      const MEL = [[[78, 0, 1], [81, 1, 1], [86, 2, 1.5], [85, 3.5, .5]], [[85, 0, 1], [81, 1, 1], [76, 2, 2]], [[74, 0, 1], [78, 1, 1], [83, 2, 1.5], [81, 3.5, .5]], [[79, 0, 1.5], [78, 1.5, .5], [74, 2, 2]],
        [[78, 0, 1], [81, 1, 1], [86, 2, 1], [88, 3, 1]], [[90, 0, 1.5], [88, 1.5, .5], [86, 2, 1], [83, 3, 1]], [[81, 0, 1], [83, 1, 1], [86, 2, 1], [83, 3, 1]], [[85, 0, 2], [81, 2, 1], [85, 3, 1]]];
      const key = (m, t, d, v) => { const f = hz(m), g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(f * 6, 9000), t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 1.2);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(v * 0.32, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(d * 1.8, 1.4));
        for (const [k, a, ty] of [[1, 1, 'triangle'], [2.002, 0.32, 'sine'], [3.004, 0.12, 'sine']]) { const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f * k; og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + Math.max(d * 1.8, 1.4) + 0.05); }
        lp.connect(g); g.connect(out); };
      const pad = (ms, t, d, v) => { const g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.9); g.gain.setValueAtTime(v, t + d - 0.3); g.gain.linearRampToValueAtTime(0, t + d + 1.1);
        for (const m of ms) for (const dt of [-6, 5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + d + 1.2); } lp.connect(g); g.connect(out); };
      const sched = () => { while (next < ac.currentTime + 0.6) { const i = bar % 8, rnd = Math.floor(bar / 8), [bs, tn] = CH[i], t = next;
          key(bs, t, 4 * B, 0.20); key(bs + 12, t, 4 * B, 0.10); pad(tn.slice(0, 3), t, 4 * B, rnd > 0 ? 0.022 : 0.012);
          const ord = [0, 2, 1, 3, 2, 1, 3, 2]; for (let k = 0; k < 8; k++) key(tn[ord[k]] - 12, t + k * B / 2 + 0.004 * (k % 2), B, 0.075);
          if (rnd % 3 !== 0 || i > 3 || bar > 7) for (const [m, s0, d] of MEL[i]) { key(m - (rnd % 2 ? 0 : 12), t + s0 * B, d * B, 0.15); if (rnd % 2) key(m - 12, t + s0 * B, d * B, 0.05); }
          next += 4 * B; bar++; } };
      const start = () => { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { toast('이 기기는 소리를 낼 수 없습니다'); return false; }
        if (!ac) { ac = new AC(); out = ac.createGain(); const cmp = ac.createDynamicsCompressor(), cv = ac.createConvolver(), wet = ac.createGain(); wet.gain.value = 0.28;
          const n = Math.floor(ac.sampleRate * 2.4), ir = ac.createBuffer(2, n, ac.sampleRate); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let j = 0; j < n; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / n, 2.6); } cv.buffer = ir;
          out.connect(cmp); out.connect(cv); cv.connect(wet); wet.connect(cmp); cmp.connect(ac.destination); }
        ac.resume(); out.gain.cancelScheduledValues(ac.currentTime); out.gain.setValueAtTime(0.0001, ac.currentTime); out.gain.exponentialRampToValueAtTime(0.8, ac.currentTime + 1.2);
        next = ac.currentTime + 0.15; bar = 0; clearInterval(timer); timer = setInterval(sched, 120); sched(); return true; };
      const stop = () => { clearInterval(timer); if (ac) { out.gain.cancelScheduledValues(ac.currentTime); out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.25); setTimeout(() => { if (!on && ac) ac.suspend(); }, 1500); } };
      $('bgm').onclick = () => { on = !on; if (on && !start()) on = false; if (!on) stop(); $('bgm').setAttribute('aria-pressed', on); $('bgm').textContent = on ? '음악 끄기' : '음악'; };
    }
    $('fs').onclick = () => { if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const rq = de.requestFullscreen || de.webkitRequestFullscreen; const fb = () => { setClean(true); toast('이 기기는 전체화면을 막아 두어 화면 가리기로 대신합니다'); };
      if (!rq) { fb(); return; } try { const r = rq.call(de); if (r && r.catch) r.catch(fb); } catch (e) { fb(); } };
    const upd = () => { $('fs').setAttribute('aria-pressed', fsOn()); $('fs').textContent = fsOn() ? '전체화면 끄기' : '전체화면'; }; document.addEventListener('fullscreenchange', upd); document.addEventListener('webkitfullscreenchange', upd); }
  renderer.domElement.addEventListener('dblclick', () => { if ($('stage').classList.contains('clean')) setClean(false); });
  { let lastTap = 0; renderer.domElement.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') return; const t = performance.now(); if (t - lastTap < 350 && $('stage').classList.contains('clean')) setClean(false); lastTap = t; }); }
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' || (e.code === 'Escape' && $('stage').classList.contains('clean'))) { setClean(e.code === 'KeyH' ? !$('stage').classList.contains('clean') : false); return; }
    if (MOVE.test(e.code)) { const a = document.activeElement; if (a && a.tagName === 'INPUT') a.blur(); e.preventDefault(); }
    keys[e.code] = 1; });
  addEventListener('keyup', (e) => { keys[e.code] = 0; }); addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
  // touch pad for walking
  { const st = $('stick'), nub = st.firstElementChild; view.joy = [0, 0];
    const mv = (e) => { const r = st.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } view.joy = [x, y]; nub.style.transform = `translate(${x * 30}px,${y * 30}px)`; };
    const end = () => { view.joy = [0, 0]; nub.style.transform = ''; };
    st.addEventListener('pointerdown', (e) => { st.setPointerCapture(e.pointerId); mv(e); }); st.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') mv(e); }); st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end); }
  view.keys = keys;
}

function tick(dt) {
  renderer.info.reset();
  U.uTime.value += dt;
  if (S.playing) { S.hour += dt * 24 / 48; if (S.hour >= 24) { S.hour -= 24; } $('hr').value = S.hour; ENV.dirty = true; }
  // weather easing
  const tw = WEATHER[S.weather]; let moved = false;
  for (const k in tw) { const d = tw[k] - WX[k]; if (Math.abs(d) > 1e-4) { WX[k] += d * Math.min(1, dt * (SHOT ? 1000 : 1.6)); moved = true; } }
  const snowT = tw.snow; if (Math.abs(U.uSnow.value - snowT) > 1e-3) { U.uSnow.value += (snowT - U.uSnow.value) * Math.min(1, dt * (SHOT ? 1000 : 0.5)); moved = true; }
  U.uWet.value = WX.wet;
  if (moved) ENV.dirty = true;
  if (ENV.dirty) updateEnv();
  precip.material.uniforms.uAmt.value = WX.precip; precip.material.uniforms.uSnowy.value = WX.snow; precip.visible = WX.precip > 0.01;
  const pc = precip.material.uniforms.uCol.value, sk = U.uSkyHor.value; pc.setRGB(sk.r * 2.2 + 2e-4, sk.g * 2.2 + 2e-4, sk.b * 2.3 + 2e-4);
  // camera
  const k = view.keys || {};
  if (S.room === 'overview') {
    if (orbit.playing) orbit.azimuth += dt * 0.02;
    const radius = orbit.distance * Math.cos(orbit.elevation);
    const cy = FY * 0.7, cz = -25;
    cam.position.set(Math.sin(orbit.azimuth)*radius, cy+Math.sin(orbit.elevation)*orbit.distance, cz-Math.cos(orbit.azimuth)*radius);
    cam.lookAt(0,cy,cz);
    view.pos.copy(cam.position);
    view.fov = 50;
  } else {
    if (!view.outdoors) {
      // arrows look (←→ turn, ↑↓ tilt), WASD walk and side-step, Shift faster; the touch pad does the same as WASD
      const J = view.joy || [0, 0], run = k.ShiftLeft || k.ShiftRight ? 1.9 : 1;
      const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) - J[1], r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + J[0];
      if (f || r) { const fx = Math.sin(view.yaw), fz = -Math.cos(view.yaw), st = 1.7 * run * dt; const R = 0.2;
        const free = (x, z) => walkable(x, z, R);
        const nx = view.tpos.x + (fx * f - fz * r) * st, nz = view.tpos.z + (fz * f + fx * r) * st;
        if (free(nx, view.tpos.z)) view.tpos.x = nx; if (free(view.tpos.x, nz)) view.tpos.z = nz; }
    }
    const turn = Number(!!k.ArrowRight) - Number(!!k.ArrowLeft);
    const tilt = Number(!!k.ArrowUp) - Number(!!k.ArrowDown);
    view.tyaw += turn * 1.7 * dt;
    view.tpitch = clamp(view.tpitch + tilt * 1.1 * dt, -1.2, 1.2);
    const e = SHOT ? 1 : 1 - Math.exp(-dt * 7);
    view.pos.lerp(view.tpos, e); view.yaw += (view.tyaw - view.yaw) * e; view.pitch += (view.tpitch - view.pitch) * e; view.fov += (view.tfov - view.fov) * e;
    cam.position.copy(view.pos); cam.rotation.set(view.pitch, -view.yaw, 0, 'YXZ');
  }
  // view.fov is the vertical angle on a wide screen; on a tall (phone) screen widen it so the sideways view is not a narrow slot
  cam.fov = view.outdoors || cam.aspect >= 1.2 ? view.fov : Math.min(110, 2 * Math.atan(Math.tan(view.fov * RAD / 2) * Math.pow(1.2 / cam.aspect, 0.6)) / RAD); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  for (const d of HOME.doors) {   // doors rest shut and open as you come near
    const near = !view.outdoors && Math.hypot(view.pos.x - d.cx, view.pos.z - d.cz) < (d.t > 0.01 ? 1.9 : 1.45), want = near ? 1 : 0;
    const ds = Math.max(dt, 0) * 1.5; d.t = SHOT ? want : clamp(d.t + clamp(want - d.t, -ds, ds), 0, 1); const e = d.t * d.t * (3 - 2 * d.t);
    if (d.rot !== undefined) d.mesh.rotation.y = d.rot * e; else d.mesh.position.set(d.px + d.sx * e, 0, d.pz + d.sz * e); }
  { const rl = view.outdoors ? (S.room==='street' ? '교차로' : S.room==='main-gate' ? '주출입구' : S.room==='west-gate' ? '부출입구' : '단지 전경') : (roomAt(view.pos.x, view.pos.z) || '집'); if (rl !== view.rl) { view.rl = rl; $('roomLab').textContent = rl; } drawMap(); }
  WORLD.updateCars(dt, cam, trafficDemand(S.doy,S.hour));
  if (SHADOW.dirty) { renderShadow(renderer); SHADOW.dirty = false; }
  // exposure adaptation + interior balance
  const ea = SHOT ? 1 : 1 - Math.exp(-dt * 2.5); ENV.exp = Math.exp(lerp(Math.log(ENV.exp), Math.log(ENV.expTarget), ea));
  const HU = HOME.uni; if (HU) { HU.uBoost.value = clamp(0.54 / (ENV.exp * Math.max(ENV.Lin, 1e-7)), 1, 40); HU.uBoostSun.value = Math.min(HU.uBoost.value, 1.7); }
  WORLD.lamps.material.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan(cam.fov * RAD / 2)) / 500;
  renderFrame(renderer, extScene, homeScene, cam, !view.outdoors, ENV.exp);
}

async function boot() {
  const cv = $('cv'); renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
  renderer.info.autoReset=false;
  let dpr = Math.min(devicePixelRatio || 1, SHOT ? 1 : 1.75); renderer.setPixelRatio(dpr);
  const size = () => [cv.clientWidth || innerWidth, cv.clientHeight || innerHeight]; let [w, h] = size(); renderer.setSize(w, h, false);
  const prog = (p, t) => { $('bar').style.width = Math.round(p * 100) + '%'; if (t) $('loadmsg').textContent = t; };
  prog(0.05, '지형과 도시 자료를 불러오는 중');
  await loadWorld(); W.site = SITE_OUTLINE.map(p=>planPoint(...p)); demN = arr('dem_n'); demF = arr('dem_f'); U.uHF.value = W.HF;
  const basisPath=new URL('../libs/basis/',import.meta.resolve('three/addons/loaders/KTX2Loader.js')).href;
  const ktx=new KTX2Loader().setTranscoderPath(basisPath).setWorkerLimit(1).detectSupport(renderer);
  const pavement=ktx.loadAsync('data/asphalt.ktx2').catch(()=>loadTex('data/asphalt.webp',false)).finally(()=>ktx.dispose());
  const [satN, satF, paint, satIn, streets, asphalt, floorLight] = await Promise.all([loadTex('sat_near.jpg'), loadTex('sat_far.jpg'), loadTex('roadpaint.png', true).catch(() => null), loadTex('sat_inner.jpg').catch(() => null),new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('data/streets.meshopt.glb'),
    pavement,loadTex('data/floor-light.png',false)]); HAS_PAINT = !!paint; if (paint) { paint.flipY = false; paint.needsUpdate = true; paint.generateMipmaps = true; paint.minFilter = THREE.LinearMipmapLinearFilter; paint.anisotropy = 16; } if (satIn) { satIn.flipY = false; satIn.needsUpdate = true; } prog(0.45, '지형을 세우는 중');
  U.uNoise.value = makeNoiseTex(256);
  cam = new THREE.PerspectiveCamera(62, w / h, 0.05, 160000); cam.rotation.order = 'YXZ';
  extScene = new THREE.Scene(); homeScene = new THREE.Scene();
  extScene.add(initSky(renderer)); initShadow(); POST.msaa = !QS.has('nomsaa'); initPost(renderer, Math.round(w * dpr), Math.round(h * dpr));
  await new Promise(r => setTimeout(r, 20));
  const nightMap=paintNightMap();
  extScene.add(buildTerrain(satN, satF, paintDetail(), nightMap, paint, satIn));
  asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping;
  asphalt.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  extScene.add(prepareStreets(streets.scene,nightMap,asphalt)); prog(0.6, '건물 1만 9천 동을 올리는 중'); await new Promise(r => setTimeout(r, 20));
  extScene.add(buildCity()); extScene.add(buildTowers()); extScene.add(buildComplexFeatures()); initPick(); prog(0.75, '나무와 주변 환경을 꾸미는 중'); await new Promise(r => setTimeout(r, 20));
  extScene.add(buildTrees()); extScene.add(buildWater()); extScene.add(buildLamps()); extScene.add(buildWorldProps()); extScene.add(buildCars());
  precip = buildPrecip(); extScene.add(precip);
  // marker for our unit in the overview
  { // gold outline of our flat: facade x -2.65..12.3, 17th-floor slab to slab, and the free end wall
    const y0 = FY, y1 = FY + FLOOR_H, x0 = -2.65, x1 = 12.3, zf = -0.07, zb = 10.25, xe = x0 - 0.07, P = [];
    const rect = (a, b, c, d) => { P.push(...a, ...b, ...b, ...c, ...c, ...d, ...d, ...a); };
    for (const o of [0, 0.05, 0.1]) { rect([x0 + o, y0 + o, zf], [x1 - o, y0 + o, zf], [x1 - o, y1 - o, zf], [x0 + o, y1 - o, zf]); rect([xe, y0 + o, 0 + o], [xe, y0 + o, zb - o], [xe, y1 - o, zb - o], [xe, y1 - o, 0 + o]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const e = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffc866 })); e.material.color.multiplyScalar(40); e.frustumCulled = false; marker = e; marker.visible = false; extScene.add(e); }
  prog(0.9, '시점을 준비하는 중'); await new Promise(r => setTimeout(r, 20));
  HOME.floorLight = floorLight;
  setupUI(); goView(QS.get('view') || S.room, true);
  addEventListener('resize', () => { const [w, h] = size(); renderer.setSize(w, h, false); cam.aspect = w / h; resizePost(Math.round(w * dpr), Math.round(h * dpr)); });
  Object.assign(WX, WEATHER[S.weather]); updateEnv(); ENV.exp = ENV.expTarget;
  prog(1, ''); $('load').classList.add('done'); if (SHOT) $('load').hidden = true; else setTimeout(() => { $('load').hidden = true; }, 900);
  window.__doors = HOME.doors; window.__gg = { S, view, ENV, WX, goView, frame: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) tick(dt); }, set: (o) => { Object.assign(S, o); if (o.weather) Object.assign(WX, WEATHER[o.weather]); ENV.dirty = true; }, info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, indoorLoaded: !!HOME.group, compressedAsphalt: !!asphalt.isCompressedTexture, trees: WORLD.treeTris }) };
  if (SHOT) return;
  let last = performance.now();
  // keep it fluid on slower GPUs: step the render resolution down while frames stay long
  let slow = 0, ema = 0.016, warm = 0;
  const loop = (t) => {
    const raw = (t - last) / 1000, dt = clamp(raw, 0, 0.1); last = t; tick(dt);
    if (++warm > 40 && raw < 0.5) { ema += (raw - ema) * 0.1; slow = ema > 0.036 ? slow + 1 : 0;
      if (slow > 45 && dpr > 0.7) { dpr = Math.max(0.7, dpr * 0.8); slow = 0; ema = 0.02; renderer.setPixelRatio(dpr); const [w, h] = size(); renderer.setSize(w, h, false); resizePost(Math.round(w * dpr), Math.round(h * dpr)); } }
    requestAnimationFrame(loop); }; requestAnimationFrame(loop);
}
boot().catch(e => { console.error(e); $('loadmsg').textContent = '불러오지 못했습니다: ' + e.message; });
