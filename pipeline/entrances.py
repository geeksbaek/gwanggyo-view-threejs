"""Registered plan entrances and their proposed longitudinal profiles."""
import math

import shapely as shp
from shapely.geometry import LineString, Point


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
    def __init__(self, name, spec, frame, ways, public, terrain):
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
            self.axis=LineString([*ease_path([*points,arc[0]]).coords,*arc[1:],self.end.coords[0]])
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
        returns=public.union(shape).buffer(4).buffer(-4).intersection(self.mouth.buffer(13))
        self.drive=shape.union(returns).difference(public).difference(self.island)
        # Sidewalk follows the returns. The mouth and garage thresholds stay open.
        self.walk=self.drive.buffer(1.4).difference(shp.union_all([self.drive,public,self.island,
            self.end.buffer(5),self.junction.buffer(4)]))
        self.area=self.drive.union(self.walk)
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
