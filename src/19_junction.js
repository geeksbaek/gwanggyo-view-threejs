const JUNCTION_CROSSWALKS = JUNCTION.crosswalks;

function withinJunctionRoad(x,z) {
  return x>=30 && x<=260 && z>=-110 && z<=110 && pip((x-30)*5,(z+110)*5,JUNCTION.outline);
}

// Sample the rendered terrain triangles, including their diagonal. Vehicle
// wheels and the baked road deck use the same vertical datum.
function streetDeckY(x,z) {
  const grid=WORLD.terrain.geometry.attributes.position;
  const n=Math.round(Math.sqrt(grid.count)), scale=(n-1)/(2*W.HN);
  const u=(x+W.HN)*scale, v=(z+W.HN)*scale;
  const i=Math.floor(u), j=Math.floor(v), dx=u-i, dz=v-j, k=j*n+i;
  const b=grid.getY(k+1), c=grid.getY(k+n);
  const y=dx+dz<=1 ? (1-dx-dz)*grid.getY(k)+dx*b+dz*c :
    (dx+dz-1)*grid.getY(k+n+1)+(1-dz)*b+(1-dx)*c;
  const west=WORLD.gates?.west;
  if (west) {
    const g=west.grade, mx=x-west.mouth[0], mz=z-west.mouth[1], r=Math.hypot(mx,mz);
    if (r<g.outer && inStreetPolygon(x,z,g.polygon)) {
      const t=Math.min(1,(g.outer-r)/(g.outer-g.inner));
      return lerp(y+0.075,g.height+g.slope*(mx*g.tangent[0]+mz*g.tangent[1]),t*t*(3-2*t));
    }
  }
  return y+0.075;
}

// Place through traffic on the same surveyed cross-sections as the paint.
function frontageTrafficPose(x,z,dx,dz,laneOffset,dir) {
  for (const gate of WORLD.frontages) {
    const road=gate.carriageway,[tx,tz]=road.forward;
    const mx=x-road.origin[0],mz=z-road.origin[1];
    const s=mx*tx+mz*tz-road.start,k=Math.floor(s);
    if (k<0 || k+1>=road.edges.length) continue;
    const alignment=(dx*tx+dz*tz)*dir;
    if (Math.abs(alignment)<0.83 || (road.oneWay && alignment<0)) continue;
    const [a,b]=road.edges[k],[c,d]=road.edges[k+1];
    const lateral=mz*tx-mx*tz, f=s-k;
    if (lateral<lerp(a,c,f)-1.8 || lateral>lerp(b,d,f)+1.8) continue;
    // Stable lane choice over the entire bend, including OSM way splits.
    const outer=laneOffset*dir>2.2;
    const frac=road.oneWay ? (laneOffset*dir>0 ? 0.75 : 0.25) :
      alignment>0 ? (outer?0.90:0.70) : (outer?0.10:0.50);
    const low=lerp(a,b,frac), high=lerp(c,d,frac);
    const w=clamp(Math.min(s,road.edges.length-1-s)/road.tieIn,0,1);
    const blend=w*w*(3-2*w), shift=blend*(lerp(low,high,f)-lateral);
    // In the transition, blend the heading with the original path as well.
    const sign=Math.sign(alignment)*dir, slope=high-low;
    return [x-tz*shift,z+tx*shift,lerp(dx,sign*(tx-tz*slope),blend),
            lerp(dz,sign*(tz+tx*slope),blend)];
  }
  return null;
}

