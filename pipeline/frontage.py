"""Curb-aligned approach lanes. XZ left-normal points to the driver's right."""
import math
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring


class Frontage:
    def __init__(self, name, spec, road):
        survey=spec['frontageSurvey']
        self.origin=np.array(survey['origin'])
        forward=np.array(survey['forward'])
        self.forward=forward/np.linalg.norm(forward)
        self.right=np.array([-self.forward[1],self.forward[0]])
        sections=np.array(survey['edges'])
        start,end=sections[0,0],sections[-1,0]
        tie=survey['tieIn']
        self.stations=np.linspace(start-tie,end+tie,int(end-start+2*tie)+1)
        # Blend both edges into the existing through way at each end. The
        # cross-section excludes the separate carriageway across the trench.
        lo,hi=[],[]
        for station in self.stations:
            a,b=(np.interp(station,sections[:,0],sections[:,i]) for i in (1,2))
            f=max(0,start-station,station-end)/tie
            if f:
                cut=LineString([self.point(station,-35),self.point(station,35)])
                clipped=road.intersection(cut)
                pieces=[p for p in getattr(clipped,'geoms',[clipped]) if p.geom_type=='LineString']
                lane=min(pieces,key=Point(self.point(station,-4)).distance)
                ends=sorted(self.lateral(p) for p in lane.coords)
                f=f*f*(3-2*f)
                a+=(ends[0]-a)*f
                b+=(ends[-1]-b)*f
            lo.append(a);hi.append(b)
        self.lo,self.hi=np.array(lo),np.array(hi)
        self.curb=self.line(self.hi)
        self.deck=self.band(self.lo,self.hi)
        # Replace only this surface road within the measured stretch.
        # At the west entrance the inner mask follows the open trench edge.
        self.mask=self.band(np.minimum(self.lo,-13 if name=='west' else -20)-0.25,
                            np.maximum(self.hi,24)+0.25)
        self.walk=self.band(self.hi,self.hi+2.1)
        self.name=name

    def point(self,s,d):
        return self.origin+self.forward*s+self.right*d

    def lateral(self,p):
        return np.dot(np.array(p)-self.origin,self.right)

    def line(self,offset):
        return LineString([self.point(s,d) for s,d in zip(self.stations,offset)])

    def band(self,left,right):
        return Polygon([*self.line(left).coords,*reversed(self.line(right).coords)])

    def public_lines(self):
        if self.name=='west':
            return [('white',self.line((self.lo+self.hi)/2),(3,5))]
        # Two lanes on the parcel side and three on the opposite approach.
        # Tie lane separators into the narrower untagged OSM carriageway.
        median=self.hi-0.40*(self.hi-self.lo)
        lines=[('yellow',self.line(median-0.16),None),('yellow',self.line(median+0.16),None)]
        for a,b,n in [(self.lo,median,3),(median,self.hi,2)]:
            for i in range(1,n):
                line=self.line(a+(b-a)*i/n)
                # End intermittent lines before a substandard-width lane.
                valid=np.flatnonzero((b-a)/n>=2.70)
                if len(valid)>1:
                    lines.append(('white',LineString(list(line.coords)[valid[0]:valid[-1]+1]),(3,5)))
        return lines


def cubic_turn(start, end, u, v):
    """Tangent cubic fitted to the two rays; minimise peak steering curvature."""
    along,across=np.linalg.solve(np.column_stack([u,v]),end-start)
    if min(along,across)<=0:
        raise ValueError('Turning tangents must meet ahead of the driver')
    f=np.linspace(0,1,41)[:,None]
    best=None
    for first in (0.42,0.49,0.55,0.62,0.69):
        for last in (0.42,0.49,0.55,0.62,0.69):
            a=start+along*first*u
            b=end-across*last*v
            speed=3*((1-f)**2*(a-start)+2*f*(1-f)*(b-a)+f**2*(end-b))
            accel=6*((1-f)*(b-2*a+start)+f*(end-2*b+a))
            bend=(speed[:,0]*accel[:,1]-speed[:,1]*accel[:,0])/np.linalg.norm(speed,axis=1)**3
            cost=max(abs(bend))+0.02*(abs(bend[0])+abs(bend[-1]))
            if best is None or cost<best[0]:
                curve=(1-f)**3*start+3*(1-f)**2*f*a+3*(1-f)*f**2*b+f**3*end
                best=cost,curve
    return best[1]


def turning_path(street, axis, mouth, incoming, lane_offset):
    # The ends and both tangents come from the actual lane centrelines.
    # XZ positive offset is the driver's right in the Three.js scene.
    curb_lane=street.curb.offset_curve(-1.75)
    drive_lane=axis.offset_curve(lane_offset if incoming else -lane_offset,join_style='mitre')
    depth=(3.6 if incoming else 12.5) if street.name=='west' else 8.3
    throat=axis.interpolate(axis.project(mouth)+depth)
    internal=drive_lane.project(throat)
    def pos(line,s):return np.array(line.interpolate(s).coords[0])
    def tangent(line,s):
        d=pos(line,s+0.08)-pos(line,s-0.08)
        return d/np.linalg.norm(d)
    def right(v):return np.array([-v[1],v[0]])

    # Solve an arc tangent to the actual through lane and gate lane. Construct
    # from the driveway end, then reverse the arc for inbound traffic.
    start=pos(drive_lane,internal)
    u=-tangent(drive_lane,internal)
    station=curb_lane.project(mouth)
    for _ in range(8):
        p=pos(curb_lane,station)
        v=tangent(curb_lane,station)*(-1 if incoming else 1)
        radius=np.dot(start-p,right(v))/(1-np.dot(u,v))
        center=start+radius*right(u)
        finish=center-radius*right(v)
        station=curb_lane.project(Point(finish))
    angle=math.atan2(u[0]*v[1]-u[1]*v[0],np.dot(u,v))
    first=math.atan2(start[1]-center[1],start[0]-center[0])
    curve=[center+abs(radius)*np.array([math.cos(a),math.sin(a)])
           for a in np.linspace(first,first+angle,40)]
    if incoming:
        lead=substring(curb_lane,station-12,station)
        finish=internal+(5.5 if street.name=='west' else 2.0)
        # End at a whole lane segment, keeping the final heading defined.
        if street.name=='west':
            station_lengths=np.r_[0,np.cumsum(np.linalg.norm(np.diff(drive_lane.coords,axis=0),axis=1))]
            finish=station_lengths[np.argmin(abs(station_lengths-finish))]
        throat=substring(drive_lane,internal,finish)
        return LineString([*list(lead.coords)[:-1],*reversed(curve),*list(throat.coords)[1:]])
    lead=substring(curb_lane,station,station+12)
    return LineString([*curve,*list(lead.coords)[1:]])
