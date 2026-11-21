// ───────────── frame pipeline: exterior → aerial perspective → interior → bloom → tone map
const POST = {};
function initPost(renderer, w, h) {
  const mkRT = (w, h, opt = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opt });
  POST.a = mkRT(w, h, { depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType), samples: POST.msaa ? 4 : 0 });
  POST.b = mkRT(w, h, { samples: POST.msaa ? 4 : 0, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) }); POST.c = mkRT(w, h, { depthBuffer: false });
  POST.bl = [mkRT(w >> 2, h >> 2, { depthBuffer: false }), mkRT(w >> 2, h >> 2, { depthBuffer: false }), mkRT(w >> 3, h >> 3, { depthBuffer: false }), mkRT(w >> 3, h >> 3, { depthBuffer: false })];
  POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
  POST.fog = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null }, uSkyLUT: U.uSkyLUT, uInv: { value: new THREE.Matrix4() }, uCamPos: U.uCamPos, uHaze: { value: 1 }, uNear: { value: 2.5 }, uFar: { value: 150000 }, uPrecip: { value: 0 }, uSunDir: U.uSunDir, uLCol: U.uLCol, uFoc: { value: new THREE.Vector2(1, 1) }, uAO: { value: 1 }, uHF: U.uHF },
    vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tC, tD, uSkyLUT; uniform mat4 uInv; uniform vec3 uCamPos, uSunDir, uLCol; uniform float uHaze, uPrecip, uAO, uHF; uniform vec2 uFoc;
      vec3 posAt(vec2 uv){ float z=texture2D(tD,uv).r; vec4 p=uInv*vec4(uv*2.0-1.0,z*2.0-1.0,1.0); return p.xyz/p.w; }
      float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
      vec3 lut(vec3 d){ float az=atan(d.z,d.x); float el=asin(clamp(d.y,-1.0,1.0)); float s=sign(el)*sqrt(abs(el)/1.5707963); return texture2D(uSkyLUT, vec2(az/6.2831853+0.5, s*0.5+0.5)).rgb; }
      void main(){
        vec3 c=texture2D(tC,vUv).rgb; float z=texture2D(tD,vUv).r;
        if(z<0.9999999){
          vec4 p=uInv*vec4(vUv*2.0-1.0,z*2.0-1.0,1.0); vec3 wp=p.xyz/p.w; vec3 rv=wp-uCamPos; float d=length(rv); vec3 rd=rv/d; float km=d*0.001;
          if(uAO>0.01 && d<1400.0){ // contact shade where walls, trees and ground meet (depth-only ambient occlusion)
            vec3 nn=normalize(cross(dFdx(wp),dFdy(wp))); if(dot(nn,rd)>0.0) nn=-nn;
            float R=clamp(d*0.03,0.35,10.0); vec2 ruv=R/d*uFoc; float a0=ign(gl_FragCoord.xy)*6.2831853, occ=0.0;
            for(int i=0;i<10;i++){ float fi=(float(i)+0.5)/10.0; float a=a0+float(i)*2.39996; vec2 o=vec2(cos(a),sin(a))*ruv*sqrt(fi);
              vec3 v=posAt(vUv+o)-wp; float l=length(v)+1e-4; occ+=max(dot(nn,v)/l-0.12,0.0)/(1.0+(l*l)/(R*R)*1.6)*step(l,R*3.0); }
            float ao=clamp(1.0-occ/10.0*2.1,0.0,1.0); c*=mix(1.0,mix(0.40,1.0,ao),uAO*smoothstep(1400.0,700.0,d)); }
          // exponential-height haze integrated along the ray (scale height 1.2 km)
          float h0=max(uCamPos.y,0.0)*0.001, h1=max(wp.y,0.0)*0.001; float Hs=1.2; float dh=h1-h0;
          float avg=abs(dh)<1e-4?exp(-h0/Hs):Hs*(exp(-h0/Hs)-exp(-h1/Hs))/dh;
          // At sunrise/sunset, slightly gentler near-field extinction keeps foreground crisp while distant mountains stay atmospheric
          float lowSun=1.0-smoothstep(0.0,0.22,uSunDir.y);
          float nearK=mix(1.0, smoothstep(0.15, 2.5, km)*0.55+0.45, lowSun);
          vec3 tau=vec3(5.8e-3,13.6e-3,33.1e-3)*km*1.05 + vec3(0.088)*uHaze*km*avg*nearK + vec3(uPrecip*km*0.85);
          vec3 T=exp(-tau);
          // Match exact sky-dome horizon elevation seamlessly (no orange glow mismatch against the sky behind the ridge!)
          vec3 dirHor=normalize(vec3(rd.x, max(rd.y, 0.004)+0.010*(1.0-smoothstep(12.0,36.0,km)), rd.z));
          // Decouple extreme forward-Mie sun glare from near/midground so sunrise/sunset doesn't wash out foreground in neon orange
          vec3 sideDir=normalize(vec3(-rd.z, max(rd.y, 0.015), rd.x));
          vec3 sideDir2=normalize(vec3(rd.z, max(rd.y, 0.015), -rd.x));
          vec3 ambHor=0.5*(lut(sideDir)+lut(sideDir2));
          vec3 insDir=lut(dirHor);
          float mieFade=smoothstep(1.2, 16.0, km);
          vec3 ins=mix(mix(ambHor, insDir, 0.35+0.65*mieFade), insDir, 1.0-lowSun*0.75);
          // Clamp extreme sun-disc forward peak in haze so nearby buildings stay crisp
          float cap=max(dot(ambHor,vec3(0.3,0.6,0.1))*3.6, 0.02);
          float il=dot(ins,vec3(0.3,0.6,0.1));
          if(il>cap) ins*=mix(cap/il, 1.0, smoothstep(8.0, 28.0, km));
          c=c*T+ins*(1.0-T);
          // Seamless circular horizon melt at far terrain edge -> ZERO hard map cutoff or glowing rim!
          float rEdge=max(length(wp.xz)/uHF, max(abs(wp.x),abs(wp.z))/uHF);
          float edgeMelt=smoothstep(0.54, 0.93, rEdge);
          if(edgeMelt>0.001){
            vec3 skyBehind=lut(rd);
            c=mix(c, skyBehind, edgeMelt);
          }
        }
        gl_FragColor=vec4(c,1.0); }`,
  });
  // interior contact shade: where furniture, walls, floor and ceiling meet (depth-only ambient occlusion on the room pass)
  POST.iao = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null }, uInv: { value: new THREE.Matrix4() }, uCamPos: U.uCamPos, uFoc: { value: new THREE.Vector2(1, 1) } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tC, tD; uniform mat4 uInv; uniform vec3 uCamPos; uniform vec2 uFoc;
      vec3 posAt(vec2 uv){ float z=texture2D(tD,uv).r; vec4 p=uInv*vec4(uv*2.0-1.0,z*2.0-1.0,1.0); return p.xyz/p.w; }
      float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
      void main(){ vec3 c=texture2D(tC,vUv).rgb; float z=texture2D(tD,vUv).r;
        if(z<0.99999){ vec4 p=uInv*vec4(vUv*2.0-1.0,z*2.0-1.0,1.0); vec3 wp=p.xyz/p.w; vec3 rv=wp-uCamPos; float d=length(rv);
          vec3 nn=normalize(cross(dFdx(wp),dFdy(wp))); if(dot(nn,rv)>0.0) nn=-nn;
          float a0=ign(gl_FragCoord.xy)*6.2831853, occ=0.0, wsum=0.0;
          for(int i=0;i<14;i++){ float fi=(float(i)+0.5)/14.0; float R=(i<7)?0.16:0.55; float a=a0+float(i)*2.39996; vec2 o=vec2(cos(a),sin(a))*R/d*uFoc*sqrt(fract(fi*2.0)+0.08);
            float zs=texture2D(tD,vUv+o).r; if(zs>0.99999) continue; vec3 v=posAt(vUv+o)-wp; float l=length(v)+1e-4;
            occ+=max(dot(nn,v)/l-0.10,0.0)/(1.0+(l*l)/(R*R)*2.0)*step(l,R*2.5); }
          float ao=clamp(1.0-occ/14.0*2.6,0.0,1.0); c*=mix(0.42,1.0,ao)*vec3(1.0)+ (1.0-ao)*c*vec3(0.03,0.015,0.0); }
        gl_FragColor=vec4(c,1.0); }`,
  });
  POST.bright = new THREE.ShaderMaterial({ uniforms: { tC: { value: null }, uExp: { value: 1 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tC; uniform float uExp; void main(){ vec3 c=min(texture2D(tC,vUv).rgb*uExp,vec3(60.0)); float l=dot(c,vec3(0.2126,0.7152,0.0722)); gl_FragColor=vec4(c*smoothstep(0.9,2.2,l),1.0); }` });
  POST.blur = new THREE.ShaderMaterial({ uniforms: { tC: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tC; uniform vec2 uDir; void main(){ vec3 c=texture2D(tC,vUv).rgb*0.227; c+=(texture2D(tC,vUv+uDir*1.385).rgb+texture2D(tC,vUv-uDir*1.385).rgb)*0.316; c+=(texture2D(tC,vUv+uDir*3.231).rgb+texture2D(tC,vUv-uDir*3.231).rgb)*0.070; gl_FragColor=vec4(c,1.0); }` });
  POST.out = new THREE.ShaderMaterial({
    toneMapped:false,
    uniforms: { toneMappingExposure:{value:1.0},  tC: { value: null }, tB1: { value: null }, tB2: { value: null }, uExp: { value: 1 }, uTime: U.uTime, uFade: { value: 1 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tC, tB1, tB2; uniform float uExp, uTime, uFade;
      #include <tonemapping_pars_fragment>
      float h(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      void main(){
        vec3 c=texture2D(tC,vUv).rgb*uExp; c+=texture2D(tB1,vUv).rgb*0.09+texture2D(tB2,vUv).rgb*0.06;
        vec2 q=vUv-0.5; c*=1.0-dot(q,q)*0.16;
        c=AgXToneMapping(max(c,0.0));
        // Pivot contrast around photographic middle gray in display-linear space.
        vec3 pivot=vec3(0.18);
        c=mix(pivot*pow(c/pivot,vec3(1.12)),
              1.-(1.-pivot)*pow((1.-c)/(1.-pivot),vec3(1.12)),step(pivot,c));
        c=mix(12.92*c,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));
        c+=(h(gl_FragCoord.xy+fract(uTime)*91.0)-0.5)/255.0*2.2;
        gl_FragColor=vec4(c*uFade,1.0); }`,
  });
  POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.fog); POST.scene = new THREE.Scene(); POST.scene.add(POST.quad);
}
function resizePost(w, h) {
  POST.a.setSize(w, h); POST.b.setSize(w, h); POST.c.setSize(w, h); POST.bl[0].setSize(w >> 2, h >> 2); POST.bl[1].setSize(w >> 2, h >> 2); POST.bl[2].setSize(w >> 3, h >> 3); POST.bl[3].setSize(w >> 3, h >> 3);
}
function fsq(renderer, mat, target) { POST.quad.material = mat; renderer.setRenderTarget(target); renderer.render(POST.scene, POST.cam); }
function renderFrame(renderer, extScene, homeScene, cam, inside, exposure) {
  const near0 = cam.near, far0 = cam.far;
  renderer.autoClear = true;
  cam.near = inside ? 2.2 : 1.0; cam.far = 160000; cam.updateProjectionMatrix();
  U.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
  renderer.setRenderTarget(POST.a); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(extScene, cam);
  POST.fog.uniforms.tC.value = POST.a.texture; POST.fog.uniforms.tD.value = POST.a.depthTexture;
  POST.fog.uniforms.uInv.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
  POST.fog.uniforms.uFoc.value.set(cam.projectionMatrix.elements[0] * 0.5, cam.projectionMatrix.elements[5] * 0.5);
  fsq(renderer, POST.fog, POST.b);
  if (inside) {
    cam.near = 0.04; cam.far = 120; cam.updateProjectionMatrix();
    renderer.autoClear = false; renderer.setRenderTarget(POST.b); renderer.clearDepth(); renderer.render(homeScene, cam); renderer.autoClear = true;
    POST.iao.uniforms.tC.value = POST.b.texture; POST.iao.uniforms.tD.value = POST.b.depthTexture;
    POST.iao.uniforms.uInv.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    POST.iao.uniforms.uFoc.value.set(cam.projectionMatrix.elements[0] * 0.5, cam.projectionMatrix.elements[5] * 0.5);
    fsq(renderer, POST.iao, POST.c);
  }
  const fin = inside ? POST.c : POST.b;
  const b = POST.bl, tx = 1 / b[0].width, ty = 1 / b[0].height;
  POST.bright.uniforms.tC.value = fin.texture; POST.bright.uniforms.uExp.value = exposure; fsq(renderer, POST.bright, b[0]);
  const blurPass = (src, tmp, dst, sx, sy, k) => { POST.blur.uniforms.tC.value = src.texture; POST.blur.uniforms.uDir.value.set(sx * k, 0); fsq(renderer, POST.blur, tmp); POST.blur.uniforms.tC.value = tmp.texture; POST.blur.uniforms.uDir.value.set(0, sy * k); fsq(renderer, POST.blur, dst); };
  blurPass(b[0], b[1], b[0], tx, ty, 1.0);
  blurPass(b[0], b[3], b[2], 2 * tx, 2 * ty, 1.0); blurPass(b[2], b[3], b[2], 2 * tx, 2 * ty, 2.0);
  POST.out.uniforms.tC.value = fin.texture; POST.out.uniforms.tB1.value = b[0].texture; POST.out.uniforms.tB2.value = b[2].texture; POST.out.uniforms.uExp.value = exposure;
  fsq(renderer, POST.out, null);
  cam.near = near0; cam.far = far0;
}
