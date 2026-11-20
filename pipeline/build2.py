import pickle,math,json,random,numpy as np
from PIL import Image,ImageDraw,ImageFilter
import build_data as bd
from build_data import sample_scene,raster_poly,area,h01,plan2s,HN,NN,HF,NF
from frame import TOWERS,SITE
D=pickle.load(open('stage1.pkl','rb')); dn,df,PAD,water,wlev,B,T,roads,site=[D[k] for k in('dn','df','PAD','water','wlev','B','T','roads','site')]
rnd=random.Random(7)
import os; os.makedirs('pub',exist_ok=True)
# ---- satellite, scene aligned
if not os.path.exists('out/satn.npy'):
    np.save('out/satn.npy',sample_scene('sat',14,HN,2048).astype(np.uint8)); np.save('out/satf.npy',sample_scene('sat',11,HF,1024).astype(np.uint8))
satn=np.load('out/satn.npy'); satf=np.load('out/satf.npy')
def grade(a):
    a=a.astype(np.float32)/255
    a=np.clip((a-0.03)*1.12,0,1)
    return (a*255).astype(np.uint8)
Image.fromarray(grade(satn)).save('pub/sat_near.jpg',quality=86); Image.fromarray(grade(satf)).save('pub/sat_far.jpg',quality=86)
# vegetation mask from satellite
s=satn.astype(np.float32); r,g,b=s[...,0],s[...,1],s[...,2]
veg=((g>r*1.06)&(g>b*1.12)&((r+g+b)/3<105)).astype(np.uint8)*255
veg=np.asarray(Image.fromarray(veg).filter(ImageFilter.MedianFilter(5)))
Image.fromarray(veg).save('out/veg.png')
# ---- masks at 1m/px over R=1800
R=1800; M=3600
def to_px(p,half,N): return [((x+half)/(2*half)*N,(z+half)/(2*half)*N) for x,z in p]
occ=Image.new('L',(M,M),0); d=ImageDraw.Draw(occ)
for p,h,base,kind,A in B:
    if max(abs(p[0][0]),abs(p[0][1]))<R+50: d.polygon(to_px(p,R,M),fill=255)
for p,w,hw,tun,br in roads:
    if tun: continue
    if any(max(abs(x),abs(z))<R for x,z in p): d.line(to_px(p,R,M),fill=200,width=max(1,int(w+2)))
for p in water: d.polygon(to_px(p,R,M),fill=255)
towers=[[tuple(q) for q in t['p']] for t in T]
for q in towers: d.polygon(to_px(q,R,M),fill=255)
occ=np.asarray(occ.filter(ImageFilter.MaxFilter(5)))
sitem=np.asarray(raster_poly([site],R,M))
def demn(x,z):
    fx=(x+HN)/(2*HN)*NN-0.5; fz=(z+HN)/(2*HN)*NN-0.5
    i=int(min(max(fx,0),NN-2)); j=int(min(max(fz,0),NN-2)); a=min(max(fx-i,0),1); c=min(max(fz-j,0),1)
    return (dn[j,i]*(1-a)+dn[j,i+1]*a)*(1-c)+(dn[j+1,i]*(1-a)+dn[j+1,i+1]*a)*c
def vegat(x,z):
    i=int((x+HN)/(2*HN)*2048); j=int((z+HN)/(2*HN)*2048)
    return veg[min(max(j,0),2047),min(max(i,0),2047)]>0
def free(x,z):
    i=int((x+R)/(2*R)*M); j=int((z+R)/(2*R)*M)
    return 0<=i<M and 0<=j<M and occ[j,i]==0
bocc=Image.new('L',(M,M),0); d2=ImageDraw.Draw(bocc)
for p,h,base,kind,A in B:
    if max(abs(p[0][0]),abs(p[0][1]))<R+50: d2.polygon(to_px(p,R,M),fill=255)
bocc=np.asarray(bocc.filter(ImageFilter.MaxFilter(5)))
def bfree(x,z):
    i=int((x+R)/(2*R)*M); j=int((z+R)/(2*R)*M)
    return 0<=i<M and 0<=j<M and bocc[j,i]==0
