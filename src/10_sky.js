// ───────────── sky: physically based atmosphere LUT, dome (sun, moon, stars, clouds)
const SUNI = 20.0;
const ATM = /* glsl */`
const float RG=6360.0, RT=6440.0;
const vec3 BR=vec3(5.802e-3,13.558e-3,33.1e-3);      // rayleigh /km
const vec3 BO=vec3(0.650e-3,1.881e-3,0.085e-3);      // ozone absorption /km
const float BM0=3.996e-3;
uniform float uTurb;                                  // mie multiplier (haze / fine dust)
vec2 rsi(vec3 ro, vec3 rd, float r){ float b=dot(ro,rd), c=dot(ro,ro)-r*r, h=b*b-c; if(h<0.0) return vec2(1e9,-1e9); h=sqrt(h); return vec2(-b-h,-b+h); }
vec3 dens(float h){ // rayleigh, mie, ozone
  return vec3(exp(-h/8.0), exp(-h/(1.2+0.25*min(uTurb,6.0))), max(0.0,1.0-abs(h-25.0)/15.0));
}
vec3 odepth(vec3 ro, vec3 rd, float len){
  vec3 od=vec3(0.0); float dt=len/6.0;
  for(int i=0;i<6;i++){ vec3 p=ro+rd*(float(i)+0.5)*dt; od+=dens(length(p)-RG)*dt; }
  return od;
}
vec3 ext(vec3 od){ return exp(-(BR*od.x + vec3(BM0*uTurb*1.1)*od.y + BO*od.z)); }
vec3 scatter(vec3 ro, vec3 rd, vec3 L, float I, out vec3 trans){
  // Clamp grazing downward rays cleanly to horizon path so the LUT never drops into a black band
  vec3 rdu=rd;
  float below=max(-rd.y, 0.0);
  if(rdu.y < 0.006) rdu = normalize(vec3(rd.x, 0.006, rd.z));
  vec2 ta=rsi(ro,rdu,RT);
  float t0=max(ta.x,0.0), t1=ta.y;
  trans=vec3(1.0); if(t1<=t0) return vec3(0.0);
  float mu=dot(rdu,L), pr=3.0/(16.0*3.14159)*(1.0+mu*mu);
  float g=0.73, pm=3.0/(8.0*3.14159)*((1.0-g*g)*(1.0+mu*mu))/((2.0+g*g)*pow(1.0+g*g-2.0*g*mu,1.5));
  vec3 sum=vec3(0.0), od=vec3(0.0), ms=vec3(0.0);
  const int N=28; float prev=t0;
  float sunUp=smoothstep(-0.14, 0.14, L.y);
  // Warm golden-to-indigo upper-atmosphere ambient twilight floor (prevents anti-solar dark band at sunset/sunrise!)
  vec3 twCol=mix(vec3(0.18,0.12,0.22), mix(vec3(0.95,0.44,0.16), vec3(0.60,0.74,0.96), smoothstep(0.0,0.35,L.y)), smoothstep(-0.08,0.08,L.y));
  for(int i=0;i<N;i++){
    float f=(float(i)+1.0)/float(N); float t=t0+(t1-t0)*f*f; float dt=t-prev; float tm=prev+dt*0.5; prev=t;
    vec3 p=ro+rdu*tm; float h=max(length(p)-RG, 0.0); vec3 d=dens(h)*dt; od+=d;
    float pl=dot(p,L);
    float b2=max(dot(p,p)-pl*pl, 0.0);
    float hMin=(pl<0.0) ? (sqrt(b2)-RG) : h;
    float vis=smoothstep(-4.5, 2.5, hMin);
    vec2 tl=rsi(p,L,RT);
    vec3 odl=odepth(p,L,max(tl.y, 0.0));
    vec3 T=ext(od+odl);
    vec3 sR=BR*d.x*pr, sM=vec3(BM0*uTurb)*d.y*pm;
    sum+=T*(sR+sM)*vis;
    // Physically smooth multi-scattering from sunlit upper sky dome (uses gentle path extinction so horizon NEVER dips dark!)
    vec3 Tview=ext(od*0.24);
    vec3 Tsun=ext(odl*0.32);
    float scatterAmt=(0.052+0.018*min(uTurb,5.0));
    ms+=Tview*(Tsun*mix(0.32,1.0,vis) + twCol*0.18)*(BR*d.x+vec3(BM0*uTurb)*d.y)*scatterAmt*sunUp;
  }
  trans=ext(od);
  vec3 res=(sum+ms)*I;
  // Subtle horizon continuity lift near el=0..0.06 at golden hour so anti-solar horizon is smooth peach/violet, never brown/black
  float horBand=exp(-max(rdu.y,0.0)*18.0);
  float golden=smoothstep(-0.08,0.02,L.y)*(1.0-smoothstep(0.06,0.28,L.y));
  res += twCol * vec3(1.05, 0.68, 0.44) * horBand * golden * (0.045 + 0.025*clamp(mu*0.5+0.5,0.0,1.0)) * I;
  // Below true horizon: smoothly match horizon color with gentle warm atmospheric depth (zero seam!)
  if(below > 0.0){
    res = mix(res, res * vec3(0.92, 0.85, 0.78) * 0.72, smoothstep(0.0, 0.28, below));
  }
  return res;
}`;

