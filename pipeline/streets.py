"""Build data/streets.glb from the checked-in traces, OSM ways and DEM.
Run from the project root with numpy and Shapely 2.1 or newer.
"""
from functools import lru_cache
import json
import math
from pathlib import Path
import struct

from entrances import Entrance

import numpy as np
import shapely as shp
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import substring

root = Path(__file__).resolve().parents[1]
world = json.loads((root / 'world.json').read_text())
mapping = json.loads((root / 'data/neighborhood.json').read_text())
trace = json.loads((root / 'data/junction.json').read_text())
dem = np.fromfile(root / 'world.wasm', dtype='<i2', count=world['NN']**2,
                  offset=world['idx']['dem_n']['o']).reshape(world['NN'], world['NN'])
half = world['HN']
# Match buildTerrain's rendered near grid and its b-c diagonal exactly.
step = 2*half/400


def scene(point):
    return (30 + point[0]/5, -110 + point[1]/5)


def polygon(points):
    return Polygon([scene(p) for p in points])


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for item in geometry.geoms:
            yield from parts(item, kind)


@lru_cache(None)
def grid_height(i, j):
    a, b = (i*world['NN']/400 - 0.5, j*world['NN']/400 - 0.5)
    col, row = math.floor(a), math.floor(b)
    u, v = a-col, b-row
    return 0.1*((1-v)*((1-u)*dem[row,col]+u*dem[row,col+1]) +
                v*((1-u)*dem[row+1,col]+u*dem[row+1,col+1]))


def terrain(x, z):
    u, v = (x+half)/step, (z+half)/step
    i, j = math.floor(u), math.floor(v)
    u, v = u-i, v-j
    b, c = grid_height(i+1,j), grid_height(i,j+1)
    if u+v <= 1:
        return (1-u-v)*grid_height(i,j)+u*b+v*c
    return (u+v-1)*grid_height(i+1,j+1)+(1-v)*b+(1-u)*c


def cut_to_terrain(geometry, kind):
    if geometry.is_empty:
        return
    x0,z0,x1,z1 = geometry.bounds
    for j in range(math.floor((z0+half)/step), math.floor((z1+half)/step)+1):
        for i in range(math.floor((x0+half)/step), math.floor((x1+half)/step)+1):
            x, z = i*step-half, j*step-half
            cell = box(x,z,x+step,z+step)
            if not geometry.intersects(cell):
                continue
            fragment = geometry.intersection(cell)
            b, c = (x+step,z), (x,z+step)
            for tip in [(x,z),(x+step,z+step)]:
                yield from parts(fragment.intersection(Polygon([b,c,tip])),kind)


# Mesh batches are separately selectable by name in a standard glTF viewer.
batches = {}


def triangle(name, vertices):
    positions, lookup, indices = batches.setdefault(name, ([], {}, []))
    face = []
    for point in vertices:
        key = tuple(round(v,4) for v in point)
        if key not in lookup:
            lookup[key] = len(positions)
            positions.append(key)
        face.append(lookup[key])
    if len(set(face))==3:
        indices.extend(face)


def surface(name, geometry, top):
    for poly in cut_to_terrain(geometry,'Polygon'):
        if poly.area < 0.00001:
            continue
        if name in ('sidewalk','granite','refuge','mainDrive','westDrive','entranceWalk','apron'):
            poly = shp.segmentize(poly,2)
        for tri in shp.constrained_delaunay_triangles(poly).geoms:
            # Clockwise in XZ gives an upward-facing normal in Three.js.
            vertices = list(shp.orient_polygons(tri,exterior_cw=True).exterior.coords)[:3]
            triangle(name,[(x,terrain(x,z)+top(x,z),z) for x,z in vertices])


def walls(boundary, top, bottom=lambda x,z:0.035, material='curbFace'):
    for segment in cut_to_terrain(boundary,'LineString'):
        coords = list(shp.segmentize(segment,1.5).coords)
        for (x,z),(xx,zz) in zip(coords, coords[1:]):
            a,b = terrain(x,z), terrain(xx,zz)
            low, end = (x,a+bottom(x,z),z), (xx,b+bottom(xx,zz),zz)
            high, far = (x,a+top(x,z),z), (xx,b+top(xx,zz),zz)
            triangle(material,[low,high,far])
            triangle(material,[low,far,end])


def stripe(points, width, dash=None):
    line = LineString(points)
    if not dash:
        return line.buffer(width/2,cap_style='flat',join_style='round')
    strokes = []
    for start in np.arange(0,line.length,sum(dash)):
        segment = substring(line,start,min(start+dash[0],line.length))
        strokes.append(segment.buffer(width/2,cap_style='flat'))
    return shp.union_all(strokes)


