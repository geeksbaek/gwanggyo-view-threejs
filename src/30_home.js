// ───────────── the home: 84B (mirrored for line 2), built from the official unit plan
const HOME = { occ: [], solid: [], walls: [], doors: [] };
const MAT = { WALL: 1, CEIL: 2, WOOD: 3, TILE: 4, DOOR: 5, FRAME: 6, CAB: 7, STONE: 8, SOFA: 9, WALNUT: 10, BLACK: 11, BED: 12, RUG: 13, LAMP: 14, STEEL: 15, FROST: 16, CHAIR: 17, METAL: 18, KID: 19, CONC: 20, OAK: 21, CURTAIN: 22, PEND: 23, PLANT: 24, ART: 25, POT: 26, ARTWALL: 27, WOODCAB: 28, SPLASH: 29, BTILE: 30, BTILE2: 31, MIRROR: 32, BOWL: 33 };
// rooms used for lighting: [xmin,xmax,zmin,zmax], window [x0,x1,y0,y1] on the facade
const ROOMS = [
  { name: 'living', box: [-2.25, 2.76, 0.38, 9.45], win: [-1.83, 1.80, 0.18, 2.24], lamp: [0.0, 2.70, 0.50, 0.55], area: 22 + 19 },
  { name: 'bed2', box: [2.46, 5.15, 0.38, 3.85], win: [2.88, 4.70, 0.85, 2.20], lamp: [3.80, 2.1, 0.3, 0.3], area: 9.3 },
  { name: 'bed3', box: [5.30, 8.29, 0.38, 3.85], win: [5.87, 7.71, 0.85, 2.20], lamp: [6.80, 2.1, 0.3, 0.3], area: 10.4 },
  { name: 'bed1', box: [8.50, 12.13, 1.59, 4.98], win: [8.77, 10.28, 0.06, 2.20], lamp: [10.3, 3.3, 0.35, 0.35], area: 12.3 },
];
const HALL_LAMP = [5.4, 4.53, 2.2, 0.06], KITCHEN_LAMP = [0.5, 8.72, 1.25, 0.022];
// recessed downlights as in the model house: dining 2 x 2, corridor, entrance, living soffit by the corridor, powder passage
const DOWNLIGHTS = [[-0.95, 6.2], [0.95, 6.2], [-0.95, 8.0], [0.95, 8.0], [3.7, 4.53], [5.4, 4.53], [7.1, 4.53], [6.3, 6.9], [-1.1, 4.75], [1.1, 4.75], [10.92, 5.88], [4.2, 6.1], [9.4, 6.0], [4.2, 8.4], [6.3, 7.9]];

