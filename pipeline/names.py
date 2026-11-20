# building index -> name (complex name from OSM landuse=residential areas, or the building's own name)
import pickle,json,re,sys,numpy as np
from frame import en2s
nodes,ways,rels=pickle.load(open('osm2.pkl','rb'))
st=pickle.load(open('stage1.pkl','rb')); B=st['B']
def S(n): e,s=nodes[n]; return en2s(e,-s)
def poly(nd): return [S(n) for n in nd if n in nodes]
areas=[]; own={}
for wid,(nd,t) in ways.items():
    nm=t.get('name')
    if not nm: continue
    if t.get('landuse') in('residential','commercial','retail','industrial') or t.get('amenity') in('school','university','hospital','townhall','courthouse','college'):
        p=poly(nd)
        if len(p)>=3: xs=[a[0] for a in p]; zs=[a[1] for a in p]; areas.append((nm,p,min(xs),max(xs),min(zs),max(zs)))
    if 'building' in t:
        p=poly(nd)
        if p:
            if len(p)>1 and p[0]==p[-1]: p=p[:-1]
            own[(round(sum(a[0] for a in p)/len(p)),round(sum(a[1] for a in p)/len(p)))]=nm
# multipolygon relations
if isinstance(rels,dict):
    for rid,r in rels.items():
        mem,t=(r if isinstance(r,tuple) else (r.get('members'),r.get('tags')))
        nm=t.get('name') if isinstance(t,dict) else None
        if nm and isinstance(t,dict) and (t.get('landuse')=='residential' or t.get('amenity') in('school','university','hospital')):
            for typ,ref,role in mem:
                if typ=='way' and role=='outer' and ref in ways:
                    p=poly(ways[ref][0])
                    if len(p)>=3: xs=[a[0] for a in p]; zs=[a[1] for a in p]; areas.append((nm,p,min(xs),max(xs),min(zs),max(zs)))
def pip(x,z,p):
    c=False; n=len(p)
    for i in range(n):
        x1,z1=p[i]; x2,z2=p[(i+1)%n]
        if (z1>z)!=(z2>z) and x<(x2-x1)*(z-z1)/(z2-z1)+x1: c=not c
    return c
names=['']; idx={}; out=[]; cnt=0
def nid(s):
    if s not in idx: idx[s]=len(names); names.append(s)
    return idx[s]
for p,h,base,kind,A in B:
    cx=sum(a[0] for a in p)/len(p); cz=sum(a[1] for a in p)/len(p)
    o=None
    for ddx in(0,-1,1):
        for ddz in(0,-1,1):
            o=o or own.get((round(cx)+ddx,round(cz)+ddz))
    comp=None
    ba=1e18
    for nm,q,x0,x1,z0,z1 in areas:
        if x0<=cx<=x1 and z0<=cz<=z1 and (x1-x0)*(z1-z0)<ba and pip(cx,cz,q): comp=nm; ba=(x1-x0)*(z1-z0)
    lab=None
    if comp and o and re.fullmatch(r'\d+(동)?',o): lab=f'{comp} {o.rstrip("동")}동'
    elif comp and (kind==1 or not o): lab=comp if h>12 or kind in(1,4) else None
    elif o and not re.fullmatch(r'[\dA-Za-z\-]+',o): lab=o
    if o and comp and not lab: lab=o
    out.append(nid(lab) if lab else 0); cnt+=bool(lab)
print(len(B),'labelled',cnt,'names',len(names),'areas',len(areas))
tall=[(names[out[i]],round(B[i][1])) for i in range(len(B)) if B[i][1]>60]; print(len(tall),sum(1 for a in tall if a[0]),[a for a in tall if not a[0]][:5], tall[:12])
for f in sys.argv[1:]:
    d=json.load(open(f)); d['names']=names; d['bname']=out; json.dump(d,open(f,'w'),ensure_ascii=False,separators=(',',':'))