registered = polygon(trace['outline'])
study = Point(0,0).buffer(550,quad_segs=48)
window = box(30,-110,260,110)
open_ramps = [LineString(w['p']).buffer(w['w']/2+0.6,cap_style='flat') for w in world['underpass'] if not w['tun']]
trench = shp.union_all(open_ramps)
motor = {'primary','secondary','tertiary','residential','unclassified','service','trunk'}
decks, walkways, axes = [], [], []
for way in mapping['roads']+mapping['otherWays']:
    if way['highway'] not in motor or way.get('tunnel')=='yes' or way.get('bridge')=='yes' or way.get('name')=='법원지하차도':
        continue
    axis = LineString(way['p'])
    one = way.get('oneway') in ('yes','-1')
    fallback = {'primary':3 if one else 6,'secondary':3 if one else 4,
                'tertiary':2 if one else 3,'service':1}.get(way['highway'],1 if one else 2)
    lanes = int(way.get('lanes',fallback))
    width = float(way.get('width',lanes*3.15))
    deck = axis.buffer(width/2,cap_style='round',join_style='round',quad_segs=3)
    if way.get('name') in ('광교중앙로','월드컵로','동수원로'):
        deck = deck.difference(window)
    decks.append(deck)
    axes.append((axis,one,lanes,width,way['highway']))
    if way.get('sidewalk')=='both':
        walkways.append(deck.buffer(1.9,quad_segs=3))
refuges = shp.union_all([polygon(p) for p in trace['refuges']])
garden = polygon(trace['plantedMedian'])
# The trace supplies the exact edges on the four approaches. Preserve
# unrelated neighborhood streets inside the same rectangular map extent.
network = shp.union_all(decks).intersection(study)
# Blend the surveyed undivided section to the two separate OSM axes.
transition = Polygon([(259.9,-28.65),(275,-27.7),(296,-26.7),(296,-18.8),
                      (280,-14.6),(296,-11.2),(296,-2.4),(275,-2.5),(259.9,-3.0)])
outer = network.union(transition)
road = shp.union_all([outer,registered]).difference(shp.union_all([refuges,garden,trench]))
registered_walk = registered.buffer(2.1,quad_segs=4).intersection(window)
walk = shp.union_all([registered_walk,transition.buffer(1.9).intersection(box(260,-40,294,5)),*walkways]).intersection(study).difference(
    shp.union_all([road,refuges,garden,trench]))
# Avoid invented walkways across a trace cut or the study perimeter.
walk = walk.difference(window.boundary.buffer(0.12)).difference(study.boundary.buffer(1))
specs=json.loads((root/'data/entrances.json').read_text())
gates=[Entrance(name,spec,world['frame'],mapping['roads'],road,terrain) for name,spec in specs.items()]
excavation=shp.union_all([g.area for g in gates])
walk=walk.difference(excavation)
west=next(g for g in gates if g.name=='west')
vicinity=west.mouth.buffer(west.grade['outer'],quad_segs=24)
# Only regrade the connected surface carriageway and its adjacent pavement.
graded=max((p for p in parts(road.union(walk).intersection(vicinity),'Polygon')
            if p.distance(west.junction)<0.01),key=lambda p:p.area)
excavation=excavation.union(graded)
gx,gz,ex,ez=graded.bounds
cells=[graded.intersection(box(x,z,x+2,z+2)) for x in np.arange(gx,ex,2) for z in np.arange(gz,ez,2)]
def public_surface(name,shape,base):
    surface(name,shape.difference(graded),base)
    for cell in cells:
        if not cell.is_empty and cell.intersects(shape):
            surface(name,shape.intersection(cell),lambda x,z:base(x,z)+west.public_offset(x,z)-0.075)

def public_walls(boundary,top,bottom=lambda x,z:0.035):
    walls(boundary.difference(graded),top,bottom)
    walls(boundary.intersection(graded),lambda x,z:top(x,z)+west.public_offset(x,z)-0.075,
          lambda x,z:bottom(x,z)+west.public_offset(x,z)-0.075)
# Close exposed sides where the constructed section meets ungraded ground.
walls(graded.boundary.difference(shp.union_all([g.area for g in gates]).buffer(0.02)),
      west.public_offset,lambda x,z:0,material='retaining')
# Remove just the touched terrain faces and refill the pieces outside each
# cutting. The basement driveway can then pass below the original hillside.
removed=[]
bounds=excavation.bounds
for j in range(math.floor((bounds[1]+half)/step),math.floor((bounds[3]+half)/step)+1):
    for i in range(math.floor((bounds[0]+half)/step),math.floor((bounds[2]+half)/step)+1):
        x,z=i*step-half,j*step-half
        b,c=(x+step,z),(x,z+step)
        for side,tip in enumerate([(x,z),(x+step,z+step)]):
            face=Polygon([b,c,tip])
            if face.intersection(excavation).area<0.000001:
                continue
            removed.append(2*(j*400+i)+side)
            for piece in parts(face.difference(excavation),'Polygon'):
                for tri in shp.constrained_delaunay_triangles(piece).geoms:
                    corners=list(shp.orient_polygons(tri,exterior_cw=True).exterior.coords)[:3]
                    triangle('terrainRemainder',[(a,terrain(a,b),b) for a,b in corners])