const HOME_VS = /* glsl */`attribute float aM; varying vec3 vW; varying vec3 vN; varying float vM;
void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=mat3(modelMatrix)*normal; vM=aM; gl_Position=projectionMatrix*viewMatrix*w; }`;
const NOCC = 64;
const HOME_FS = /* glsl */`
precision highp float;
${GLSL_COMMON}
varying vec3 vW; varying vec3 vN; varying float vM;
uniform vec4 uWin[4]; uniform vec4 uRoom[4]; uniform vec3 uRoomAmb[5]; uniform vec4 uLamp[6]; uniform float uLampOn[6];
uniform vec3 uWinSky, uWinGnd, uLampL, uWB; uniform float uFY, uCeil, uBoost, uBoostSun, uGlassT;
uniform vec3 uDL[15]; uniform vec3 uSunIn; uniform sampler2D uFloorLight, uWood, uMarble;
uniform vec3 uOccA[${NOCC}]; uniform vec3 uOccB[${NOCC}]; uniform int uNOcc;
vec3 lutDir(vec3 d){ float az=atan(d.z,d.x); float el=asin(clamp(d.y,-1.0,1.0)); float s=sign(el)*sqrt(abs(el)/1.5707963); return texture2D(uSkyLUT, vec2(az/6.2831853+0.5, s*0.5+0.5)).rgb; }
float edgeI(vec3 a, vec3 b, vec3 n){ float c=clamp(dot(a,b),-0.99999,0.99999); vec3 cr=cross(a,b); float l=length(cr); return l<1e-6?0.0:acos(c)*dot(cr,n)/l; }
float quadE(vec3 P, vec3 n, vec3 p0, vec3 p1, vec3 p2, vec3 p3){ // irradiance factor of a unit-radiance quad (π·form factor)
  vec3 c=(p0+p1+p2+p3)*0.25-P; if(dot(c,n)<=0.0) return 0.0;
  vec3 a=normalize(p0-P), b=normalize(p1-P), cc=normalize(p2-P), d=normalize(p3-P);
  return abs(edgeI(a,b,n)+edgeI(b,cc,n)+edgeI(cc,d,n)+edgeI(d,a,n))*0.5;
}
float boxHit(vec3 ro, vec3 rd, vec3 a, vec3 b, float tmax){
  vec3 inv=1.0/(rd+vec3(1e-7)); vec3 t0=(a-ro)*inv, t1=(b-ro)*inv; vec3 mn=min(t0,t1), mx=max(t0,t1);
  float tn=max(max(mn.x,mn.y),mn.z), tf=min(min(mx.x,mx.y),mx.z);
  return (tf>max(tn,0.0)+0.004 && tn<tmax && tf>0.004)?1.0:0.0;
}
float inRect(vec2 p, vec4 r, float soft){ return smoothstep(r.x-soft,r.x+soft,p.x)*smoothstep(r.y+soft,r.y-soft,p.x)*smoothstep(r.z-soft,r.z+soft,p.y)*smoothstep(r.w+soft,r.w-soft,p.y); }
// sunlight arriving at P through any facade opening (analytic, soft-edged by the sun's angular size)
float sunVis(vec3 P){
  vec3 L=uLDir; if(L.z>-0.02) return 0.0;
  float tin=(0.38-P.z)/L.z, tout=(0.0-P.z)/L.z; if(tout<=0.0) return 0.0;
  vec3 hi=P+L*max(tin,0.0), ho=P+L*tout, hm=P+L*((0.16-P.z)/L.z);
  float v=0.0;
  for(int i=0;i<4;i++){
    vec4 w=uWin[i]; w.z+=uFY; w.w+=uFY;
    float s=tout*0.0048+0.003;
    float a=inRect(ho.xy,w,s);
    if(P.z>0.38) a*=inRect(hi.xy,w,s);
    if(a>0.001){ // sash bars
      float n=(i==0)?4.0:2.0; float pw=(w.y-w.x)/n; float g=(hm.x-w.x)/pw; float k=floor(g+0.5);
      if(k>0.5 && k<n-0.5) a*=smoothstep(0.028-s,0.028+s,abs(g-k)*pw);
      v=max(v,a);
    }
  }
  if(v<0.001) return 0.0;
  float occ=0.0; for(int i=0;i<${NOCC};i++){ if(i>=uNOcc) break; occ=max(occ,boxHit(P,L,uOccA[i],uOccB[i],tout)); }
  if(occ>0.5) return 0.0;
  return v*shadowAt(ho+vec3(0.0,0.0,-0.6),0.0015);
}
vec3 baseColor(int m, vec3 P, vec3 n, out float gloss, out float f0){
  gloss=0.0; f0=0.04; vec3 a=vec3(0.8);
  float fine=texture2D(uNoise,P.xz*3.1+P.y*2.3).r;
  if(m==1){ vec2 wq=vec2(abs(n.x)>0.5?P.z:P.x,P.y); float wv=texture2D(uNoise,wq*vec2(31.0,5.0)).r*texture2D(uNoise,wq*vec2(4.0,37.0)).g; bool bedR=(P.x>2.4&&P.x<8.4&&P.z<3.9)||(P.x>8.4&&P.z<5.05);                       // DID BC6398-1 (bedrooms): slightly deeper, linen weave
    bool stoR=(P.x>10.2&&P.z>6.6)||(P.x>5.55&&P.x<7.1&&P.z>8.55);                      // DID BC6500-4 (dressing room, entrance storage): greige
    bool pntR=(P.x>2.9&&P.x<5.5&&P.z>7.0)||(P.x>8.4&&P.z<1.6)||(P.x<-2.3);             // painted: utility room, balcony, refuge room
    vec3 wc=stoR?vec3(0.53,0.51,0.47):bedR?vec3(0.775,0.768,0.742):pntR?vec3(0.80,0.775,0.75):vec3(0.825,0.818,0.79);  // Shinhan 10462-2 elsewhere
    float wvk=pntR?0.02:(bedR||stoR)?0.22:0.14; a=wc*(0.955+0.05*fine+wvk*wv); if(P.y-uFY<0.075){ a=vec3(0.81,0.78,0.74); gloss=0.3; } }
  else if(m==2){ a=vec3(0.90,0.90,0.88); }
  else if(m==3||m==21){ // engineered oak planks, 125 mm wide, laid along Z (toward the window)
    float pw=0.115, pL=0.8; float row=floor(P.x/pw); float off=hash11(row*7.3)*pL; float pl=floor((P.z+off)/pL);
    float id=hash21(vec2(row,pl)); vec2 f=vec2(fract(P.x/pw),fract((P.z+off)/pL));
    float grain2=texture2D(uNoise,vec2(P.x*9.0,P.z*0.6+id)).g;
    vec2 wb=vec2(P.x/pw/8.0,P.z/pL*0.333);                                   // continuous coordinates give seam-free filtering
    vec3 wt=textureGrad(uWood,vec2((floor(id*7.99)+clamp(f.x,0.015,0.985))/8.0,f.y*0.333+id*0.37),dFdx(wb),dFdy(wb)).rgb; wt=mix(vec3(dot(wt,vec3(0.3,0.5,0.2))),wt,0.92)*vec3(1.06,1.01,0.92);
    a=wt*(0.94+0.12*hash11(id*31.7));
    float gap=smoothstep(0.0,0.012,f.x)*smoothstep(1.0,0.988,f.x)*smoothstep(0.0,0.0012,f.y)*smoothstep(1.0,0.9988,f.y); a*=mix(0.80,1.0,gap);
    gloss=0.36+0.26*dot(wt,vec3(0.5))-0.08*grain2; f0=0.05; if(m==21){ gloss=0.2; }
  }
  else if(m==4){ bool bal=P.z<1.6; float ts=bal?0.3:0.6; vec2 g=fract(P.xz/ts); float jw=0.0036/ts; float j=smoothstep(0.0,jw,g.x)*smoothstep(0.0,jw,g.y); float sp=texture2D(uNoise,P.xz*23.0).g, cl=texture2D(uNoise,P.xz*1.7).b; a=mix(vec3(0.48,0.47,0.45),(bal?vec3(0.60,0.59,0.57):vec3(0.66,0.65,0.62))*(0.92+0.06*fine+0.08*cl)-vec3(0.07)*smoothstep(0.64,0.72,sp),j); gloss=bal?0.25:0.4; f0=0.05; }
  else if(m==5){ a=vec3(0.81,0.78,0.74); gloss=0.25; }
  else if(m==6){ a=vec3(0.81,0.78,0.74); gloss=0.3; }
  else if(m==7){ a=vec3(0.80,0.765,0.735); float gx=abs(fract((abs(n.x)>0.5?P.z:P.x)/0.6)-0.5); a*=mix(0.55,1.0,smoothstep(0.492,0.497,0.5-gx+0.49)); gloss=0.2; }
  else if(m==8){ float v1=texture2D(uNoise,P.xz*0.9).g, v2=texture2D(uNoise,P.xz*4.0).b; float v3=texture2D(uNoise,P.xz*31.0).r; a=vec3(0.79,0.79,0.755)*(0.97+0.04*v1)-vec3(0.05)*smoothstep(0.70,0.76,v3)-vec3(0.0)*v2; gloss=0.55; f0=0.05; }
  else if(m==9){ float w=texture2D(uNoise,P.xz*14.0+P.y*9.0).r; a=vec3(0.50,0.49,0.46)*(0.85+0.3*w); }
  else if(m==10){ float g=texture2D(uNoise,vec2(P.x*0.6+P.y*3.0,P.z*6.0)).r; a=mix(vec3(0.19,0.115,0.065),vec3(0.30,0.19,0.11),g); gloss=0.35; }
  else if(m==11){ a=vec3(0.012); gloss=0.95; f0=0.06; }
  else if(m==12){ float w=texture2D(uNoise,P.xz*1.3).r; a=vec3(0.88,0.87,0.85)*(0.92+0.1*w); }
  else if(m==13){ float w=texture2D(uNoise,P.xz*6.0).r, w2=texture2D(uNoise,P.xz*0.35).g; a=mix(vec3(0.62,0.58,0.52),vec3(0.74,0.71,0.66),w2)*(0.85+0.3*w); }
  else if(m==15){ a=vec3(0.30,0.31,0.32); gloss=0.7; f0=0.4; }
  else if(m==17){ a=vec3(0.66,0.56,0.44)*(0.9+0.2*fine); }
  else if(m==18){ a=vec3(0.04); gloss=0.5; }
  else if(m==19){ a=vec3(0.80,0.74,0.60); }
  else if(m==20){ a=vec3(0.55,0.55,0.53)*(0.9+0.2*fine); }
  else if(m==22){ float w=texture2D(uNoise,vec2(P.x*9.0,P.y*30.0)).r; a=vec3(0.86,0.84,0.79)*(0.9+0.15*w); }
  else if(m==24){ float w=texture2D(uNoise,P.xy*5.0+P.z*3.0).r; a=mix(vec3(0.03,0.09,0.03),vec3(0.10,0.22,0.07),w); gloss=0.25; }
  else if(m==25){ vec2 q=vec2(abs(n.x)>0.5?P.z:P.x,P.y); float w=texture2D(uNoise,q*0.35+0.2).r, w2=texture2D(uNoise,q*0.9).g; a=mix(mix(vec3(0.80,0.76,0.68),vec3(0.62,0.45,0.30),smoothstep(0.42,0.6,w)),vec3(0.20,0.27,0.30),smoothstep(0.55,0.7,w2)); }
  else if(m==26){ a=vec3(0.78,0.76,0.72); gloss=0.3; }
  else if(m==27){ // art wall: Ceradeco KKR-BLANCO porcelain, 600 x 1200, stacked
    vec2 q=vec2(P.z-0.38,P.y-uFY); vec2 t=vec2(q.x/0.6,q.y/1.2); vec2 c=floor(t), f=fract(t);
    a=texture2D(uMarble,vec2(f.x*0.3,f.y*0.6)+vec2(hash21(c)*0.7,hash21(c+3.7)*0.4)).rgb*1.03;
    float j=min(min(f.x,1.0-f.x)*0.6,min(f.y,1.0-f.y)*1.2); a*=mix(0.74,1.0,smoothstep(0.0008,0.003,j)); gloss=0.42; f0=0.05; }
  else if(m==28){ float u=abs(n.x)>0.5?P.z:P.x; float g=texture2D(uNoise,vec2(u*3.0,P.y*0.18)).r, g2=texture2D(uNoise,vec2(u*11.0,P.y*0.5)).g;
    a=mix(vec3(0.50,0.41,0.29),vec3(0.61,0.51,0.375),g)*(0.94+0.12*g2); float gx=abs(fract(u/0.6)-0.5); a*=mix(0.6,1.0,smoothstep(0.0,0.006,0.5-gx)); gloss=0.18; }
  else if(m==29){ vec2 g=fract(vec2((abs(n.x)>0.5?P.z:P.x)/0.6,(P.y-uFY)/0.3)); float j=smoothstep(0.0,0.006,g.x)*smoothstep(0.0,0.012,g.y); a=mix(vec3(0.50),vec3(0.59,0.57,0.53)*(0.95+0.08*fine),j); gloss=0.5; f0=0.05; }
  else if(m==30||m==31){ bool fl=abs(n.y)>0.5; vec2 q=fl?P.xz/vec2(0.3,0.3):vec2((abs(n.x)>0.5?P.z:P.x)/0.3,(P.y-uFY)/0.6); vec2 g=fract(q); vec2 gw=fl?vec2(0.012):vec2(0.012,0.006);
    float j=smoothstep(0.0,gw.x,g.x)*smoothstep(0.0,gw.y,g.y); float tv=hash21(floor(q)); vec3 t=(m==30?vec3(0.74,0.73,0.71):fl?vec3(0.68,0.68,0.66):vec3(0.55,0.53,0.49))*(0.96+0.05*tv+0.04*fine);
    a=mix(vec3(0.84,0.84,0.82),t,j); gloss=fl?0.25:0.55; f0=0.05; }
  else if(m==32){ a=vec3(0.80,0.81,0.81); gloss=1.0; f0=0.75; }
  else if(m==33){ a=vec3(0.50,0.51,0.52); gloss=0.7; f0=0.05; }
  return a;
}
void main(){
  int m=int(vM+0.5); vec3 P=vW; vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
  vec3 V=normalize(uCamPos-P);
  if(m==14){ gl_FragColor=vec4(mix(vec3(0.75,0.75,0.73)*uRoomAmb[0]*uBoost*3.0*uWB, uLampL*uBoost*0.5, step(0.5,uLampOn[0])),1.0); return; }
  if(m==23){ gl_FragColor=vec4(mix(vec3(0.80,0.78,0.72)*(uRoomAmb[0]*3.0+uWinSky*0.05)*uBoost*uWB, vec3(1.0,0.78,0.52)*uLampL.r*uBoost*0.16, step(0.5,uLampOn[0])),1.0); return; }
  // which room
  int r=4; for(int i=0;i<4;i++){ vec4 b=uRoom[i]; if(P.x>b.x-0.12&&P.x<b.y+0.12&&(P.z>b.z-0.12||P.z<0.6)&&P.z<b.w+0.12){ r=i; } }
  if(r==0 && P.x>2.3 && P.z<5.25 && P.z>3.8) r=4;
  int wr=(r==4)?0:r;
  bool encl=(P.x>2.95&&P.x<5.451&&P.z>5.289&&P.z<9.46)||(P.x>7.77&&P.x<10.121&&P.z>5.139&&P.z<7.01)||(P.x>5.59&&P.x<7.05&&P.z>8.69);   // bathrooms and utility room: no daylight
  float gloss, f0; vec3 alb=baseColor(m,P,n,gloss,f0);
  // sky & ground light through the room's window
  vec4 w=uWin[wr]; float y0=w.z+uFY, y1=w.w+uFY; float zi=(wr==3)?1.55:0.30;
  float ym=clamp(P.y,y0,y1);
  float eS=quadE(P,n,vec3(w.x,ym,zi),vec3(w.y,ym,zi),vec3(w.y,y1,zi),vec3(w.x,y1,zi));
  float eG=quadE(P,n,vec3(w.x,y0,zi),vec3(w.y,y0,zi),vec3(w.y,ym,zi),vec3(w.x,ym,zi));
  float vis=1.0;
  if(r==4){ // corridor sees the living-room window past the corner of bedroom 2
    float xc=P.x+(2.30-P.x)*(P.z-0.38)/max(P.z-3.9,0.02); vis=clamp((xc-w.x)/(w.y-w.x),0.0,1.0)*step(3.9,P.z);
  }
  if(wr==0 && P.x>2.3 && P.z>5.2) vis=0.3;
  if(encl) vis=0.0;
  vec3 E=(uWinSky*eS+uWinGnd*eG)*uGlassT*vis;
  if(r==0 && !encl && P.z>4.9){ // small side window by the refuge room
    if(P.x>-1.70) E+=uWinSky*uGlassT*0.9*min(quadE(P,n,vec3(-1.71,uFY+0.95,6.25),vec3(-1.71,uFY+0.95,6.88),vec3(-1.71,uFY+2.1,6.88),vec3(-1.71,uFY+2.1,6.25)),0.12);
    else if(P.z>6.2&&P.z<6.92) E+=uWinSky*0.22; }
  if(P.z<0.42) E=min(E,uWinSky*0.42);
  { // first bounce: the daylit patch of oak floor in front of the window lights walls and ceiling warmly
    float zb=zi+2.6; vec3 Lb=vec3(0.56,0.46,0.34)*(uWinSky*0.34*uGlassT+uSunIn*0.30*(wr==0?1.0:0.5));
    if(n.y<0.5) E+=Lb*quadE(P,n,vec3(w.x,uFY+0.002,zi),vec3(w.x,uFY+0.002,zb),vec3(w.y,uFY+0.002,zb),vec3(w.y,uFY+0.002,zi))*vis; }                                // reveals right at the glass: no glowing edge
  // ceiling light panels
  vec3 El=vec3(0.0);
  for(int i=0;i<6;i++){
    if(uLampOn[i]<0.5) continue; vec4 lp=uLamp[i]; float ly=uFY+uCeil-0.012;
    bool same = (i<4) ? (r==i || (i==0&&r==4)) : (r==0||r==4);
    if(!same || n.y<-0.5 || encl) continue;                       // flush panels do not light the ceiling they sit in
    El+=uLampL*quadE(P,n,vec3(lp.x-lp.z,ly,lp.y-lp.w),vec3(lp.x+lp.z,ly,lp.y-lp.w),vec3(lp.x+lp.z,ly,lp.y+lp.w),vec3(lp.x-lp.z,ly,lp.y+lp.w));
  }
  if(uLampOn[0]>0.5){ for(int i=0;i<15;i++){ vec3 Ld=uDL[i]-P; float d2=dot(Ld,Ld); if(d2>10.0) continue; Ld*=inversesqrt(d2);
    float cone=pow(max(Ld.y,0.0),3.0); El+=uLampL*1.5*cone*max(dot(n,Ld),0.0)/max(d2,0.06)*smoothstep(10.0,6.0,d2); } }   // downlight pools and wall scallops
  // analytic contact occlusion from the room box
  vec4 rb=(r==4)?vec4(2.25,8.5,3.93,5.13):uRoom[r];
  vec3 dlo=vec3(P.x-rb.x,P.y-uFY,P.z-rb.z), dhi=vec3(rb.y-P.x,uFY+uCeil-P.y,rb.w-P.z);
  float ao=1.0;
  vec3 kl=exp(-max(dlo,0.0)/0.28), kh=exp(-max(dhi,0.0)/0.28);
  ao*=1.0-0.30*kl.x*(1.0-abs(n.x)); ao*=1.0-0.30*kh.x*(1.0-abs(n.x));
  ao*=1.0-0.34*kl.y*(1.0-abs(n.y)); ao*=1.0-0.30*kh.y*(1.0-abs(n.y));
  ao*=1.0-0.30*kl.z*(1.0-abs(n.z)); ao*=1.0-0.30*kh.z*(1.0-abs(n.z));
  if(r==0 && P.z>5.0) ao=mix(ao,1.0,0.3);
  vec3 amb=uRoomAmb[r]*ao*(0.82+0.18*n.y)*0.92;
  if(r==4) amb*=1.5;
  amb*=1.0+1.0*max(n.z,0.0)*smoothstep(1.6,0.2,P.z)*vec3(1.04,1.0,0.94);   // the window wall is lit by the bright room behind the camera, not by the sky
  if(P.x>10.12 && P.z>5.1){ float dao=1.0-0.35*exp(-max(uFY+uCeil-P.y,0.0)/0.3)*(1.0-abs(n.y)); amb=(uRoomAmb[3]*0.55+uRoomAmb[0]*0.55)*vec3(1.0,0.97,0.92)*dao*(0.8+0.2*n.y); }   // windowless dressing room: its downlight is on
  bool hall=P.x>5.59&&P.x<7.05&&P.z>5.28;
  if(encl||hall){ vec3 rbx=hall?vec3(5.6,7.04,P.z>8.7?8.7:5.29):((P.x<6.0)?vec3(2.96,5.45,P.z<7.2?5.29:7.4):vec3(8.6,10.12,5.14)); float ex=min(P.x-rbx.x,rbx.y-P.x), ez=P.z-rbx.z; float dao=(1.0-0.30*exp(-max(ex,0.0)/0.25)*(1.0-abs(n.x)))*(1.0-0.30*exp(-max(ez,0.0)/0.25)*(1.0-abs(n.z)))*(1.0-0.32*exp(-max(uFY+uCeil-P.y,0.0)/0.3)*(1.0-abs(n.y)))*(1.0-0.30*exp(-max(P.y-uFY,0.0)/0.25)*(1.0-abs(n.y)));
    amb=(uRoomAmb[3]*0.5+uRoomAmb[0]*0.5)*vec3(1.0,0.98,0.95)*dao*(0.8+0.2*n.y)*1.7; }   // windowless rooms: their own lights are on
  if(n.y>0.5) amb*=vec3(1.34,1.30,1.22);                        // floors and counters see the white ceiling and walls
  if(n.y<-0.5) amb*=mix(vec3(1.10,1.02,0.90)*1.12,vec3(1.75,1.72,1.66),step(0.5,uLampOn[0]));                 // ceilings are lit by the oak floor
  // Diffuse-only Cycles transport for the static floor, separate from live direct sun.
  if(n.y>0.98 && P.y-uFY<0.025 && (m==3 || m==4 || m==30 || m==31)){
    vec3 bake=texture2D(uFloorLight,vec2((P.x+3.)/16.,1.-P.z/10.)).rgb;
    vec3 bounce=(0.5*(uWinSky+uWinGnd)*uGlassT*bake.r*bake.r + uLampL*bake.g*bake.g);
    amb=mix(amb,bounce,0.62)*mix(0.68,1.,bake.b);
    E*=mix(0.44,1.,bake.b);
    El*=mix(0.52,1.,bake.b);
  }
  // direct sun
  float ndl=max(dot(n,uLDir),0.0); float sv=(ndl>0.0&&!encl)?sunVis(P+n*0.004):0.0;
  vec3 sun=uLCol*uCloudShade*ndl*sv*uGlassT;
  vec3 col=alb*((E+El)/3.14159+amb)*uBoost + alb*sun*uBoostSun;
  // glossy reflections of the window (sky) and the ceiling panels
  if(gloss>0.01){
    vec3 R=reflect(-V,n); float fr=f0+(1.0-f0)*pow(1.0-max(dot(V,n),0.0),5.0);
    vec3 refl=uRoomAmb[r]*0.6;
    if(R.z<-0.01){ float t=(zi-P.z)/R.z; vec3 h=P+R*t; float s=0.02+t*(1.0-gloss)*0.09; float k=inRect(h.xy,vec4(w.x,w.y,y0,y1),s)*vis;
      vec3 sky=R.y>0.0?lutDir(R):uWinGnd; refl=mix(refl,sky*uGlassT,k); }
    if(R.y>0.01){ for(int i=0;i<6;i++){ if(uLampOn[i]<0.5) continue; vec4 lp=uLamp[i]; float t=(uFY+uCeil-P.y)/R.y; vec3 h=P+R*t; float s=0.01+t*(1.0-gloss)*0.08;
      refl+=uLampL*inRect(h.xz,vec4(lp.x-lp.z,lp.x+lp.z,lp.y-lp.w,lp.y+lp.w),s); } }
    col+=refl*fr*gloss*uBoost;
  }
  if(m==22){ col+=alb*uWinSky*uGlassT*0.16*uBoost*smoothstep(0.9,0.2,abs(P.x))*0.0 + alb*uWinSky*0.10*uBoost; }
  if(m==16){ col=(uWinSky*0.5+uRoomAmb[0])*uBoost*0.55; }
  col*=uWB;
  gl_FragColor=vec4(col,1.0);
}`;

