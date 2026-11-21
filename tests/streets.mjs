// Check the geometry shipped to Pages without a WebGL context or Python dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const file=fs.readFileSync(new URL('../data/streets.glb',import.meta.url));
assert.equal(file.readUInt32LE(0),0x46546c67);
const jsonLength=file.readUInt32LE(12);
const gltf=JSON.parse(file.subarray(20,20+jsonLength));
const packedFile=fs.readFileSync(new URL('../data/streets.meshopt.glb',import.meta.url));
const packed=JSON.parse(packedFile.subarray(20,20+packedFile.readUInt32LE(12)));
assert.equal(packed.asset.extras.sourceSHA256,createHash('sha256').update(file).digest('hex'),
  'Regenerate the compressed street mesh after changing the source GLB');
assert.deepEqual(packed.scenes,gltf.scenes);
assert.equal(JSON.stringify(packed.accessors),JSON.stringify(gltf.accessors));
assert.ok(packed.bufferViews.every(v=>v.extensions?.EXT_meshopt_compression));
const binary=28+jsonLength;
assert.equal(gltf.images,undefined);
const batches={};
function attribute(id) {
  const a=gltf.accessors[id], v=gltf.bufferViews[a.bufferView];
  const type=a.componentType===5126 ? Float32Array : Uint32Array;
  return new type(file.buffer,file.byteOffset+binary+v.byteOffset,a.count*(a.type==='VEC3'?3:1));
}
for (const n of gltf.nodes) {
  const primitive=gltf.meshes[n.mesh].primitives[0], p=attribute(primitive.attributes.POSITION);
  const ix=attribute(primitive.indices), tris=[];
  for(let i=0;i<ix.length;i+=3){
    tris.push([0,1,2].map(k=>p.subarray(3*ix[i+k],3*ix[i+k]+3)));
  }
  batches[n.name]=tris;
}
function heights(names,x,z) {
  const hits=[];
  for (const name of names) for (const [a,b,c] of batches[name]) {
    if (x<Math.min(a[0],b[0],c[0])-1e-5 || x>Math.max(a[0],b[0],c[0])+1e-5 ||
        z<Math.min(a[2],b[2],c[2])-1e-5 || z>Math.max(a[2],b[2],c[2])+1e-5) continue;
    const dx=x-a[0], dz=z-a[2], bx=b[0]-a[0], bz=b[2]-a[2], cx=c[0]-a[0], cz=c[2]-a[2];
    const det=bx*cz-bz*cx;
    if (Math.abs(det)<1e-9) continue;
    const u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
    if (Math.min(u,v,1-u-v)>=-1e-5) hits.push(a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
  }
  return hits;
}
for(const name of ['asphalt','refuge','curbFace','white','redAsphalt','apron','mainDrive','westDrive','terrainRemainder'])
  assert.ok(batches[name]?.length>0,name);
const {gates,terrainFaces}=gltf.scenes[0].extras;
assert.ok(terrainFaces.length>0);
assert.ok(batches.curbFace.some(tri=>Math.max(...tri.map(a=>a[1]))-Math.min(...tri.map(a=>a[1]))>0.14));
const base=['asphalt','redAsphalt','mainDrive','westDrive','apron'];
function checkPath(path,name,offsets,endReserve=0) {
  let remaining=path.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p[0]-path[k][0],p[1]-path[k][1]),0);
  for(let i=1;i<path.length;i++) {
    const a=path[i-1], b=path[i], dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    for(let t=0;t<len;t+=0.55){
      if (remaining-t<endReserve) break;
      for (const offset of offsets) {
        const x=a[0]+(dx*t-dz*offset)/len,z=a[1]+(dz*t+dx*offset)/len;
        const deck=heights(base,x,z);
        assert.ok(deck.length,name+' road gap at '+[x,z]);
        const barriers=heights(['sidewalk','refuge','entranceWalk','granite','terrainRemainder'],x,z);
        assert.ok(barriers.every(y=>y<=Math.max(...deck)+0.025),name+' obstruction at '+[x,z]);
      }
    }
    remaining-=len;
  }
}
for (const [name,gate] of Object.entries(gates)) {
  checkPath(gate.axis,name,[-1.6,0,1.6],name==='main'?6.4:1);
  for(const lateral of [-1.7,1.7]) {
    const [x,z]=gate.mouth,dx=Math.sin(gate.heading),dz=-Math.cos(gate.heading);
    let prev=null;
    for(let d=-2;d<5;d+=0.25){
      const y=Math.max(...heights(base,x+dx*d-dz*lateral,z+dz*d+dx*lateral));
      assert.ok(Number.isFinite(y));
      if(prev!==null) assert.ok(Math.abs(y-prev)<(name==='west'?0.03:0.09),name+' height discontinuity');
      prev=y;
    }
  }
}
// Four approach movements, sampled with the rear axle as the reference.
// Both bumpers and both sides of a 4.6 x 1.9 m car must clear the sidewalk.
function overlap(a,b) {
  const diff=[b.x-a.x,b.z-a.z];
  for(const [dx,dz] of [[a.dx,a.dz],[-a.dz,a.dx],[b.dx,b.dz],[-b.dz,b.dx]]) {
    const span=r=>r.long*Math.abs(dx*r.dx+dz*r.dz)+r.wide*Math.abs(dz*r.dx-dx*r.dz);
    if(Math.abs(diff[0]*dx+diff[1]*dz)>=span(a)+span(b)) return false;
  }
  return true;
}
for (const [name,gate] of Object.entries(gates)) {
  const footprints={in:[],out:[]};
  for (const [direction,points] of Object.entries(gate.turns)) {
    const route=name+' '+direction;
    let turn=0,prev=null,lastLength=0;
    for(let i=1;i<points.length;i++) {
      const [ax,az]=points[i-1], [bx,bz]=points[i];
      const len=Math.hypot(bx-ax,bz-az);
      const dx=(bx-ax)/len,dz=(bz-az)/len;
      if (prev) {
        const delta=Math.atan2(prev[0]*dz-prev[1]*dx,prev[0]*dx+prev[1]*dz);
        turn+=delta;
        assert.ok(Math.abs(delta)<(len+lastLength)/(2*4.6),route+' steering radius below 4.6 m');
      }
      lastLength=len;
      prev=[dx,dz];
      for(let d=0;d<len;d+=0.6) {
        footprints[direction].push({x:ax+(d+1.3)*dx,z:az+(d+1.3)*dz,dx,dz,long:2.3,wide:0.95});
      }
      for(let d=0;d<len;d+=0.6) for(const overhang of [-1,1.3,3.6]) for(const side of [-0.95,0.95]) {
        const x=ax+(d+overhang)*dx-side*dz,z=az+(d+overhang)*dz+side*dx;
        const deck=heights(base,x,z);
        assert.ok(deck.length,route+' wheel or bumper leaves the paved surface at '+[x,z]);
        const intrusions=heights(['granite','sidewalk','entranceWalk'],x,z);
        assert.ok(intrusions.every(y=>y<=Math.max(...deck)+0.025),route+' curb in swept path at '+[x,z]);
      }
    }
    assert.ok(turn>0.4 && turn<Math.PI,route+' must turn right');
  }
  assert.ok(!footprints.in.some(a=>footprints.out.some(b=>overlap(a,b))),name+' turning bodies overlap');
  if(name==='west') {
    const [x,z]=gate.gate;
    const island={x,z,dx:Math.sin(gate.gateHeading),dz:-Math.cos(gate.gateHeading),long:2,wide:0.4};
    const walls=gate.fanWalls.map(([[ax,az],[bx,bz]])=>{
      const len=Math.hypot(bx-ax,bz-az);
      return {x:(ax+bx)/2,z:(az+bz)/2,dx:(bx-ax)/len,dz:(bz-az)/len,long:len/2,wide:0.35};
    });
    assert.ok(walls.length>0);
    const obstacles=[island,...walls];
    assert.ok(![...footprints.in,...footprints.out].some(r=>obstacles.some(b=>overlap(r,b))),
      'reader island or canopy wall blocks a turning car');
  }
}
const ctx=vm.createContext({JUNCTION:{crosswalks:[]},WORLD:{frontages:Object.values(gates)},
  lerp:(a,b,f)=>a+(b-a)*f,clamp:(v,a,b)=>Math.min(b,Math.max(a,v))});
