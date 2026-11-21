"""Registered plan entrances and their proposed longitudinal profiles."""
import math

import shapely as shp
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from frontage import cubic_turn, turning_path
from shapely.ops import substring


def plan_point(uv, frame):
    u,v=uv
    east=0.271449*u+0.000662*(v+55)-112.097991
    north=-0.002727*u-0.275150*(v+55)+170.052137
    return (east*frame['rE']+north*frame['rN'], -east*frame['nE']-north*frame['nN'])


def ease_path(points):
    curve=[points[0]]
    for a,b in zip(points,points[1:]):
        curve.extend([(a[0]*k+b[0]*(1-k),a[1]*k+b[1]*(1-k)) for k in (0.75,0.25)])
    return LineString([*curve,points[-1]])


class Entrance:
    def __init__(self, name, spec, frame, ways, public, terrain, street):
        project=lambda p: plan_point(p,frame)
        lanes=[LineString(w['p']) for w in ways if w.get('name')==spec['street'] and w.get('tunnel')!='yes']
        frontage=Point(project(spec['frontage']))
        facing=min(lanes,key=frontage.distance)
        self.junction=facing.interpolate(facing.project(frontage))
        self.gate=Point(project(spec['gate']))
        points=[self.junction.coords[0],*map(project,spec['approach'])]
        self.name=name
        self.terrain=terrain
        self.island=Point().buffer(1)
        if name=='main':
            circle=Point(project(spec['roundabout']))
            self.island=circle.buffer(spec['islandRadius'],quad_segs=24)
            self.axis=ease_path([*points,circle.coords[0]])
            garage=ease_path([circle.coords[0],*map(project,spec['garage'])])
            self.garage=garage
            self.end=Point(garage.coords[-1])
            shape=shp.union_all([self.axis.buffer(spec['width']/2),circle.buffer(spec['outerRadius'],quad_segs=24),
                                 garage.buffer(3.9,cap_style='flat')])
            self.inner_height=terrain(*circle.coords[0])+0.075
        else:
            cx,cz=project(spec['fanCenter'])
            def angle(p):
                x,z=project(p)
                return math.atan2(z-cz,x-cx)
            a=angle(spec['fanStart'])
            span=(angle(spec['fanEnd'])-a+math.pi)%(2*math.pi)-math.pi
            arc=[(cx+spec['fanRadius']*math.cos(a+span*i/24),cz+spec['fanRadius']*math.sin(a+span*i/24)) for i in range(25)]
            tx,tz=-math.sin(a+span)*math.copysign(1,span),math.cos(a+span)*math.copysign(1,span)
            self.end=Point(arc[-1][0]+tx*spec['portalDepth'],arc[-1][1]+tz*spec['portalDepth'])
            # Enter the fan tangentially. A straight approach to its first
            # radial rib otherwise makes a sharp bend at the reader island.
            along=np.array(points[1])-points[0]
            along/=np.linalg.norm(along)
            lead=np.array(points[0])+3.0*along
            join=4
            station_angle=a+span*join/24
            tangent=np.array([-math.sin(station_angle),math.cos(station_angle)])*math.copysign(1,span)
            shoulder=cubic_turn(lead,np.array(arc[join]),along,tangent)
            self.axis=LineString([points[0],*shoulder,*arc[join+1:],self.end.coords[0]])
            shape=self.axis.buffer(spec['width']/2,cap_style='flat',quad_segs=12)
        # Start exactly on the parcel-facing edge of this carriageway.
        outside=self.axis.difference(public)
        crossings=[self.axis.project(Point(p.coords[0])) for p in shp.get_parts(outside) if p.geom_type=='LineString']
        self.start=min(crossings)
        self.mouth=self.axis.interpolate(self.start)
        self.street_height=terrain(*self.mouth.coords[0])+0.075
        if name=='west':
            # Fit the longitudinal grade of the surface road, independently
            # of the underpass depression in the 20.48 m terrain triangles.
            station=facing.project(self.junction)
            before=facing.interpolate(max(0,station-6))
            after=facing.interpolate(min(facing.length,station+6))
            length=before.distance(after)
            tx,tz=(after.x-before.x)/length,(after.y-before.y)/length
            slope=(terrain(after.x,after.y)-terrain(before.x,before.y))/length
            self.grade={'tangent':[tx,tz], 'slope':max(-0.06,min(0.06,slope)),
                        'height':self.street_height, 'inner':8, 'outer':18}
        self.routes={key:turning_path(street,self.axis,self.mouth,key=='in',spec['width']/4)
                     for key in ('in','out')}
        # Sweep a 4.6 m passenger car from its rear axle, with 0.25 m of
        # lateral clearance. This sizes both curb returns through the turn.
        envelopes=[]
        for route in self.routes.values():
            for d in np.arange(0.2,route.length-0.2,0.35):
                p=np.array(route.interpolate(d).coords[0])
                v=np.array(route.interpolate(d+0.15).coords[0])-p
                v/=np.linalg.norm(v)
                n=np.array([-v[1],v[0]])
                envelopes.append(Polygon([p+u*v+w*n for u,w in
                                 [(-1,-1.2),(3.6,-1.2),(3.6,1.2),(-1,1.2)]]))
        shape=shape.union(shp.union_all(envelopes))
        if name=='west':
            self.gate=self.axis.interpolate(self.start+8.8)
        # Round only the two throat corners. Closing the entire ramp footprint
        # would bridge the gap between the public road and the fan's outer bend.
        throat=substring(self.axis,0,self.start+8).buffer(spec['width']/2,cap_style='flat')
        junction=street.deck.union(throat)
        returns=junction.buffer(6,quad_segs=16).buffer(-6,quad_segs=16).difference(junction)
        returns=returns.intersection(self.mouth.buffer(14))
        self.drive=shape.union(returns).difference(public).difference(self.island)
        # Sidewalk follows the returns. The mouth and garage thresholds stay open.
        self.walk=self.drive.buffer(1.4).difference(shp.union_all([self.drive,public,self.island,
            self.end.buffer(5),self.junction.buffer(4)]))
        self.area=self.drive.union(self.walk)
        if name=='west':
            # The canopy sits on the original radial grid. Start its outer
            # wall only where the full wall thickness clears the new throat.
            self.fan_walls=[]
            for i in range(8):
                angles=[a+span*k/8 for k in (i,i+1)]
                wall=LineString([(cx+22.1*math.cos(t),cz+22.1*math.sin(t)) for t in angles])
                for part in shp.get_parts(wall.difference(self.area.buffer(0.45))):
                    if part.geom_type=='LineString' and part.length>0.35:
                        self.fan_walls.append([part.coords[0],part.coords[-1],(i+0.5)/8])
        station=self.axis.project(self.gate)
        before,after=(self.axis.interpolate(station+d) for d in (-0.15,0.15))
        self.gate_heading=math.atan2(after.x-before.x,before.y-after.y)
        self.heading=math.atan2(self.gate.x-self.mouth.x,-(self.gate.y-self.mouth.y))

    def public_offset(self,x,z):
        g=self.grade
        dx,dz=x-self.mouth.x,z-self.mouth.y
        t=max(0,min(1,(g['outer']-math.hypot(dx,dz))/(g['outer']-g['inner'])))
        along=dx*g['tangent'][0]+dz*g['tangent'][1]
        change=g['height']+along*g['slope']-self.terrain(x,z)-0.075
        return 0.075+change*t*t*(3-2*t)

    def offset(self,x,z):
        distance=self.axis.project(Point(x,z))-self.start
        length=self.axis.length-self.start
        if self.name=='west':
            height=self.street_height-0.035*max(0,distance)
        else:
            f=max(0,min(1,distance/max(1,length-4)))
            height=(1-f)*self.street_height+f*self.inner_height
        f=max(0,min(1,distance/3.5))
        base=self.public_offset(x,z) if self.name=='west' else 0.075
        return base+(height-self.terrain(x,z)-base)*f*f*(3-2*f)