class HomeBuf {
  constructor() { this.p = []; this.n = []; this.m = []; this.i = []; this.nv = 0; }
  quad(a, b, c, d, n, m) { this.p.push(...a, ...b, ...c, ...d); for (let k = 0; k < 4; k++) { this.n.push(...n); this.m.push(m); } const v = this.nv; this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.nv += 4; }
  // axis box in unit coords (y relative to finished floor); mats: single id or {top,bottom,side}
  box(x0, x1, y0, y1, z0, z1, m, occ = false) {
    const Y0 = FY + y0, Y1 = FY + y1; const mt = typeof m === 'number' ? { t: m, b: m, s: m } : m;
    this.quad([x0, Y1, z0], [x0, Y1, z1], [x1, Y1, z1], [x1, Y1, z0], [0, 1, 0], mt.t);
    this.quad([x0, Y0, z1], [x0, Y0, z0], [x1, Y0, z0], [x1, Y0, z1], [0, -1, 0], mt.b);
    this.quad([x0, Y0, z1], [x1, Y0, z1], [x1, Y1, z1], [x0, Y1, z1], [0, 0, 1], mt.s);
    this.quad([x1, Y0, z0], [x0, Y0, z0], [x0, Y1, z0], [x1, Y1, z0], [0, 0, -1], mt.s);
    this.quad([x1, Y0, z1], [x1, Y0, z0], [x1, Y1, z0], [x1, Y1, z1], [1, 0, 0], mt.s);
    this.quad([x0, Y0, z0], [x0, Y0, z1], [x0, Y1, z1], [x0, Y1, z0], [-1, 0, 0], mt.s);
    if (occ) HOME.occ.push([x0, Y0, z0, x1, Y1, z1]);
    if (!this.loose && y0 < 1.0 && y1 > 0.5 && (x1 - x0) * (z1 - z0) < 30) HOME.solid.push([x0, x1, z0, z1]);   // blocks walking
  }
  geo(g, m) { // append any geometry already placed in world coordinates
    const p = g.attributes.position, n = g.attributes.normal, v = this.nv, ix = g.index;
    for (let i = 0; i < p.count; i++) { this.p.push(p.getX(i), p.getY(i), p.getZ(i)); this.n.push(n.getX(i), n.getY(i), n.getZ(i)); this.m.push(m); }
    if (ix) for (let i = 0; i < ix.count; i++) this.i.push(v + ix.getX(i)); else for (let i = 0; i < p.count; i++) this.i.push(v + i);
    this.nv += p.count;
  }
  obox(cx, cz, w, d, y0, y1, ang, m) { const g = new THREE.BoxGeometry(w, y1 - y0, d); g.rotateY(ang); g.translate(cx, FY + (y0 + y1) / 2, cz); this.geo(g, m); }
  cyl(x, z, r, y0, y1, m, seg = 20) { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); g.translate(x, FY + (y0 + y1) / 2, z); this.geo(g, m); }
  tube(pts, r, m) { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], FY + p[1], p[2]))); this.geo(new THREE.TubeGeometry(c, 24, r, 8, false), m); }
  rbox(x0, x1, y0, y1, z0, z1, m, r = 0.05, occ = false) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0; const g = new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    g.translate((x0 + x1) / 2, FY + (y0 + y1) / 2, (z0 + z1) / 2); this.geo(g, m); if (occ) HOME.occ.push([x0 + r * 0.3, FY + y0, z0 + r * 0.3, x1 - r * 0.3, FY + y1 - r * 0.3, z1 - r * 0.3]);
  }
  build() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('aM', new THREE.BufferAttribute(new Float32Array(this.m), 1)); g.setIndex(this.i); return g;
  }
}

function paintWood() {       // 8 oak planks side by side (each 256 x 2048 px = 0.19 x 2.4 m), grain periodic along the length
  const N = 2048, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  let s = 4711; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 8; k++) {
    const x0 = k * 256, t = rnd(); g.save(); g.beginPath(); g.rect(x0, 0, 256, N); g.clip();
    g.fillStyle = `rgb(${212 + t * 12 | 0},${197 + t * 12 | 0},${174 + t * 12 | 0})`; g.fillRect(x0, 0, 256, N);
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '150,122,88' : '232,220,200'},${0.025 + rnd() * 0.045})`; g.fillRect(x0 + rnd() * 256, 0, 14 + rnd() * 60, N); }
    const cath = rnd() < 0.6 ? { x: x0 + 70 + rnd() * 116, y: rnd() * N, w: 18 + rnd() * 22 } : null;
    for (let i = 0; i < 190; i++) {
      const x = x0 + rnd() * 256, amp = 1 + rnd() * 5, n1 = 1 + Math.floor(rnd() * 3), ph = rnd() * 6.283, light = rnd() < 0.22;
      g.strokeStyle = `rgba(${light ? '238,228,210' : '128,100,70'},${0.05 + rnd() * (light ? 0.12 : 0.16)})`; g.lineWidth = 0.5 + rnd() * rnd() * 2.0; g.beginPath();
      for (let y = 0; y <= N; y += 12) { let xx = x + amp * Math.sin(y / N * 6.283 * n1 + ph);
        if (cath) { let dy = y - cath.y; dy -= Math.round(dy / N) * N; const dx = xx - cath.x, q = Math.exp(-dy * dy / 90000); xx += Math.sign(dx || 1) * cath.w * q * Math.exp(-Math.abs(dx) / 60); }
        y ? g.lineTo(xx, y) : g.moveTo(xx, y); }
      g.stroke();
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(104,78,52,${0.10 + rnd() * 0.16})`; g.fillRect(x0 + rnd() * 256, rnd() * N, 1, 3 + rnd() * 11); }   // open pores
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
function paintMarble() {     // warm-white porcelain slab with soft clouding and a few long veins
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  let s = 9173; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#ece9e2'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) { const x = rnd() * N, y = rnd() * N, r = 60 + rnd() * 220, gr = g.createRadialGradient(x, y, 0, x, y, r); const col = rnd() < 0.5 ? '205,200,190' : '250,248,244'; gr.addColorStop(0, `rgba(${col},${0.10 + rnd() * 0.12})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const vein = (x, y, a, len, w, al) => { const pts = [[x, y]]; for (let i = 0; i < len; i++) { a += (rnd() - 0.5) * 0.5; x += Math.cos(a) * 14; y += Math.sin(a) * 14; pts.push([x, y]); if (w > 1.2 && rnd() < 0.05) vein(x, y, a + (rnd() < 0.5 ? 0.7 : -0.7), len * 0.4, w * 0.5, al * 0.7); }
    for (const [lw, k] of [[w * 9, 0.05], [w * 5, 0.08], [w * 2.4, 0.16], [w * 0.8, 0.5]]) { g.strokeStyle = `rgba(150,143,130,${al * k})`; g.lineWidth = lw; g.lineJoin = g.lineCap = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); } };
  for (let i = 0; i < 9; i++) vein(rnd() * N, rnd() * N, rnd() * 6.283, 40 + rnd() * 70, 0.5 + rnd() * 0.9, 0.22 + rnd() * 0.25);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