for gate in gates:
    # A flush pedestrian apron carries the sidewalk across the driveway.
    crossing=gate.axis.interpolate(gate.start+2.0)
    ahead=gate.axis.interpolate(gate.start+2.5)
    dx,dz=ahead.x-crossing.x,ahead.y-crossing.y
    length=math.hypot(dx,dz)
    nx,nz=-dz/length,dx/length
    apron_axis=LineString([(crossing.x-12*nx,crossing.y-12*nz),(crossing.x+12*nx,crossing.y+12*nz)])
    apron=apron_axis.buffer(0.9,cap_style='flat').intersection(gate.drive)
    surface(gate.name+'Drive',gate.drive.difference(apron),gate.offset)
    surface('apron',apron,gate.offset)
    def side_top(x,z):
        # Taper the curb returns down to the pedestrian apron.
        rise=max(0,min(1,(apron_axis.distance(Point(x,z))-0.9)/1.5))
        return gate.offset(x,z)+0.012+0.14*rise
    strip=gate.walk.intersection(gate.drive.boundary.buffer(0.22))
    surface('entranceWalk',gate.walk.difference(strip),side_top)
    surface('granite',strip,side_top)
    walls(gate.walk.boundary.difference(road.buffer(0.02)),side_top,gate.offset)
    walls(gate.area.boundary.difference(road.buffer(0.08)),side_top,
          bottom=lambda x,z:-0.03,material='retaining')
    # Stop the driveway centre marking before the public lane and roundabout.
    end=gate.axis.length-(12 if gate.name=='main' else 7)
    line=substring(gate.axis,gate.start+4.8,end)
    surface('yellow',line.buffer(0.075,cap_style='flat').intersection(gate.drive),
            lambda x,z:gate.offset(x,z)+0.014)
asphalt_y = lambda x,z: 0.075
paint_y = lambda x,z: 0.089
red = polygon(trace['redSurface']).intersection(road)
public_surface('asphalt',road.difference(red),asphalt_y)
public_surface('redAsphalt',red,asphalt_y)
public_walls(road.boundary.difference(shp.union_all([g.area for g in gates]).buffer(0.02)),asphalt_y)

# Curb reveals taper to road level at the observed pedestrian landings.
landings = []
for a,b,c,d in trace['crosswalks']:
    for left,right in [(a,b),(c,d)]:
        landings.append(LineString([scene(left),scene(right)]))
ramps = shp.union_all(landings)
@lru_cache(maxsize=65536)
def walk_height(x,z):
    if not (28<x<262 and -112<z<112):
        return 0.235
    return 0.085+0.15*min(1,ramps.distance(Point(x,z))/1.4)

for area,name in [(walk,'sidewalk'),(refuges,'refuge')]:
    curb = area.intersection(area.boundary.buffer(0.23))
    # Introduce vertices at both ends of the ramp slope.
    for shape, material in [(area.difference(curb),name),(curb,'granite')]:
        for portion in (shape.intersection(ramps.buffer(1.4)),shape.difference(ramps.buffer(1.4))):
            public_surface(material,portion,walk_height)
    public_walls(area.boundary,walk_height)
surface('garden',garden.difference(trench),lambda x,z:0.22)
walls(garden.difference(trench).boundary,lambda x,z:0.22)

white, yellow = [],[]
for a,b,c,d in trace['crosswalks']:
    a,b,c,d = [np.array(scene(p)) for p in (a,b,c,d)]
    n=max(2,round(np.linalg.norm(c-a)/1.1))
    for i in range(n):
        lo,hi=(i+0.10)/n,(i+0.57)/n
        white.append(Polygon([a+(c-a)*lo,b+(d-b)*lo,b+(d-b)*hi,a+(c-a)*hi]))
for points in trace['stopLines']:
    white.append(stripe(list(map(scene,points)),0.54))
for key,width,dash in [('laneDividers',0.16,(3,4)),('guides',0.16,(1,1.3))]:
    for points in trace[key]:
        white.append(stripe(list(map(scene,points)),width,dash))
for start,end in [(769,1000),(1054,1150)]:
    for row in [484,487]:
        yellow.append(stripe([scene((start,row)),scene((end,row))],0.18))

for x,y,angle in trace['diamonds']:
    shape=LineString([(-2,0),(0,-0.52),(2,0),(0,0.52),(-2,0)]).buffer(0.09,join_style='mitre')
    white.append(shp.affinity.translate(shp.affinity.rotate(shape,angle,origin=(0,0)),*scene((x,y))))