def ins(x,z):
    i=int((x+R)/(2*R)*M); j=int((z+R)/(2*R)*M)
    return 0<=i<M and 0<=j<M and sitem[j,i]>0
trees=[]  # x,z,size(m crown radius),kind 0 broadleaf 1 pine 2 cherry 3 ginkgo 4 zelkova 5 maple
def lowf(x,z): return math.sin(x*0.011+1.3)*math.cos(z*0.013+0.7)+0.5*math.sin(x*0.031-z*0.027)
step=6.2
n=int(2*R/step)
for a in range(n):
    for c in range(n):
        x=-R+(a+rnd.random())*step; z=-R+(c+rnd.random())*step
        if x*x+z*z>R*R or ins(x,z): continue
        if vegat(x,z) and free(x,z):
            k=1 if lowf(x,z)>0.55+rnd.random()*0.5 else (5 if rnd.random()<0.06 else 0)
            trees.append((x,z,rnd.uniform(3.2,5.6),k))
nf=len(trees)
# street trees
for p,w,hw,tun,br in roads:
    if tun or hw not in('primary','secondary','tertiary','residential','trunk'): continue
    if hw=='residential' and w<6.5: continue
    k=[3,4,2,3,4][int(h01(str(p[0]))*5)]
    acc=rnd.random()*8
    for (x0,z0),(x1,z1) in zip(p,p[1:]):
        L=math.hypot(x1-x0,z1-z0)
        if L<1: continue
        ux,uz=(x1-x0)/L,(z1-z0)/L
        while acc<L:
            for sgn in(-1,1):
                x=x0+ux*acc-uz*sgn*(w/2+2.2); z=z0+uz*acc+ux*sgn*(w/2+2.2)
                if x*x+z*z<1100**2 and bfree(x,z) and not ins(x,z): trees.append((x,z,rnd.uniform(2.4,3.6),k))
            acc+=8.5
        acc-=L
ns=len(trees)-nf
# complex landscaping
ave_a=plan2s(240,870); ave_b=plan2s(790,425)
def dist_seg(x,z,a,b):
    vx,vz=b[0]-a[0],b[1]-a[1]; t=max(0,min(1,((x-a[0])*vx+(z-a[1])*vz)/(vx*vx+vz*vz)))
    return math.hypot(x-a[0]-vx*t,z-a[1]-vz*t),t
lawn_c=plan2s(540,920)
pts=[]
tries=0
xs=[p[0] for p in site]; zs=[p[1] for p in site]
while len(pts)<620 and tries<60000:
    tries+=1
    x=rnd.uniform(min(xs),max(xs)); z=rnd.uniform(min(zs),max(zs))
    if not ins(x,z) or not free(x,z): continue
    dv,t=dist_seg(x,z,ave_a,ave_b)
    if dv<5: continue                      # avenue itself clear
    if math.hypot(x-lawn_c[0],z-lawn_c[1])<17: continue
    if any((x-a)**2+(z-c)**2<3.4**2 for a,c,_,_ in pts): continue
    if dv<11: k=2
    else: k=rnd.choice([0,0,4,4,1,1,5,2,3])
    pts.append((x,z,rnd.uniform(2.2,3.8) if k!=1 else rnd.uniform(2.0,3.0),k))
trees+=pts
print('trees forest',nf,'street',ns,'complex',len(pts))
# ---- pack binary
blobs=[];idx={};off=0
def put(name,arr):
    global off
    arr=np.ascontiguousarray(arr); pad=(-off)%4
    if pad: blobs.append(b'\0'*pad); off+=pad
    idx[name]={'o':off,'n':int(arr.size),'t':str(arr.dtype)}; blobs.append(arr.tobytes()); off+=arr.nbytes
