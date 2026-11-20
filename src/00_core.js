// ───────────── core: constants, data, astronomy, shared uniforms
const QS = new URLSearchParams(location.search);
const SHOT = QS.has('shot');
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;

// unit geometry (m). origin = living-room window centre on the inner facade line, pad ground y=0
const FLOOR_H = 3.0, FLOORS_BELOW = 16, FY = 0.9 + FLOORS_BELOW * FLOOR_H; // finished floor of 17F
const CEIL = 2.40, EYE = 1.56;

let W = null;       // world.json meta
let BIN = null;     // ArrayBuffer
const arr = (name) => { const d = W.idx[name]; const T = { uint32: Uint32Array, int16: Int16Array, uint16: Uint16Array, uint8: Uint8Array }[d.t]; return new T(BIN, d.o, d.n); };

async function loadWorld(onProg) {
  const [j, b] = await Promise.all([fetch('world.json').then(r => r.json()), fetch('world.wasm').then(r => r.arrayBuffer())]);
  W = j; BIN = b; onProg && onProg(0.3);
}
function loadTex(url, srgb = true) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
}

// ───── astronomy (after SunCalc, V. Agafonkin, BSD) — site fixed, KST
const AST = (() => {
  const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toDays = (ms) => ms / dayMs - 0.5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const az = (H, phi, d) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  const alt = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const sunM = (d) => rad * (357.5291 + 0.98560028 * d);
  const ecl = (M) => M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + PI;
  const sunC = (d) => { const L = ecl(sunM(d)); return { dec: dec(L, 0), ra: ra(L, 0) }; };
  const moonC = (d) => {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
    return { ra: ra(l, b), dec: dec(l, b), dist: dt };
  };
  function at(ms, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(ms), st = sidereal(d, lw);
    const s = sunC(d), Hs = st - s.ra;
    const m = moonC(d), Hm = st - m.ra;
    let mh = alt(Hm, phi, m.dec); mh += rad * 0.017 / Math.tan(mh + rad * 10.26 / (mh + rad * 5.10));
    const sdist = 149598000;
    const phi2 = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi2), m.dist - sdist * Math.cos(phi2));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return {
      sun: { az: az(Hs, phi, s.dec) + PI, alt: alt(Hs, phi, s.dec) },         // az: bearing from north, clockwise
      moon: { az: az(Hm, phi, m.dec) + PI, alt: mh, frac: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / PI },
      lst: st,
    };
  }
  return { at };
})();

// world state
const S = {
  doy: 311, hour: 15.5,                 // day of year (0-based, non-leap), local hour (KST)
  weather: 'clear',                     // clear | few | cloudy | rain | snow | dust
  lights: 'auto',                       // auto | on | off
  room: 'living',
  playing: false,
};
const YEAR = 2029;                      // 입주 예정 연도 기준
function stateMs() { return Date.UTC(YEAR, 0, 1, 0, 0, 0) + S.doy * 864e5 + (S.hour - 9) * 36e5; }
function dirFromAzAlt(az, alt, out) {   // bearing/alt -> scene vector
  const ce = Math.cos(alt), e = Math.sin(az) * ce, n = Math.cos(az) * ce, f = W.frame;
  return out.set(e * f.rE + n * f.rN, Math.sin(alt), -(e * f.nE + n * f.nN));
}

// season model from day of year → foliage parameters
function season(doy) {
  const d = doy + 1;
  const leaf = sstep(84, 112, d) * (1 - sstep(300, 332, d));          // deciduous leaf amount
  const blossom = sstep(89, 95, d) * (1 - sstep(101, 108, d));        // cherry (4/1–4/16)
  const fresh = sstep(84, 104, d) * (1 - sstep(125, 165, d));         // spring yellow-green
  const autumn = sstep(280, 304, d) * (1 - sstep(326, 340, d));       // colour peak ~11/3
  const grass = sstep(80, 112, d) * (1 - sstep(300, 345, d));         // lawn green vs tan
  return { leaf, blossom, fresh, autumn, grass };
}

