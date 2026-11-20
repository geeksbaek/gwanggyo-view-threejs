import pickle,math,json,struct,hashlib,numpy as np
from PIL import Image,ImageDraw,ImageFilter
from geo import *
from frame import *
nodes,ways,rels=pickle.load(open('osm2.pkl','rb'))   # nodes: (east, south)
def S(nid):
    e,s=nodes[nid]; return en2s(e,-s)
def poly(nd): return [S(n) for n in nd if n in nodes]
def area(p):
    return 0.5*sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))
def h01(s): return int(hashlib.md5(str(s).encode()).hexdigest()[:8],16)/2**32
# ---------- raster sampling in scene frame
def sample_scene(kind,Z,half,N):
    """scene-aligned grid: row j -> z=-half..half, col i -> x=-half..half"""
    n=2**Z
    R=half*1.45
    lonA,lonB=LON0-R/MX,LON0+R/MX; latN,latS=LAT0+R/MY,LAT0-R/MY
    xa,xb=int(tx(lonA,n)),int(tx(lonB,n)); ya,yb=int(ty(latN,n)),int(ty(latS,n))
    jobs=[]
    for x in range(xa,xb+1):
        for y in range(ya,yb+1):
            if kind=='dem': u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'; f=f'tiles/dem_{Z}_{x}_{y}.png'
            else: u=f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{Z}/{y}/{x}.jpg'; f=f'tiles/sat_{Z}_{x}_{y}.jpg'
            jobs.append((u,f,x,y))
    with ThreadPoolExecutor(8) as ex: list(ex.map(lambda j:get(j[0],j[1]),jobs))
    W=(xb-xa+1)*256;H=(yb-ya+1)*256
    big=np.zeros((H,W,3),np.float32)
    for u,f,x,y in jobs: big[(y-ya)*256:(y-ya+1)*256,(x-xa)*256:(x-xa+1)*256]=np.asarray(Image.open(f).convert('RGB'))
    if kind=='dem': big=(big[...,0]*256+big[...,1]+big[...,2]/256-32768)[...,None]
    c=-half+(np.arange(N)+0.5)/N*2*half
    X,Zz=np.meshgrid(c,c)
    E_=X*rE-Zz*nE; Nn=X*rN-Zz*nN
    PX=(tx(LON0+E_/MX,n)-xa)*256-0.5
    lat=np.radians(LAT0+Nn/MY)
    PY=((1-np.arcsinh(np.tan(lat))/math.pi)/2*n-ya)*256-0.5
    x0=np.clip(np.floor(PX).astype(int),0,W-2);y0=np.clip(np.floor(PY).astype(int),0,H-2)
    fx=(PX-x0)[...,None];fy=(PY-y0)[...,None]
    return (big[y0,x0]*(1-fx)+big[y0,x0+1]*fx)*(1-fy)+(big[y0+1,x0]*(1-fx)+big[y0+1,x0+1]*fx)*fy
def fixvoid(a):
    a=a.copy()
    for _ in range(30):
        bad=a<-5
        if not bad.any(): break
        pad=np.pad(a,1,mode='edge'); nb=np.stack([pad[:-2,1:-1],pad[2:,1:-1],pad[1:-1,:-2],pad[1:-1,2:]])
        ok=nb>=-5; s=(nb*ok).sum(0); c=ok.sum(0)
        a[bad&(c>0)]=(s/np.maximum(c,1))[bad&(c>0)]
    return a
HN=4096.0; NN=512   # near half extent, grid
HF=40960.0; NF=384
dn=fixvoid(sample_scene('dem',14,HN,NN)[...,0]); df=np.maximum(fixvoid(sample_scene('dem',11,HF,NF)[...,0]),0)
def dem_at(x,z):
    fx=(x+HN)/(2*HN)*NN-0.5; fz=(z+HN)/(2*HN)*NN-0.5
    i=int(min(max(fx,0),NN-2)); j=int(min(max(fz,0),NN-2)); a=min(max(fx-i,0),1); b=min(max(fz-j,0),1)
    return (dn[j,i]*(1-a)+dn[j,i+1]*a)*(1-b)+(dn[j+1,i]*(1-a)+dn[j+1,i+1]*a)*b
site=[plan2s(*p) for p in SITE]
# pad level
def raster_poly(polys,half,N,ss=1):
    im=Image.new('L',(N,N),0); d=ImageDraw.Draw(im)
    for p in polys:
        if len(p)>=3: d.polygon([((x+half)/(2*half)*N,(z+half)/(2*half)*N) for x,z in p],fill=255)
    return im
sm=np.asarray(raster_poly([site],HN,NN*4).filter(ImageFilter.GaussianBlur(6)).resize((NN,NN),Image.BILINEAR)).astype(np.float32)/255
PAD=float(np.median(dn[sm>0.9])); print('pad level',PAD, 'site dem range',dn[sm>0.9].min(),dn[sm>0.9].max())
sm=np.clip(sm*1.6,0,1)
dn=dn*(1-sm)+PAD*sm
# ---------- water
def rings_of(rel):
    segs=[ways[r][0] for t,r,role in rel[0] if t=='way' and role in('outer','') and r in ways]
    rings=[]
    while segs:
        cur=list(segs.pop())
        ch=True
        while cur[0]!=cur[-1] and ch:
            ch=False
            for k,s in enumerate(segs):
                if s[0]==cur[-1]: cur+=s[1:]; segs.pop(k); ch=True; break
                if s[-1]==cur[-1]: cur+=s[::-1][1:]; segs.pop(k); ch=True; break
        rings.append(cur)
    return rings
