// Export the same static triangles used by Chrome, excluding glass and moving doors.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const dir=process.argv[2];
const LIVING_FURNITURE=JSON.parse(fs.readFileSync(new URL('../data/living-furniture.json',import.meta.url)));
const ctx=vm.createContext({LIVING_FURNITURE,THREE,RoundedBoxGeometry,URLSearchParams,location:{search:''},console});
for(const name of ['00_core','30_home'])
  vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),ctx);
const {geometry,lamps}=ctx.buildHomeGeometry();
const save=(name,array)=>fs.writeFileSync(path.join(dir,name),Buffer.from(array.buffer,array.byteOffset,array.byteLength));
save('position.f32',geometry.attributes.position.array);
save('index.u32',Uint32Array.from(geometry.index.array));
save('material.u8',Uint8Array.from(geometry.attributes.aM.array));
fs.writeFileSync(path.join(dir,'unit.json'),JSON.stringify({...vm.runInContext('({floor:FY,ceiling:CEIL,material:MAT})',ctx),lamps}));