// shared uniforms for every exterior/interior material
const U = {
  uTime: { value: 0 },
  uLDir: { value: new THREE.Vector3(0, 1, 0) },       // main light (sun, or moon at night)
  uLCol: { value: new THREE.Color(1, 1, 1) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uSkyUp: { value: new THREE.Color() },               // ambient from above
  uSkyHor: { value: new THREE.Color() },              // ambient from horizon ring
  uGroundCol: { value: new THREE.Color() },           // bounce from below
  uNight: { value: 0 },                               // 0 day .. 1 night (artificial lights on)
  uLate: { value: 0 },                                // 0 evening .. 1 deep night (fewer windows lit)
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uLeaf: { value: 1 }, uBlossom: { value: 0 }, uFresh: { value: 0 }, uAutumn: { value: 0 }, uGrass: { value: 1 },
  uShadowMap: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uShadowOn: { value: 1 },
  uSkyLUT: { value: null },
  uNoise: { value: null },
  uCamPos: { value: new THREE.Vector3() },
  uCloudShade: { value: 1 },                          // direct light factor from cloud cover
  uHF: { value: 40960 },                              // far terrain half extent for horizon fade
};

function makeNoiseTex(n = 256) {
  // tileable value-noise fbm in RGBA (4 independent channels)
  const data = new Uint8Array(n * n * 4);
  const rnd = (() => { let s = 1234567; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let c = 0; c < 4; c++) {
    const acc = new Float32Array(n * n);
    let amp = 1, tot = 0;
    for (let o = 0; o < 6; o++) {
      const g = 4 << o; const lat = new Float32Array(g * g); for (let i = 0; i < g * g; i++) lat[i] = rnd();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
        const v = lerp(lerp(lat[y0 * g + x0], lat[y0 * g + x1], tx), lerp(lat[y1 * g + x0], lat[y1 * g + x1], tx), ty);
        acc[y * n + x] += v * amp;
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < n * n; i++) data[i * 4 + c] = clamp(acc[i] / tot, 0, 1) * 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// GLSL shared by exterior materials
const GLSL_COMMON = /* glsl */`
uniform vec3 uLDir, uLCol, uSunDir, uSkyUp, uSkyHor, uGroundCol, uCamPos;
uniform float uNight, uLate, uSnow, uWet, uTime, uLeaf, uBlossom, uFresh, uAutumn, uGrass, uShadowOn, uCloudShade, uHF;
uniform sampler2D uShadowMap, uNoise, uSkyLUT;
uniform mat4 uShadowMat;
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 hash32(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
vec3 sampleSky(vec3 d){
  vec3 rd=normalize(d);
  float az=atan(rd.z,rd.x), el=asin(clamp(rd.y,-1.0,1.0));
  float s=sign(el)*sqrt(abs(el)/1.5707963);
  return texture2D(uSkyLUT, vec2(az/6.2831853+0.5, s*0.5+0.5)).rgb;
}
float shadowAt(vec3 wp, float bias){
  if(uShadowOn<0.5) return 1.0;
  vec4 sc=uShadowMat*vec4(wp,1.0); vec3 p=sc.xyz/sc.w*0.5+0.5;
  float edge=min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
  if(edge<0.002||p.z>1.0) return 1.0;
  float a=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))*6.2831853;
  float ca=cos(a), sa=sin(a); mat2 rot=mat2(ca,-sa,sa,ca);
  vec2 tx=vec2(1.0/4096.0)*1.9;
  float s=0.0;
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.326,-0.406)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.840,-0.074)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.696, 0.457)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.203, 0.621)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.962,-0.195)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.473,-0.480)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.519, 0.767)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.185,-0.893)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.507, 0.064)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2( 0.896, 0.412)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.322,-0.933)*tx).r);
  s+=step(p.z-bias, texture2D(uShadowMap, p.xy + rot*vec2(-0.792,-0.598)*tx).r);
  return mix(1.0, s/12.0, smoothstep(0.002, 0.06, edge));
}
vec3 ambient(vec3 n){
  float up=n.y*0.5+0.5;
  return mix(uGroundCol, mix(uSkyHor,uSkyUp,clamp(n.y,0.0,1.0)), smoothstep(0.0,0.62,up));
}
vec3 lit(vec3 alb, vec3 n, float sh, float ao){
  float ndl=max(dot(n,uLDir),0.0);
  return alb*(uLCol*ndl*sh*uCloudShade + ambient(n)*ao);
}
`;
