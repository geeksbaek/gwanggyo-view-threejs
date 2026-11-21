// ───────────── authentic 광교 자연앤 센트레빌 architectural features, entrances, stairs, tunnels & 광교호수공원 landmarks
class ArchBuf {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; this.i = []; this.nv = 0; }
  // m = [roughness, metallic, nightGlow, glassFlag (1=glass, 2=animated water)]
  addGeo(g, col, matP = [0.7, 0.0, 0.0, 0.0]) {
    const p = g.attributes.position, n = g.attributes.normal, ix = g.index, v = this.nv;
    for (let k = 0; k < p.count; k++) {
      this.p.push(p.getX(k), p.getY(k), p.getZ(k));
      this.n.push(n.getX(k), n.getY(k), n.getZ(k));
      this.c.push(col[0], col[1], col[2]);
      this.m.push(matP[0], matP[1], matP[2], matP[3]);
    }
    if (ix) for (let k = 0; k < ix.count; k++) this.i.push(v + ix.getX(k));
    else for (let k = 0; k < p.count; k++) this.i.push(v + k);
    this.nv += p.count;
  }
  box(cx, cy, cz, w, h, d, ang, col, matP, pitch = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (pitch) g.rotateZ(pitch);
    if (ang) g.rotateY(ang);
    g.translate(cx, cy, cz);
    this.addGeo(g, col, matP);
  }
  cyl(cx, cy, cz, rt, rb, h, seg, col, matP, rotX = 0, rotZ = 0, rotY = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rotX) g.rotateX(rotX);
    if (rotZ) g.rotateZ(rotZ);
    if (rotY) g.rotateY(rotY);
    g.translate(cx, cy, cz);
    this.addGeo(g, col, matP);
  }
  torus(cx, cy, cz, R, tube, ang, col, matP, tiltX = 0) {
    const g = new THREE.TorusGeometry(R, tube, 12, 32);
    if (tiltX) g.rotateX(tiltX);
    if (ang) g.rotateY(ang);
    g.translate(cx, cy, cz);
    this.addGeo(g, col, matP);
  }
  rock(cx, cy, cz, rx, ry, rz, seed, col, matP) {
    const g = new THREE.DodecahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.78 + 0.36 * Math.abs(Math.sin(x * 7.1 + y * 5.3 + z * 9.7 + seed));
      p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
    }
    g.computeVertexNormals(); g.translate(cx, cy, cz);
    this.addGeo(g, col, matP);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.m), 4));
    g.setIndex(this.i);
    this.p = this.n = this.c = this.m = this.i = null;
    return g;
  }
}