for x,y,angle in trace['arrows']:
    arrow=Polygon([(-1.8,-0.11),(0.45,-0.11),(0.05,-0.50),(1.8,0),
                   (0.05,0.50),(0.45,0.11),(-1.8,0.11)])
    white.append(shp.affinity.translate(shp.affinity.rotate(arrow,angle,origin=(0,0)),*scene((x,y))))
for points in trace['hatching']:
    hatch=polygon(points)
    yellow.append(hatch.boundary.buffer(0.075))
    x0,z0,x1,z1=hatch.bounds
    for x in np.arange(x0-(z1-z0),x1,1.7):
        yellow.append(LineString([(x,z0),(x+z1-z0,z1)]).buffer(0.075).intersection(hatch))
# Actual yellow centre line continues along the east arm beyond the trace.
for z in (-13.2,-12.6):
    yellow.append(stripe([(260,z),(271,z-0.2),(279,z-0.6)],0.17))

# Outside the trace, only draw main-road divisions clear of connecting ways.
for i,(axis,one,lanes,width,kind) in enumerate(axes):
    if lanes<2 or kind not in ('primary','secondary','tertiary'):
        continue
    neighbours = [line.buffer(w/2+2) for j,(line,_,_,w,_) in enumerate(axes)
                  if j!=i and axis.intersects(line)]
    clear = study.difference(shp.union_all([window,*neighbours]))
    for n in range(1,lanes):
        offset=width*(n/lanes-0.5)
        middle=not one and n==lanes//2
        for line in parts(axis.offset_curve(offset).intersection(clear),'LineString'):
            (yellow if middle else white).append(stripe(line.coords,0.15,None if middle else (3,5)))
public_surface('white',shp.union_all(white).intersection(road),paint_y)
public_surface('yellow',shp.union_all(yellow).intersection(road),paint_y)
public_surface('blue',stripe(list(map(scene,trace['blueGuide'])),0.50).intersection(road),paint_y)

# glTF 2.0, indexed geometry only. No imagery, textures or external URIs.
blob=bytearray()
model={'asset':{'version':'2.0','generator':'pipeline/streets.py'},'scene':0,
       'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'bufferViews':[],'accessors':[]}
def accessor(array,component,kind,target):
    blob.extend(b'\0'*(-len(blob)%4))
    view=len(model['bufferViews'])
    model['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':array.nbytes,'target':target})
    blob.extend(array.tobytes())
    data={'bufferView':view,'componentType':component,'count':len(array),'type':kind}
    if kind=='VEC3':
        data.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
    model['accessors'].append(data)
    return len(model['accessors'])-1
for name,(verts,_,indices) in batches.items():
    v=accessor(np.asarray(verts,dtype='<f4'),5126,'VEC3',34962)
    idx=accessor(np.asarray(indices,dtype='<u4'),5125,'SCALAR',34963)
    n=len(model['nodes'])
    model['nodes'].append({'name':name,'mesh':n})
    model['scenes'][0]['nodes'].append(n)
    model['meshes'].append({'primitives':[{'attributes':{'POSITION':v},'indices':idx}]})
model['scenes'][0]['extras']={'terrainFaces':removed,'gates':{
    g.name:{'mouth':list(g.mouth.coords[0]),'gate':list(g.gate.coords[0]),'end':list(g.end.coords[0]),
            'heading':g.heading,'axis':[list(p) for p in g.axis.coords],
            'drivePolygons':[[list(poly.exterior.coords),*[list(r.coords) for r in poly.interiors]]
                             for poly in parts(g.drive,'Polygon')]} for g in gates}}
def rings(poly):
    return [list(poly.exterior.coords),*[list(r.coords) for r in poly.interiors]]
extras=model['scenes'][0]['extras']
extras['gates']['west']['grade']={**west.grade,'polygon':rings(graded)}
extras['gates']['main']['garageAxis']=list(next(g for g in gates if g.name=='main').garage.coords)
for g in gates:
    extras['gates'][g.name]['frontagePolygons']=[rings(poly) for poly in parts(road.intersection(g.mouth.buffer(30)),'Polygon')]
model['buffers']=[{'byteLength':len(blob)}]
meta=json.dumps(model,separators=(',',':')).encode()
meta+=b' '*(-len(meta)%4)
glb=struct.pack('<4sIIII',b'glTF',2,28+len(meta)+len(blob),len(meta),0x4E4F534A)+meta+struct.pack('<II',len(blob),0x004E4942)+blob
(root/'data/streets.glb').write_bytes(glb)
print(len(glb),'bytes;',sum(len(b[2])//3 for b in batches.values()),'triangles')