q=lambda v:int(round(v*4))
B.sort(key=lambda b:b[0][0][0]**2+b[0][0][1]**2)
boff=[0];bxy=[]
for p,h,base,kind,A in B:
    for x,z in p: bxy+= [q(x),q(z)]
    boff.append(len(bxy)//2)
put('b_off',np.array(boff,np.uint32)); put('b_xy',np.array(bxy,np.int16))
put('b_h',np.array([min(65535,round(b[1]*10)) for b in B],np.uint16)); put('b_base',np.array([round(b[2]*10) for b in B],np.int16)); put('b_kind',np.array([b[3] for b in B],np.uint8))
put('t_xy',np.array([[q(x),q(z)] for x,z,s,k in trees],np.int16)); put('t_y',np.array([round((demn(x,z)-PAD)*10) for x,z,s,k in trees],np.int16))
put('t_s',np.array([round(s*20) for x,z,s,k in trees],np.uint8)); put('t_k',np.array([k for x,z,s,k in trees],np.uint8))
rsel=[r for r in roads if (r[2] in('service','footway','pedestrian','living_street','path','cycleway') and min(math.hypot(x,z) for x,z in r[0])<800) or r[2] in('motorway','trunk','primary','secondary','tertiary','residential','unclassified','motorway_link','trunk_link','primary_link','secondary_link') and not (r[2] in('residential','unclassified') and min(math.hypot(x,z) for x,z in r[0])>1500)]
roff=[0];rxy=[]
for p,w,hw,tun,br in rsel:
    for x,z in p: rxy+=[q(max(-8000,min(8000,x))),q(max(-8000,min(8000,z)))]
    roff.append(len(rxy)//2)
put('r_off',np.array(roff,np.uint32)); put('r_xy',np.array(rxy,np.int16)); put('r_w',np.array([min(255,round(r[1]*5)) for r in rsel],np.uint8))
put('r_c',np.array([{'motorway':5,'trunk':5,'primary':4,'secondary':3,'tertiary':2,'service':0,'living_street':0,'footway':6,'pedestrian':6,'path':6,'cycleway':6}.get(r[2],1 if 'link' not in r[2] else 3)|(8 if r[3] else 0) for r in rsel],np.uint8))
wsel=[(p,l) for p,l in zip(water,wlev) if abs(area(p))>300 and min(max(abs(x),abs(z)) for x,z in p)<4000]
woff=[0];wxy=[]
for p,l in wsel:
    for x,z in p: wxy+=[q(max(-8000,min(8000,x))),q(max(-8000,min(8000,z)))]
    woff.append(len(wxy)//2)
put('w_off',np.array(woff,np.uint32)); put('w_xy',np.array(wxy,np.int16)); put('w_lv',np.array([round((l-PAD)*10) for p,l in wsel],np.int16))
lsel=[]
for nd,t in bd.ways.values():
    k=None
    if t.get('leisure')=='pitch': k=1
    elif t.get('amenity')=='parking': k=2
    elif t.get('landuse') in('grass','meadow','village_green') or t.get('leisure') in('park','garden'): k=0
    elif t.get('leisure')=='playground': k=3
    if k is None or len(nd)<4 or nd[0]!=nd[-1]: continue
    p=bd.poly(nd[:-1])
    if len(p)>=3 and min(math.hypot(x,z) for x,z in p)<900: lsel.append((p,k))
loff=[0];lxy=[]
for p,k in lsel:
    for x,z in p: lxy+=[q(max(-8000,min(8000,x))),q(max(-8000,min(8000,z)))]
    loff.append(len(lxy)//2)
put('l_off',np.array(loff,np.uint32)); put('l_xy',np.array(lxy,np.int16)); put('l_k',np.array([k for p,k in lsel],np.uint8))
put('dem_n',np.round((dn-PAD)*10).astype(np.int16)); put('dem_f',np.round((df-PAD)*10).clip(-32000,32000).astype(np.int16))
open('pub/world.bin','wb').write(b''.join(blobs))
meta={'idx':idx,'HN':HN,'NN':NN,'HF':HF,'NF':NF,'PAD':PAD,'towers':T,'site':[[round(x,1),round(z,1)] for x,z in site],
 'frame':{'lat':bd.LAT0,'lon':bd.LON0,'bearing':bd.BN,'rE':bd.rE,'rN':bd.rN,'nE':bd.nE,'nN':bd.nN},
 'ave':[ave_a,ave_b],'lawn':lawn_c}
json.dump(meta,open('pub/world.json','w'))
print('bin',off/1e6,'MB','roads',len(rsel),'water',len(wsel))
pickle.dump(dict(trees=trees,meta=meta),open('stage2.pkl','wb'))
