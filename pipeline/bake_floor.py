"""blender -b -t 4 --python-exit-code 1 --python pipeline/bake_floor.py"""
import json
from pathlib import Path
import subprocess
import tempfile
import bpy
import numpy as np

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['node',str(root/'pipeline/export_home.mjs'),tmp],check=True)
    src=Path(tmp)
    unit=json.loads((src/'unit.json').read_text())
    positions=np.fromfile(src/'position.f32',dtype='<f4').reshape(-1,3)
    triangles=np.fromfile(src/'index.u32',dtype='<u4').reshape(-1,3)
    labels=np.fromfile(src/'material.u8',dtype='u1')[triangles[:,0]]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.max_bounces=5
scene.cycles.seed=114
scene.world=bpy.data.worlds.new('Sky')
scene.world.use_nodes=True
sky=scene.world.node_tree.nodes.get('Background')
sky.inputs[0].default_value=(1,1,1,1)

def make_mesh(name,verts,faces):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    return obj

x,y,z=positions.T
home=make_mesh('Static apartment',np.column_stack((x,-z,y-unit['floor'])).tolist(),triangles.tolist())
mat_ids=unit['material']
values={'WOOD':0.42,'SOFA':0.36,'WALNUT':0.15,'BLACK':0.02,'METAL':0.08,'PLANT':0.10,'RUG':0.48}
emitters=[]
for i in range(int(labels.max())+1):
    name=next((k for k,v in mat_ids.items() if v==i),'default')
    material=bpy.data.materials.new(name)
    material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    rho=values.get(name,0.72)
    bsdf.inputs['Base Color'].default_value=(rho,rho,rho,1)
    if name in ('LAMP','PEND'):
        bsdf.inputs['Emission Color'].default_value=(1,1,1,1)
        emitters.append(bsdf.inputs['Emission Strength'])
    home.data.materials.append(material)
home.data.polygons.foreach_set('material_index',labels.astype('i4'))

# The atlas is parametrized by floor metres. Blender +Z corresponds to Three.js +Y.
floor=make_mesh('Receiver',[(-3,-10,.012),(13,-10,.012),(13,0,.012),(-3,0,.012)],[(0,1,2,3)])
uv=floor.data.uv_layers.new(name='Floor metres')
for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):
    loop.uv=coord
mat=bpy.data.materials.new('Receiver')
mat.use_nodes=True
floor.data.materials.append(mat)
nodes=mat.node_tree.nodes
target=nodes.new('ShaderNodeTexImage')
width,height=384,240
image=bpy.data.images.new('Bake',width,height,float_buffer=True)
target.image=image
nodes.active=target
floor.select_set(True)
bpy.context.view_layer.objects.active=floor
scene.render.bake.margin=0
scene.render.bake.use_pass_direct=False
scene.render.bake.use_pass_indirect=True
scene.render.bake.use_pass_color=False
def bake(kind):
    bpy.ops.object.bake(type=kind)
    buf=np.empty(width*height*4,dtype='f4')
    image.pixels.foreach_get(buf)
    return buf.reshape(height,width,4)[:,:,0].copy()
sky.inputs[1].default_value=1
day=bake('DIFFUSE')
sky.inputs[1].default_value=0
for strength in emitters:
    strength.default_value=1
lamps=bake('DIFFUSE')
ao=nodes.new('ShaderNodeAmbientOcclusion')
ao.inputs['Distance'].default_value=.8
emission=nodes.new('ShaderNodeEmission')
links=mat.node_tree.links
links.new(ao.outputs['AO'],emission.inputs['Color'])
links.new(emission.outputs[0],nodes.get('Material Output').inputs['Surface'])
nodes.active=target
contact=bake('EMIT')
# Pack two linear transport coefficients (square-root encoding for dark rooms)
# and short-range visibility in one RGB texture; PNG stores raw data values.
channels=np.stack([np.sqrt(np.clip(day,0,1)),np.sqrt(np.clip(lamps,0,1)),
                   np.clip(contact,0,1),np.ones_like(day)],axis=-1)
out=bpy.data.images.new('Floor light transport',width,height,alpha=False)
out.colorspace_settings.name='Non-Color'
out.pixels.foreach_set(channels.astype('f4').ravel())
out.filepath_raw=str(root/'data/floor-light.png')
out.file_format='PNG'
out.save()
print('Transport percentiles',*[np.percentile(a,[10,50,90]) for a in (day,lamps,contact)])
