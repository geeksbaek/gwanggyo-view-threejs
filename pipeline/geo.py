import math,os,io,urllib.request,numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
LAT0,LON0=37.27629,127.05241
MX=111320*math.cos(math.radians(LAT0)); MY=110950
def tx(lon,n):return (lon+180)/360*n
def ty(lat,n):return (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
def get(url,f):
    if os.path.exists(f) and os.path.getsize(f)>100: return
    for k in range(4):
        try:
            r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            d=urllib.request.urlopen(r,timeout=40).read(); open(f,'wb').write(d); return
        except Exception as e: err=e
    print('fail',url,err)
def mosaic(kind,Z,half,N):
    """return N x N array sampled over [-half,half] m (row0 = north, i.e. z=-half)"""
    n=2**Z
    lonA,lonB=LON0-half/MX,LON0+half/MX; latN,latS=LAT0+half/MY,LAT0-half/MY
    xa,xb=int(tx(lonA,n)),int(tx(lonB,n)); ya,yb=int(ty(latN,n)),int(ty(latS,n))
    jobs=[]
    for x in range(xa,xb+1):
        for y in range(ya,yb+1):
            if kind=='dem': u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'; f=f'tiles/dem_{Z}_{x}_{y}.png'
            else: u=f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{Z}/{y}/{x}.jpg'; f=f'tiles/sat_{Z}_{x}_{y}.jpg'
            jobs.append((u,f,x,y))
    print(kind,Z,len(jobs),'tiles')
    with ThreadPoolExecutor(8) as ex: list(ex.map(lambda j:get(j[0],j[1]),jobs))
    W=(xb-xa+1)*256;H=(yb-ya+1)*256
    big=np.zeros((H,W,3),np.float32)
    for u,f,x,y in jobs:
        big[(y-ya)*256:(y-ya+1)*256,(x-xa)*256:(x-xa+1)*256]=np.asarray(Image.open(f).convert('RGB'))
    if kind=='dem': big=(big[...,0]*256+big[...,1]+big[...,2]/256-32768)[...,None]
    xs=-half+(np.arange(N)+0.5)/N*2*half; zs=-half+(np.arange(N)+0.5)/N*2*half
    px=(tx(LON0+xs/MX,n)-xa)*256-0.5; py=(np.array([ty(LAT0-z/MY,n) for z in zs])-ya)*256-0.5
    PX,PY=np.meshgrid(px,py)
    x0=np.clip(np.floor(PX).astype(int),0,W-2);y0=np.clip(np.floor(PY).astype(int),0,H-2)
    fx=(PX-x0)[...,None];fy=(PY-y0)[...,None]
    out=(big[y0,x0]*(1-fx)+big[y0,x0+1]*fx)*(1-fy)+(big[y0+1,x0]*(1-fx)+big[y0+1,x0+1]*fx)*fy
    return out
