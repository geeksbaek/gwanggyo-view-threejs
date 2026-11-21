// Lossless glTF buffer packing. Run after streets.py with meshoptimizer 0.20.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const dir = path.resolve(__dirname, '../data');

async function pack() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const source = fs.readFileSync(path.join(dir, 'streets.glb'));
  const length = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20,20+length));
  gltf.asset.extras = {...gltf.asset.extras, sourceSHA256:createHash('sha256').update(source).digest('hex')};
  const input = source.subarray(28+length);
  const chunks = [];
  let size = 0;
  for (const accessor of gltf.accessors) {
    const view = gltf.bufferViews[accessor.bufferView];
    const bytes = input.subarray(view.byteOffset,view.byteOffset+view.byteLength);
    const stride = view.byteLength/accessor.count;
    const mode = accessor.type==='VEC3' ? 'ATTRIBUTES' : 'INDICES';
    const encoded = MeshoptEncoder.encodeGltfBuffer(bytes,accessor.count,stride,mode);
    const decoded = new Uint8Array(bytes.length);
    MeshoptDecoder.decodeGltfBuffer(decoded,accessor.count,stride,encoded,mode);
    if (!bytes.equals(Buffer.from(decoded))) throw Error('Geometry round-trip failed');
    view.buffer = 1;
    view.extensions = {EXT_meshopt_compression:{buffer:0,byteOffset:size,byteLength:encoded.length,
      byteStride:stride,count:accessor.count,mode}};
    const pad = (4-encoded.length%4)%4;
    chunks.push(encoded,Buffer.alloc(pad));
    size += encoded.length+pad;
  }
  gltf.buffers = [{byteLength:size},{byteLength:input.length,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  gltf.extensionsUsed = gltf.extensionsRequired = ['EXT_meshopt_compression'];
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = (json.length+3)&~3;
  const header = Buffer.alloc(20+padded+8,0x20);
  header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(header.length+size,8);
  header.writeUInt32LE(padded,12); header.write('JSON',16); json.copy(header,20);
  header.writeUInt32LE(size,20+padded); header.writeUInt32LE(0x004e4942,24+padded);
  fs.writeFileSync(path.join(dir,'streets.meshopt.glb'),Buffer.concat([header,...chunks]));
}
pack().catch(e=>{console.error(e);process.exitCode=1});