water=[]
for nd,t in ways.values():
    if t.get('natural')=='water' and nd[0]==nd[-1]:
        p=poly(nd)
        if abs(area(p))>300: water.append(p)
for m,t in rels.values():
    if t.get('natural')=='water':
        for r in rings_of((m,t)):
            p=poly(r)
            if len(p)>3 and abs(area(p))>300: water.append(p)
print('water polys',len(water),sorted([round(abs(area(p))) for p in water])[-6:])
wm=np.asarray(raster_poly(water,HN,NN*2).resize((NN,NN),Image.BILINEAR)).astype(np.float32)/255
# flatten lakes: per polygon, set to min level
wlev=[]
for p in water:
    m=np.asarray(raster_poly([p],HN,NN))>0
    if m.sum()==0:
        cx=sum(a for a,b in p)/len(p); cz=sum(b for a,b in p)/len(p); lv=dem_at(cx,cz)
    else:
        lv=float(np.percentile(dn[m],20)); dn[m]=lv-0.6
    wlev.append(lv)
# ---------- buildings
B=[]; skipped=0
smask=raster_poly([site],HN,2048)
def insite(x,z):
    i=int((x+HN)/(2*HN)*2048); j=int((z+HN)/(2*HN)*2048)
    return 0<=i<2048 and 0<=j<2048 and smask.getpixel((i,j))>0
for wid,(nd,t) in ways.items():
    b=t.get('building')
    if not b or len(nd)<4 or nd[0]!=nd[-1]: continue
    p=poly(nd[:-1])
    if len(p)<3: continue
    cx=sum(a for a,_ in p)/len(p); cz=sum(c for _,c in p)/len(p)
    if max(abs(cx),abs(cz))>3900: continue
    if insite(cx,cz): skipped+=1; continue
    A=abs(area(p))
    if A<25: continue
    if area(p)<0: p=p[::-1]
    r=h01(wid)
    h=None
    try:
        if 'height' in t: h=float(t['height'].replace('m',''))
        elif 'building:levels' in t:
            lv=float(t['building:levels']); h=lv*(2.85 if b=='apartments' else 3.3)+ (3 if lv>6 else 1)
    except: pass
    kind=0
    if b=='apartments': kind=1
    elif b in('commercial','retail','office','hospital','hotel'): kind=2
    elif b in('industrial','warehouse'): kind=3
    elif b in('school','university','public','kindergarten','college','government','civic'): kind=4
    if h is None:
        if kind==1: h=(15+int(r*10))*2.85+3 if A>240 else (4+int(r*2))*2.9
        elif kind==2: h=(4+int(r*5))*3.6 if A<3000 else (5+int(r*4))*4.0
        elif kind==3: h=9+r*8
        elif kind==4: h=(3+int(r*3))*3.5
        elif b in('house','detached'): h=6+r*3
        elif b=='roof': h=5
        else:
            if A<90: h=6+r*4
            elif A<350: h=(3+int(r*2.5))*3.0+1.5
            elif A<1500: h=(3+int(r*4))*3.3
            else: h=10+r*10
    h=min(max(h,3),250)
    ys=[dem_at(x,z) for x,z in p]
    B.append((p,h,min(ys)-PAD,kind,A))
print('buildings',len(B),'skipped in site',skipped, 'tall',sum(1 for b in B if b[1]>40))
# towers of the complex
T=[]
for k,(pp,lv) in TOWERS.items():
    q=[plan2s(*a) for a in pp]
    if area(q)<0: q=q[::-1]
    T.append({'name':k,'levels':lv,'p':[[round(x,2),round(z,2)] for x,z in q]})
# ---------- roads
RW={'motorway':14,'trunk':13,'primary':20,'secondary':16,'tertiary':11,'residential':6.5,'unclassified':6.5,'living_street':5,'service':4.5,'motorway_link':7,'trunk_link':7,'primary_link':7,'secondary_link':6,'tertiary_link':6,'pedestrian':5,'footway':2,'path':1.5,'cycleway':2.5,'steps':2,'track':3}
roads=[]
for wid,(nd,t) in ways.items():
    hw=t.get('highway')
    if hw not in RW: continue
    p=poly(nd)
    if len(p)<2: continue
    if not any(max(abs(x),abs(z))<4000 for x,z in p): continue
    w=RW[hw]
    try:
        if 'lanes' in t: w=max(w,float(t['lanes'])*3.3+1)
    except: pass
    if t.get('oneway')=='yes' and hw in('primary','secondary','tertiary') and 'lanes' not in t: w*=0.55
    roads.append((p,w,hw,t.get('tunnel')=='yes',t.get('bridge')=='yes'))
print('roads',len(roads))
pickle.dump(dict(dn=dn,df=df,PAD=PAD,water=water,wlev=wlev,B=B,T=T,roads=roads,site=site,wm=wm),open('stage1.pkl','wb'))
