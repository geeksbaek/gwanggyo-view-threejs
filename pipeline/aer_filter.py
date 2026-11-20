import math,json,sys,numpy as np
from PIL import Image,ImageDraw,ImageFilter
import frame
from geo import LAT0,LON0,MX,MY
Image.MAX_IMAGE_PIXELS=None
z=18;n=2**z; x0,y0,R=223588,101781,10
TH=float(sys.argv[1]) if len(sys.argv)>1 else 0.45
frac=np.load('aer/frac.npy'); H,Wd=frac.shape
fm=np.asarray(Image.fromarray((frac*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))).astype(np.float32)/255
def pix(x,zz):
    E=x*frame.rE-zz*frame.nE; Nn=x*frame.rN-zz*frame.nN
    lon=LON0+E/MX; lat=LAT0+Nn/MY
    return ((lon+180)/360*n-(x0-R))*256, ((1-np.arcsinh(np.tan(np.radians(lat)))/math.pi)/2*n-(y0-R))*256
w=json.load(open('app/world.json')); B=open('app/world.wasm','rb').read()
def arr(nm):
    d=w['idx'][nm]; return np.frombuffer(B,dtype={'uint32':'<u4','int16':'<i2','uint16':'<u2','uint8':'u1'}[d['t']],count=d['n'],offset=d['o'])
t=arr('t_xy').reshape(-1,2)/4; tk=arr('t_k')
px,py=pix(t[:,0],t[:,1]); inb=(px>8)&(py>8)&(px<Wd-8)&(py<H-8)
pxi=np.clip(px.astype(int),0,Wd-1); pyi=np.clip(py.astype(int),0,H-1)
f=fm[pyi,pxi]
site=np.array(w['site'])
def pip(x,zz,p):
    c=np.zeros(len(x),bool); j=len(p)-1
    for i in range(len(p)):
        a,bb=p[i],p[j]; cond=((a[1]>zz)!=(bb[1]>zz))&(x<(bb[0]-a[0])*(zz-a[1])/(bb[1]-a[1]+1e-12)+a[0]); c^=cond; j=i
    return c
ins=pip(t[:,0],t[:,1],site)
keep=ins|(~inb)|(f>TH)
print('total',len(t),'in aerial',inb.sum(),'complex',ins.sum(),'dropped',(~keep).sum())
for k in range(6): print('kind',k,(tk==k).sum(),'dropped',((tk==k)&~keep).sum())
np.save('aer/keep.npy',keep)
# overlay near home: +-420 m crop
im=Image.new('RGB',(Wd,H))
for i in range(-R,R+1):
    for j in range(-R,R+1):
        try: im.paste(Image.open(f'aer/{x0+i}_{y0+j}.jpg'),((i+R)*256,(j+R)*256))
        except Exception: pass
d=ImageDraw.Draw(im)
for (a,b,k) in zip(px,py,keep):
    if 8<a<Wd-8 and 8<b<H-8: d.ellipse((a-3,b-3,a+3,b+3),outline=(60,255,60) if k else (255,40,40),width=2)
cx,cy=pix(0,0); cx,cy=int(cx),int(cy)
im.crop((cx-900,cy-900,cx+900,cy+900)).save('aer/keep_c.jpg',quality=85)