vm.runInContext(fs.readFileSync(new URL('../src/19_junction.js',import.meta.url),'utf8'),ctx);
for(const [name,g] of Object.entries(gates)) {
  const {origin:[x,z],forward:[dx,dz],edges,start}=g.carriageway;
  const [lo,hi]=edges[-start],median=lo+(hi-lo)*0.60;
  const pose=ctx.frontageTrafficPose(x,z,dx,dz,3,1);
  const lateral=p=>-(p[0]-x)*dz+(p[1]-z)*dx;
  assert.ok(lateral(pose)<hi-0.95 && lateral(pose)>(name==='main'?median:(lo+hi)/2));
  const reverse=ctx.frontageTrafficPose(x,z,dx,dz,-3,-1);
  if(name==='main') assert.ok(lateral(reverse)<median && lateral(reverse)>lo+0.95);
  else assert.equal(reverse,null);
}
const ring=gates.main.axis.at(-1);
// Follow the exit from the roundabout to the main garage portal.
const garage=gates.main.garageAxis;
checkPath(garage.filter(p=>Math.hypot(p[0]-ring[0],p[1]-ring[1])>5.7),'main garage',[-1.5,0,1.5],0.3);
for(let i=0;i<64;i++){
  const a=i*Math.PI/32;
  assert.ok(heights(['mainDrive'],ring[0]+8*Math.cos(a),ring[1]+8*Math.sin(a)).length);
}
console.log('Checked four right-hand turns, sedan body clearance, steering radius, approach elevations and the main roundabout.');