const LUT_W = 256, LUT_H = 128;
const SKY = {};
function initSky(renderer) {
  SKY.rt = new THREE.WebGLRenderTarget(LUT_W, LUT_H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  SKY.rt.texture.wrapS = THREE.RepeatWrapping;
  U.uSkyLUT.value = SKY.rt.texture;
  SKY.lutMat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uMoonI: { value: 0 }, uTurb: { value: 1 }, uGlow: { value: 1 }, uOvercast: { value: 0 }, uOverCol: { value: new THREE.Color() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float; varying vec2 vUv;
      uniform vec3 uSunDir, uMoonDir, uOverCol; uniform float uMoonI, uGlow, uOvercast;
      ${ATM}
      void main(){
        float az=(vUv.x*2.0-1.0)*3.14159265;
        float s=vUv.y*2.0-1.0; float el=sign(s)*s*s*1.5707963;
        vec3 rd=vec3(cos(el)*cos(az), sin(el), cos(el)*sin(az));
        vec3 ro=vec3(0.0,RG+0.11,0.0); vec3 tr;
        vec3 c=scatter(ro,rd,uSunDir,${SUNI.toFixed(1)},tr);
        if(uMoonI>0.0){ vec3 t2; c+=scatter(ro,rd,uMoonDir,uMoonI,t2)*vec3(0.85,0.92,1.0); }
        // night: airglow + city light pollution dome (Suwon) — gentle indigo-amber so night silhouettes remain subtly readable
        float e=max(el,0.0);
        c+=uGlow*(vec3(1.0,0.62,0.36)*2.8e-4*exp(-e*4.8)*(0.6+0.25*uTurb) + vec3(0.32,0.40,0.68)*8.5e-5);
        // overcast: replace with luminous grey layer, brighter toward zenith
        vec3 oc=uOverCol*(0.55+0.45*sin(e)) ;
        c=mix(c,oc,uOvercast);
        gl_FragColor=vec4(c,1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  SKY.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), SKY.lutMat);
  SKY.scene = new THREE.Scene(); SKY.scene.add(SKY.quad); SKY.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  SKY.buf = new Uint16Array(LUT_W * LUT_H * 4);

  // dome
  SKY.domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uSkyLUT: U.uSkyLUT, uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uNoise: U.uNoise, uTime: U.uTime, uLCol: U.uLCol, uLDir: U.uLDir,
      uSunTr: { value: new THREE.Color() }, uMoonCol: { value: new THREE.Color() }, uStarVis: { value: 0 }, uPole: { value: new THREE.Vector3(0, 1, 0) }, uLst: { value: 0 },
      uCover: { value: 0.2 }, uCirrus: { value: 0.3 }, uCloudAmb: { value: new THREE.Color() }, uCloudGlow: { value: new THREE.Color() }, uOvercast: { value: 0 }, uHorizon: { value: new THREE.Color() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*viewMatrix*vec4(position*50000.0+cameraPosition,1.0); gl_Position=p.xyww; }`,
    fragmentShader: /* glsl */`
      precision highp float; varying vec3 vDir;
      uniform sampler2D uSkyLUT, uNoise; uniform vec3 uSunDir, uMoonDir, uSunTr, uMoonCol, uPole, uLCol, uLDir, uCloudAmb, uCloudGlow, uHorizon;
      uniform float uTime, uStarVis, uLst, uCover, uCirrus, uOvercast;
      vec3 lut(vec3 d){ float az=atan(d.z,d.x); float el=asin(clamp(d.y,-1.0,1.0)); float s=sign(el)*sqrt(abs(el)/1.5707963); return texture2D(uSkyLUT, vec2(az/6.2831853+0.5, s*0.5+0.5)).rgb; }
      float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      float fbm(vec2 p){ // noise tex already holds 6 octaves; combine two scales for range
        return texture2D(uNoise,p).r*0.62 + texture2D(uNoise,p*3.7+0.31).g*0.27 + texture2D(uNoise,p*11.3+0.7).b*0.11;
      }
      float cdens(vec2 p, float cover){
        float n=fbm(p); float big=texture2D(uNoise,p*0.23+0.5).a;
        n=n*0.78+big*0.42-0.1;
        float th=mix(0.80,0.30,cover);
        return smoothstep(th,th+0.22,n);
      }
      vec4 cloudLayer(vec3 rd, float h, float scale, float cover, vec2 wind, float thick){
        float R=6360.0; float t=-R*rd.y+sqrt(R*R*rd.y*rd.y+2.0*R*h+h*h);
        vec3 p=rd*t; vec2 uv=p.xz/scale+wind*uTime;
        float d=0.0; // pseudo volume: a few parallax slices
        for(int i=0;i<4;i++){ float f=float(i)/3.0; d+=cdens(uv+rd.xz/max(rd.y,0.08)*f*thick/scale, cover)*0.25; }
        if(d<0.003) return vec4(0.0);
        vec2 ls=normalize(uLDir.xz+1e-4)*0.012*(1.0-uLDir.y*0.5);
        float dl=cdens(uv+ls,cover)*0.6+cdens(uv+ls*2.3,cover)*0.4;
        float mu=dot(rd,uLDir);
        float fw=pow(max(mu,0.0),6.0)*0.9+pow(max(mu,0.0),60.0)*2.5;
        float shade=exp(-dl*2.2*d*1.6);
        float edge=1.0-d;                                  // thin edges glow
        vec3 sun=uLCol*(0.42*shade+0.12+fw*edge*0.5);
        vec3 col=sun/3.14159*1.15 + uCloudAmb*(0.55+0.45*edge) + uCloudGlow*(0.4+0.6*d);
        col*=mix(1.0,0.42,uOvercast*d);                    // rain clouds are darker underneath
        float a=smoothstep(0.0,0.75,d);
        float far=exp(-t/55.0);                            // aerial fade into horizon sky
        return vec4(col,a*mix(1.0,far,0.92));
      }
      void main(){
        vec3 rd=normalize(vDir);
        vec3 col=lut(rd);
        // stars (rotating with sidereal time around the celestial pole)
        if(uStarVis>0.001 && rd.y>-0.02){
          float c=cos(uLst), s=sin(uLst); vec3 k=uPole;
          vec3 q=rd*c+cross(k,rd)*s+k*dot(k,rd)*(1.0-c);
          vec3 a=abs(q); vec2 uv; float face;
          if(a.x>a.y&&a.x>a.z){ uv=q.yz/a.x; face=q.x>0.0?0.0:1.0; } else if(a.y>a.z){ uv=q.xz/a.y; face=q.y>0.0?2.0:3.0; } else { uv=q.xy/a.z; face=q.z>0.0?4.0:5.0; }
          vec2 g=uv*90.0; vec2 id=floor(g)+face*131.0; vec2 f=fract(g)-0.5;
          float r=h21(id); vec2 o=(vec2(h21(id+7.1),h21(id+13.7))-0.5)*0.7;
          float mag=pow(r,60.0);
          float tw=0.75+0.25*sin(uTime*(2.0+r*5.0)+r*40.0);
          float d=length(f-o); float star=mag*smoothstep(0.09,0.0,d)*tw;
          vec3 tint=mix(vec3(1.0,0.86,0.72),vec3(0.75,0.85,1.0),h21(id+3.3));
          col+=tint*star*uStarVis*1.6e-2*smoothstep(-0.02,0.12,rd.y);
        }
        // sun disc with limb darkening
        float mu=dot(rd,uSunDir); float ang=acos(clamp(mu,-1.0,1.0));
        float disc=smoothstep(0.0052,0.0042,ang);
        float limb=1.0-0.5*pow(clamp(ang/0.0047,0.0,1.0),2.5);
        col+=uSunTr*disc*limb*30000.0*step(-0.004,rd.y); col=min(col,vec3(60000.0));
        // moon with real phase (lit by the sun's direction)
        float mm=dot(rd,uMoonDir); float ma=acos(clamp(mm,-1.0,1.0)); const float MR=0.0058;
        if(ma<MR*1.05){
          vec3 mx=normalize(cross(vec3(0.0,1.0,0.0),uMoonDir)), my=cross(uMoonDir,mx);
          vec2 pp=vec2(dot(rd,mx),dot(rd,my))/MR; float r2=dot(pp,pp);
          if(r2<1.0){
            vec3 n=normalize(mx*pp.x+my*pp.y-uMoonDir*sqrt(1.0-r2));
            float l=max(dot(n,uSunDir),0.0);
            float maria=texture2D(uNoise,pp*0.11+0.37).r*0.6+texture2D(uNoise,pp*0.31+0.11).g*0.4;
            float alb=mix(0.55,1.0,smoothstep(0.42,0.58,maria));
            vec3 mc=uMoonCol*(l*alb+0.004);
            col=mix(col,col+mc,smoothstep(1.0,0.92,r2));
          }
        }
        // clouds
        if(rd.y>0.004){
          vec4 ci=cloudLayer(rd,9.0,46.0,uCirrus,vec2(0.0006,0.0002),0.2);
          ci.a*=0.55; col=mix(col,ci.rgb,ci.a);
          vec4 cu=cloudLayer(rd,1.7,10.0,uCover,vec2(0.0021,0.0009),0.9);
          col=mix(col,cu.rgb,cu.a*smoothstep(0.004,0.05,rd.y));
        }
        gl_FragColor=vec4(col,1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  SKY.dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), SKY.domeMat);
  SKY.dome.frustumCulled = false; SKY.dome.renderOrder = -1000;
  return SKY.dome;
}

// CPU atmosphere transmittance toward a light (same model as GLSL)
function atmTrans(dir, turb) {
  const RG = 6360, RT = 6440, h0 = 0.11;
  const oy = RG + h0, b = oy * dir.y, c = oy * oy - RT * RT, hh = b * b - c; if (hh < 0) return [1, 1, 1];
  const t1 = -b + Math.sqrt(hh);
  const cg = oy * oy - RG * RG, hg = b * b - cg;
  let ground = false; if (hg > 0 && -b - Math.sqrt(hg) > 0) ground = true;
  let oR = 0, oM = 0, oO = 0; const N = 40;
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const f = (i + 1) / N, t = t1 * f * f, dt = t - prev, tm = prev + dt / 2; prev = t;
    const x = dir.x * tm, y = oy + dir.y * tm, z = dir.z * tm; const h = Math.sqrt(x * x + y * y + z * z) - RG;
    oR += Math.exp(-h / 8) * dt; oM += Math.exp(-h / (1.2 + 0.25 * Math.min(turb, 6))) * dt; oO += Math.max(0, 1 - Math.abs(h - 25) / 15) * dt;
  }
  const BR = [5.802e-3, 13.558e-3, 33.1e-3], BO = [0.650e-3, 1.881e-3, 0.085e-3], BM = 3.996e-3 * turb * 1.1;
  const g = ground ? sstep(-0.06, 0.0, dir.y) : 1;
  return [0, 1, 2].map(i => Math.exp(-(BR[i] * oR + BM * oM + BO[i] * oO)) * g);
}

function lutSample(dir, out) {
  // nearest sample of CPU copy of the sky LUT (linear HDR)
  const az = Math.atan2(dir.z, dir.x), el = Math.asin(clamp(dir.y, -1, 1));
  const s = Math.sign(el) * Math.sqrt(Math.abs(el) / (Math.PI / 2));
  const x = clamp(Math.floor((az / (2 * Math.PI) + 0.5) * LUT_W), 0, LUT_W - 1), y = clamp(Math.floor((s * 0.5 + 0.5) * LUT_H), 0, LUT_H - 1);
  const i = (y * LUT_W + x) * 4, f = THREE.DataUtils.fromHalfFloat;
  out[0] = f(SKY.buf[i]); out[1] = f(SKY.buf[i + 1]); out[2] = f(SKY.buf[i + 2]); return out;
}
// average sky radiance over a cone-ish set of directions (cosine weighted about n, only y>0 part)
function skyIrradiance(nx, ny, nz) {
  const acc = [0, 0, 0], tmp = [0, 0, 0], d = new THREE.Vector3(); let wsum = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 5; j++) {
    const az = (i + 0.5) / 12 * Math.PI * 2, el = (j + 0.5) / 5 * Math.PI / 2;
    d.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const w = Math.max(0, d.x * nx + d.y * ny + d.z * nz) * Math.cos(el);
    if (w <= 0) continue; lutSample(d, tmp); acc[0] += tmp[0] * w; acc[1] += tmp[1] * w; acc[2] += tmp[2] * w; wsum += Math.cos(el);
  }
  // E = ∫ L cos dω ≈ (2π / Σcos el) Σ L w
  const k = (Math.PI * 2 / 12) * (Math.PI / 2 / 5);
  return [acc[0] * k, acc[1] * k, acc[2] * k];
}