function buildHomeGeometry() {
  const B = new HomeBuf(), M = MAT, H = CEIL, GQ = [];
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const wall = (x0, x1, z0, z1, y0 = 0, y1 = H, occ = true) => { B.box(x0, x1, y0, y1, z0, z1, M.WALL, occ); if (y0 === 0) HOME.walls.push([x0, x1, z0, z1, y1]);
    const a = cl(x0 - 0.007, -2.64, 12.32), b = cl(x1 + 0.007, -2.64, 12.32), c = cl(z0 - 0.007, 0.001, 9.9), d = cl(z1 + 0.007, 0.001, 9.9);
    if (y0 === 0 && y1 > 1) B.box(a, b, 0.003, 0.07, c, d, M.FRAME);                 // skirting
    if (y1 === H && y0 < 2.2) B.box(a, b, H - 0.028, H, c, d, M.FRAME); };            // slim cornice
  // cabinet door gaps: vertical seams splitting a0..a1 into n doors on the face at c (dir = outward normal sign), and one horizontal gap
  const seams = (ax, a0, a1, n, y0, y1, c, dir = 1) => { for (let i = 1; i < n; i++) { const a = lerp(a0, a1, i / n), q0 = Math.min(c, c + 0.0015 * dir), q1 = Math.max(c, c + 0.0015 * dir);
    if (ax === 'x') B.box(a - 0.0015, a + 0.0015, y0, y1, q0, q1, M.BLACK); else B.box(q0, q1, y0, y1, a - 0.0015, a + 0.0015, M.BLACK); } };
  const hseam = (ax, a0, a1, y, c, dir = 1) => { const q0 = Math.min(c, c + 0.0015 * dir), q1 = Math.max(c, c + 0.0015 * dir);
    if (ax === 'x') B.box(a0, a1, y - 0.0015, y + 0.0015, q0, q1, M.BLACK); else B.box(q0, q1, y - 0.0015, y + 0.0015, a0, a1, M.BLACK); };
  // a door leaf standing at pivot (px,pz), running along (dx,dz), with lever handles on both faces
  // a moving part: built closed in world coordinates, then hung on its own mesh at the pivot; a.rot = swing angle, a.sx/a.sz = slide, a.glass = clear panes
  const dyn = (cx, cz, build, a) => { const L = new HomeBuf(); L.loose = true; build(L); const g = L.build(); g.translate(-a.px, 0, -a.pz); const mesh = new THREE.Mesh(g); mesh.position.set(a.px, 0, a.pz); mesh.frustumCulled = false; HOME.doors.push({ mesh, cx, cz, t: 0, ...a }); };
  const leaf = (B, px, pz, dx, dz, Wd, m, hd = true, h = 2.06) => {
    const t = 0.038, ang = Math.atan2(-dz, dx), nx = -dz, nz = dx;
    B.obox(px + dx * Wd / 2, pz + dz * Wd / 2, Wd, t, 0.008, h, ang, m);
    if (hd) for (const s of [1, -1]) { const k = Wd - 0.075, ox = nx * s * (t / 2 + 0.035), oz = nz * s * (t / 2 + 0.035);
      B.obox(px + dx * k + nx * s * (t / 2 + 0.018), pz + dz * k + nz * s * (t / 2 + 0.018), 0.022, 0.036, 0.99, 1.012, ang, M.STEEL);
      B.obox(px + dx * (k - 0.055) + ox, pz + dz * (k - 0.055) + oz, 0.13, 0.016, 0.992, 1.010, ang, M.STEEL);
      B.obox(px + dx * k + nx * s * (t / 2 + 0.003), pz + dz * k + nz * s * (t / 2 + 0.003), 0.05, 0.006, 0.975, 1.027, ang, M.STEEL); }
  };
  // framed doorway: ax 'x' = opening along x in a wall spanning z c0..c1, ax 'z' = opening along z in a wall spanning x c0..c1
  const door = (ax, a0, a1, c0, c1, o = {}) => {
    const h = o.h || 2.1, fm = o.fm || M.FRAME, jt = 0.035, pr = 0.012;
    const bx = (p0, p1, y0, y1, q0, q1, m) => ax === 'x' ? B.box(p0, p1, y0, y1, q0, q1, m) : B.box(q0, q1, y0, y1, p0, p1, m);
    bx(a0, a0 + jt, 0, h, c0 - pr, c1 + pr, fm); bx(a1 - jt, a1, 0, h, c0 - pr, c1 + pr, fm); bx(a0, a1, h - jt, h, c0 - pr, c1 + pr, fm);
    for (const q of [c0 - pr - 0.006, c1 + pr]) { bx(a0 - 0.045, a0, 0, h + 0.045, q, q + 0.006, fm); bx(a1, a1 + 0.045, 0, h + 0.045, q, q + 0.006, fm); bx(a0, a1, h, h + 0.045, q, q + 0.006, fm); }   // casing
    if (o.leaf === false) return;
    const th = (o.ang === undefined ? 88 : o.ang) * RAD, side = o.side || 1, hg = o.hinge ? 1 : 0;
    const pa = hg ? a1 - jt : a0 + jt, da0 = hg ? -1 : 1, Wd = a1 - a0 - 2 * jt, mid = (a0 + a1) / 2, cm = (c0 + c1) / 2, m = o.m || M.DOOR, hh = h - 0.045;
    if (o.slide) {                                             // sliding leaf hung on the face of the wall, pocket pull instead of a lever
      const pc = side > 0 ? c1 + 0.028 : c0 - 0.028, s = o.slide * (a1 - a0 + 0.02), W2 = a1 - a0 + 0.06, p0 = a0 - 0.03;
      const bld = (L) => { if (ax === 'x') { leaf(L, p0, pc, 1, 0, W2, m, false, hh + 0.04); for (const q of [pc - 0.021, pc + 0.019]) L.box(o.slide > 0 ? p0 + 0.05 : p0 + W2 - 0.07, o.slide > 0 ? p0 + 0.07 : p0 + W2 - 0.05, 0.92, 1.12, q, q + 0.002, M.STEEL); }
        else { leaf(L, pc, p0, 0, 1, W2, m, false, hh + 0.04); for (const q of [pc - 0.021, pc + 0.019]) L.box(q, q + 0.002, 0.92, 1.12, o.slide > 0 ? p0 + 0.05 : p0 + W2 - 0.07, o.slide > 0 ? p0 + 0.07 : p0 + W2 - 0.05, M.STEEL); } };
      if (ax === 'x') { B.box(a0 - 0.95 * (o.slide < 0) - 0.05, a1 + 0.95 * (o.slide > 0) + 0.05, hh + 0.045, hh + 0.085, Math.min(pc - 0.03, pc + 0.03), Math.max(pc - 0.03, pc + 0.03), fm); dyn(mid, cm, bld, { px: p0, pz: pc, sx: s, sz: 0 }); }
      else { B.box(Math.min(pc - 0.03, pc + 0.03), Math.max(pc - 0.03, pc + 0.03), hh + 0.045, hh + 0.085, a0 - 0.95 * (o.slide < 0) - 0.05, a1 + 0.95 * (o.slide > 0) + 0.05, fm); dyn(cm, mid, bld, { px: pc, pz: p0, sx: 0, sz: s }); }
      return; }
    const pc = side > 0 ? c1 - 0.01 : c0 + 0.01;
    const [px, pz, dx, dz, rot] = ax === 'x' ? [pa, pc, da0, 0, -side * da0 * th] : [pc, pa, 0, da0, side * da0 * th];
    if (th === 0) leaf(B, px, pz, dx, dz, Wd, m, true, hh);                                        // stays shut (nothing is modelled behind it)
    else dyn(ax === 'x' ? mid : cm, ax === 'x' ? cm : mid, (L) => leaf(L, px, pz, dx, dz, Wd, m, true, hh), { px, pz, rot });
  };
  const plate = (ax, a, c, y, w, hh, m, dir = 1) => { const d = 0.008 * dir; if (ax === 'x') B.box(a - w / 2, a + w / 2, y - hh / 2, y + hh / 2, Math.min(c, c + d), Math.max(c, c + d), m); else B.box(Math.min(c, c + d), Math.max(c, c + d), y - hh / 2, y + hh / 2, a - w / 2, a + w / 2, m); };
  const ceilY = (x, z) => (z > 0.38 && z < 5.05 && x > -2.25 && x < 2.25 && !(x > -1.68 && x < 1.68 && z > 0.95 && z < 4.45)) ? H - 0.10 : H;
  const vent = (x, z) => { const y = ceilY(x, z); B.cyl(x, z, 0.085, y - 0.012, y, M.FRAME, 28); B.cyl(x, z, 0.05, y - 0.02, y - 0.012, M.FRAME, 24); };
  const sprk = (x, z) => { const y = ceilY(x, z); B.cyl(x, z, 0.032, y - 0.004, y, M.FRAME, 16); B.cyl(x, z, 0.012, y - 0.03, y - 0.004, M.STEEL, 10); B.cyl(x, z, 0.022, y - 0.034, y - 0.03, M.STEEL, 12); };
  const smoke = (x, z) => { const y = ceilY(x, z); B.cyl(x, z, 0.055, y - 0.03, y, M.FRAME, 24); };
  // floor & ceiling slabs
  B.box(-2.64, 12.32, -0.3, 0, 0, 9.9, { t: M.WOOD, b: M.CONC, s: M.CONC });
  B.box(-2.64, 12.32, H, H + 0.3, 0, 9.9, { t: M.CONC, b: M.CEIL, s: M.CONC });
  B.box(5.6, 7.04, 0, 0.004, 5.29, 8.53, M.TILE);                  // entrance tiles
  B.box(8.5, 12.13, 0, 0.004, 0.2, 1.51, M.TILE);                  // balcony tiles
  // ── facade (z 0..0.38) with window openings
  const fac = (x0, x1) => wall(x0, x1, 0, 0.38, 0, H, false);
  fac(-2.64, -1.83); fac(1.80, 2.88); fac(4.70, 5.87); fac(7.71, 8.50);
  wall(-1.83, 1.80, 0, 0.38, 2.24, H, false); wall(-1.83, 1.80, 0, 0.38, 0, 0.18, false);
  for (const [a, b] of [[2.88, 4.70], [5.87, 7.71]]) { wall(a, b, 0, 0.38, 0, 0.85, false); wall(a, b, 0, 0.38, 2.20, H, false); }
  // balcony front (thin wall) + outdoor-unit room
  wall(8.50, 8.77, 0, 0.2, 0, H, false); wall(10.28, 12.32, 0, 0.2, 0, H, false); wall(8.77, 10.28, 0, 0.2, 2.20, H, false); wall(8.77, 10.28, 0, 0.2, 0, 0.06, false);
  wall(10.36, 10.46, 0.2, 1.51);
  // bedroom 1 front wall with sliding door to the balcony
  wall(8.50, 8.60, 1.51, 1.59); wall(10.36, 12.13, 1.51, 1.59); wall(8.60, 10.36, 1.51, 1.59, 2.20, H);
  // ── end walls
  wall(-2.64, -2.25, 0, 5.25); wall(-2.64, -2.03, 5.25, 5.59); wall(-2.64, -1.17, 6.88, 9.9);                       // plan: the facade steps in 0.56 m beside the refuge room
  wall(-2.03, -1.69, 5.25, 6.25, 0, H, false); wall(-2.03, -1.69, 6.25, 6.88, 0, 0.95, false); wall(-2.03, -1.69, 6.25, 6.88, 2.1, H, false);   // ordinary 0.34 m wall with the side window
  B.box(-2.64, -2.03, 0, 0.012, 5.59, 6.88, M.CONC); wall(12.13, 12.32, 0, 9.9);
  // ── partitions
  wall(2.25, 2.46, 0.38, 3.93); wall(5.15, 5.30, 0.38, 3.85); wall(8.29, 8.50, 0.2, 3.93);
  // corridor south wall (bedroom doors: bed2 at x 2.55..3.45, bed3 at 7.30..8.20)
  wall(2.46, 2.55, 3.85, 3.93); wall(3.45, 7.30, 3.85, 3.93); wall(8.20, 8.29, 3.85, 3.93);
  wall(2.55, 3.45, 3.85, 3.93, 2.1, H); wall(7.30, 8.20, 3.85, 3.93, 2.1, H);
  // corridor east end: door into bedroom 1 (z 3.98..4.88)
  wall(8.29, 8.50, 3.93, 3.98); wall(8.29, 8.50, 4.88, 5.29); wall(8.29, 8.50, 3.98, 4.88, 2.1, H);
  // corridor north wall with bath door and the entrance opening (x 5.6..7.04)
  wall(2.96, 4.5, 5.13, 5.29); wall(5.35, 5.6, 5.13, 5.29, 0, H, false); wall(4.5, 5.35, 5.13, 5.29, 2.1, H, false); wall(7.04, 8.50, 5.13, 5.29); wall(5.6, 7.04, 5.13, 5.29, 2.15, H);
  // entrance vestibule
  wall(5.45, 5.6, 5.29, 7.6); wall(5.45, 5.6, 8.4, 8.7, 0, H, false); wall(5.45, 5.6, 7.6, 8.4, 2.1, H, false);            // west: opening to the utility room
  wall(7.04, 7.2, 5.29, 7.4); wall(7.04, 7.2, 8.4, 8.7, 0, H, false); wall(7.04, 7.2, 7.4, 8.4, 2.1, H, false);            // east: front door
  wall(5.6, 6.1, 8.53, 8.7, 0, H, false); wall(6.95, 7.04, 8.53, 8.7, 0, H, false); wall(6.1, 6.95, 8.53, 8.7, 2.1, H, false); // north: entrance storage
  wall(5.6, 7.2, 9.45, 9.9, 0, H, false); wall(7.04, 7.2, 8.7, 9.9, 0, H, false);
  B.box(5.6, 7.04, 0, 0.004, 8.53, 9.45, M.TILE);
  B.box(7.07, 7.12, 0, 2.1, 7.4, 8.4, M.METAL);                                                                          // front door: charcoal steel leaf
  for (const [z0, z1] of [[7.36, 7.4], [8.4, 8.44]]) B.box(7.0, 7.07, 0, 2.14, z0, z1, M.METAL); B.box(7.0, 7.07, 2.1, 2.14, 7.36, 8.44, M.METAL);
  B.box(7.035, 7.07, 1.00, 1.30, 7.48, 7.555, M.BLACK); B.box(7.01, 7.035, 0.98, 1.00, 7.47, 7.62, M.STEEL); B.box(7.055, 7.07, 1.55, 1.57, 7.86, 7.94, M.STEEL);   // digital lock, lever, viewer
  B.box(6.64, 7.04, 0, H, 5.29, 7.3, M.CAB, true);                                                                       // full-height white shoe cabinet
  B.box(5.6, 5.615, 0, H, 5.29, 7.6, M.WOODCAB); B.box(5.615, 5.619, 0.08, 2.24, 6.0, 6.75, M.MIRROR);                    // oak wall panels with a full-height mirror
  B.box(5.6, 5.615, 0, H, 8.4, 8.53, M.WOODCAB); B.box(5.6, 6.1, 0, H, 8.515, 8.53, M.WOODCAB); B.box(6.95, 7.04, 0, H, 8.515, 8.53, M.WOODCAB); B.box(6.1, 6.95, 2.1, H, 8.515, 8.53, M.WOODCAB);
  door('x', 6.1, 6.95, 8.53, 8.7, { hinge: 1, side: 1, m: M.WOODCAB, fm: M.WOODCAB });                                   // entrance storage door, open
  for (const y of [0.4, 0.8, 1.2, 2.0]) { B.box(5.6, 6.9, y, y + 0.025, 9.1, 9.45, M.METAL); B.box(5.6, 5.95, y, y + 0.025, 8.7, 9.1, M.METAL); }
  for (const x of [5.75, 6.3, 6.85]) B.box(x, x + 0.02, 0, H, 9.435, 9.45, M.BLACK); for (const z of [8.8, 9.05]) B.box(5.6, 5.612, 0, H, z, z + 0.02, M.BLACK);
  B.box(6.0, 7.0, 1.86, 1.885, 8.88, 8.905, M.STEEL); for (const x of [6.05, 6.93]) B.box(x, x + 0.02, 1.885, 2.0, 8.88, 8.905, M.STEEL);                 // hanging rod under the top shelf
  seams('z', 5.29, 7.3, 4, 0.1, H - 0.03, 6.64, -1); B.box(6.66, 7.04, 0, 0.1, 5.29, 7.3, M.BLACK); hseam('z', 5.29, 7.3, 0.1, 6.64, -1);
  door('z', 7.6, 8.4, 5.45, 5.6, { slide: 1, side: -1, m: M.WOODCAB, fm: M.WOODCAB });                                    // entrance → utility room: sliding door (owner)
  // bedroom 1 back wall (door to dressing room / bath)
  wall(8.50, 10.42, 4.98, 5.14); wall(11.42, 12.13, 4.98, 5.14); wall(10.42, 11.42, 4.98, 5.14, 2.1, H);
  // powder passage → dressing room (model house: vanity on the end-wall side, open wood shelving beyond)
  wall(10.12, 10.27, 6.0, 8.75); wall(10.12, 10.27, 5.14, 5.2, 0, H, false); wall(10.12, 10.27, 5.2, 6.0, 2.1, H, false); wall(10.27, 12.13, 8.6, 8.75);
  wall(10.27, 10.52, 6.6, 6.7); wall(11.52, 12.13, 6.6, 6.7); wall(10.52, 11.52, 6.6, 6.7, 2.1, H);
  B.box(11.65, 12.13, 0.12, 0.76, 5.3, 6.5, M.CAB, true); B.box(11.63, 12.13, 0.76, 0.79, 5.28, 6.52, M.STONE); B.box(12.105, 12.13, 0.92, 2.0, 5.42, 6.38, M.CAB); B.box(12.10, 12.105, 0.94, 1.98, 5.44, 6.36, M.MIRROR); B.box(11.95, 12.13, 2.0, H, 5.3, 6.5, M.CAB); B.box(11.97, 12.09, 1.995, 2.0, 5.5, 6.3, M.LAMP);
  seams('z', 5.3, 6.5, 2, 0.12, 0.76, 11.65, -1); hseam('z', 5.9, 6.5, 0.45, 11.65, -1); B.box(11.68, 12.13, 0, 0.12, 5.32, 6.48, M.BLACK);
  { // system hanger: steel posts, white lower shelf, top shelf with hanging rails (as in the model house)
    const runs = [[10.27, 10.77, 6.75, 8.6, 'z'], [11.63, 12.13, 6.75, 8.6, 'z'], [10.77, 11.63, 8.12, 8.6, 'x']];
    for (const [x0, x1, z0, z1, ax] of runs) {
      B.box(x0, x1, 0.80, 0.825, z0, z1, M.CAB); B.box(x0, x1, 2.02, 2.045, z0, z1, M.CAB);
      const front = ax === 'z' ? (x0 < 11 ? x1 - 0.03 : x0) : null;
      if (ax === 'z') { for (const z of [z0 + 0.02, (z0 + z1) / 2, z1 - 0.05]) B.box(front, front + 0.03, 0, H, z, z + 0.03, M.STEEL); B.box((x0 + x1) / 2 - 0.012, (x0 + x1) / 2 + 0.012, 1.93, 1.955, z0, z1, M.METAL); }
      else { for (const x of [x0 + 0.02, x1 - 0.05]) B.box(x, x + 0.03, 0, H, z0, z0 + 0.03, M.STEEL); B.box(x0, x1, 1.93, 1.955, (z0 + z1) / 2 - 0.012, (z0 + z1) / 2 + 0.012, M.METAL); }
    }
  }
  B.box(11.0, 11.3, H - 0.012, H, 7.35, 7.65, M.LAMP); B.box(10.85, 11.0, H - 0.008, H, 5.8, 5.95, M.LAMP);
  // balcony: ceiling-mounted drying rack
  B.box(8.95, 10.15, H - 0.07, H, 0.55, 0.95, M.DOOR); for (const z of [0.6, 0.72, 0.84]) B.box(8.9, 10.2, H - 0.34, H - 0.325, z, z + 0.015, M.STEEL);
  // kitchen back wall, utility wall, fridge column
  wall(-1.72, 2.94, 9.45, 9.9); wall(2.76, 2.94, 8.45, 9.45); wall(2.76, 2.94, 7.55, 7.6, 0, H, false); wall(2.76, 2.94, 7.6, 8.45, 2.1, H, false);
  B.box(2.25, 2.96, 0, H, 5.13, 5.55, M.CAB, true); B.box(2.25, 2.96, 0, H, 7.25, 7.55, M.CAB); B.box(2.25, 2.96, 1.95, H, 5.55, 7.25, M.CAB); B.box(2.90, 2.96, 0, 1.95, 5.55, 7.25, M.WALL);   // fridge alcove: tall units, bridge cabinets, open recess
  door('z', 7.97, 8.65, -1.21, -1.17, { hinge: 0, side: 1, ang: 0, h: 2.05 });   // refuge-room door (closed)
  { // side window beside the refuge room (clear glass, sill 0.95 m) in a normal-thickness wall
    const x0 = -1.90, x1 = -1.82, t = 0.05, a = 6.25, b = 6.88, c = (a + b) / 2;
    B.box(x0, x1, 0.95, 0.95 + t, a, b, M.FRAME); B.box(x0, x1, 2.1 - t, 2.1, a, b, M.FRAME); B.box(x0, x1, 0.95, 2.1, a, a + t, M.FRAME); B.box(x0, x1, 0.95, 2.1, b - t, b, M.FRAME);
    B.box(-1.82, -1.67, 0.93, 0.95, a - 0.02, b + 0.02, M.STONE);
    B.box(x0 + 0.01, x1 - 0.01, 1.0, 2.05, c - 0.02, c + 0.02, M.FRAME); B.box(x1, x1 + 0.02, 1.45, 1.56, c + 0.025, c + 0.045, M.FRAME);
  }
  // ── bathrooms as in the model house: light tiles, darker band behind the ledge, mirrored cabinet, white fixtures
  const bath = (x0, x1, z0, z1, tub, vx, tx, gap, dr) => { const cvx = cl(vx + 0.25, x0 + 0.67, x1 - 0.67);
    B.box(x0, x1, 0, 0.005, z0, z1, M.BTILE2);
    if (gap) { B.box(x0, x0 + 0.015, 0, H, z0, gap[0], M.BTILE); B.box(x0, x0 + 0.015, 0, H, gap[1], z1, M.BTILE); B.box(x0, x0 + 0.015, 2.0, H, gap[0], gap[1], M.BTILE); } else B.box(x0, x0 + 0.015, 0, H, z0, z1, M.BTILE);
    if (dr[0] === 'z') { B.box(x1 - 0.015, x1, 0, H, z0, dr[1], M.BTILE); B.box(x1 - 0.015, x1, 0, H, dr[2], z1, M.BTILE); B.box(x1 - 0.015, x1, 2.1, H, dr[1], dr[2], M.BTILE); } else B.box(x1 - 0.015, x1, 0, H, z0, z1, M.BTILE);
    if (dr[0] === 'x') { B.box(x0, dr[1], 0, H, z0, z0 + 0.015, M.BTILE); B.box(dr[2], x1, 0, H, z0, z0 + 0.015, M.BTILE); B.box(dr[1], dr[2], 2.1, H, z0, z0 + 0.015, M.BTILE); } else B.box(x0, x1, 0, H, z0, z0 + 0.015, M.BTILE);
    B.box(x0, x1, 0, H, z1 - 0.015, z1, M.BTILE);
    B.box(x0, x1, 0, 0.84, z1 - 0.16, z1 - 0.015, M.BTILE2); B.box(x0, x1, 0.84, 0.865, z1 - 0.18, z1 - 0.015, M.STONE); B.box(x0 + 0.015, x1 - 0.015, 0.865, 1.10, z1 - 0.018, z1 - 0.0149, M.BTILE2);   // ledge wall + stone shelf + darker tile band
    B.box(cvx - 0.62, cvx + 0.62, 1.10, 1.95, z1 - 0.17, z1 - 0.015, M.CAB); B.box(cvx - 0.60, cvx + 0.22, 1.12, 1.93, z1 - 0.174, z1 - 0.17, M.MIRROR);   // cabinet: mirror doors + one white door
    seams('x', cvx - 0.60, cvx + 0.22, 2, 1.12, 1.93, z1 - 0.174, -1); seams('x', cvx + 0.22, cvx + 0.62, 1, 1.12, 1.93, z1 - 0.17, -1); B.box(cvx + 0.219, cvx + 0.222, 1.10, 1.95, z1 - 0.172, z1 - 0.17, M.BLACK);
    B.box(cvx - 0.62, cvx + 0.62, 1.95, H, z1 - 0.19, z1 - 0.015, M.CAB);                                                                                // boxed head with the light slot
    B.box(cvx - 0.5, cvx + 0.5, 1.945, 1.95, z1 - 0.185, z1 - 0.172, M.LAMP);
    if (tub) { B.box(x0 + 0.02, x0 + 0.5, 1.05, 1.062, z1 - 0.17, z1 - 0.03, M.STEEL); B.box(x0 + 0.02, x0 + 0.5, 1.062, 1.09, z1 - 0.172, z1 - 0.166, M.STEEL); }    // steel shelf by the cabinet
    B.box((x0 + x1) / 2 + 0.25, (x0 + x1) / 2 + 0.7, H - 0.005, H, (z0 + z1) / 2 + 0.2, (z0 + z1) / 2 + 0.65, M.FRAME); B.cyl((x0 + x1) / 2 - 0.45, (z0 + z1) / 2 + 0.35, 0.09, H - 0.012, H, M.FRAME, 24);   // access hatch, exhaust fan
    B.rbox(vx - 0.26, vx + 0.26, 0.73, 0.875, z1 - 0.60, z1 - 0.17, M.CAB, 0.03); B.box(vx - 0.20, vx + 0.20, 0.8755, 0.877, z1 - 0.55, z1 - 0.27, M.BOWL); B.rbox(vx - 0.09, vx + 0.09, 0.30, 0.73, z1 - 0.36, z1 - 0.18, M.CAB, 0.04);   // basin on a half pedestal
    B.box(vx - 0.018, vx + 0.018, 0.875, 1.0, z1 - 0.235, z1 - 0.20, M.STEEL); B.box(vx - 0.018, vx + 0.018, 0.985, 1.0, z1 - 0.33, z1 - 0.20, M.STEEL);
    B.rbox(tx - 0.175, tx + 0.175, 0, 0.40, z1 - 0.70, z1 - 0.19, M.CAB, 0.045); B.rbox(tx - 0.18, tx + 0.18, 0.40, 0.428, z1 - 0.695, z1 - 0.33, M.CAB, 0.012); B.rbox(tx - 0.18, tx + 0.18, 0.40, 0.78, z1 - 0.33, z1 - 0.175, M.CAB, 0.02); B.box(tx - 0.03, tx + 0.03, 0.78, 0.786, z1 - 0.27, z1 - 0.23, M.STEEL);   // toilet
    if (tub) { const a = x0 + 0.015, b = a + 0.75; B.box(a, b, 0, 0.12, z0 + 0.05, z1 - 0.18, M.CAB); for (const [p, q, r, t2] of [[a, a + 0.06, z0 + 0.05, z1 - 0.18], [b - 0.06, b, z0 + 0.05, z1 - 0.18], [a, b, z0 + 0.05, z0 + 0.11], [a, b, z1 - 0.24, z1 - 0.18]]) B.box(p, q, 0, 0.52, r, t2, M.CAB);
      B.cyl(a + 0.03, z1 - 0.62, 0.011, 0.95, 1.95, M.STEEL, 10); B.rbox(a + 0.02, a + 0.11, 1.80, 1.84, z1 - 0.66, z1 - 0.58, M.STEEL, 0.015); B.box(a + 0.0, a + 0.05, 0.62, 0.70, z1 - 0.72, z1 - 0.52, M.STEEL);
      B.tube([[a + 0.04, 0.68, z1 - 0.62], [a + 0.10, 0.9, z1 - 0.70], [a + 0.08, 1.5, z1 - 0.66], [a + 0.06, 1.8, z1 - 0.62]], 0.007, M.STEEL);
      B.box(a, a + 0.14, 1.25, 1.262, z0 + 0.03, z0 + 0.32, M.STEEL); }                                                                    // bathtub, shower set, corner shelf
    B.box(x1 - 0.05, x1 - 0.03, 1.2, 1.22, z0 + 0.9, z0 + 1.45, M.STEEL);                                                                                 // towel bar
    B.box((x0 + x1) / 2 - 0.35, (x0 + x1) / 2 + 0.35, H - 0.008, H, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02, M.LAMP);                                    // linear ceiling light
  };
  wall(2.96, 4.2, 7.0, 7.4, 0, H, false); wall(4.2, 5.45, 7.0, 7.02, 0, H, false);
  bath(2.96, 5.45, 5.29, 7.0, true, 4.35, 5.05, null, ['x', 4.5, 5.35]);
  door('x', 4.5, 5.35, 5.13, 5.29, { hinge: 1, side: 1 });
  wall(8.5, 8.6, 5.14, 5.29, 0, H, false); wall(8.5, 8.6, 6.5, 7.1, 0, H, false); wall(8.5, 8.6, 5.29, 6.5, 2.0, H, false); wall(8.5, 10.12, 7.0, 7.1, 0, H, false);
  bath(8.6, 10.12, 5.14, 7.0, false, 9.0, 9.7, [5.29, 6.5], ['z', 5.2, 6.0]);
  { // plan: the shower booth is an alcove beside the bathroom (x 7.78..8.6), closed by a framed glass front with a door
    const ax = 7.78, bx = 8.6, az = 5.29, bz = 6.5, fm = M.STEEL;
    wall(7.68, ax, 5.29, 6.6, 0, H, false); wall(ax, 8.5, bz, 6.6, 0, H, false); HOME.walls.push([bx - 0.02, bx + 0.02, az, bz, 2.0]);
    B.box(ax, bx, 0, 0.012, az, bz, M.BTILE2); B.box(ax, ax + 0.015, 0, H, az, bz, M.BTILE); B.box(ax, bx, 0, H, az, az + 0.015, M.BTILE); B.box(ax, bx, 0, H, bz - 0.015, bz, M.BTILE);
    for (const z of [az + 0.015, 5.88, bz - 0.035]) B.box(bx - 0.01, bx + 0.01, 0, 2.0, z, z + 0.02, fm);
    B.box(bx - 0.01, bx + 0.01, 1.98, 2.0, az, bz, fm); B.box(bx - 0.01, bx + 0.01, 0, 0.03, az, bz, fm); B.box(bx + 0.01, bx + 0.04, 0.95, 1.15, 5.80, 5.82, fm);     // frame, door stile, pull
    GQ.push([[bx, 0.03, az + 0.03], [bx, 0.03, bz - 0.03], [bx, 1.98, bz - 0.03], [bx, 1.98, az + 0.03]]);
    const sz = 5.9, sx = ax + 0.05; B.cyl(sx, sz, 0.011, 0.95, 2.08, M.STEEL, 10); B.tube([[sx, 2.08, sz], [sx + 0.04, 2.13, sz], [sx + 0.25, 2.13, sz]], 0.011, M.STEEL);
    B.box(sx + 0.17, sx + 0.39, 2.105, 2.117, sz - 0.11, sz + 0.11, M.STEEL);                                                           // rain head
    B.box(ax + 0.02, ax + 0.075, 0.98, 1.02, sz - 0.13, sz + 0.13, M.STEEL); B.rbox(sx, sx + 0.05, 1.45, 1.62, sz + 0.10, sz + 0.14, M.STEEL, 0.015);
    B.box(ax + 0.02, ax + 0.3, 1.2, 1.212, bz - 0.14, bz - 0.02, M.STEEL);                                                              // corner shelf
    B.box(8.0, 8.4, H - 0.008, H, 5.88, 5.92, M.LAMP);
  }
  door('z', 5.2, 6.0, 10.12, 10.27, { hinge: 0, side: -1 });
  // ── utility room (x 2.94..5.45, z 7.4..9.45): doors to the kitchen and to the entrance, shelves over the washer taps, niche cabinet
  wall(2.94, 5.6, 9.45, 9.9, 0, H, false); wall(5.45, 5.6, 8.7, 9.9, 0, H, false);
  B.box(2.94, 5.45, 0, 0.004, 7.4, 9.45, M.TILE);
  door('z', 7.6, 8.45, 2.76, 2.94, { hinge: 0, side: 1 });
  wall(2.94, 3.6, 8.62, 9.45, 0, H, false);                                                                                     // pipe shaft
  for (const y of [1.50, 1.86]) { B.box(3.72, 4.42, y, y + 0.03, 9.10, 9.45, M.CONC); for (const x of [3.80, 4.34]) B.box(x, x + 0.02, y - 0.22, y, 9.42, 9.45, M.STEEL); }
  for (const x of [3.98, 4.14]) B.box(x, x + 0.035, 1.12, 1.16, 9.38, 9.45, M.STEEL);
  B.box(4.2, 5.45, 0, 0.85, 7.02, 7.45, M.CAB); B.box(4.2, 5.45, 1.5, H, 7.02, 7.45, M.CAB);
  B.box(4.2, 5.45, 0.85, 1.5, 7.02, 7.04, M.WOODCAB); B.box(4.2, 5.45, 0.85, 0.872, 7.02, 7.45, M.WOODCAB); B.box(4.2, 5.45, 1.478, 1.5, 7.02, 7.45, M.WOODCAB); B.box(4.2, 5.45, 1.16, 1.18, 7.02, 7.43, M.WOODCAB); B.box(4.2, 4.22, 0.85, 1.5, 7.02, 7.45, M.WOODCAB); B.box(5.43, 5.45, 0.85, 1.5, 7.02, 7.45, M.WOODCAB);
  // open bedroom doors (leaf swung against the wall)
  door('x', 2.55, 3.45, 3.85, 3.93, { hinge: 0, side: -1 }); door('x', 7.30, 8.20, 3.85, 3.93, { hinge: 1, side: -1 }); door('z', 3.98, 4.88, 8.29, 8.50, { hinge: 1, side: 1 });   /* bedroom 1: hinged door opening into the bedroom (owner, plan) */
  door('x', 10.42, 11.42, 4.98, 5.14, { leaf: false });                                                                    // bedroom 1 → powder passage (open frame)
  door('x', 10.52, 11.52, 6.6, 6.7, { leaf: false });                                                                      // dressing-room double doors
  dyn(11.02, 6.65, (L) => leaf(L, 10.555, 6.61, 1, 0, 0.464, M.DOOR, false, 2.05), { px: 10.555, pz: 6.61, rot: 1.745 }); dyn(11.02, 6.65, (L) => leaf(L, 11.485, 6.61, -1, 0, 0.464, M.DOOR, false, 2.05), { px: 11.485, pz: 6.61, rot: -1.745 });
  B.box(8.5, 8.6, 0, H, 5.14, 5.2, M.WALL);
  // built-in wardrobe of bedroom 3 (on the corridor wall)
  B.box(5.34, 6.98, 0, H, 3.22, 3.85, M.CAB, true); seams('x', 5.34, 6.98, 4, 0.08, H - 0.03, 3.22, -1); hseam('x', 5.34, 6.98, 0.08, 3.22, -1); hseam('x', 5.34, 6.98, 1.95, 3.22, -1);
  // outdoor-unit room door (louvred) on the balcony
  B.box(10.335, 10.36, 0, 2.0, 0.42, 1.22, M.DOOR); for (let y = 0.2; y < 1.9; y += 0.06) B.box(10.33, 10.336, y, y + 0.03, 0.5, 1.14, M.FRAME); B.box(10.31, 10.335, 0.98, 1.0, 0.47, 0.57, M.STEEL);
  // Illustrative living-room arrangement, in metres relative to the finished floor.
  const sofa=LIVING_FURNITURE.sofa, table=LIVING_FURNITURE.table;
  const {x,z,depth,length,seatHeight,backHeight}=sofa;
  const right=x+depth, end=z+length;
  for (const px of [x+0.10,right-0.10]) for (const pz of [z+0.14,end-0.14])
    B.cyl(px,pz,0.027,0,0.14,M.WALNUT,12);
  B.rbox(x,right,0.12,0.29,z,end,M.SOFA,0.055,true);
  for (let i=0;i<2;i++) {
    const a=z+0.12+i*(length-0.24)/2,b=a+(length-0.24)/2-0.009;
    B.rbox(x+0.012,right-0.14,0.285,seatHeight,a,b,M.SOFA,0.062);
    B.rbox(right-0.19,right,0.29,backHeight,a,b,M.SOFA,0.075);
  }
  for (const pz of [z,end-0.12]) B.rbox(x,right,0.25,0.59,pz,pz+0.12,M.SOFA,0.055);
  HOME.solid.push([x,right,z,end]);
  const rim=new THREE.LatheGeometry([[0,0],[table.radius-0.008,0],[table.radius,0.007],
    [table.radius,0.026],[table.radius-0.008,0.033],[0,0.033]].map(p=>new THREE.Vector2(...p)),48);
  rim.translate(table.x,FY+table.height-0.033,table.z); B.geo(rim,M.WALNUT);
  for (let i=0;i<3;i++) {
    const a=2*Math.PI*i/3;
    B.cyl(table.x+0.23*Math.cos(a),table.z+0.23*Math.sin(a),0.028,0,table.height-0.033,M.WALNUT);
  }
  HOME.solid.push([table.x-table.radius,table.x+table.radius,table.z-table.radius,table.z+table.radius]);
  // ── kitchen
  B.box(-1.17, 0.98, 0.1, 0.86, 8.85, 9.45, M.WOODCAB, true); B.box(1.72, 2.76, 0.1, 0.86, 8.85, 9.45, M.WOODCAB); B.box(0.98, 1.72, 0.1, 0.69, 8.85, 9.45, M.WOODCAB); B.box(0.98, 1.72, 0.69, 0.86, 8.85, 8.966, M.WOODCAB); B.box(0.98, 1.72, 0.69, 0.86, 9.374, 9.45, M.WOODCAB);
  B.box(-1.17, 2.76, 0, 0.1, 8.92, 9.45, M.BLACK);
  { // worktop with a cut-out for the sink bowl (x 0.98..1.72, z 8.97..9.37)
    const sx0 = 0.98, sx1 = 1.72, sz0 = 8.97, sz1 = 9.37;
    B.box(-1.17, sx0, 0.86, 0.89, 8.83, 9.45, M.STONE); B.box(sx1, 2.76, 0.86, 0.89, 8.83, 9.45, M.STONE); B.box(sx0, sx1, 0.86, 0.89, 8.83, sz0, M.STONE); B.box(sx0, sx1, 0.86, 0.89, sz1, 9.45, M.STONE);
    B.box(sx0, sx1, 0.69, 0.70, sz0, sz1, M.STEEL); B.box(sx0 - 0.004, sx0, 0.70, 0.888, sz0, sz1, M.STEEL); B.box(sx1, sx1 + 0.004, 0.70, 0.888, sz0, sz1, M.STEEL); B.box(sx0, sx1, 0.70, 0.888, sz0 - 0.004, sz0, M.STEEL); B.box(sx0, sx1, 0.70, 0.888, sz1, sz1 + 0.004, M.STEEL);
    B.cyl(1.35, 9.17, 0.045, 0.70, 0.703, M.METAL, 16);
    B.cyl(1.35, 9.405, 0.024, 0.89, 0.93, M.STEEL, 14); B.tube([[1.35, 0.93, 9.405], [1.35, 1.22, 9.405], [1.35, 1.31, 9.36], [1.35, 1.31, 9.27], [1.35, 1.25, 9.215], [1.35, 1.17, 9.21]], 0.011, M.STEEL); B.box(1.385, 1.44, 0.93, 0.945, 9.397, 9.413, M.STEEL);   // gooseneck tap + lever
  }
  B.box(-1.17, 2.76, 0.89, 1.45, 9.43, 9.45, M.SPLASH);
  B.box(-1.17, 2.76, 1.45, H, 9.10, 9.45, M.CAB, true); seams('x', -1.17, 2.76, 7, 1.45, H - 0.03, 9.10, -1); B.box(-1.17, 2.76, 1.444, 1.45, 9.12, 9.43, M.LAMP);
  seams('x', -1.17, 0.98, 4, 0.1, 0.86, 8.85, -1); seams('x', 0.98, 1.72, 2, 0.1, 0.86, 8.85, -1); seams('x', 1.72, 2.76, 2, 0.1, 0.86, 8.85, -1);
  B.box(0.979, 0.981, 0.1, 0.86, 8.8485, 8.85, M.BLACK); B.box(1.719, 1.721, 0.1, 0.86, 8.8485, 8.85, M.BLACK); hseam('x', -0.65, 0.44, 0.60, 8.85, -1);
  seams('x', -1.17, 1.15, 4, 0.1, 0.86, 6.95, -1); seams('x', -1.17, 1.15, 4, 0.1, 0.86, 7.70, 1);
  seams('z', 5.13, 5.55, 1, 0, H, 2.25, -1); hseam('z', 5.13, 5.55, 1.95, 2.25, -1); hseam('z', 7.25, 7.55, 1.95, 2.25, -1); seams('z', 5.55, 7.25, 3, 1.95, H - 0.03, 2.25, -1); hseam('z', 5.13, 7.55, 0.1, 2.25, -1);
  B.box(-0.65, -0.05, 0.892, 0.898, 8.93, 9.37, M.BLACK); for (const [x, z, r] of [[-0.48, 9.05, 0.07], [-0.22, 9.05, 0.07], [-0.35, 9.26, 0.085]]) { B.cyl(x, z, r, 0.898, 0.912, M.METAL, 18); B.cyl(x, z, r * 0.45, 0.912, 0.918, M.STEEL, 12); }   // hob
  for (const x of [-0.55, -0.45, -0.35, -0.25, -0.15]) B.cyl(x, 8.955, 0.013, 0.898, 0.912, M.STEEL, 10);
  B.box(-0.65, -0.05, 1.40, 1.45, 9.02, 9.45, M.BLACK); B.box(-0.65, -0.05, 1.385, 1.40, 8.98, 9.45, M.BLACK);                 // slim hood
  B.box(0.1, 0.9, 1.20, 1.212, 9.415, 9.43, M.BLACK); B.box(0.35, 0.85, 1.10, 1.112, 9.30, 9.43, M.BLACK); B.box(0.35, 0.36, 1.112, 1.20, 9.41, 9.43, M.BLACK); B.box(0.84, 0.85, 1.112, 1.20, 9.41, 9.43, M.BLACK);   // rail + shelf
  B.box(-1.17, 1.15, 0.1, 0.86, 6.95, 7.70, M.WOODCAB, true); B.box(-1.17, 1.11, 0, 0.1, 7.0, 7.65, M.BLACK); B.box(-1.17, 1.20, 0.86, 0.90, 6.90, 7.75, M.STONE);   // island: one end against the refuge-room wall
  hseam('x', 0.44, 0.98, 0.80, 8.85, -1);                                                                                   // built-in dishwasher (panel-ready) left of the sink: option
  { // option: entrance middle door, manual 3-panel slider on the corridor face; opens toward bedroom 1 and parks clear of the passage on the corridor wall
    const fm = M.FRAME; B.box(5.6, 5.63, 0, 2.15, 5.15, 5.27, fm); B.box(7.01, 7.04, 0, 2.15, 5.15, 5.27, fm); B.box(5.6, 7.04, 2.11, 2.15, 5.15, 5.27, fm);
    B.box(5.6, 8.27, 2.11, 2.15, 5.02, 5.13, fm); B.box(5.63, 7.01, 0, 0.006, 5.03, 5.13, M.STEEL);                       // head rail runs on along the wall, floor guide in the opening
    [5.112, 5.078, 5.044].forEach((z, i) => { const a = 5.615 + i * 0.47, b = a + 0.50;                                    // closed: side by side; open: stacked beyond the jamb
      dyn(6.32, 5.08, (L) => { L.box(a, a + 0.028, 0.006, 2.11, z - 0.012, z + 0.012, fm); L.box(b - 0.028, b, 0.006, 2.11, z - 0.012, z + 0.012, fm); L.box(a, b, 2.07, 2.11, z - 0.012, z + 0.012, fm); L.box(a, b, 0.006, 0.09, z - 0.012, z + 0.012, fm);
        if (i === 0) L.box(a + 0.005, a + 0.02, 0.95, 1.2, z - 0.03, z - 0.012, M.STEEL); },
        { px: a, pz: z, sx: 7.07 + i * 0.03 - a, sz: 0, glass: [[[a + 0.028, 0.09, z], [b - 0.028, 0.09, z], [b - 0.028, 2.07, z], [a + 0.028, 2.07, z]]] }); }); }
  { // option: ceiling system air conditioners (1-way cassettes) x 5 — living, dining, three bedrooms
    const ac = (x, z, w, d, dir) => { const y = ceilY(x, z); B.box(x - w / 2, x + w / 2, y - 0.022, y, z - d / 2, z + d / 2, M.FRAME);
      B.box(x - w / 2 + 0.07, x + w / 2 - 0.07, y - 0.024, y - 0.022, z + dir * d * 0.26 - 0.028, z + dir * d * 0.26 + 0.028, M.BLACK);
      B.box(x - w / 2 + 0.05, x + w / 2 - 0.05, y - 0.0235, y - 0.022, z - dir * d * 0.18 - 0.11, z - dir * d * 0.18 + 0.11, M.CEIL); };
    ac(0, 0.67, 1.2, 0.42, 1); ac(0, 5.6, 1.0, 0.4, 1); ac(3.8, 0.85, 0.95, 0.4, 1); ac(6.8, 0.85, 0.95, 0.4, 1); ac(10.3, 1.95, 0.95, 0.4, 1); }
  // ── model-house finishes (official cyber model house, 84B): art wall, tray ceiling, wall pad
  B.box(-2.25, -2.236, 0.075, H, 0.38, 5.05, M.ARTWALL);
  for (const [x0, x1, z0, z1] of [[-2.25, 2.25, 0.38, 0.95], [-2.25, 2.25, 4.45, 5.05], [-2.25, -1.68, 0.95, 4.45], [1.68, 2.25, 0.95, 4.45]]) B.box(x0, x1, H - 0.10, H, z0, z1, M.CEIL);
  B.box(2.238, 2.25, 1.27, 1.40, 2.62, 2.88, M.BLACK); B.box(2.24, 2.25, 1.15, 1.23, 3.05, 3.13, M.DOOR); B.box(2.24, 2.25, 1.15, 1.23, 3.17, 3.25, M.DOOR);
  // ── ceiling light panels
  const lamps = [...ROOMS.map(r => r.lamp), HALL_LAMP, KITCHEN_LAMP];
  lamps.forEach((l, i) => { if (i === 4) return; B.box(l[0] - l[2], l[0] + l[2], H - 0.012, H + 0.001, l[1] - l[3], l[1] + l[3], M.LAMP); });   // the corridor is lit by downlights, not a strip
  B.box(-0.52, 0.52, H - 0.014, H, 2.665, 2.735, M.CEIL);          // the living-room light is two panels
  for (const l of lamps.slice(0, 4)) { const t = 0.018; for (const [a, b, c, d] of [[l[0] - l[2] - t, l[0] + l[2] + t, l[1] - l[3] - t, l[1] - l[3]], [l[0] - l[2] - t, l[0] + l[2] + t, l[1] + l[3], l[1] + l[3] + t], [l[0] - l[2] - t, l[0] - l[2], l[1] - l[3], l[1] + l[3]], [l[0] + l[2], l[0] + l[2] + t, l[1] - l[3], l[1] + l[3]]]) B.box(a, b, H - 0.016, H, c, d, M.FRAME); }   // slim white bezels
  for (const [x, z] of DOWNLIGHTS) { const soff = (z > 4.45 && z < 5.05 && Math.abs(x) < 2.25) ? 0.10 : 0, y = FY + H - soff;
    const c = new THREE.CircleGeometry(0.04, 20); c.rotateX(Math.PI / 2); c.translate(x, y - 0.003, z); B.geo(c, M.LAMP);
    const r = new THREE.RingGeometry(0.04, 0.058, 20); r.rotateX(Math.PI / 2); r.translate(x, y - 0.005, z); B.geo(r, M.FRAME); }
  // ── ceiling fittings and wall plates
  for (const [x, z] of [[1.95, 4.2], [1.9, 8.4], [3.8, 1.2], [6.8, 1.2], [11.4, 2.2], [6.3, 6.0], [4.4, 8.6]]) vent(x, z);
  for (const [x, z] of [[-1.1, 1.6], [1.1, 1.6], [-1.1, 3.8], [1.1, 3.8], [0, 7.1], [1.7, 8.5], [-0.6, 8.5], [3.8, 2.6], [6.8, 2.6], [10.3, 2.4], [10.3, 4.3], [4.5, 4.4], [6.4, 4.4], [6.3, 7.3], [11.2, 7.6]]) sprk(x, z);
  for (const [x, z] of [[1.25, 2.7], [3.1, 1.9], [6.1, 1.9], [9.5, 3.3], [0.0, 7.45]]) smoke(x, z);
  plate('z', 5.98, -1.69, 1.25, 0.085, 0.12, M.BLACK); plate('z', 5.86, -1.69, 1.25, 0.075, 0.12, M.FRAME);                      // thermostat + switch by the side window
  plate('x', 3.62, 3.85, 1.2, 0.075, 0.12, M.FRAME, -1); plate('x', 7.13, 3.85, 1.2, 0.075, 0.12, M.FRAME, -1); plate('z', 3.84, 8.5, 1.2, 0.075, 0.12, M.FRAME);   // bedroom switches
  plate('x', 3.62, 3.93, 1.2, 0.075, 0.12, M.FRAME); plate('x', 4.33, 5.13, 1.2, 0.075, 0.12, M.FRAME, -1); plate('z', 7.1, 5.615, 1.2, 0.075, 0.12, M.FRAME);         // corridor, bath, entrance
  for (const [ax, a, c, d] of [['z', 1.5, 2.25, -1], ['z', 3.6, 2.25, -1], ['z', 1.2, 2.46, 1], ['z', 1.2, 5.15, -1], ['z', 1.2, 5.30, 1], ['z', 1.2, 8.29, -1], ['x', 11.8, 4.98, -1], ['x', 9.2, 4.98, -1]]) plate(ax, a, c, 0.3, 0.075, 0.12, M.FRAME, d);   // sockets
  // ── window frames
  const frame = (x0, x1, y0, y1, z, n, slideI = -1) => {
    const t = 0.055, d0 = z - 0.045, d1 = z + 0.045;
    B.box(x0, x1, y0, y0 + t, d0, d1, M.FRAME); B.box(x0, x1, y1 - t, y1, d0, d1, M.FRAME); B.box(x0, x0 + t, y0, y1, d0, d1, M.FRAME); B.box(x1 - t, x1, y0, y1, d0, d1, M.FRAME);
    for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n); B.box(x - 0.028, x + 0.028, y0, y1, d0, d1, M.FRAME); }
    for (let i = 0; i < n; i++) { const a = lerp(x0, x1, i / n) + (i ? 0.028 : t), b = lerp(x0, x1, (i + 1) / n) - (i < n - 1 ? 0.028 : t), s = 0.04, o = (i % 2 ? 0.012 : -0.012), e0 = z - 0.02 + o, e1 = z + 0.02 + o;
      const sash = (B) => { B.box(a, b, y0 + t, y0 + t + s, e0, e1, M.FRAME); B.box(a, b, y1 - t - s, y1 - t, e0, e1, M.FRAME); B.box(a, a + s, y0 + t, y1 - t, e0, e1, M.FRAME); B.box(b - s, b, y0 + t, y1 - t, e0, e1, M.FRAME);
        if (i > 0) { const hy = Math.max(y0 + 0.25, 1.05); B.box(a + 0.008, a + 0.03, hy, hy + 0.11, e1, e1 + 0.022, M.FRAME); } };
      if (i === slideI) dyn((x0 + x1) / 2, z, sash, { px: a, pz: z, sx: -(b - a) + 0.06, sz: 0, glass: [[[a + s, y0 + t + s, z + o], [b - s, y0 + t + s, z + o], [b - s, y1 - t - s, z + o], [a + s, y1 - t - s, z + o]]] }); else sash(B); }
  };
  frame(-1.83, 1.80, 0.18, 2.24, 0.16, 3); frame(2.88, 4.70, 0.85, 2.20, 0.16, 2); frame(5.87, 7.71, 0.85, 2.20, 0.16, 2); frame(8.77, 10.28, 0.06, 2.20, 0.10, 2); frame(8.60, 10.36, 0.0, 2.20, 1.55, 2, 1);
  B.box(2.88, 4.70, 0.83, 0.85, 0.2, 0.42, M.STONE); B.box(5.87, 7.71, 0.83, 0.85, 0.2, 0.42, M.STONE);  // sills
  // glass balustrade top rails (living room & balcony)
  B.box(-1.83, 1.80, 1.155, 1.17, 0.025, 0.045, M.STEEL); B.box(8.77, 10.28, 1.155, 1.17, 0.025, 0.045, M.STEEL);

  return {geometry:B.build(), lamps, GQ};
}