function makeArchMat(transparent = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent,
    depthWrite: !transparent,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: `attribute vec3 aCol; attribute vec4 aMat; varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vM;
      void main(){ vW=position; vN=normal; vC=aCol; vM=aMat; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`precision highp float;
      ${GLSL_COMMON}
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vM;
      void main(){
        vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
        vec3 V=normalize(uCamPos-vW);
        float rough=vM.x, metal=vM.y, glow=vM.z, glass=vM.w;
        float nz=texture2D(uNoise, vW.xz*0.35+vW.y*0.25).r;
        vec3 alb=vC*(0.93+0.14*nz);
        float sh=shadowAt(vW+n*0.2, 0.0014);
        vec3 col=lit(alb, n, sh, 0.92);
        vec3 R=reflect(-V, n);
        vec3 skyR=sampleSky(vec3(R.x, max(R.y, 0.015), R.z));
        float fr=mix(0.04, 0.65, metal) + (1.0-mix(0.04, 0.65, metal))*pow(1.0-max(dot(V,n),0.0),5.0);
        float shin=mix(240.0, 18.0, rough);
        col += skyR * fr * (1.0 - rough*0.85) * mix(0.6, 1.35, max(metal, glass));
        col += uLCol * pow(max(dot(R, uLDir), 0.0), shin) * mix(0.25, 2.5, 1.0-rough) * sh * uCloudShade;
        // Animated waterfall curtain & fountain plume shimmer when glass > 1.5
        if(glass > 1.5){
          float flow = texture2D(uNoise, vec2(vW.x*0.9+vW.z*0.9, vW.y*0.45 + uTime*1.45)).r;
          float foam = smoothstep(0.38, 0.76, flow);
          col = mix(col, lit(vec3(0.88,0.95,0.99), n, sh, 1.0) + skyR*0.42, foam*0.78);
        }
        // Architectural night LED / tunnel lights / warm storefront glow (glow > 2.5 = always-on tunnel ceiling lights!)
        if(glow > 0.001){
          float gOn = glow > 2.5 ? 1.0 : mix(0.08, 1.0, uNight);
          float gAmt = glow > 2.5 ? (glow - 2.0) : glow;
          if(glass > 0.5 && glass < 1.5){
            float mull = 1.0 - smoothstep(0.04, 0.09, abs(fract((vW.x + vW.z)*0.38) - 0.5));
            col = mix(col, lit(vec3(0.14, 0.15, 0.17), n, sh, 0.8), mull);
            float bayVar = 0.65 + 0.35 * hash21(floor(vec2(vW.x + vW.z, vW.y) * 0.38));
            col += vec3(1.0, 0.78, 0.46) * gAmt * uNight * bayVar * (1.0 - mull) * ${(LAMP * 1.15).toFixed(5)};
          } else {
            col += vC * gAmt * gOn * ${(LAMP * 3.4).toFixed(5)};
          }
        }
        float alpha = glass > 1.5 ? 0.80 : (glass > 0.5 ? clamp(0.30 + fr*0.58, 0.26, 0.90) : 1.0);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

// Helper: crisp canvas signboard, highway gantry sign, tunnel plaque, or transparent wall decal
function makeSignMesh(text, opts = {}) {
  const { bg = '#131b2b', fg = '#f2e4c4', w = 14, h = 2.0, font = '700 84px Georgia, "Times New Roman", serif', track = 14, glow = 0.75, sub = null, emblem = false, transparent = false, border = null, chevron = false } = opts;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192; const g = c.getContext('2d');
  if (transparent) g.clearRect(0, 0, 1024, 192);
  else { g.fillStyle = bg; g.fillRect(0, 0, 1024, 192); }
  if (border) {
    g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 172);
  }
  if (chevron) {
    // Yellow/black safety clearance chevron strip
    g.fillStyle = '#e5b822'; g.fillRect(0, 0, 1024, 192);
    g.fillStyle = '#181a1e';
    for (let x = -192; x < 1200; x += 128) {
      g.beginPath(); g.moveTo(x, 192); g.lineTo(x + 64, 192); g.lineTo(x + 144, 0); g.lineTo(x + 80, 0); g.closePath(); g.fill();
    }
    if (text) {
      g.fillStyle = '#ffffff'; g.fillRect(380, 26, 264, 140);
      g.strokeStyle = '#c82424'; g.lineWidth = 12; g.strokeRect(386, 32, 252, 128);
      g.fillStyle = '#111'; g.font = '700 78px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 512, 98);
    }
  } else if (emblem === 'goldHill') {
    // Iconic glowing gold architectural square-arch-over-hills 광교 자연앤 센트레빌 gate emblem (sp1_maingate.jpg!)
    c.width = 512; c.height = 512;
    const g2 = c.getContext('2d');
    g2.clearRect(0, 0, 512, 512);
    g2.shadowColor = 'rgba(255, 210, 128, 0.92)'; g2.shadowBlur = 26;
    g2.strokeStyle = '#f5deb0'; g2.lineWidth = 28; g2.lineJoin = 'round'; g2.lineCap = 'round';
    // Architectural square frame rising above rolling Gwanggyo hills
    g2.beginPath();
    g2.moveTo(116, 336); g2.lineTo(116, 114); g2.lineTo(396, 114); g2.lineTo(396, 336);
    g2.stroke();
    // Rolling organic hill base curve + central rising sun/leaf crest
    g2.beginPath();
    g2.moveTo(56, 368);
    g2.bezierCurveTo(132, 326, 204, 344, 256, 366);
    g2.bezierCurveTo(318, 340, 386, 328, 456, 372);
    g2.stroke();
    g2.lineWidth = 18;
    g2.beginPath(); g2.arc(256, 302, 42, Math.PI * 0.92, Math.PI * 2.08); g2.stroke();
    g2.fillStyle = '#fae8c4';
    g2.beginPath(); g2.arc(256, 294, 15, 0, Math.PI * 2); g2.fill();
  } else if (emblem) {
    g.strokeStyle = fg; g.lineWidth = 14;
    g.strokeRect(220, 20, 584, 152);
    g.lineWidth = 8; g.strokeRect(290, 44, 444, 104);
    g.fillStyle = fg; g.fillRect(360, 74, 304, 44);
    if (!transparent) { g.fillStyle = bg; g.fillRect(382, 86, 260, 20); } else g.clearRect(382, 86, 260, 20);
  } else {
    g.fillStyle = fg; g.font = font; g.textBaseline = 'middle';
    if (transparent && opts.shadow) { g.shadowColor = 'rgba(12,16,24,0.85)'; g.shadowBlur = 14; g.shadowOffsetY = 3; }
    let tw = 0; for (const ch of text) tw += g.measureText(ch).width + track;
    let x = (1024 - tw + track) / 2; const cy = sub ? 72 : 98;
    for (const ch of text) { g.fillText(ch, x, cy); x += g.measureText(ch).width + track; }
    if (sub) {
      g.font = '600 40px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
      g.fillStyle = '#e4ebf2'; g.fillText(sub, 512, 144);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uTex: { value: tex }, uGlow: { value: glow } },
    side: THREE.DoubleSide,
    transparent,
    depthWrite: !transparent,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `precision highp float; ${GLSL_COMMON} varying vec2 vUv; varying vec3 vN; varying vec3 vW; uniform sampler2D uTex; uniform float uGlow;
      void main(){ vec4 tx=texture2D(uTex,vUv); if(tx.a<0.12) discard; vec3 t=tx.rgb; vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
        float sh=shadowAt(vW+n*0.2, 0.0014); vec3 col=lit(t, n, sh, 1.0);
        float bright=smoothstep(0.24, 0.62, dot(t, vec3(0.3,0.6,0.1)));
        col += t * bright * uGlow * (0.14 + 0.86 * uNight) * ${(LAMP * 4.8).toFixed(5)};
        gl_FragColor=vec4(col, tx.a); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
  return m;
}

// ───────────── Build authentic 광교 자연앤 센트레빌 architectural features (1:1 Digital Twin of Official 단지배치도 & Site-Plan Renderings!)
function buildComplexFeatures() {
  const grp = new THREE.Group();
  const OP = new ArchBuf(); // opaque structures (casts shadows!)
  const GL = new ArchBuf(); // glass, frosted glass blocks, water cascades, transparent soundproof walls

  // Exact 0.80m-fit affine transform: official 단지배치도 pixel (u, v) -> scene (x, z) meters!
  const U2S = (u, v) => [-0.25210532 * u + 0.20415737 * v - 14.13187687, -0.20250471 * u - 0.25586374 * v + 196.07265457];
  // Local right-handed frame from siteplan P0=(u0,v0) -> P1=(u1,v1): +lx along P0->P1, +lz perpendicular right (-uz, ux)
  function mkFrame(u0, v0, u1, v1, baseY = null, project = U2S) {
    const a = project(u0, v0), b = project(u1, v1);
    const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
    const ang = Math.atan2(-uz, ux);
    const y0 = baseY !== null ? baseY : Math.max(groundY(mx, mz), -0.05);
    const pt = (lx, ly, lz) => [mx + lx * ux + lz * rx, y0 + ly, mz + lx * uz + lz * rz];
    const box = (buf, lx, ly, lz, w, h, d, col, mp, pitch = 0) => { const p = pt(lx, ly, lz); buf.box(p[0], p[1], p[2], w, h, d, ang, col, mp, pitch); };
    const cyl = (buf, lx, ly, lz, rt, rb, h, seg, col, mp, rX = 0, rZ = 0) => { const p = pt(lx, ly, lz); buf.cyl(p[0], p[1], p[2], rt, rb, h, seg, col, mp, rX, rZ, ang); };
    return { a, b, mx, mz, L, ux, uz, rx, rz, ang, y0, pt, box, cyl };
  }

  // Linear-calibrated authentic materials palette matching sp1_maingate..sp6_honors!
  const C_WHITE  = [0.85, 0.845, 0.825];
  const C_GRAN   = [0.56, 0.545, 0.52];
  const C_STONE  = [0.22, 0.22, 0.22];
  const C_WALL   = [0.36, 0.355, 0.34];
  const C_NAVY   = [0.045, 0.058, 0.090];
  const C_METAL  = [0.13, 0.145, 0.17];
  const C_DARK   = [0.02, 0.024, 0.030];
  const C_ASPH   = [0.10, 0.105, 0.115];
  const C_SILV   = [0.25, 0.27, 0.30];   // sleek anodized brushed silver-grey aluminum (sp1_maingate & sp3_connect!)
  const C_SILV_D = [0.15, 0.17, 0.20];
  const C_WOOD   = [0.38, 0.22, 0.11];
  const C_CEDAR  = [0.50, 0.30, 0.14];
  const C_MUST   = [0.74, 0.52, 0.10];   // 어린이집 KIDS VILLAGE mustard-yellow entrance frame (sp5_growing.jpg!)
  const C_OAK    = [0.48, 0.28, 0.11];   // 아너스라운지 SENIOR LOUNGE warm oak entrance frame (sp6_honors.jpg!)
  const C_LIME   = [0.42, 0.68, 0.08];   // 펀 그라운드 signature lime-green play tower (sp4_fun.jpg!)
  const C_YEL    = [0.84, 0.72, 0.14];   // 펀 그라운드 yellow adventure frame
  const C_HEDGE  = [0.09, 0.22, 0.06];
  const C_SOIL   = [0.18, 0.12, 0.07];
  const C_LED    = [1.0, 0.88, 0.64];
  const C_TUNL   = [1.0, 0.82, 0.50];
  const C_GLASS  = [0.18, 0.26, 0.34];
  const C_FBLOCK = [0.86, 0.90, 0.94];   // glowing frosted glass-block security pavilion (sp1_maingate.jpg!)
  const C_SHOPG  = [0.07, 0.11, 0.16];
  const C_WATER  = [0.20, 0.54, 0.68];

  const M_STONE  = [0.78, 0.0, 0.0, 0.0];
  const M_DARK   = [0.95, 0.0, 0.0, 0.0];
  const M_METAL  = [0.28, 0.68, 0.0, 0.0];
  const M_CHROME = [0.10, 0.92, 0.0, 0.0];
  const M_WOOD   = [0.75, 0.0, 0.0, 0.0];
  const M_LED    = [0.18, 0.0, 1.85, 0.0];
  const M_TUNL   = [0.10, 0.0, 4.2, 0.0]; // always-on underground parking tunnel interior lights
  const M_GLASS  = [0.08, 0.16, 0.0, 1.0];
  const M_FBLOCK = [0.22, 0.05, 1.35, 0.0]; // warm luminous glass-block facade
  const M_SHOP   = [0.06, 0.16, 0.72, 1.0];
  const M_FLOW   = [0.10, 0.05, 0.12, 2.0];

  // Helper: architectural garden bollard light (reused cleanly across all courtyards!)
  const addBollard = (u, v, yOff = 0) => {
    const [bx, bz] = U2S(u, v), gy = Math.max(groundY(bx, bz), -0.05) + yOff;
    OP.cyl(bx, gy + 0.42, bz, 0.08, 0.09, 0.84, 8, C_METAL, M_METAL);
    OP.cyl(bx, gy + 0.76, bz, 0.085, 0.085, 0.14, 8, C_LED, M_LED);
  };

  // Helper: pitched/gabled silver-fluted pavilion (exact architectural language of 어린이집 sp5 & 아너스라운지 sp6!)
  function addGabledPavilion(u0, v0, u1, v1, depth, hEave, hRidge, portalCol, signText) {
    const F = mkFrame(u0, v0, u1, v1, 0.02);
    const W = F.L, D = depth;
    // Recessed solid stone back & interior floor slab
    F.box(OP, 0, 0.14, 0, W + 0.6, 0.28, D + 0.6, C_GRAN, M_STONE);
    F.box(OP, 0, hEave * 0.5, -D * 0.22, W - 0.8, hEave, D * 0.52, C_STONE, M_STONE);
    // Warm cedar accent side flank wall (left side, sp5_growing.jpg!)
    F.box(OP, -W * 0.48, hEave * 0.5, 0.2, 0.55, hEave, D - 0.6, C_CEDAR, M_WOOD);
    F.box(OP,  W * 0.48, hEave * 0.5, 0.2, 0.55, hEave, D - 0.6, C_SILV, M_METAL);
    // Pitched dual-slope silver-fluted roof + sculptural front gable fascia!
    const halfW = W * 0.5 + 0.75, slopeRise = hRidge - hEave, pitch = Math.atan2(slopeRise, halfW);
    const slopeL = Math.hypot(halfW, slopeRise);
    // Left roof slope rising to center ridge
    F.box(OP, -halfW * 0.5, hEave + slopeRise * 0.5 + 0.32, 0, slopeL, 0.72, D + 1.4, C_SILV, M_METAL, pitch);
    F.box(OP, -halfW * 0.5, hEave + slopeRise * 0.5 + 0.70, 0, slopeL + 0.15, 0.12, D + 1.55, C_METAL, M_METAL, pitch);
    // Right roof slope descending from center ridge
    F.box(OP,  halfW * 0.5, hEave + slopeRise * 0.5 + 0.32, 0, slopeL, 0.72, D + 1.4, C_SILV, M_METAL, -pitch);
    F.box(OP,  halfW * 0.5, hEave + slopeRise * 0.5 + 0.70, 0, slopeL + 0.15, 0.12, D + 1.55, C_METAL, M_METAL, -pitch);
    // Vertical silver-fluted gable ribs across the pitched fascia front
    const nRib = Math.floor(W / 0.9);
    for (let k = -nRib; k <= nRib; k++) {
      const lx = k * 0.48; if (Math.abs(lx) > halfW - 0.3) continue;
      const ry = hRidge - (Math.abs(lx) / halfW) * slopeRise;
      F.box(OP, lx, ry + 0.34, D * 0.5 + 0.68, 0.10, 0.64, 0.14, C_SILV_D, M_METAL);
    }
    // Full-height front & side glazed curtain walls + crisp dark mullions!
    F.box(GL, 0, hEave * 0.50, D * 0.46, W - 1.2, hEave - 0.25, 0.16, C_SHOPG, M_SHOP);
    const nMul = Math.max(4, Math.floor(W / 1.9));
    for (let k = 0; k <= nMul; k++) {
      const lx = lerp(-W * 0.46, W * 0.46, k / nMul);
      const mh = hRidge - (Math.abs(lx) / halfW) * slopeRise - 0.15;
      F.box(OP, lx, mh * 0.5, D * 0.48, 0.11, mh, 0.22, C_METAL, M_METAL);
    }
    F.box(OP, 0, hEave * 0.66, D * 0.48, W - 1.0, 0.10, 0.20, C_METAL, M_METAL);
    // Warm recessed interior ceiling glow visible through the huge glass curtain wall!
    F.box(OP, 0, hEave - 0.35, D * 0.15, W - 2.4, 0.12, D * 0.55, C_LED, M_LED);
    // Signature Colored Entrance Portal Box (Mustard-Yellow for 어린이집, Oak-Wood for 아너스라운지!)
    const ex = -W * 0.24;
    F.box(OP, ex, 2.75, D * 0.50, 3.6, 0.38, 0.95, portalCol, M_WOOD);
    F.box(OP, ex - 1.65, 1.45, D * 0.50, 0.34, 2.9, 0.95, portalCol, M_WOOD);
    F.box(OP, ex + 1.65, 1.45, D * 0.50, 0.34, 2.9, 0.95, portalCol, M_WOOD);
    F.box(GL, ex, 1.35, D * 0.54, 2.9, 2.5, 0.10, C_GLASS, M_GLASS);
    F.box(OP, ex, 1.35, D * 0.58, 0.08, 2.5, 0.10, C_METAL, M_METAL);
    // Clean transparent signage floating over entrance portal!
    const sg = makeSignMesh(signText, { transparent: true, fg: '#ffffff', shadow: true, w: 4.5, h: 0.60, font: '700 72px "Noto Sans KR", sans-serif', track: 8, glow: 0.95 });
    sg.position.set(...F.pt(ex, 3.24, D * 0.54 + 0.18));
    sg.rotation.y = Math.atan2(F.rx, F.rz);
    grp.add(sg);
    return F;
  }

  // ── 1. 1701동 Landmark L-Frame Crown + Illuminated CENTREVILLE Signage (NO floating stickers!)
  // Roof sites specified in the public sale notice. Panel and mast sizes are illustrative.
  for (const name of ['1701','1703','1706','1708']) {
    const tower = WORLD.towerInfo[name];
    if (!tower.plantRoof) continue;
    const [x,z] = tower.plantRoof, y = tower.HR + 3.6;
    OP.cyl(x,y+1.55,z,0.07,0.12,3.1,8,C_METAL,M_METAL);
    for (let i=0; i<3; i++) {
      const angle=i*2*Math.PI/3;
      OP.box(x+0.32*Math.sin(angle),y+2.15,z+0.32*Math.cos(angle),0.32,1.35,0.18,angle,C_WHITE,M_METAL);
    }
  }
  const t1 = WORLD.towerInfo['1701'];
  if (t1) {
    const pA = [113.92, -92.99], pB = [115.36, -67.61];
    const ex = pB[0] - pA[0], ez = pB[1] - pA[1], eL = Math.hypot(ex, ez), ang = Math.atan2(-ez, ex);
    const nx = ez / eL, nz = -ex / eL, mx = (pA[0] + pB[0]) / 2, mz = (pA[1] + pB[1]) / 2;
    const hr = t1.HR, crH = 3.2;
    OP.box(mx + nx * 0.45, hr + crH + 0.55, mz + nz * 0.45, eL + 1.2, 1.05, 1.4, ang, C_WHITE, M_STONE);
    OP.box(mx + nx * 0.15, hr + crH * 0.5 + 0.1, mz + nz * 0.15, eL - 0.8, crH, 0.8, ang, C_NAVY, M_METAL);
    OP.box(mx + nx * 0.62, hr + crH + 0.02, mz + nz * 0.62, eL - 1.2, 0.18, 0.25, ang, C_LED, M_LED);
    for (const endP of [pA, pB]) {
      OP.box(endP[0] + nx * 0.35, (hr + crH) * 0.5 + 0.5, endP[1] + nz * 0.35, 1.15, hr + crH + 1.1, 1.35, ang, C_WHITE, M_STONE);
    }
    const s1 = makeSignMesh('CENTREVILLE', { transparent: true, fg: '#f6ecd4', w: 17.5, h: 2.35, glow: 1.15, track: 16 });
    s1.position.set(mx + nx * 0.68, hr + crH * 0.52 + 0.15, mz + nz * 0.68);
    s1.rotation.y = Math.atan2(nx, nz); grp.add(s1);

    const qA = [101.19, -92.37], qB = [113.92, -92.99];
    const qx = qB[0] - qA[0], qz = qB[1] - qA[1], qL = Math.hypot(qx, qz), qAng = Math.atan2(-qz, qx);
    let qnx = qz / qL, qnz = -qx / qL;
    if ((qA[0] - t1.cx) * qnx + (qA[1] - t1.cz) * qnz < 0) { qnx = -qnx; qnz = -qnz; }
    const qmx = (qA[0] + qB[0]) / 2, qmz = (qA[1] + qB[1]) / 2;
    OP.box(qmx + qnx * 0.45, hr + crH + 0.55, qmz + qnz * 0.45, qL + 1.0, 1.05, 1.3, qAng, C_WHITE, M_STONE);
    OP.box(qmx + qnx * 0.15, hr + crH * 0.5 + 0.1, qmz + qnz * 0.15, qL - 0.6, crH, 0.8, qAng, C_NAVY, M_METAL);
    OP.box(qmx + qnx * 0.62, hr + crH + 0.02, qmz + qnz * 0.62, qL - 0.8, 0.18, 0.25, qAng, C_LED, M_LED);
    const s2 = makeSignMesh('CENTREVILLE', { transparent: true, fg: '#f6ecd4', w: qL * 0.86, h: 1.95, glow: 1.15, track: 10 });
    s2.position.set(qmx + qnx * 0.66, hr + crH * 0.52 + 0.15, qmz + qnz * 0.66);
    s2.rotation.y = Math.atan2(qnx, qnz); grp.add(s2);
  }

  // ── 2. 1704동 Iconic Dark-Navy Rooftop Open Portal Crown (visual9.jpg left!)
  // (NOTE: 1703동's signature fluted dark-navy corner panel & integrated C-spiral relief are now rendered natively in FACADE_FS kind=10 — ZERO floating stickers!)
  const t4 = WORLD.towerInfo['1704'];
  if (t4) {
    const hr4 = t4.HR, pcx = -32.0, pcz = 49.5, pAng = 0.05;
    OP.box(pcx, hr4 + 4.3, pcz, 15.5, 1.15, 1.5, pAng, C_NAVY, M_METAL);
    OP.box(pcx - 7.1, hr4 + 2.2, pcz, 1.35, 4.4, 1.5, pAng, C_NAVY, M_METAL);
    OP.box(pcx + 7.1, hr4 + 2.2, pcz, 1.35, 4.4, 1.5, pAng, C_NAVY, M_METAL);
    OP.box(pcx, hr4 + 3.68, pcz, 13.0, 0.16, 0.3, pAng, C_LED, M_LED);
  }

  // ── 3. Crisp Transparent Dong Numbers (1701~1709) + Lobby Entrance Canopies (exact match to sp2_vista & sp5_growing!)
  for (const ts of WORLD.towerSigns || []) {
    if (ts.gable) {
      const { mx, mz, nx, nz, eL } = ts.gable;
      const ux = -nz, uz = nx;
      const offS = eL * 0.24;
      const sx = mx + ux * offS + nx * 0.12, sz = mz + uz * offS + nz * 0.12;
      const dn = makeSignMesh(ts.name, { transparent: true, fg: '#232a36', w: Math.min(eL * 0.30, 3.2), h: 1.15, font: '700 100px "Noto Sans KR", sans-serif', track: 6, glow: 0.20 });
      dn.position.set(sx, 11.8, sz); dn.rotation.y = Math.atan2(nx, nz); grp.add(dn);
    }
    if (ts.front) {
      const { mx, mz, nx, nz } = ts.front;
      const cAng = Math.atan2(nx, nz);
      OP.box(mx + nx * 1.4, 3.35, mz + nz * 1.4, 4.8, 0.24, 2.8, cAng, C_METAL, M_METAL);
      OP.box(mx + nx * 1.4, 3.20, mz + nz * 1.4, 4.2, 0.08, 0.2, cAng, C_LED, M_LED);
      GL.box(mx + nx * 0.2, 1.65, mz + nz * 0.2, 3.4, 3.1, 0.16, cAng, C_SHOPG, [0.08, 0.15, 0.45, 1.0]);
    }
  }
  // Signature crisp white "1702" on dark charcoal Vista-facing wall (sp2_vista.jpg right!)
  {
    const dn2 = makeSignMesh('1702', { transparent: true, fg: '#f2f4f6', w: 3.1, h: 1.15, font: '700 100px "Noto Sans KR", sans-serif', track: 6, glow: 0.35 });
    dn2.position.set(70.0, 15.6, -31.68); dn2.rotation.y = 0.06; grp.add(dn2);
  }

  // ── 4. 주출입구 문주 + 유리블록 경비실 + 원형 회전광장 (1:1 Digital Twin of sp1_maingate.jpg & siteplan_fit.jpg!)
  {
    // Frame spans left monolith U2S(294,968) -> right pier U2S(364,988) along the southern 32 m frontage!
    // Check outward normal (+lz = rx,rz): dx = -13.56, dz = -19.29 -> rx = +0.818, rz = -0.575 (faces straight out toward 32M 도로!)
    const G = mkFrame(338,1104,424,1120,entranceFloor(...WORLD.gates.main.gate),planPoint);
    const faceOut = Math.atan2(G.rx, G.rz);
    const W = G.L; // ~23.6m exact span!
    const hL = 8.1, hR = 5.5; // iconic asymmetric sloping silhouette from sp1_maingate.jpg!
    const slopeAng = Math.atan2(hR - hL, W); // negative pitch descending left->right!

    // Tall broad fluted silver-aluminum LEFT MONOLITH pier (sp1_maingate.jpg left!)
    const wLeft = 5.4;
    G.box(OP, -W * 0.5 + wLeft * 0.5, hL * 0.5 - 0.15, 0, wLeft, hL, 2.7, C_SILV, M_METAL);
    for (let lx = -W * 0.5 + 0.35; lx < -W * 0.5 + wLeft - 0.2; lx += 0.45) {
      G.box(OP, lx, hL * 0.5 - 0.15, 1.38, 0.12, hL - 0.3, 0.10, C_SILV_D, M_METAL);
    }
    // Slender fluted silver-aluminum RIGHT PIER (sp1_maingate.jpg far right!)
    const wRight = 1.7;
    G.box(OP, W * 0.5 - wRight * 0.5, hR * 0.5, 0, wRight, hR, 2.5, C_SILV, M_METAL);
    // Continuous SLOPING FLUTED SILVER CANTILEVERED FASCIA spanning full 23.6m (sp1_maingate.jpg!)
    const spanL = Math.hypot(W, hR - hL);
    const midTopY = (hL + hR) * 0.5;
    G.box(OP, 0, midTopY - 0.85, 0, spanL + 0.4, 1.85, 2.75, C_SILV, M_METAL, slopeAng);
    // Crisp dark top coping & fluted vertical louvers along front of cantilevered fascia
    G.box(OP, 0, midTopY + 0.12, 0, spanL + 0.5, 0.16, 2.90, C_METAL, M_METAL, slopeAng);
    for (let k = 0; k <= 38; k++) {
      const f = k / 38, lx = lerp(-W * 0.5 + 0.3, W * 0.5 - 0.3, f);
      const topY = lerp(hL, hR, f);
      G.box(OP, lx, topY - 0.88, 1.40, 0.10, 1.68, 0.10, C_SILV_D, M_METAL);
    }
    // CONTINUOUS GLOWING WARM-WHITE LED HALO PERIMETER (top edge, outer left edge, inner soffit arch & right pier — sp1_maingate.jpg!)
    G.box(OP, 0, midTopY + 0.04, 1.44, spanL + 0.2, 0.14, 0.16, C_LED, M_LED, slopeAng);
    G.box(OP, -W * 0.5 + 0.04, hL * 0.5, 1.44, 0.14, hL, 0.16, C_LED, M_LED);
    // Inner glowing soffit cove running smoothly across underside of drive opening
    const openL = W - wLeft - wRight;
    const soffMidX = (wLeft - wRight) * 0.5;
    const soffY = lerp(hL, hR, 0.5 + soffMidX / W) - 1.78;
    G.box(OP, soffMidX, soffY, 0.25, openL + 0.6, 0.16, 2.2, C_LED, M_LED, slopeAng);
    G.box(OP, -W * 0.5 + wLeft + 0.06, (hL - 1.8) * 0.5, 1.38, 0.14, hL - 1.8, 0.16, C_LED, M_LED);
    G.box(OP,  W * 0.5 - wRight - 0.06, (hR - 1.6) * 0.5, 1.38, 0.14, hR - 1.6, 0.16, C_LED, M_LED);

    // ICONIC GLOWING GOLD SQUARE-HILL CENTREVILLE EMBLEM on tall left monolith (sp1_maingate.jpg!)
    const gEmb = makeSignMesh('', { transparent: true, emblem: 'goldHill', w: 3.6, h: 3.6, glow: 1.55 });
    gEmb.position.set(...G.pt(-W * 0.5 + wLeft * 0.5, 3.15, 1.54));
    gEmb.rotation.y = faceOut; grp.add(gEmb);

    // FLOATING BACKLIT TRANSPARENT "광교 자연앤 센트레빌" LETTERING (NO ugly black box — crisp & aligned with portal slope!)
    const titleX = 5.4;
    const titleY = lerp(hL, hR, 0.5 + titleX / W) - 1.05;
    const ms = makeSignMesh('광교 자연앤 센트레빌', { transparent: true, fg: '#ffffff', shadow: true, w: 8.4, h: 0.96, font: '700 72px "Noto Sans KR", sans-serif', track: 10, glow: 1.75 });
    ms.position.set(...G.pt(titleX, titleY, 1.56));
    ms.rotation.order = 'YXZ'; ms.rotation.y = faceOut; ms.rotation.z = slopeAng; grp.add(ms);

    // LUMINOUS FROSTED GLASS-BLOCK SECURITY PAVILION (유리블록 경비실 — sp1_maingate.jpg right-center!)
    const kx = 5.6, kz = -0.35;
    G.box(OP, kx, 0.55, kz, 5.2, 1.1, 3.6, C_STONE, M_STONE);              // dark stone plinth
    G.box(OP, kx, 2.75, kz, 5.4, 1.55, 3.8, C_FBLOCK, M_FBLOCK);           // glowing frosted glass-block upper crown!
    G.box(OP, kx + 1.85, 1.55, kz, 1.7, 2.4, 3.8, C_FBLOCK, M_FBLOCK);     // glowing right glass-block wrap!
    // Crisp architectural glass-block grid joints across luminous frosted cube (sp1_maingate.jpg!)
    for (let gx = -2.4; gx <= 2.45; gx += 0.48) G.box(OP, kx + gx, 2.75, kz + 1.92, 0.04, 1.50, 0.04, C_SILV, M_METAL);
    for (let gy = 2.15; gy <= 3.35; gy += 0.40) G.box(OP, kx, gy, kz + 1.92, 5.36, 0.04, 0.04, C_SILV, M_METAL);
    for (let gy = 0.65; gy <= 2.45; gy += 0.40) G.box(OP, kx + 1.85, gy, kz + 1.92, 1.66, 0.04, 0.04, C_SILV, M_METAL);
    G.box(GL, kx - 0.80, 1.55, kz + 1.82, 3.3, 1.75, 0.14, C_SHOPG, M_SHOP); // warm viewing window
    G.box(GL, kx - 0.80, 1.55, kz - 1.82, 3.3, 1.75, 0.14, C_SHOPG, M_SHOP);
    G.box(OP, kx - 0.80, 2.10, kz, 2.8, 0.12, 2.2, C_LED, M_LED);          // warm glowing interior ceiling!
    // Subtle dark metal framing mullions on glass-block kiosk
    G.box(OP, kx, 3.55, kz, 5.5, 0.12, 3.9, C_METAL, M_METAL);
    G.box(OP, kx, 1.98, kz + 1.88, 5.3, 0.08, 0.10, C_METAL, M_METAL);

    // 원형 회전광장 (Circular Roundabout Center Planter Island at exact U2S(338, 932) — sp1_maingate.jpg & siteplan_fit.jpg!)
    const [rbx, rbz] = planPoint(395,1060), rby = entranceFloor(rbx+7,rbz);
    OP.cyl(rbx, rby + 0.24, rbz, 5.35, 5.55, 0.48, 28, C_GRAN, M_STONE);
    OP.cyl(rbx, rby + 0.56, rbz, 4.95, 5.15, 0.34, 28, C_HEDGE, M_STONE);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      OP.cyl(rbx + Math.cos(a) * 5.25, rby + 0.54, rbz + Math.sin(a) * 5.25, 0.08, 0.08, 0.16, 6, C_LED, M_LED);
    }
  }

  // ── 5. 주출입 지하주차장 포털 + 석가산 2단 폭포 + 상단 연못 & 화이트 티하우스 데크 (1:1 match to sp3_connect.jpg!)
  {
    // 5A) Fluted Silver-Grey CENTREVILLE Underground Parking Portal facing straight onto roundabout U2S(338, 932)!
    const P = mkFrame(430,1107,460,1074,entranceFloor(...planPoint(442,1089)),planPoint);
    const [rbx, rbz] = planPoint(395,1060);
    const outSgn = ((rbx - P.mx) * P.rx + (rbz - P.mz) * P.rz) >= 0 ? 1 : -1;
    const ptP = (lx, ly, lz) => P.pt(lx, ly, lz * outSgn);
    const boxP = (buf, lx, ly, lz, w, h, d, col, mp) => { const p = ptP(lx, ly, lz); buf.box(p[0], p[1], p[2], w, h, d, P.ang, col, mp); };
    const faceRb = Math.atan2(P.rx * outSgn, P.rz * outSgn);

    // Tall vertical-fluted anodized silver-grey portal headwall (sp3_connect.jpg foreground right!)
    boxP(OP, 0, 5.0, 0, 12.6, 2.6, 2.2, C_SILV, M_METAL);
    boxP(OP, -5.2, 2.0, 0, 2.2, 4.4, 2.2, C_SILV, M_METAL);
    boxP(OP,  5.2, 2.0, 0, 2.2, 4.4, 2.2, C_SILV, M_METAL);
    boxP(OP, 0, 6.38, 0, 13.0, 0.22, 2.4, C_METAL, M_METAL);
    for (let lx = -5.8; lx <= 5.8; lx += 0.52) {
      boxP(OP, lx, 5.0, 1.14, 0.12, 2.45, 0.10, C_SILV_D, M_METAL);
    }
    const ps = makeSignMesh('CENTREVILLE', { transparent: true, fg: '#f4f0e4', shadow: true, w: 8.6, h: 0.96, font: '700 72px Georgia, serif', track: 14, glow: 0.95 });
    ps.position.set(...ptP(0, 5.05, 1.26)); ps.rotation.y = faceRb; grp.add(ps);
    // Central entry island + white barrier arms + OUT/IN indicators
    boxP(OP, 0, 0.22, 0.8, 0.72, 0.44, 3.8, C_GRAN, M_STONE);
    boxP(OP, 0, 0.85, 1.1, 0.30, 0.95, 0.30, C_WHITE, M_STONE);
    boxP(OP, -2.1, 0.95, 1.1, 3.5, 0.09, 0.09, C_WHITE, M_STONE);
    boxP(OP,  2.1, 0.95, 1.1, 3.5, 0.09, 0.09, C_WHITE, M_STONE);
    boxP(OP, -2.1, 3.45, 1.0, 1.4, 0.32, 0.20, [0.85, 0.16, 0.14], M_LED);
    boxP(OP,  2.1, 3.45, 1.0, 1.4, 0.32, 0.20, [0.18, 0.62, 0.92], M_LED);
    // Deep recessed dark descending underground parking tunnel box + always-on ceiling strip lights!
    boxP(OP, 0, 1.85, -16.0, 9.6, 4.1, 0.4, C_DARK, M_DARK);
    boxP(OP, 0, 0.05, -7.5, 9.2, 0.24, 16.0, C_ASPH, M_DARK);
    boxP(OP, -5.2, 2.1, -8.5, 1.0, 4.6, 15.5, C_STONE, M_STONE);
    boxP(OP,  5.2, 2.1, -8.5, 1.0, 4.6, 15.5, C_STONE, M_STONE);
    for (const tz of [-2.0, -5.5, -9.0, -12.5]) {
      boxP(OP, -2.1, 3.50, tz, 2.4, 0.14, 0.42, C_TUNL, M_TUNL);
      boxP(OP,  2.1, 3.50, tz, 2.4, 0.14, 0.42, C_TUNL, M_TUNL);
    }
    boxP(OP, 0, 4.50, -9.2, 13.0, 0.60, 15.5, C_GRAN, M_STONE);
    boxP(OP, 0, 4.90, -9.8, 11.2, 0.30, 13.0, C_HEDGE, M_STONE);

    // 5B) 웰컴라운지(1F) Glazed Atrium Pavilion tucked neatly on NE flank of parking portal (sp3_connect.jpg far right!)
    const WL = mkFrame(390, 868, 418, 894, 0.02);
    WL.box(OP, 0, 2.35, 0, WL.L, 4.7, 7.2, C_STONE, M_STONE);
    WL.box(OP, 0, 4.88, 0, WL.L + 1.0, 0.40, 8.2, C_METAL, M_METAL);
    WL.box(OP, 0, 5.18, 0, WL.L - 0.8, 0.24, 6.4, C_HEDGE, M_STONE);
    WL.box(GL, 0, 2.35,  3.64, WL.L - 0.8, 4.2, 0.16, C_SHOPG, M_SHOP);
    WL.box(GL, 0, 2.35, -3.64, WL.L - 0.8, 4.2, 0.16, C_SHOPG, M_SHOP);
    WL.box(OP, 0, 4.10, 0, WL.L - 2.0, 0.12, 4.0, C_LED, M_LED);

    // 5C) Iconic Multi-Tiered 석가산 Layered Korean Granite Boulder Waterfall + Dark-Rimmed Lower Splash Pool + Upper Pond & 5 Fountain Jets (sp3_connect.jpg!)
    const [sx, sz] = U2S(348, 858); // rockery ridge facing SW (+X,-Z) straight toward roundabout!
    const C_RK1 = [0.13, 0.125, 0.12], C_RK2 = [0.20, 0.19, 0.175], C_RK3 = [0.16, 0.155, 0.14];
    const rocks = [
      // Sculpted layered terraced granite cliffs flanking the central waterfall gully!
      [-2.2, 1.8, -0.4, 3.2, 1.8, 2.8, 1.1, C_RK1],
      [ 1.8, 1.6,  2.2, 3.0, 1.7, 2.6, 2.4, C_RK2],
      [-0.8, 3.2,  1.2, 2.8, 2.2, 2.5, 3.7, C_RK1],
      [-2.6, 3.8,  0.4, 2.2, 2.0, 2.0, 5.1, C_RK2],
      [ 1.2, 3.4,  2.4, 2.2, 1.9, 2.1, 6.3, C_RK3],
      [-0.6, 4.8,  1.6, 1.9, 1.6, 1.8, 7.8, C_RK1],
      [ 3.4, 1.1,  0.2, 2.2, 1.1, 2.0, 8.9, C_RK2],
      [-3.8, 1.0, -2.0, 2.4, 1.0, 2.0, 9.6, C_RK3],
      // Secondary eastern pond boulder outcrop (sp3_connect.jpg right of pond!)
      [-6.8, 0.9, -5.8, 2.6, 1.1, 2.2, 11.2, C_RK1],
      [-8.4, 1.4, -4.6, 1.8, 1.3, 1.7, 12.5, C_RK2],
      [-5.6, 0.7, -6.8, 1.8, 0.8, 1.6, 13.8, C_RK3],
    ];
    for (const [dx, dy, dz, rx, ry, rz, sd, col] of rocks) {
      OP.rock(sx + dx, dy - 0.15, sz + dz, rx, ry, rz, sd, col, M_STONE);
    }
    // Two dramatic frothy animated white waterfalls cascading straight SW (+X,-Z) toward the roundabout!
    GL.box(sx + 1.5, 2.9, sz - 1.3, 2.1, 3.6, 0.45, -0.78, [0.76, 0.90, 0.96], M_FLOW);
    GL.box(sx + 3.2, 1.2, sz - 2.8, 2.4, 2.2, 0.45, -0.78, [0.80, 0.92, 0.98], M_FLOW);
    // Dark-stone-rimmed lower fountain splash pool at foot of waterfall with 3 sparkling plumes!
    const [lpX, lpZ] = U2S(342, 886);
    OP.cyl(lpX, 0.08, lpZ, 4.3, 4.5, 0.28, 20, C_STONE, M_STONE);
    GL.cyl(lpX, 0.24, lpZ, 3.85, 3.85, 0.08, 20, C_WATER, M_FLOW);
    for (const [fx, fz] of [[0, 0], [-1.3, 0.8], [1.3, -0.8]]) {
      GL.cyl(lpX + fx, 0.95, lpZ + fz, 0.10, 0.24, 1.55, 8, [0.88, 0.96, 1.0], M_FLOW);
    }
    // Upper reflecting pond shimmering surface + dark granite curb + 5 sparkling fountain plumes (sp3_connect.jpg!)
    const [upX, upZ] = U2S(366, 840);
    OP.cyl(upX, 0.06, upZ, 8.0, 8.2, 0.24, 24, C_STONE, M_STONE);
    GL.cyl(upX, 0.20, upZ, 7.5, 7.5, 0.08, 24, C_WATER, M_FLOW);
    for (const [fx, fz] of [[-2.4, -1.2], [0.2, 0.4], [2.8, 1.8], [-4.2, 1.4], [1.2, -2.4]]) {
      GL.cyl(upX + fx, 1.05, upZ + fz, 0.10, 0.24, 1.75, 8, [0.88, 0.96, 1.0], M_FLOW);
    }

    // 5D) White Cantilevered Glass & Column Teahouse Pavilion (티하우스) on Timber Deck (sp3_connect.jpg upper-center!)
    const TH = mkFrame(350, 814, 386, 810, 0.04);
    TH.box(OP, 0, 0.18, 0.4, TH.L + 3.2, 0.36, 6.8, C_WOOD, M_WOOD);         // cantilevered warm timber deck
    TH.box(OP, 0, 3.45, 0, TH.L + 1.4, 0.36, 5.0, C_WHITE, M_STONE);         // crisp white floating roof canopy
    TH.box(OP, 0, 3.24, 0, TH.L + 0.6, 0.10, 4.2, C_LED, M_LED);             // warm underside soffit glow
    // Left half: frameless glass teahouse café lounge!
    TH.box(GL, -TH.L * 0.22, 1.72,  2.15, TH.L * 0.48, 3.1, 0.12, C_SHOPG, M_SHOP);
    TH.box(GL, -TH.L * 0.22, 1.72, -2.15, TH.L * 0.48, 3.1, 0.12, C_SHOPG, M_SHOP);
    TH.box(GL, -TH.L * 0.46, 1.72,  0.0,  0.12, 3.1, 4.3, C_SHOPG, M_SHOP);
    // Right half: open colonnade viewing pavilion with slender white columns & bar counter!
    for (const [cx, cz] of [[0.2, 2.0], [0.2, -2.0], [TH.L * 0.44, 1.8], [TH.L * 0.44, -1.8], [TH.L * 0.24, 1.9]]) {
      TH.box(OP, cx, 1.72, cz, 0.28, 3.15, 0.28, C_WHITE, M_STONE);
    }
    TH.box(OP, TH.L * 0.22, 0.95, 0.2, 3.6, 0.10, 0.9, C_WHITE, M_STONE);
    TH.box(OP, TH.L * 0.22, 0.48, 0.2, 3.2, 0.90, 0.6, C_WOOD, M_WOOD);
  }

  // ── 6. Streetfront B1F Community & Commercial Pavilions (1:1 from siteplan_fit.jpg!)
  {
    const addStreetPav = (u0, v0, u1, v1, depth, h, hasFluted = true, project = U2S) => {
      const F = mkFrame(u0, v0, u1, v1,null,project);
      const base = Math.min(F.y0, -0.6);
      const bh = Math.max(h, 0.1 - base + 3.8);
      const yMid = base + bh * 0.5;
      F.box(OP, 0, yMid - F.y0, 0, F.L, bh, depth, C_STONE, M_STONE);
      F.box(OP, 0, base + bh - F.y0 + 0.35, 0, F.L + 0.8, 0.72, depth + 0.9, hasFluted ? C_SILV : C_WHITE, hasFluted ? M_METAL : M_STONE);
      F.box(OP, 0, base + bh - F.y0 + 0.82, 0, F.L - 0.8, 0.22, depth - 1.0, C_HEDGE, M_STONE);
      F.box(GL, 0, base + bh - F.y0 + 1.40, depth * 0.48, F.L, 1.05, 0.08, C_GLASS, M_GLASS);
      F.box(GL, 0, yMid - F.y0 - 0.1,  depth * 0.51, F.L - 1.0, bh * 0.74, 0.16, C_SHOPG, M_SHOP);
      F.box(GL, 0, yMid - F.y0 - 0.1, -depth * 0.51, F.L - 1.0, bh * 0.74, 0.16, C_SHOPG, M_SHOP);
      F.box(OP, 0, base + bh - F.y0 - 0.08, depth * 0.54, F.L - 1.0, 0.10, 0.18, C_LED, M_LED);
    };
    addStreetPav(420,1121,478,1133,7.6,4.4,true,planPoint);  // 근린생활시설(B1F) right of main gate (sp1_maingate far right!)
    addStreetPav(260,1064,332,1090,7.4,4.3,true,planPoint);  // 키즈&맘스라운지(B1F) left of main gate (sp3_connect far left!)
    addStreetPav(168, 848, 214, 904, 7.8, 4.5, false); // 센트레 라이브러리 / 다 함께 돌봄센터(B1F)
    addStreetPav(192, 738, 216, 804, 8.2, 5.2, true);  // 센트웰 듀플렉스 피트니스 / 스크린 골프(B1/B2F)
  }

  // ── 7. 51.5M 도로 (광교중앙로) Terraced Stone Retaining Walls & Transparent Soundproof Walls (U2S-aligned!)
  {
    const terraceUVs = [
      [[242, 238], [218, 316], [198, 386]], // North of 부출입구 (1704동 frontage)
      [[192, 480], [182, 548], [174, 610]], // Between 부출입구 & 비스타애비뉴 (1703동 frontage)
      [[164, 728], [156, 788], [150, 846]], // South of 비스타애비뉴 (1702~1701동 frontage)
    ];
    for (const run of terraceUVs) {
      for (let i = 0; i < run.length - 1; i++) {
        const [x0, z0] = U2S(...run[i]), [x1, z1] = U2S(...run[i + 1]);
        const slices=Math.ceil(Math.hypot(x1-x0,z1-z0));
        let first=null;
        for (let n=0;n<=slices;n++) {
          const f=Math.min(1,(n+0.5)/slices), px=lerp(x0,x1,f), pz=lerp(z0,z1,f);
          const blocked=n===slices || [-3,-1.5,0,1.5,3].some(ox=>[-3,0,3].some(oz=>onEntranceDrive(px+ox,pz+oz)));
          if (!blocked && first===null) first=n/slices;
          if (!blocked || first===null) continue;
          const a=first,b=n/slices;
          first=null;
          addTerrace(lerp(x0,x1,a),lerp(z0,z1,a),lerp(x0,x1,b),lerp(z0,z1,b),run!==terraceUVs[2]);
        }
      }
    }
    function addTerrace(x0,z0,x1,z1,withScreen) {
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
        const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
        let ix = dz / L, iz = -dx / L;
        if ((0 - mx) * ix + (0 - mz) * iz < 0) { ix = -ix; iz = -iz; }
        const gy = Math.min(groundY(mx, mz), -1.6), hWall = Math.max(2.2, 0.1 - gy);
        OP.box(mx, gy + hWall * 0.34, mz, L + 0.5, hWall * 0.68 + 1.0, 1.2, ang, C_WALL, M_STONE);
        OP.box(mx, gy + hWall * 0.69, mz, L + 0.6, 0.18, 1.4, ang, C_WHITE, M_STONE);
        OP.box(mx + ix * 1.4, gy + hWall * 0.75, mz + iz * 1.4, L, 0.82, 1.5, ang, C_HEDGE, M_STONE);
        OP.box(mx + ix * 2.5, gy + hWall * 0.72, mz + iz * 2.5, L + 0.4, hWall * 0.62 + 0.8, 1.1, ang, C_GRAN, M_STONE);
        OP.box(mx + ix * 2.5, 0.12, mz + iz * 2.5, L + 0.5, 0.20, 1.3, ang, C_WHITE, M_STONE);
        GL.box(mx + ix * 2.5, 0.75, mz + iz * 2.5, L, 1.1, 0.08, ang, C_GLASS, M_GLASS);
        // Transparent acoustic soundproof wall along 1704 & 1703 frontage
        if (withScreen) {
          const sx = mx - ix * 2.0, sz = mz - iz * 2.0, sgy = groundY(sx, sz);
          OP.box(sx, sgy + 0.45, sz, L, 1.1, 0.34, ang, C_STONE, M_STONE);
          GL.box(sx, sgy + 3.45, sz, L, 5.0, 0.10, ang, C_GLASS, M_GLASS);
          OP.box(sx, sgy + 6.00, sz, L, 0.16, 0.42, ang, C_METAL, M_METAL);
          const np = Math.max(2, Math.floor(L / 3.5));
          for (let k = 0; k <= np; k++) {
            const px = lerp(x0, x1, k / np) - ix * 2.0, pz = lerp(z0, z1, k / np) - iz * 2.0, pgy = groundY(px, pz);
            OP.box(px, pgy + 3.1, pz, 0.16, 6.0, 0.26, ang, C_METAL, M_METAL);
          }
        }
    }
  }

  // Stone retaining edges identified in the notice: existing at Sohwa Elementary
  // and planned along the east park slope. Block courses and heights are approximate.
  for (const trace of [
    [[279,203],[362,228],[412,191],[470,147],[552,85]],
    [[742,388],[766,425],[851,524],[893,579],[938,607],[865,678],[811,824],[754,988],[691,1178]],
  ]) {
    for (let i=1; i<trace.length; i++) {
      const a=planPoint(...trace[i-1]), b=planPoint(...trace[i]);
      const dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz), angle=Math.atan2(-dz,dx);
      const blocks=Math.ceil(length/1.9);
      for (let j=0;j<blocks;j++) {
        const t=(j+0.5)/blocks, x=lerp(a[0],b[0],t), z=lerp(a[1],b[1],t);
        const y=groundY(x,z), shade=0.29+0.06*Math.sin(j*2.4+i);
        OP.box(x,y+0.34,z,length/blocks-0.03,0.85,1.18,angle,[shade,shade*0.98,shade*0.92],M_STONE);
        OP.box(x,y+0.94,z,length/blocks-0.07,0.48,0.90,angle,[shade*1.08,shade*1.04,shade],M_STONE);
      }
    }
  }

  // ── 8. 부출입구 문주 + ICONIC 부채꼴 아치형 유리 스카이라이트 램프 캐노피 (1:1 match to siteplan_fit.jpg & visual9.jpg!)
  {
    // Leave a car length between the pedestrian crossing and the reader.
    // Span the lanes perpendicular to the local driveway at the island.
    const gate=WORLD.gates.west;
    const [gx,gz]=gate.gate;
    const dx=Math.sin(gate.gateHeading), dz=-Math.cos(gate.gateHeading);
    const gyB=entranceFloor(gx,gz), faceRoad=Math.atan2(-dx,-dz);
    const ptB=(lx,ly,lz)=>[gx-lx*dz-lz*dx,gyB+ly,gz+lx*dx-lz*dz];
    const boxB=(buf,lx,ly,lz,w,h,d,col,mp)=>buf.box(...ptB(lx,ly,lz),w,h,d,faceRoad,col,mp);

    // Sleek fluted silver & white secondary gatehouse portal
    boxB(OP, 0, 4.65, 0, 14.0, 1.35, 2.5, C_SILV, M_METAL);
    boxB(OP, 0, 5.42, 0, 14.4, 0.20, 2.7, C_WHITE, M_STONE);
    boxB(OP, -6.2, 2.35, 0, 1.9, 4.8, 2.5, C_STONE, M_STONE);
    boxB(OP,  6.2, 2.35, 0, 1.9, 4.8, 2.5, C_STONE, M_STONE);
    boxB(OP, 0, 3.92, 0.1, 11.0, 0.14, 0.36, C_LED, M_LED);
    // Entry divider island + yellow/black barrier arms
    boxB(OP, 0, 0.18, 0.0, 0.80, 0.36, 4.0, C_GRAN, M_STONE);
    boxB(OP, 0, 0.80, 0.0, 0.30, 0.95, 0.30, C_METAL, M_METAL);
    boxB(OP, -2.4, 0.92, 0.0, 4.0, 0.10, 0.10, C_YEL, M_METAL);
    boxB(OP,  2.4, 0.92, 0.0, 4.0, 0.10, 0.10, C_YEL, M_METAL);
    const bs = makeSignMesh('CENTREVILLE', { transparent: true, fg: '#f8f6ee', shadow: true, w: 7.4, h: 0.82, font: '700 66px Georgia, serif', track: 12, glow: 0.85 });
    bs.position.set(...ptB(0, 4.68, 1.32)); bs.rotation.y = faceRoad; grp.add(bs);
    const chv = makeSignMesh('2.7m', { w: 9.2, h: 0.44, chevron: true, glow: 0.35 });
    chv.position.set(...ptB(0, 3.62, -0.35)); chv.rotation.y = faceRoad; grp.add(chv);

    // ICONIC QUARTER-CIRCLE FAN-SHAPED GLASS SKYLIGHT RAMP CANOPY (부채꼴 아치 캐노피 — siteplan_fit.jpg left of 1703동!)
    // Center of curvature sits right at U2S(276, 444), fanning cleanly from (u=222,v=436) curving around to (u=288,v=378)!
    const [fcX, fcZ] = planPoint(307,481);
    const [pStartX, pStartZ] = planPoint(268,475);
    const [pEndX, pEndZ] = planPoint(329,422);
    const a0 = Math.atan2(pStartZ - fcZ, pStartX - fcX);
    let a1 = Math.atan2(pEndZ - fcZ, pEndX - fcX);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    const rIn = 8.2, rOut = 21.8, nFan = 8;
    const fanTopY = gyB + 4.65; // soaring gracefully above complex deck y=0!
    for (let k = 0; k <= nFan; k++) {
      const f = k / nFan, a = lerp(a0, a1, f);
      const ca = Math.cos(a), sa = Math.sin(a);
      const rMid = (rIn + rOut) * 0.5, radSpan = rOut - rIn;
      const ribAng = Math.atan2(-sa, ca);
      const drop = f * 1.45; // gracefully tapers down into underground garage!
      // Bold radiating dark-charcoal arched steel skylight rib!
      OP.box(fcX + ca * rMid, fanTopY - drop, fcZ + sa * rMid, radSpan + 0.6, 0.34, 0.46, ribAng, C_NAVY, M_METAL);
      // Inner & outer curved vertical support steel columns
      OP.box(fcX + ca * rIn,  (fanTopY+gyB) * 0.5 - drop, fcZ + sa * rIn,  0.42, fanTopY-gyB+0.6, 0.42, ribAng, C_NAVY, M_METAL);
      OP.box(fcX + ca * rOut, (fanTopY+gyB) * 0.5 - drop, fcZ + sa * rOut, 0.46, fanTopY - drop + 2.0, 0.46, ribAng, C_NAVY, M_METAL);
      // Faceted blue-tinted glass skylight roof panels & recessed asphalt ramp floor between consecutive ribs
      if (k < nFan) {
        const am = lerp(a0, a1, (k + 0.5) / nFan), cam = Math.cos(am), sam = Math.sin(am);
        const dropM = ((k + 0.5) / nFan) * 1.45;
        const chordM = Math.abs(a1 - a0) / nFan * rMid + 0.45;
        const segAng = Math.atan2(-sam, cam);
        GL.box(fcX + cam * rMid, fanTopY - dropM + 0.14, fcZ + sam * rMid, radSpan - 0.3, 0.10, chordM, segAng, C_GLASS, M_GLASS);
        // Dark underground ramp floor + glowing warm ceiling strip lights under the fan canopy!
        OP.box(fcX + cam * rMid, fanTopY - dropM - 0.28, fcZ + sam * rMid, radSpan * 0.55, 0.12, 0.32, segAng, C_TUNL, M_TUNL);
      }
    }
    for (const [[ax,az],[bx,bz],fraction] of gate.fanWalls) {
      const length=Math.hypot(bx-ax,bz-az), angle=Math.atan2(bx-ax,bz-az);
      OP.box((ax+bx)/2,gyB+1.4-1.45*fraction,(az+bz)/2,0.7,3.8,length,angle,C_STONE,M_STONE);
    }
    // Continue the driveway between the sidewalls beneath the covered end.
    const path=WORLD.gates.west.axis;
    const [sx,sz]=path.at(-2), [ex,ez]=path.at(-1);
    const length=Math.hypot(ex-sx,ez-sz), tx=(ex-sx)/length,tz=(ez-sz)/length;
    const angle=Math.atan2(tx,tz), mx=(sx+ex)/2,mz=(sz+ez)/2;
    const floor=entranceFloor(mx,mz);
    for (const side of [-1,1])
      OP.box(mx+side*4.7*tz,floor+2,mz-side*4.7*tx,0.5,4.1,length,angle,C_STONE,M_STONE);
    OP.box(mx,floor+3.85,mz,9.9,0.38,length,angle,C_GRAN,M_STONE);
    OP.box(ex+tx*0.2,floor+1.8,ez+tz*0.2,9.5,4.1,0.35,angle,C_DARK,M_DARK);
  }

  // ── 9. ① 비스타애비뉴 (1:1 Digital Twin of sp2_vista.jpg & siteplan_fit.jpg!)
  // Includes: White CENTREVILLE Waterfall Gate + Glazed Nude Glass Elevator + White Side Staircase + 5-Jet Splash Pool +
  // Timber Lounge Deck w/ White Café Tables + Emerald Lawn w/ Chrome Ring Sculpture + Stepped Water Cascade + 센트웰 스테이 Canopy +
  // Straight Approach Road Stairs + 블루아트갤러리 Canal w/ 9 Stepping Stones!
  {
    // Vista axis: from road sidewalk U2S(182, 682) -> sunken plaza U2S(264, 618) -> waterfall portal U2S(285, 604) -> 블루아트갤러리 U2S(394, 492)!
    // Frame V centered at waterfall portal U2S(285, 604), width along NW->SE across Vista avenue, +lz facing OUT toward sunken plaza & road!
    const V = mkFrame(264, 582, 306, 626, 0.04); // span ~19.5m perpendicular to Vista axis!
    const [rdX, rdZ] = U2S(210, 660);
    const outSgn = ((rdX - V.mx) * V.rx + (rdZ - V.mz) * V.rz) >= 0 ? 1 : -1;
    // Ensure +lx is ALWAYS RIGHT (1702동 side) and -lx is LEFT (1703동 / elevator & stairs side — sp2_vista.jpg!)
    const [d2x, d2z] = U2S(250, 685); // 1702동 side
    const rtSgn = ((d2x - V.mx) * V.ux + (d2z - V.mz) * V.uz) >= 0 ? 1 : -1;
    const ptV = (lx, ly, lz) => [V.mx + lx * rtSgn * V.ux + lz * outSgn * V.rx, V.y0 + ly, V.mz + lx * rtSgn * V.uz + lz * outSgn * V.rz];
    const boxV = (buf, lx, ly, lz, w, h, d, col, mp, pitch = 0) => { const p = ptV(lx, ly, lz); buf.box(p[0], p[1], p[2], w, h, d, V.ang, col, mp, pitch * rtSgn); };
    const faceV = Math.atan2(V.rx * outSgn, V.rz * outSgn);
    const sunkDy = 0.02; // flush cleanly ON TOP of the flat y=0 complex plaza deck so ZERO lounge/pool/sculpture geometry clips underground!

    // 9A) Iconic Bright-White CENTREVILLE Waterfall Gate Pavilion (벽천 문주 — sp2_vista.jpg center!)
    boxV(OP, 0, 6.45, 0, 18.8, 1.10, 2.8, C_WHITE, M_STONE);             // bold white top lintel beam
    boxV(OP, -8.7, 3.25, 0, 1.4, 6.6, 2.8, C_WHITE, M_STONE);            // left white monolith pier
    boxV(OP,  8.7, 3.25, 0, 1.4, 6.6, 2.8, C_WHITE, M_STONE);            // right white monolith pier
    boxV(OP, 0, 5.86, 0.2, 16.0, 0.14, 0.40, C_LED, M_LED);              // underside LED cove
    // GLAZED NUDE EXTERIOR ELEVATOR TOWER (누드 엘리베이터 — left-center bay of portal, sp2_vista.jpg!)
    boxV(OP, -3.4, 3.25, 0.1, 2.9, 6.5, 2.7, C_METAL, M_METAL);
    boxV(GL, -3.4, 3.25, 1.48, 2.5, 6.0, 0.14, C_GLASS, M_GLASS);
    boxV(GL, -3.4, 3.25, -1.28, 2.5, 6.0, 0.14, C_GLASS, M_GLASS);
    boxV(OP, -3.4, 2.2, 0.1, 1.9, 2.2, 1.8, C_LED, M_LED);               // warmly lit interior elevator cab!
    // WHITE GRANITE SIDE STAIRCASE climbing beside the glass elevator up to upper Vista balcony overlook (sp2_vista.jpg left!)
    for (let s = 0; s < 10; s++) {
      const f = (s + 0.5) / 10, sy = lerp(sunkDy + 0.12, 2.25, f);
      boxV(OP, -6.3, sy * 0.5, lerp(4.6, -0.4, f), 2.8, sy, 0.56, C_WHITE, M_STONE);
    }
    boxV(GL, -7.8, 1.75, 2.1, 0.10, 1.15, 5.4, C_GLASS, M_GLASS);
    // DARK STONE WATERFALL BACKSPLASH + FROTHY ANIMATED WATERFALL CURTAIN + 3D "CENTREVILLE" (sp2_vista.jpg!)
    boxV(OP, 2.8, 2.45, -0.35, 9.8, 4.9, 1.2, C_STONE, M_STONE);
    boxV(GL, 2.8, 2.35, 0.34, 9.2, 4.4, 0.24, C_WATER, M_FLOW);
    const vs = makeSignMesh('CENTREVILLE', { transparent: true, fg: '#ffffff', shadow: true, w: 8.8, h: 0.96, font: '700 74px Georgia, serif', track: 14, glow: 1.25 });
    vs.position.set(...ptV(2.8, 4.95, 0.65)); vs.rotation.y = faceV; grp.add(vs);

    // 9B) Dark Granite Splash Pool with 5 Vertical Fountain Plumes + Warm Timber Café Lounge Deck (sp2_vista.jpg!)
    boxV(OP, 2.2, sunkDy + 0.18, 3.0, 12.2, 0.36, 4.6, C_STONE, M_STONE);
    boxV(GL, 2.2, sunkDy + 0.38, 3.0, 11.4, 0.08, 3.9, C_WATER, M_FLOW);
    for (const fx of [-2.2, 0.0, 2.2, 4.4, 6.4]) {
      const p = ptV(fx, sunkDy + 1.25, 3.0);
      GL.cyl(p[0], p[1], p[2], 0.09, 0.24, 1.75, 8, [0.90, 0.97, 1.0], M_FLOW);
    }
    // Warm slatted timber lounge terrace directly in front of splash pool!
    boxV(OP, 1.2, sunkDy + 0.18, 9.6, 10.6, 0.36, 8.2, C_WOOD, M_WOOD);
    // 3 white round modern café tables + surrounding chairs on timber deck (sp2_vista.jpg!)
    for (const [tx, tz] of [[-1.6, 10.4], [1.2, 8.2], [4.0, 10.4]]) {
      const tp = ptV(tx, sunkDy + 1.05, tz);
      OP.cyl(tp[0], tp[1], tp[2], 0.78, 0.78, 0.09, 14, C_WHITE, M_STONE);
      OP.cyl(tp[0], tp[1] - 0.36, tp[2], 0.10, 0.15, 0.65, 8, C_METAL, M_METAL);
      for (let c = 0; c < 4; c++) {
        const ca = c * Math.PI * 0.5 + 0.4;
        OP.box(tp[0] + Math.cos(ca) * 1.12, tp[1] - 0.32, tp[2] + Math.sin(ca) * 1.12, 0.46, 0.52, 0.46, ca, C_WHITE, M_STONE);
      }
    }
    // Rectangular Emerald Sculpture Lawn + SEAMLESS GLEAMING CHROME RING SCULPTURE (32-seg Torus, sp2_vista.jpg foreground!)
    boxV(OP, 1.2, sunkDy + 0.12, 17.8, 10.6, 0.24, 7.6, C_HEDGE, M_STONE);
    const ringC = ptV(1.2, sunkDy + 1.98, 17.4);
    OP.torus(ringC[0], ringC[1], ringC[2], 1.78, 0.14, V.ang + 0.42, [0.84, 0.87, 0.90], M_CHROME, 0.14);
    OP.box(ringC[0], sunkDy + 0.26, ringC[2], 1.8, 0.16, 0.65, V.ang + 0.42, C_GRAN, M_STONE);

    // 9C) Right-Side Stepped Reflecting Water Cascade + 센트웰 스테이(B1F) White Gallery Canopy & Wood Bench Niche (sp2_vista.jpg right!)
    boxV(OP, 7.6, sunkDy + 0.24, 13.5, 2.2, 0.48, 15.8, C_STONE, M_STONE);
    boxV(GL, 7.6, sunkDy + 0.50, 13.5, 1.7, 0.08, 15.0, C_WATER, M_FLOW);
    for (const wz of [8.2, 11.8, 15.4, 19.0]) {
      const wp = ptV(7.6, sunkDy + 1.05, wz);
      GL.cyl(wp[0], wp[1], wp[2], 0.09, 0.20, 1.15, 8, [0.90, 0.97, 1.0], M_FLOW);
    }
    // White cantilevered 센트웰 스테이 gallery canopy & warm recessed timber bench seating along 1702동 flank!
    boxV(OP, 10.2, sunkDy + 3.85, 13.5, 3.2, 0.65, 16.8, C_WHITE, M_STONE);
    boxV(OP, 10.2, sunkDy + 1.90, 5.4,  3.0, 3.8, 0.95, C_WHITE, M_STONE);
    boxV(OP, 10.2, sunkDy + 1.90, 21.6, 3.0, 3.8, 0.95, C_WHITE, M_STONE);
    boxV(OP, 11.2, sunkDy + 1.90, 13.5, 0.9, 3.6, 15.6, C_STONE, M_STONE);
    boxV(GL, 10.6, sunkDy + 1.90, 13.5, 0.16, 3.2, 14.6, C_SHOPG, M_SHOP);
    boxV(OP, 9.5,  sunkDy + 0.52, 13.5, 1.5, 0.48, 13.6, C_WOOD, M_WOOD);
    boxV(OP, 10.2, sunkDy + 3.45, 13.5, 2.2, 0.10, 14.8, C_LED, M_LED);

    // 9D) Grand Straight Granite Approach Staircase climbing cleanly from 51.5M 도로 sidewalk up into Vista promenade!
    const ST = mkFrame(186, 682, 234, 642);
    const stY0 = groundY(ST.a[0], ST.a[1]), stY1 = V.y0 + sunkDy + 0.12;
    const nSt = 14, stW = 5.4;
    for (let k = 0; k < nSt; k++) {
      const f = (k + 0.5) / nSt, sy = lerp(stY0 + 0.08, stY1, f);
      const hStep = Math.max(0.55, sy - (stY0 - 1.2));
      ST.box(OP, lerp(-ST.L * 0.5, ST.L * 0.5, f), sy - ST.y0 - hStep * 0.5, 0, ST.L / nSt + 0.12, hStep, stW, C_GRAN, M_STONE);
      ST.box(OP, lerp(-ST.L * 0.5, ST.L * 0.5, f), sy - ST.y0 - 0.02, 0, 0.08, 0.06, stW - 0.5, C_LED, M_LED);
    }
    const stPitch = Math.atan2(stY1 - stY0, ST.L);
    const stMidY = (stY0 + stY1) * 0.5 - ST.y0;
    for (const side of [-1, 1]) {
      const oz = side * (stW * 0.5 + 0.24);
      ST.box(OP, 0, stMidY - 0.1, oz, ST.L + 0.6, 0.65, 0.38, C_WHITE, M_STONE, stPitch);
      ST.box(GL, 0, stMidY + 0.68, oz, ST.L + 0.3, 1.05, 0.08, C_GLASS, M_GLASS, stPitch);
    }

    // 9E) 블루아트갤러리 Canal (U2S(306, 580) -> U2S(394, 492)) — Granite Coping + Shimmering Water + 9 Floating Stepping Pads + Sculpture Plinths!
    const BA = mkFrame(306, 580, 394, 492, 0.03);
    const baW = 6.6;
    BA.box(OP, 0, 0.14, -baW * 0.5, BA.L + 0.6, 0.34, 0.55, C_WHITE, M_STONE);
    BA.box(OP, 0, 0.14,  baW * 0.5, BA.L + 0.6, 0.34, 0.55, C_WHITE, M_STONE);
    BA.box(OP, -BA.L * 0.5, 0.14, 0, 0.55, 0.34, baW + 0.5, C_WHITE, M_STONE);
    BA.box(OP,  BA.L * 0.5, 0.14, 0, 0.55, 0.34, baW + 0.5, C_WHITE, M_STONE);
    BA.box(GL, 0, 0.22, 0, BA.L - 0.4, 0.08, baW - 0.55, C_WATER, M_FLOW);
    for (let i = 0; i < 9; i++) {
      const lx = lerp(-BA.L * 0.42, BA.L * 0.42, i / 8);
      BA.box(OP, lx, 0.27, 0, 1.65, 0.16, 2.3, C_WHITE, M_STONE);
    }
    // 3 modern outdoor gallery art sculptures along waterside promenade
    for (const [lx, lz] of [[-BA.L * 0.26, -baW * 0.72], [0.0, baW * 0.72], [BA.L * 0.28, -baW * 0.72]]) {
      BA.box(OP, lx, 0.45, lz, 1.1, 0.9, 1.1, C_WHITE, M_STONE);
      const sp = BA.pt(lx, 1.65, lz);
      OP.cyl(sp[0], sp[1], sp[2], 0.42, 0.18, 1.5, 8, [0.76, 0.80, 0.84], M_CHROME);
    }
  }

  // ── 10. ③ 펀 그라운드 (65m Multi-Zone Adventure Park — 1:1 match to sp4_fun.jpg!)
  {
    // 10A) Sculptural Lime-Green & Yellow Adventure Jungle-Gym Tower + Skybridge + Tube Slide + Trampolines at U2S(596, 696)!
    const FG = mkFrame(566, 730, 624, 666, 0.03);
    // Tall sculptural lime-green play tower core (sp4_fun.jpg right!)
    FG.box(OP, -4.5, 2.4, -0.6, 3.6, 4.8, 3.2, C_LIME, M_METAL);
    FG.box(OP, -4.5, 5.4, -0.8, 1.4, 2.2, 1.4, C_YEL, M_METAL);          // iconic tall periscope crest!
    FG.box(OP, -2.1, 1.2,  0.8, 1.5, 1.6, 2.4, [0.85, 0.44, 0.14], M_WOOD); // climbing ramp deck
    // Tubular silver slide descending from tower into teal EPDM pad!
    FG.cyl(OP, -1.5, 2.1, -2.4, 0.48, 0.48, 5.6, 10, C_SILV, M_CHROME, 0.78, -0.35);
    // Yellow arched climbing skybridge & twin swing frame spanning out toward center (sp4_fun.jpg center!)
    FG.box(OP,  2.2, 3.6, -0.4, 9.4, 0.36, 0.36, C_YEL, M_METAL);
    for (const sx of [-2.0, 1.5, 5.2, 6.8]) {
      FG.box(OP, sx, 1.8, -0.4, 0.32, 3.6, 0.32, C_YEL, M_METAL);
    }
    FG.box(OP,  3.4, 2.1, -0.4, 4.8, 0.24, 1.3, C_LIME, M_WOOD);         // elevated mesh skybridge
    // 2 circular recessed black/white trampoline pads (sp4_fun.jpg foreground!)
    for (const [tx, tz] of [[-1.2, 3.2], [2.4, 3.6]]) {
      FG.cyl(OP, tx, 0.10, tz, 1.55, 1.65, 0.18, 16, C_WHITE, M_STONE);
      FG.cyl(OP, tx, 0.16, tz, 1.25, 1.25, 0.10, 16, C_DARK, M_DARK);
    }
    // Lime-green perimeter adventure play arch bordering the EPDM zone
    FG.box(OP, 0.6, 2.0, 5.6, 8.2, 0.42, 0.42, C_LIME, M_METAL);
    FG.box(OP, -3.4, 1.0, 5.6, 0.42, 2.0, 0.42, C_LIME, M_METAL);
    FG.box(OP,  4.6, 1.0, 5.6, 0.42, 2.0, 0.42, C_LIME, M_METAL);

    // 10B) Elevated White Oval-Roof Treehouse Viewing Pavilion on Angled Lime Columns (sp4_fun.jpg left!)
    const TH2 = mkFrame(628, 650, 662, 614, 0.03);
    TH2.box(OP, 0, 2.35, 0, 6.8, 0.32, 3.6, C_WOOD, M_WOOD);             // elevated viewing timber deck
    TH2.box(OP, 0, 4.95, 0, 8.2, 0.44, 4.4, C_WHITE, M_STONE);           // sleek floating white oval-style canopy
    TH2.box(OP, 0, 4.68, 0, 7.2, 0.10, 3.4, C_LED, M_LED);               // warm soffit LED
    TH2.box(GL, 0, 3.05,  1.72, 6.6, 1.15, 0.08, C_GLASS, M_GLASS);
    TH2.box(GL, 0, 3.05, -1.72, 6.6, 1.15, 0.08, C_GLASS, M_GLASS);
    for (const [cx, cz, tilt] of [[-2.6, 1.2, 0.16], [2.6, 1.2, -0.16], [-2.6, -1.2, 0.16], [2.6, -1.2, -0.16]]) {
      TH2.box(OP, cx, 2.45, cz, 0.28, 5.1, 0.28, C_LIME, M_METAL, tilt);
    }
    // Curved spectator benches along Fun Ground promenade
    for (const lx of [-8.0, 0.0, 8.0]) {
      FG.box(OP, lx, 0.42, -5.6, 3.2, 0.48, 0.72, C_WOOD, M_WOOD);
    }
  }

  // ── 11. ④ 그로잉 그라운드 & 어린이집(1F) (1:1 Digital Twin of sp5_growing.jpg!)
  {
    // 어린이집(1F) (KIDS VILLAGE) at U2S(474, 540), facing 그로잉 그라운드 U2S(404, 594)!
    addGabledPavilion(456, 520, 496, 558, 9.6, 3.7, 4.85, C_MUST, 'KIDS VILLAGE');
    // Linear Granite Reflecting Water Basin along 그로잉 그라운드 with warm continuous LED strip + white granite bridge slabs (sp5_growing.jpg!)
    const GW = mkFrame(390, 566, 446, 514, 0.03);
    GW.box(OP, 0, 0.20, -1.9, GW.L + 0.4, 0.44, 0.45, C_STONE, M_STONE);
    GW.box(OP, 0, 0.20,  1.9, GW.L + 0.4, 0.44, 0.45, C_STONE, M_STONE);
    GW.box(OP, 0, 0.36, -1.68, GW.L, 0.07, 0.10, C_LED, M_LED);          // continuous linear coping LED!
    GW.box(OP, 0, 0.36,  1.68, GW.L, 0.07, 0.10, C_LED, M_LED);
    GW.box(GL, 0, 0.24, 0, GW.L - 0.3, 0.08, 3.3, C_WATER, M_FLOW);
    // Crisp white granite pedestrian bridge crossing the water basin (sp5_growing.jpg foreground!)
    GW.box(OP, -2.5, 0.38, 0, 3.4, 0.22, 4.6, C_WHITE, M_STONE);
    GW.box(OP,  5.5, 0.38, 0, 2.8, 0.22, 4.6, C_WHITE, M_STONE);
    // Architectural kids' timber & yellow star-themed tot-lot playhouse in 그로잉 그라운드 (sp5_growing.jpg!)
    const KP = mkFrame(402, 598, 420, 586, 0.03);
    for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) KP.box(OP, px, 1.45, pz, 0.18, 2.9, 0.18, C_CEDAR, M_WOOD);
    KP.box(OP, 0, 1.25, 0, 2.5, 0.18, 2.5, C_WOOD, M_WOOD);
    KP.box(OP, 0, 1.75, -1.15, 2.4, 0.85, 0.14, C_YEL, M_WOOD);
    KP.box(OP, -1.15, 1.75, 0, 0.14, 0.85, 2.4, C_YEL, M_WOOD);
    KP.box(OP,  1.15, 1.75, 0, 0.14, 0.85, 2.4, [0.22, 0.58, 0.78], M_WOOD);
    KP.box(OP, -0.75, 3.05, 0, 1.85, 0.18, 2.9, C_YEL, M_METAL, 0.42);
    KP.box(OP,  0.75, 3.05, 0, 1.85, 0.18, 2.9, C_YEL, M_METAL, -0.42);
    KP.box(OP,  2.15, 0.65, 0, 2.3, 0.14, 0.78, [0.22, 0.58, 0.78], M_METAL, -0.48);
    KP.box(OP, -1.85, 0.65, 0, 1.4, 0.16, 0.85, C_LIME, M_WOOD, 0.52);
  }

  // ── 12. ⑤ 아너스가든 & 아너스라운지(경로당 1F) (1:1 Digital Twin of sp6_honors.jpg!)
  {
    // 아너스라운지(경로당 1F) (SENIOR LOUNGE) at U2S(468, 374), facing 아너스가든 U2S(400, 396)!
    addGabledPavilion(450, 354, 486, 390, 8.4, 3.6, 4.75, C_OAK, 'SENIOR LOUNGE');
    // 아너스가든: 3 raised wooden vegetable/herb planter beds (텃밭), putting green flags & senior fitness stations (sp6_honors.jpg!)
    const HG = mkFrame(378, 412, 424, 372, 0.03);
    for (const lx of [-5.2, 0.0, 5.2]) {
      HG.box(OP, lx, 0.38, 4.8, 3.8, 0.76, 1.8, C_WOOD, M_WOOD);
      HG.box(OP, lx, 0.78, 4.8, 3.4, 0.12, 1.4, C_SOIL, M_STONE);
      HG.box(OP, lx, 0.96, 4.8, 3.0, 0.26, 1.1, C_HEDGE, M_STONE);
    }
    // Putting green flagsticks + 3 outdoor senior fitness equipment stations
    for (const [fx, fz] of [[-4.5, -2.5], [1.2, -3.2], [5.8, -1.8]]) {
      const p = HG.pt(fx, 0, fz);
      OP.cyl(p[0], p[1] + 0.95, p[2], 0.03, 0.03, 1.9, 6, C_WHITE, M_METAL);
      OP.box(p[0] + 0.18, p[1] + 1.75, p[2], 0.36, 0.24, 0.04, HG.ang, [0.88, 0.22, 0.18], M_STONE);
    }
    for (const lx of [-6.0, -2.0, 2.0]) {
      HG.box(OP, lx, 0.95, -5.8, 0.14, 1.9, 0.14, [0.22, 0.56, 0.52], M_METAL);
      HG.box(OP, lx + 0.55, 1.25, -5.8, 1.1, 0.10, 0.10, C_SILV, M_METAL);
    }
    // Shade pergola in 아너스가든
    HG.box(OP, 7.6, 3.15, 0.0, 4.8, 0.24, 3.8, C_WOOD, M_WOOD);
    for (const [dx, dz] of [[-2.1, -1.6], [2.1, -1.6], [-2.1, 1.6], [2.1, 1.6]]) {
      HG.box(OP, 7.6 + dx, 1.58, dz, 0.22, 3.15, 0.22, C_METAL, M_METAL);
    }
  }

  // ── 13. 보타닉라운지, 바이탈그라운드 (배드민턴장 + 허브정원), 킨포크라운지 (1:1 from siteplan_fit.jpg!)
  {
    // 보타닉라운지 (North woodland deck + white/wood pergola at U2S(505, 198))
    const BL = mkFrame(486, 210, 526, 192, 0.03);
    BL.box(OP, 0, 0.18, 0, 10.6, 0.36, 6.2, C_WOOD, M_WOOD);
    BL.box(OP, 0, 3.25, 0, 8.6, 0.24, 4.6, C_WHITE, M_STONE);
    BL.box(OP, 0, 3.08, 0, 7.4, 0.10, 0.25, C_LED, M_LED);
    for (const [dx, dz] of [[-3.9, -2.0], [3.9, -2.0], [-3.9, 2.0], [3.9, 2.0]]) {
      BL.box(OP, dx, 1.62, dz, 0.22, 3.25, 0.22, C_METAL, M_METAL);
    }
    BL.box(OP, 0, 0.52, -1.5, 4.2, 0.48, 0.72, C_GRAN, M_STONE);
    BL.box(OP, 0, 0.52,  1.5, 4.2, 0.48, 0.72, C_GRAN, M_STONE);

    // 바이탈그라운드 (Multi-sport badminton court net + geometric herb garden at U2S(668, 544) & U2S(644, 492))
    const VG = mkFrame(654, 560, 694, 524, 0.03);
    VG.cyl(OP, 0, 0.85, -3.4, 0.06, 0.06, 1.7, 6, C_METAL, M_METAL);
    VG.cyl(OP, 0, 0.85,  3.4, 0.06, 0.06, 1.7, 6, C_METAL, M_METAL);
    VG.box(OP, 0, 1.56, 0, 0.06, 0.10, 6.8, C_WHITE, M_STONE);
    VG.box(GL, 0, 1.15, 0, 0.04, 0.75, 6.7, [0.85, 0.88, 0.90], M_GLASS);
    // Geometric herb garden raised frames & pergola next to court
    const HG2 = mkFrame(624, 502, 666, 466, 0.03);
    for (const [gx, gz] of [[-3.5, -2.2], [3.5, -2.2], [-3.5, 2.2], [3.5, 2.2]]) {
      HG2.box(OP, gx, 0.32, gz, 5.2, 0.64, 3.0, C_GRAN, M_STONE);
      HG2.box(OP, gx, 0.70, gz, 4.6, 0.22, 2.4, C_HEDGE, M_STONE);
    }
    HG2.box(OP, 0, 3.10, -5.8, 6.2, 0.22, 3.4, C_WOOD, M_WOOD);
    for (const [dx, dz] of [[-2.7, -1.4], [2.7, -1.4], [-2.7, 1.4], [2.7, 1.4]]) {
      HG2.box(OP, dx, 1.55, -5.8 + dz, 0.20, 3.1, 0.20, C_METAL, M_METAL);
    }

    // 킨포크라운지 (SE wood terrace + slatted cedar pergola at U2S(548, 848))
    const KL = mkFrame(534, 858, 574, 830, 0.03);
    KL.box(OP, 0, 0.18, 0, 11.4, 0.36, 6.6, C_WOOD, M_WOOD);
    KL.box(OP, 0, 3.15, 0, 8.8, 0.24, 4.8, C_CEDAR, M_WOOD);
    KL.box(OP, 0, 2.98, 0, 7.6, 0.10, 0.24, C_LED, M_LED);
    for (const [dx, dz] of [[-4.0, -2.1], [4.0, -2.1], [-4.0, 2.1], [4.0, 2.1]]) {
      KL.box(OP, dx, 1.58, dz, 0.22, 3.15, 0.22, C_METAL, M_METAL);
    }
    KL.box(OP, -1.8, 0.56, 0, 2.2, 0.52, 1.0, C_WHITE, M_STONE);
    KL.box(OP,  1.8, 0.56, 0, 2.2, 0.52, 1.0, C_WHITE, M_STONE);
  }

  // ── 14. Architectural Landscape Bollard Lights across all Complex Courtyards & Promenades!
  const bollardUVs = [
    // 비스타애비뉴 promenade
    [296, 568], [326, 540], [356, 512], [386, 484], [416, 456], [452, 422], [492, 386], [532, 350],
    [322, 594], [352, 566], [382, 538], [412, 510], [448, 476], [488, 440], [528, 404],
    // 센트레 커넥트 파크 & 웰컴라운지
    [336, 774], [344, 722], [368, 668], [418, 660], [434, 718], [408, 778], [362, 796],
    // 그로잉 그라운드 & 아너스가든
    [388, 616], [428, 578], [454, 592], [358, 412], [396, 368], [436, 388], [388, 444],
    // 펀 그라운드 & 바이탈그라운드 & 보타닉/킨포크
    [556, 738], [588, 686], [628, 636], [668, 596], [642, 558], [684, 520],
    [486, 226], [526, 198], [540, 842], [568, 862],
  ];
  for (const [u, v] of bollardUVs) addBollard(u, v);

  const opMesh = new THREE.Mesh(OP.build(), makeArchMat(false));
  opMesh.frustumCulled = false;
  WORLD.casters.push({ mesh: opMesh, mat: depthMat });
  grp.add(opMesh);

  const glMesh = new THREE.Mesh(GL.build(), makeArchMat(true));
  glMesh.frustumCulled = false; glMesh.renderOrder = 4;
  grp.add(glMesh);

  return grp;
}

// ───────────── Build Neighborhood Props: High-Detail 3D 법원지하차도, 갈참나무다리 생태터널, 광교호수공원 & Street Furniture!
function buildWorldProps() {
  const grp = new THREE.Group();
  const OP = new ArchBuf();
  const GL = new ArchBuf();
  const C_CONC = [0.60, 0.59, 0.56], C_WALL = [0.76, 0.77, 0.78], C_DARK = [0.03, 0.035, 0.045];
  const C_ASPH = [0.18, 0.19, 0.21], C_METAL = [0.24, 0.26, 0.29], C_POLE = [0.50, 0.52, 0.56];
  const C_WHITE = [0.89, 0.89, 0.87], C_WOOD = [0.48, 0.31, 0.18], C_CEDAR = [0.58, 0.38, 0.22];
  const C_TILE = [0.22, 0.25, 0.29], C_TURF = [0.21, 0.37, 0.15], C_WATER = [0.26, 0.64, 0.76];
  const C_LED = [1.0, 0.86, 0.58], C_TUNL = [1.0, 0.80, 0.46], C_GLASS = [0.24, 0.34, 0.42];
  const M_CONC = [0.85, 0.0, 0.0, 0.0], M_DARK = [0.95, 0.0, 0.0, 0.0], M_METAL = [0.35, 0.65, 0.0, 0.0];
  const M_WOOD = [0.75, 0.0, 0.0, 0.0], M_LED = [0.2, 0.0, 1.8, 0.0], M_TUNL = [0.1, 0.0, 4.4, 0.0];
  const M_GLASS = [0.08, 0.15, 0.0, 1.0], M_FLOW = [0.12, 0.05, 0.35, 2.0];

  // ── 1. High-Detail 3D 법원지하차도 (Depressed Retaining Walls, Twin-Bore Portal, Dark Recessed Tunnel + Ceiling Lights & Highway Sign Gantry!)
  {
    const stations = rampStations(36);
    for (let k=1; k<stations.length; k++) {
      const {x:x0,z:z0} = stations[k-1], {x:x1,z:z1} = stations[k];
      const length = Math.hypot(x1-x0,z1-z0);
      const nx = -(z1-z0)/length, nz = (x1-x0)/length;
      const ang = Math.atan2(-(z1-z0),x1-x0);
      const halfW = (stations[k-1].halfW+stations[k].halfW)/2;
      const xm = (x0 + x1) * 0.5, zm = (z0 + z1) * 0.5, sL = Math.hypot(x1 - x0, z1 - z0) + 0.35;
      const gyFloor = groundY(xm, zm);
      const gySurfL = groundY(xm - nx * 16.0, zm - nz * 16.0);
      const gySurfR = groundY(xm + nx * 16.0, zm + nz * 16.0);
      const gySurf = (gySurfL + gySurfR) * 0.5;
      const wallTop = Math.max(gySurf + 0.55, gyFloor + 1.15);
      const wallBot = gyFloor - 1.2;
      const wallH = wallTop - wallBot;

      // Clean dark asphalt ramp floor slab (overrides coarse DEM steps inside trench!)
      OP.box(xm, gyFloor - 0.12, zm, sL, 0.28, halfW * 2.0, ang, C_ASPH, M_DARK);
      // Central New-Jersey concrete median divider separating opposing underpass bores
      OP.box(xm, gyFloor + 0.45, zm, sL, 0.95, 0.65, ang, C_CONC, M_CONC);

      // Left & right retaining walls + bright ceramic tunnel-approach tile lining + top galvanized guardrails!
      for (const sgn of [-1, 1]) {
        const wx = xm + nx * halfW * sgn, wz = zm + nz * halfW * sgn;
        OP.box(wx, (wallTop + wallBot) * 0.5, wz, sL, wallH, 0.72, ang, C_CONC, M_CONC);
        // Inner white tiled facing on deep ramp sections
        if (wallH > 2.2) {
          OP.box(xm + nx * (halfW - 0.38) * sgn, gyFloor + Math.min(wallH * 0.55, 2.8) * 0.5, zm + nz * (halfW - 0.38) * sgn, sL, Math.min(wallH * 0.55, 2.8), 0.12, ang, C_WALL, M_CONC);
        }
        // Top concrete coping + twin galvanized steel pedestrian safety rails
        OP.box(wx, wallTop + 0.08, wz, sL, 0.18, 0.92, ang, C_WHITE, M_CONC);
        OP.box(wx, wallTop + 0.65, wz, sL, 0.09, 0.10, ang, C_POLE, M_METAL);
        OP.box(wx, wallTop + 1.08, wz, sL, 0.10, 0.12, ang, C_POLE, M_METAL);
        OP.cyl(wx, wallTop + 0.58, wz, 0.05, 0.05, 1.05, 5, C_POLE, M_METAL);
      }
    }

    // Twin-Bore Reinforced Concrete Tunnel Portal at (57.7, 48.6) — FLUSH with surface intersection grade (exact match to ov_complex.jpg!)
    const {x:px,z:pz,halfW} = stations.at(-1), previous = stations.at(-2);
    const length = Math.hypot(px-previous.x,pz-previous.z);
    const ux=(px-previous.x)/length, uz=(pz-previous.z)/length;
    const nx=-uz, nz=ux, ang=Math.atan2(-uz,ux);
    const gyP = groundY(px, pz);
    const gySurfP = (groundY(px - nx * 18, pz - nz * 18) + groundY(px + nx * 18, pz + nz * 18)) * 0.5;
    const pHeadY = gySurfP - 0.12; // sits cleanly flush with flanking 광교중앙로 surface lanes!
    const boreFloor = Math.min(gyP, pHeadY - 4.55);
    const boreH = pHeadY - boreFloor;

    // Clean concrete portal headwall beam + central divider pier + outer abutments (flush with street median!)
    OP.box(px, pHeadY + 0.35, pz, 2.8, 1.15, halfW * 2.0 + 1.8, ang, C_CONC, M_CONC);
    OP.box(px, pHeadY + 0.96, pz, 3.0, 0.16, halfW * 2.0 + 2.0, ang, C_WHITE, M_CONC);
    OP.box(px, boreFloor + boreH * 0.5, pz, 2.8, boreH, 1.1, ang, C_CONC, M_CONC);
    for (const sgn of [-1, 1]) {
      OP.box(px + nx * (halfW + 0.35) * sgn, boreFloor + boreH * 0.5, pz + nz * (halfW + 0.35) * sgn, 3.0, boreH + 0.8, 1.4, ang, C_CONC, M_CONC);
    }

    // Deep 36m Pitch-Dark Recessed Twin Tunnel Interior Box + Warm Amber Ceiling Lights!
    const tunL = 36.0;
    const tx = px + ux * (tunL * 0.5 + 1.0), tz = pz + uz * (tunL * 0.5 + 1.0);
    OP.box(tx, boreFloor, tz, tunL, 0.25, halfW*2, ang, C_ASPH, M_DARK);
    // The underground ceiling faces into the bore. Its top surface is the
    // registered terrain above, which slopes independently of the tunnel.
    const ceiling = new THREE.PlaneGeometry(tunL, halfW*2);
    ceiling.rotateX(Math.PI/2);
    ceiling.rotateY(ang);
    ceiling.translate(tx,pHeadY-0.175,tz);
    OP.addGeo(ceiling,C_CONC,M_CONC);
    OP.box(px+ux*tunL,boreFloor+boreH/2,pz+uz*tunL,0.3,boreH,halfW*2,ang,C_DARK,M_DARK);
    for (const side of [-1,1]) {
      OP.box(tx+nx*halfW*side,boreFloor+boreH/2,tz+nz*halfW*side,tunL,boreH,0.3,ang,C_WALL,M_CONC);
    }
    for (let k = 0; k < 6; k++) {
      const ld = 2.6 + k * 5.0;
      for (const sgn of [-1, 1]) {
        OP.box(px + ux * ld + nx * 4.1 * sgn, pHeadY - 0.35, pz + uz * ld + nz * 4.1 * sgn, 2.2, 0.14, 0.52, ang, C_TUNL, M_TUNL);
      }
    }

    // Portal safety chevron height clearance bar (4.5m) & Tunnel Name Sign facing incoming drivers (-ux, -uz)!
    const faceRot = Math.atan2(-ux, -uz);
    const chv = makeSignMesh('4.5m', { w: halfW * 1.90, h: 0.62, chevron: true, glow: 0.45 });
    chv.position.set(px - ux * 1.46, pHeadY - 0.10, pz - uz * 1.46); chv.rotation.y = faceRot; grp.add(chv);
    const tnm = makeSignMesh('법원지하차도', { bg: '#0c5238', fg: '#ffffff', w: 9.2, h: 1.12, font: '700 72px "Noto Sans KR", sans-serif', track: 12, glow: 0.90, border: '#ffffff' });
    tnm.position.set(px - ux * 1.50, pHeadY + 0.65, pz - uz * 1.50); tnm.rotation.y = faceRot; grp.add(tnm);

    // Overhead Korean Directional Highway Sign Gantry spanning approach ~48m before tunnel portal!
    const gxG = px - ux * 48.0, gzG = pz - uz * 48.0, gyG = groundY(gxG, gzG);
    const gTop = gyG + 8.6;
    for (const sgn of [-1, 1]) {
      OP.cyl(gxG + nx * (halfW + 1.2) * sgn, (gyG + gTop) * 0.5, gzG + nz * (halfW + 1.2) * sgn, 0.24, 0.28, gTop - gyG + 1.2, 8, C_POLE, M_METAL);
    }
    OP.box(gxG, gTop - 0.4, gzG, 0.45, 0.55, (halfW + 1.4) * 2, ang, C_POLE, M_METAL);
    OP.box(gxG, gTop - 1.5, gzG, 0.35, 0.35, (halfW + 1.4) * 2, ang, C_POLE, M_METAL);
    const hwySign = makeSignMesh('↑ 법원지하차도 · 영통', { bg: '#0a5e3c', fg: '#ffffff', w: 9.2, h: 2.2, font: '700 58px "Noto Sans KR", sans-serif', track: 4, sub: '광교중앙로 · 아주대삼거리', glow: 0.95, border: '#ffffff' });
    hwySign.position.set(gxG - ux * 0.35, gTop - 0.95, gzG - uz * 0.35); hwySign.rotation.y = faceRot; grp.add(hwySign);
  }

  // ── 2. 3D 갈참나무다리 생태터널 (South of 광교에듀포레!) & 혜령로 생태터널 (using W.galcham!)
  if (W.galcham && W.galcham.length) {
    for (const tun of W.galcham) {
      const a = tun.a, b = tun.b;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      const ang = Math.atan2(-uz, ux);
      const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
      const bw = tun.bw || 26.0, halfW = bw * 0.44;
      const boreH = 6.2;

      // Ecological land-bridge roof deck spanning the full tunnel between the two hillsides!
      const roofY = Math.max(tun.ya + boreH + 1.8, tun.yb + boreH + 1.8, tun.ym - 0.4);
      // Thick concrete tunnel roof box + lush soil/grass eco-bridge surface + timber 여우길 trail on top!
      OP.box(mx, roofY - 1.1, mz, L + 2.0, 2.2, bw + 4.0, ang, C_CONC, M_CONC);
      OP.box(mx, roofY + 0.35, mz, L + 1.2, 0.85, bw + 6.5, ang, C_TURF, M_CONC);
      // Timber-railed 여우길 ecological footpath crossing OVER the tunnel roof (perpendicular to the highway!)
      OP.box(mx, roofY + 0.82, mz, 3.6, 0.14, bw + 10.0, ang, C_WOOD, M_WOOD);
      for (const sx of [-1.9, 1.9]) {
        OP.box(mx + ux * sx, roofY + 1.35, mz + uz * sx, 0.12, 0.95, bw + 9.0, ang, C_WOOD, M_WOOD);
      }

      // Build Twin-Bore Concrete Portals, Wing Walls, Dark Interiors, Ceiling Lights & Green Tunnel Name Signs on BOTH ends!
      for (const [pEnd, dirOut, yFloor] of [[a, -1, tun.ya], [b, 1, tun.yb]]) {
        const ox = ux * dirOut, oz = uz * dirOut; // outward normal from portal face
        const faceRot = Math.atan2(ox, oz);
        const boreTop = yFloor + boreH;
        const spandrelH = Math.max(2.6, roofY - boreTop + 1.4);
        const hWall = Math.max(boreH + 2.4, roofY - yFloor + 1.2);
        // Solid concrete portal headwall spandrel filling completely from boreTop up to roofY (zero daylight gap!)
        OP.box(pEnd[0], boreTop + spandrelH * 0.5 - 0.1, pEnd[1], 3.4, spandrelH, bw + 5.0, ang, C_CONC, M_CONC);
        OP.box(pEnd[0], roofY + 0.95, pEnd[1], 3.6, 0.42, bw + 5.4, ang, C_WHITE, M_CONC);
        // Central concrete divider pier + outer abutments extending solidly into ground
        OP.box(pEnd[0], yFloor + boreH * 0.5 - 0.8, pEnd[1], 3.6, boreH + 2.0, 2.0, ang, C_CONC, M_CONC);
        for (const sgn of [-1, 1]) {
          OP.box(pEnd[0] + nx * (halfW + 1.4) * sgn, yFloor + hWall * 0.5 - 0.8, pEnd[1] + nz * (halfW + 1.4) * sgn, 4.2, hWall + 1.6, 2.6, ang, C_CONC, M_CONC);
          OP.box(pEnd[0] + ox * 7.5 + nx * (halfW + 2.8) * sgn, yFloor + boreH * 0.45 - 0.6, pEnd[1] + oz * 7.5 + nz * (halfW + 2.8) * sgn, 13.0, boreH + 1.2, 1.2, ang + sgn * 0.14, C_CONC, M_CONC);
        }
        // Deep pitch-dark tunnel interior box recessed cleanly into the hillside + glowing amber ceiling lights!
        OP.box(pEnd[0] - ox * 14.0, yFloor + boreH * 0.5 - 0.4, pEnd[1] - oz * 14.0, 26.0, boreH + 0.8, halfW * 2.0, ang, C_DARK, M_DARK);
        for (let k = 0; k < 4; k++) {
          const ld = 3.0 + k * 5.0;
          for (const sgn of [-1, 1]) {
            OP.box(pEnd[0] - ox * ld + nx * (halfW * 0.52) * sgn, boreTop - 0.35, pEnd[1] - oz * ld + nz * (halfW * 0.52) * sgn, 2.4, 0.18, 0.55, ang, C_TUNL, M_TUNL);
          }
        }
        // Crisp Korean Tunnel Name Plaque ("갈참나무다리" / "혜령로 생태터널") & clearance chevron bar right on headwall!
        const sign = makeSignMesh(tun.name, { bg: '#0c5238', fg: '#ffffff', w: 10.5, h: 1.65, font: '700 78px "Noto Sans KR", sans-serif', track: 10, glow: 0.90, border: '#ffffff' });
        sign.position.set(pEnd[0] + ox * 1.76, boreTop + Math.min(spandrelH * 0.52, 2.4), pEnd[1] + oz * 1.76); sign.rotation.y = faceRot; grp.add(sign);
        const chv = makeSignMesh('4.5m', { w: halfW * 1.9, h: 0.72, chevron: true, glow: 0.40 });
        chv.position.set(pEnd[0] + ox * 1.74, boreTop + 0.25, pEnd[1] + oz * 1.74); chv.rotation.y = faceRot; grp.add(chv);
      }
    }
  }

  // ── 3. 3D 원천호수 & 신대호수 (광교호수공원) Landmarks, 어반레비 Decks & Bridges (using W.lakeFeatures!)
  const LF = W.lakeFeatures;
  if (LF) {
    const wyW = LF.woncheonY || -23.7;
    const wyS = LF.sindaeY || -9.3;

    // 3A) 프라이부르크 전망대 (33m 3-Tier Modern Timber & Glass Observation Tower at (-1236.6, -376.5)!)
    {
      const fx = -1236.6, fz = -376.5, fy = groundY(fx, fz);
      // Concrete terrace base plinth
      OP.cyl(fx, fy + 1.0, fz, 7.2, 8.2, 2.2, 12, C_CONC, M_CONC);
      // Central cylindrical reinforced-concrete core shaft rising 30m
      OP.cyl(fx, fy + 15.5, fz, 3.2, 3.6, 29.0, 12, C_WHITE, M_CONC);
      // Iconic warm vertical cedar timber louver fins wrapping the tower (12 fins radially!)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 4.65;
        OP.box(fx + Math.cos(a) * r, fy + 15.8, fz + Math.sin(a) * r, 0.55, 28.5, 1.45, -a, C_CEDAR, M_WOOD);
      }
      // Mid-height viewing rings at 12m and 21m
      OP.cyl(fx, fy + 12.0, fz, 5.4, 5.4, 0.55, 12, C_METAL, M_METAL);
      OP.cyl(fx, fy + 21.0, fz, 5.4, 5.4, 0.55, 12, C_METAL, M_METAL);
      // Cantilevered panoramic glass top observation deck at 28m..33m!
      OP.cyl(fx, fy + 28.2, fz, 7.6, 6.2, 0.95, 16, C_WHITE, M_CONC);
      GL.cyl(fx, fy + 30.6, fz, 7.2, 7.2, 4.0, 16, C_GLASS, [0.06, 0.16, 0.85, 1.0]);
      OP.cyl(fx, fy + 33.0, fz, 8.2, 8.0, 0.85, 16, C_TILE, M_METAL);
      // Warm architectural crown LED ring & vertical uplight glow at night!
      OP.cyl(fx, fy + 32.45, fz, 7.5, 7.5, 0.25, 16, C_LED, M_LED);
      OP.cyl(fx, fy + 28.75, fz, 7.4, 7.4, 0.22, 16, C_LED, M_LED);

      // Adjacent 생태환경체험교육관 at (-1242.1, -349.8)
      const ex = -1242.1, ez = -349.8, ey = groundY(ex, ez);
      OP.box(ex, ey + 2.8, ez, 24.0, 5.6, 12.0, 0.35, C_CEDAR, M_WOOD);
      OP.box(ex, ey + 5.85, ez, 26.0, 0.65, 14.0, 0.35, C_WHITE, M_CONC);
      GL.box(ex + 2.2, ey + 2.6, ez + 5.6, 20.0, 4.2, 0.25, 0.35, C_GLASS, [0.08, 0.16, 0.65, 1.0]);
    }

    // 3B) 신비한물너미 (Iconic Circular Granite Water Amphitheater & Fountain Plaza at (-1133.0, -363.9)!)
    {
      const mx = -1133.0, mz = -363.9, my = Math.max(groundY(mx, mz), wyW + 0.6);
      // 3 stepped concentric circular granite amphitheater rings
      OP.cyl(mx, my + 0.45, mz, 22.0, 23.0, 0.9, 28, C_WHITE, M_CONC);
      OP.cyl(mx, my + 0.95, mz, 16.5, 17.2, 0.55, 28, C_CONC, M_CONC);
      OP.cyl(mx, my + 1.25, mz, 11.8, 12.2, 0.35, 28, C_WHITE, M_CONC);
      // Central glowing turquoise water basin + 9 animated shimmering fountain jets!
      GL.cyl(mx, my + 1.46, mz, 10.6, 10.6, 0.12, 24, C_WATER, M_FLOW);
      GL.cyl(mx, my + 4.8, mz, 0.45, 0.95, 6.6, 8, C_WATER, M_FLOW); // central tall jet
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        GL.cyl(mx + Math.cos(a) * 6.2, my + 3.4, mz + Math.sin(a) * 6.2, 0.28, 0.58, 3.8, 6, C_WATER, M_FLOW);
        OP.box(mx + Math.cos(a) * 16.8, my + 1.35, mz + Math.sin(a) * 16.8, 1.4, 0.18, 0.22, -a, C_LED, M_LED);
      }
    }

    // 3C) All 55 Real OSM Lakeside Bridges, 원천교, 정다운 다리, 무지개다리 & 어반레비 Timber Waterfront Boardwalks!
    const allSpans = [...(LF.bridges || []), ...(LF.decks || []).map(d => ({ ...d, kind: 'deck' }))];
    for (const br of allSpans) {
      const pts = br.p; if (!pts || pts.length < 2) continue;
      const isRoad = br.kind === 'road', isArch = br.kind === 'ped_arch';
      const w = br.w || 4.0, yDeck = br.y;
      const wyLocal = pts[0][0] < -1750 ? wyS : wyW;
      let accL = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1.5) continue;
        const ang = Math.atan2(-dz, dx), nx = -dz / L, nz = dx / L;
        const xm = (x0 + x1) * 0.5, zm = (z0 + z1) * 0.5;
        const deckCol = isRoad ? C_ASPH : C_CEDAR;
        const deckMat = isRoad ? M_DARK : M_WOOD;
        // Main bridge / timber boardwalk deck
        OP.box(xm, yDeck, zm, L + 0.4, isRoad ? 1.1 : 0.36, w, ang, deckCol, deckMat);
        // Side concrete girders / white edge beams & railings
        for (const sgn of [-1, 1]) {
          const rx = xm + nx * (w * 0.5) * sgn, rz = zm + nz * (w * 0.5) * sgn;
          OP.box(rx, yDeck + (isRoad ? 0.55 : 0.12), rz, L + 0.3, isRoad ? 0.95 : 0.40, isRoad ? 0.65 : 0.22, ang, isRoad ? C_CONC : C_WHITE, M_CONC);
          OP.box(rx, yDeck + 1.05, rz, L + 0.3, 0.10, 0.12, ang, C_METAL, M_METAL);
          if (isArch) {
            // Iconic architectural warm bridge accent LED ribbon & steel arch rib!
            OP.box(rx, yDeck + 0.05, rz, L, 0.14, 0.14, ang, C_LED, M_LED);
          }
        }
        // Bridge piers / boardwalk pilings descending cleanly into lake water!
        accL += L;
        const pierStep = isRoad ? 24.0 : 16.0;
        if (accL >= pierStep || i === 0) {
          accL = 0;
          const pH = Math.max(2.2, yDeck - (wyLocal - 1.5));
          if (isRoad) {
            OP.cyl(xm - nx * (w * 0.32), yDeck - pH * 0.5, zm - nz * (w * 0.32), 0.75, 0.9, pH, 8, C_CONC, M_CONC);
            OP.cyl(xm + nx * (w * 0.32), yDeck - pH * 0.5, zm + nz * (w * 0.32), 0.75, 0.9, pH, 8, C_CONC, M_CONC);
          } else {
            OP.cyl(xm, yDeck - pH * 0.5, zm, 0.28, 0.32, pH, 6, C_CONC, M_CONC);
          }
          // Graceful white steel arch pylons on iconic pedestrian lake bridges (정다운 다리, 무지개다리!)
          if (isArch && i > 0 && i < pts.length - 2 && i % 2 === 1) {
            for (const sgn of [-1, 1]) {
              OP.cyl(xm + nx * (w * 0.52) * sgn, yDeck + 3.2, zm + nz * (w * 0.52) * sgn, 0.16, 0.22, 6.4, 6, C_WHITE, M_METAL);
            }
            OP.box(xm, yDeck + 6.3, zm, 0.28, 0.28, w + 0.6, ang, C_WHITE, M_METAL);
            OP.box(xm, yDeck + 6.1, zm, 0.18, 0.14, w, ang, C_LED, M_LED);
          }
        }
      }
    }

    // 3D) Waterfront Promenade Lamp Posts tracing BOTH 원천호수 & 신대호수 shorelines (330 lamps!)
    for (const [lx, lz, ly] of (LF.lamps || [])) {
      OP.cyl(lx, ly + 2.2, lz, 0.08, 0.12, 4.4, 5, C_METAL, M_METAL);
      OP.cyl(lx, ly + 4.55, lz, 0.26, 0.26, 0.42, 6, C_LED, M_LED);
    }
  }

  // Surveyed stop locations and tagged street furniture.
  {
    // A platform node records a stop, but only an explicit shelter tag confirms a canopy.
    for (const stop of NEIGHBORHOOD.stops) {
      const [x,z] = stop.p, y = groundY(x,z);
      const street = nearestStreet(x,z);
      if (!street) continue;
      const ang = street.angle;
      OP.cyl(x,y+1.5,z,0.055,0.065,3,8,C_POLE,M_METAL);
      OP.box(x,y+2.55,z,0.55,0.85,0.12,ang,[0.035,0.32,0.48],M_METAL);
      if (stop.shelter === 'yes') {
        const dx = Math.cos(ang), dz = -Math.sin(ang);
        OP.box(x,y+2.7,z,4.8,0.16,1.75,ang,C_METAL,M_METAL);
        for (const d of [-2.1,2.1]) OP.cyl(x+dx*d,y+1.3,z+dz*d,0.07,0.07,2.6,8,C_POLE,M_METAL);
        if (stop.bench === 'yes') OP.box(x,y+0.46,z,2.5,0.15,0.52,ang,C_WOOD,M_WOOD);
      }
    }

  }

  // Signal positions and phases at the photographed junction are unverified.
  if (W.signals && W.signals.length) {
    for (let i = 0; i < W.signals.length; i++) {
      const [sx, sz] = W.signals[i];
      if (Math.hypot(sx - 152, sz - (-16)) < 46) continue;
      for (const [ox, oz, ang] of [[7.5, 7.5, -0.78], [-7.5, -7.5, 2.35]]) {
        const px = sx + ox, pz = sz + oz, pgy = groundY(px, pz);
        OP.cyl(px, pgy + 3.4, pz, 0.12, 0.18, 6.8, 6, C_POLE, M_METAL);
        const ax = px - Math.cos(ang) * 3.2, az = pz + Math.sin(ang) * 3.2;
        OP.box(ax, pgy + 6.3, az, 6.4, 0.18, 0.18, ang, C_POLE, M_METAL);
        OP.box(ax, pgy + 6.05, az, 1.5, 0.48, 0.28, ang, C_METAL, M_METAL);
        OP.box(ax + 0.35 * Math.cos(ang), pgy + 6.05, az - 0.35 * Math.sin(ang), 0.28, 0.28, 0.32, ang, (i % 2 ? [0.15, 0.95, 0.45] : [0.98, 0.22, 0.15]), M_LED);
      }
    }
  }

  // ── 5. 3D Park Pavilions (정자/퍼걸러) in 사색공원, 원천호수 & 신대호수!
  const parkPavilions = [
    [-132, -26], [-168, -68], [-210, 12], [-156, -125], [-265, -45],                 // 사색공원
    [-780, -90], [-810, -210], [-795, 45], [-1080, -560], [-1105, 345],              // 원천호수 수변 정자
    [-1980, -140], [-2150, 160], [-2320, -240],                                      // 신대호수 수변 정자
  ];
  for (const [px, pz] of parkPavilions) {
    const gy = groundY(px, pz);
    OP.box(px, gy + 0.35, pz, 5.8, 0.7, 5.8, 0.35, C_WOOD, M_WOOD);
    for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) {
      OP.cyl(px + dx, gy + 2.0, pz + dz, 0.13, 0.15, 2.8, 6, C_WOOD, M_WOOD);
    }
    OP.cyl(px, gy + 3.9, pz, 0.45, 4.5, 1.5, 6, C_TILE, M_CONC);
    OP.cyl(px, gy + 4.85, pz, 0.15, 2.2, 0.85, 6, C_TILE, M_CONC);
    OP.box(px, gy + 3.15, pz, 0.5, 0.2, 0.5, 0, C_LED, M_LED);
  }

  // Complex bollard lamps along Vista Avenue
  const [aa, ab] = W.ave;
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, bx = lerp(aa[0], ab[0], t), bz = lerp(aa[1], ab[1], t);
    for (const off of [-5.8, 5.8]) {
      OP.cyl(bx, 0.55, bz + off, 0.10, 0.11, 1.1, 6, C_METAL, M_METAL);
      OP.cyl(bx, 1.15, bz + off, 0.09, 0.09, 0.22, 6, C_LED, M_LED);
    }
  }

  const propMesh = new THREE.Mesh(OP.build(), makeArchMat(false));
  propMesh.frustumCulled = false;
  grp.add(propMesh);

  if (GL.nv > 0) {
    const propGl = new THREE.Mesh(GL.build(), makeArchMat(true));
    propGl.frustumCulled = false; propGl.renderOrder = 4;
    grp.add(propGl);
  }

  // ── 6. Instanced 3D Curved Street Light Poles lining major roads within 520m!
  const poles = WORLD.poleSpots || [];
  if (poles.length) {
    const post = new THREE.CylinderGeometry(0.08, 0.14, 9.0, 6); post.deleteAttribute('uv'); post.translate(0, 4.5, 0);
    const arm = new THREE.BoxGeometry(1.7, 0.12, 0.12); arm.deleteAttribute('uv'); arm.translate(0.80, 8.95, 0);
    const head = new THREE.BoxGeometry(0.68, 0.16, 0.30); head.deleteAttribute('uv'); head.translate(1.62, 8.85, 0);
    const pGeo = mergeGeometries([post, arm, head]);
    const pMat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w=instanceMatrix*vec4(position,1.0); vW=w.xyz; vN=mat3(instanceMatrix)*normal; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `precision highp float; ${GLSL_COMMON} varying vec3 vW; varying vec3 vN;
        void main(){ vec3 n=normalize(vN); gl_FragColor=vec4(lit(vec3(0.46,0.48,0.52), n, 1.0, 0.9), 1.0); }`,
    });
    const pm = new THREE.InstancedMesh(pGeo, pMat, poles.length); pm.frustumCulled = false;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < poles.length; i++) {
      const [x, gy, z, ang, lh] = poles[i];
      const s = lh / 9.0;
      ps.set(x, gy, z); q.setFromAxisAngle(up, ang); sc.set(s, s, s);
      M.compose(ps, q, sc); pm.setMatrixAt(i, M);
    }
    pm.instanceMatrix.needsUpdate = true;
    grp.add(pm);
  }

  return grp;
}
