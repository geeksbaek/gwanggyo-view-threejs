# real road surface + paint from Esri World Imagery z19 -> pub/roadpaint.png (R white paint, G yellow paint, B surface: 128 asphalt, 255 red paving)
import math,os,sys,json,numpy as np,urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageFilter,ImageDraw
import frame
from geo import LAT0,LON0,MX,MY
Z=19;n=2**Z; HALF=400; N=4096
x0,x1,y0,y1=447167,447187,203554,203574
def get(j):
    x,y=j; f=f'aer19/{x}_{y}.jpg'
    if os.path.exists(f) and os.path.getsize(f)>500: return
    for k in range(4):
        try:
            d=urllib.request.urlopen(urllib.request.Request(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{y}/{x}',headers={'User-Agent':'Mozilla/5.0'}),timeout=40).read(); open(f,'wb').write(d); return
        except Exception as e: err=e
    print('fail',x,y,err)
jobs=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
with ThreadPoolExecutor(8) as ex: list(ex.map(get,jobs))
W_=(x1-x0+1)*256; H_=(y1-y0+1)*256
big=Image.new('RGB',(W_,H_))
for x,y in jobs:
    try: big.paste(Image.open(f'aer19/{x}_{y}.jpg').convert('RGB'),((x-x0)*256,(y-y0)*256))
    except Exception as e: print('bad',x,y)
A=np.asarray(big).astype(np.float32)
# resample to the model grid: pixel (i,j) -> x=-HALF+(i+.5)*2HALF/N, z likewise
g=(np.arange(N)+0.5)*2*HALF/N-HALF; X,Zz=np.meshgrid(g,g)
E=X*frame.rE-Zz*frame.nE; Nn=X*frame.rN-Zz*frame.nN
lon=LON0+E/MX; lat=LAT0+Nn/MY
px=((lon+180)/360*n-x0)*256; py=((1-np.arcsinh(np.tan(np.radians(lat)))/math.pi)/2*n-y0)*256
pxi=np.clip(px,0,W_-1.01); pyi=np.clip(py,0,H_-1.01); ix=pxi.astype(int); iy=pyi.astype(int); fx=(pxi-ix)[...,None]; fy=(pyi-iy)[...,None]
M=(A[iy,ix]*(1-fx)+A[iy,ix+1]*fx)*(1-fy)+(A[iy+1,ix]*(1-fx)+A[iy+1,ix+1]*fx)*fy
Image.fromarray(M.astype(np.uint8)).save('aer19/model.jpg',quality=92)
np.save('aer19/model.npy',M.astype(np.uint8))
print('done',M.shape)