function buildHome(floorLight) {
  const {geometry,lamps,GQ}=buildHomeGeometry(), grp=new THREE.Group();
  const U2 = {
    ...U, uFloorLight:{value:floorLight}, uWin: { value: ROOMS.map(r => new THREE.Vector4(...r.win)) }, uRoom: { value: ROOMS.map(r => new THREE.Vector4(...r.box)) },
    uRoomAmb: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) }, uLamp: { value: lamps.map(l => new THREE.Vector4(...l)) }, uLampOn: { value: [0, 0, 0, 0, 0, 0] }, uDL: { value: DOWNLIGHTS.map(([x, z]) => new THREE.Vector3(x, FY + CEIL - ((z > 4.45 && z < 5.05 && Math.abs(x) < 2.25) ? 0.10 : 0) - 0.01, z)) },
    uWinSky: { value: new THREE.Vector3() }, uWinGnd: { value: new THREE.Vector3() }, uLampL: { value: new THREE.Vector3() }, uFY: { value: FY }, uCeil: { value: CEIL }, uBoost: { value: 1 }, uBoostSun: { value: 1 }, uGlassT: { value: 0.74 }, uWB: { value: new THREE.Vector3(1, 1, 1) },
    uSunIn: { value: new THREE.Vector3() }, uWood: { value: paintWood() }, uMarble: { value: paintMarble() },
    uOccA: { value: [] }, uOccB: { value: [] }, uNOcc: { value: 0 },
  };
  const occ = HOME.occ.slice(0, NOCC); while (occ.length < NOCC) occ.push([0, -999, 0, 0, -999, 0]);
  U2.uOccA.value = occ.map(o => new THREE.Vector3(o[0], o[1], o[2])); U2.uOccB.value = occ.map(o => new THREE.Vector3(o[3], o[4], o[5])); U2.uNOcc.value = Math.min(HOME.occ.length, NOCC);
  if (HOME.occ.length > NOCC) console.warn('occluders', HOME.occ.length);
  HOME.uni = U2;
  const mat = new THREE.ShaderMaterial({ uniforms: U2, vertexShader: HOME_VS, fragmentShader: HOME_FS, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, mat); mesh.frustumCulled = false; grp.add(mesh);

  // glass panes (blended): reflection of the room + faint tint
  const gp = [], gi = []; let nv = 0;
  const pane = (x0, x1, y0, y1, z) => { gp.push(x0, FY + y0, z, x1, FY + y0, z, x1, FY + y1, z, x0, FY + y1, z); gi.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4; };
  pane(-1.83, 1.80, 0.18, 2.24, 0.16); pane(2.88, 4.70, 0.85, 2.20, 0.16); pane(5.87, 7.71, 0.85, 2.20, 0.16); pane(8.77, 10.28, 0.06, 2.20, 0.10); pane(8.60, 9.48, 0.0, 2.20, 1.55);
  pane(-1.83, 1.80, 0.18, 1.16, 0.035); pane(8.77, 10.28, 0.06, 1.16, 0.035);
  for (const q of GQ) { for (const v of q) gp.push(v[0], FY + v[1], v[2]); gi.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4; }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gp), 3)); gg.setIndex(gi);
  const gmat = new THREE.ShaderMaterial({
    uniforms: U2, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`precision highp float; varying vec3 vW; uniform vec3 uCamPos, uRoomAmb[5], uLampL; uniform vec4 uLamp[6]; uniform float uLampOn[6]; uniform float uFY, uCeil, uBoost, uWet, uTime; uniform sampler2D uNoise;
      void main(){ vec3 V=normalize(uCamPos-vW); vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(dot(n,V)<0.0) n=-n; float c=abs(dot(n,V)); bool zp=abs(n.z)>0.7; float fr=0.07+0.93*pow(1.0-c,5.0);
        vec3 R=reflect(-V,n); vec3 refl=uRoomAmb[0]*1.6;
        if(zp && V.z>0.0 && R.y>0.02){ for(int i=0;i<6;i++){ if(uLampOn[i]<0.5) continue; vec4 lp=uLamp[i]; float t=(uFY+uCeil-vW.y)/R.y; vec3 h=vW+R*t; vec2 q=abs(h.xz-lp.xy)-lp.zw; refl+=uLampL*smoothstep(0.02,-0.02,max(q.x,q.y)); } }
        vec3 col=refl*fr*min(uBoost,14.0)*(vW.z<0.1?0.10:1.0);
        float a=zp?0.05:0.07;
        // rain on the glass
        if(uWet>0.01 && vW.z<0.3){ vec2 g=vec2(vW.x*9.0,vW.y*2.2+uTime*0.6*(0.5+texture2D(uNoise,vec2(floor(vW.x*9.0)*0.13,0.5)).r)); float d=texture2D(uNoise,vec2(floor(g.x)*0.071,g.y*0.05)).g; float drop=smoothstep(0.62,0.7,d)*smoothstep(0.5,0.2,abs(fract(g.x)-0.5)); a+=drop*0.10*uWet; col+=vec3(0.6,0.65,0.7)*drop*0.02*uWet*uBoost*length(uRoomAmb[0])*20.0; }
        gl_FragColor=vec4(col,a); }`,
  });
  const glass = new THREE.Mesh(gg, gmat); glass.frustumCulled = false; glass.renderOrder = 10; grp.add(glass);
  for (const d of HOME.doors) { d.mesh.material.dispose(); d.mesh.material = mat; grp.add(d.mesh);
    if (d.glass) { const p = [], ix = []; d.glass.forEach((q, k) => { for (const v of q) p.push(v[0] - d.px, FY + v[1], v[2] - d.pz); ix.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); });
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3)); g2.setIndex(ix); const gm = new THREE.Mesh(g2, gmat); gm.frustumCulled = false; gm.renderOrder = 10; d.mesh.add(gm); } }
  HOME.group = grp; HOME.mesh = mesh;
  return grp;
}

function releaseHome() {
  const materials = new Set();
  HOME.group.traverse(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) materials.add(mesh.material);
  });
  for (const material of materials) material.dispose();
  HOME.uni.uWood.value.dispose();
  HOME.uni.uMarble.value.dispose();
  HOME.group.removeFromParent();
  HOME.group = HOME.mesh = HOME.uni = null;
  for (const items of [HOME.occ, HOME.solid, HOME.walls, HOME.doors]) items.length = 0;
}