function prepareStreets(group,nightMap) {
  // Base colours in linear space. All variation is evaluated in metres.
  const finishes={
    mainDrive:[0.14,0.136,0.13],westDrive:[0.14,0.136,0.13],apron:[0.34,0.31,0.27],
    entranceWalk:[0.36,0.32,0.27],retaining:[0.34,0.32,0.30],
    asphalt:[0.142,0.136,0.127], redAsphalt:[0.25,0.089,0.071],
    sidewalk:[0.36,0.32,0.27], refuge:[0.41,0.34,0.26], granite:[0.44,0.43,0.40],
    curbFace:[0.31,0.30,0.28], garden:[0.105,0.145,0.065],
    white:[0.77,0.76,0.70], yellow:[0.84,0.56,0.105], blue:[0.075,0.33,0.44],
  };
  group.name='streets';
  WORLD.gates=group.userData.gates;
  WORLD.frontages=Object.values(WORLD.gates);
  WORLD.entranceMeshes=[];
  const terrain=WORLD.terrain.geometry;
  const cut=new Set(group.userData.terrainFaces);
  terrain.setIndex(new THREE.BufferAttribute(terrain.index.array.filter((_,i)=>!cut.has(Math.floor(i/3))),1));
  group.traverse(mesh=>{
    if (!mesh.isMesh) return;
    const kind=mesh.name, paint=['white','yellow','blue'].includes(kind);
    mesh.geometry.computeVertexNormals();
    const previous=mesh.material;
    if (kind==='terrainRemainder') {
      const pos=mesh.geometry.attributes.position, uv=[];
      for (let i=0;i<pos.count;i++) uv.push((pos.getX(i)+W.HN)/(2*W.HN),(pos.getZ(i)+W.HN)/(2*W.HN));
      mesh.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      mesh.material=WORLD.terrain.material;
      return;
    }
    if (['mainDrive','westDrive','apron'].includes(kind)) WORLD.entranceMeshes.push(mesh);
    mesh.material=new THREE.ShaderMaterial({
      uniforms:{...U,uBase:{value:new THREE.Vector3(...finishes[kind])},uRoadNight:{value:nightMap}},
      defines:{PAVERS:Number(['refuge','sidewalk','apron','entranceWalk'].includes(kind)),PAINT:Number(paint)},
      side:['curbFace','retaining'].includes(kind) ? THREE.DoubleSide : THREE.FrontSide,
      polygonOffset:true, polygonOffsetFactor:paint ? -2 : -1, polygonOffsetUnits:paint ? -3 : -1,
      vertexShader:`varying vec3 vW,vN;
        void main(){vW=(modelMatrix*vec4(position,1.)).xyz; vN=normal;
        gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}`,
      fragmentShader:`precision highp float;
        ${GLSL_COMMON}
        varying vec3 vW,vN; uniform vec3 uBase; uniform sampler2D uRoadNight;
        void main(){
          vec3 n=normalize(gl_FrontFacing?vN:-vN);
          float grain=texture2D(uNoise,vW.xz*1.8).r;
          float wear=texture2D(uNoise,vW.xz*0.004).g;
          float patina=texture2D(uNoise,vW.xz*0.0006).r;
          vec3 base=uBase*(0.58+0.30*wear+0.23*grain+0.18*patina);
          #if PAVERS
            vec2 tile=vW.xz/vec2(0.44,0.22); tile.x+=0.5*mod(floor(tile.y),2.);
            vec2 uv=abs(fract(tile)-0.5);
            float seam=smoothstep(0.44,0.50,max(uv.x,uv.y));
            base*=1.-0.29*seam*(1.-smoothstep(0.12,0.65,max(fwidth(tile.x),fwidth(tile.y))));
          #endif
          #if PAINT
            base*=0.80+0.20*smoothstep(0.30,0.55,grain);
          #endif
          base=mix(base*(1.-0.32*uWet),vec3(0.82,0.86,0.89),uSnow*max(n.y,0.)*0.93);
          vec3 V=normalize(uCamPos-vW), R=reflect(-V,n);
          vec3 col=lit(base,n,shadowAt(vW,0.0011),1.);
          col+=uWet*sampleSky(vec3(R.x,max(R.y,0.02),R.z))*(0.03+0.37*pow(1.-max(dot(n,V),0.),5.));
          col+=texture2D(uRoadNight,(vW.xz+2048.)/4096.).rgb*uNight*${(LAMP*0.42).toFixed(5)};
          gl_FragColor=vec4(col,1.);
        }`,
    });
    previous.dispose();
  });
  return group;
}

function inStreetPolygon(x,z,rings) {
  return pip(x,z,rings[0]) && !rings.slice(1).some(hole=>pip(x,z,hole));
}

function onEntranceDrive(x,z,includeFrontage=false) {
  for (const gate of Object.values(WORLD.gates)) {
    if (Math.hypot(x-gate.gate[0],z-gate.gate[1])>65) continue;
    if (gate.drivePolygons.some(poly=>inStreetPolygon(x,z,poly))) return true;
    if (includeFrontage && gate.frontagePolygons.some(poly=>inStreetPolygon(x,z,poly))) return true;
  }
  return false;
}

function entranceFloor(x,z) {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
  return ray.intersectObjects(WORLD.entranceMeshes,false)[0]?.point.y ?? streetDeckY(x,z);
}
