import json,numpy as np
from PIL import Image,ImageDraw,ImageFilter
HALF=400;N=4096;k=N/(2*HALF)
M=np.load('aer19/model.npy').astype(np.float32); R,G,B=M[...,0],M[...,1],M[...,2]
w=json.load(open('app/world.json')); D=open('app/world.wasm','rb').read()
def arr(nm):
    d=w['idx'][nm]; return np.frombuffer(D,dtype={'uint32':'<u4','int16':'<i2','uint16':'<u2','uint8':'u1'}[d['t']],count=d['n'],offset=d['o'])
ro=arr('r_off'); rx=arr('r_xy').reshape(-1,2)/4; rw=arr('r_w')/5; rc=arr('r_c')
def corridor(extra,minw=0):
    im=Image.new('L',(N,N),0); d=ImageDraw.Draw(im)
    for i in range(len(rw)):
        c=rc[i]&7
        if c==6 or (rc[i]&8) or rw[i]<0: continue
        p=rx[ro[i]:ro[i+1]]
        if np.abs(p).min()>HALF+40: continue
        pts=[((x+HALF)*k,(z+HALF)*k) for x,z in p]; wd=int((max(rw[i],minw)+extra)*k)
        d.line(pts,fill=255,width=wd,joint='curve')
        for q in pts: d.ellipse((q[0]-wd/2,q[1]-wd/2,q[0]+wd/2,q[1]+wd/2),fill=255)
    return np.asarray(im)>0
wide=corridor(9,6); core=corridor(-1.5,3)
rw0=rw.copy(); rw=np.where((rw>=6)|((rc&7)>=2),rw,-100.0); big=corridor(7,0); rw=rw0
site=Image.new('L',(N,N),0); ImageDraw.Draw(site).polygon([((x+HALF)*k,(z+HALF)*k) for x,z in w['site']],fill=255); site=np.asarray(site)>0
lum=0.3*R+0.59*G+0.11*B; mx=np.maximum(np.maximum(R,G),B); mn=np.minimum(np.minimum(R,G),B); sat=(mx-mn)/np.maximum(mx,1)
def med(a,s): return np.asarray(Image.fromarray(np.clip(a,0,255).astype(np.uint8)).filter(ImageFilter.MedianFilter(s))).astype(np.float32)
def mxf(m,s): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(s)))>0
def mnf(m,s): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MinFilter(s)))>0
lm=med(lum,11)
grey=(sat<0.17)&(lm>50)&(lm<165)
red=(R-G>30)&(R-B>38)&(sat>0.22)&(lum>70)&(lum<205)&wide
red=mnf(mxf(red,5),5); red=mnf(red,3)
asph=(grey&wide)|core; asph=mnf(mxf(asph,9),9)&wide&~red          # close over cars
asph=np.asarray(Image.fromarray((asph*255).astype(np.uint8)).filter(ImageFilter.MedianFilter(7)))>0
road=asph|red
white=road&big&(lum-lm>17)&(lum>1.16*lm)&(sat<0.22)
thick=mxf(mnf(white,7),21); white&=~thick                             # cars, buses, roofs
yb=R-B; yellow=road&big&(yb-med(yb,11)>11)&(R>G-6)&(G>B+8)&(lum>lm*1.02)&(lum>80)&~white
yellow&=~mxf(mnf(yellow,5),17); yellow&=mxf(mnf(mxf(yellow,3),3),3)
yellow=white&(R-B>26)&(G-B>14); white&=~yellow
for m in (asph,red,white,yellow): m&=~site
out=np.zeros((N,N,3),np.uint8); out[...,0]=white*255; out[...,1]=yellow*255; out[...,2]=np.where(red,255,np.where(asph,128,0))
Image.fromarray(out).save('pub_roadpaint.png',optimize=True)
# preview: repaint
pv=M.copy()*0.35; pv[asph]=[70,71,75]; pv[red]=[150,80,66]; pv[white]=[240,240,236]; pv[yellow]=[226,186,60]
Image.fromarray(pv.astype(np.uint8)).save('aer19/pv.jpg',quality=90)
c=(2500,1900,3100,2500)
a=Image.fromarray(M.astype(np.uint8)).crop(c); b=Image.fromarray(pv.astype(np.uint8)).crop(c); m=Image.new('RGB',(1200,600)); m.paste(a,(0,0)); m.paste(b,(600,0)); m.resize((2000,1000),Image.LANCZOS).save('aer19/cmp2.jpg',quality=88)
t=yb-med(yb,11); print('yb tophat pct in road',np.percentile(t[road&big],[50,90,97,99,99.7]), 'G-B',np.percentile((G-B)[road&big],[50,90,99]))
import os; print(os.path.getsize('pub_roadpaint.png'), white.mean(), yellow.mean(), asph.mean(), red.mean())
