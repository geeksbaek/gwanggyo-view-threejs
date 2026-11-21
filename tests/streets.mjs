// Check the geometry shipped to Pages without a WebGL context or Python dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=fs.readFileSync(new URL('../data/streets.glb',import.meta.url));
assert.equal(file.readUInt32LE(0),0x46546c67);
const jsonLength=file.readUInt32LE(12);
const gltf=JSON.parse(file.subarray(20,20+jsonLength));
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
const ring=gates.main.axis.at(-1);
// Follow the exit from the roundabout to the main garage portal.
const garage=gates.main.garageAxis;
checkPath(garage.filter(p=>Math.hypot(p[0]-ring[0],p[1]-ring[1])>5.7),'main garage',[-1.5,0,1.5],0.3);
for(let i=0;i<64;i++){
  const a=i*Math.PI/32;
  assert.ok(heights(['mainDrive'],ring[0]+8*Math.cos(a),ring[1]+8*Math.sin(a)).length);
}
console.log('Checked elevation continuity and clear lanes from both public streets, the main roundabout and the west garage approach.');
