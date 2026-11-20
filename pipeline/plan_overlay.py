import re,sys
from PIL import Image, ImageDraw
s=open('app/src/30_home.js').read()
im=Image.open('/mnt/project-files/uploads/hearth/a645792c-491b-4556-9682-e334fb748502').convert('RGB')
d=ImageDraw.Draw(im,'RGBA'); K=132.9
X=lambda x:157+(x+2.25)*K; Y=lambda z:1369-(z-0.38)*K
num=r'(-?\d+\.?\d*)'
for m in re.finditer(r'wall\('+num+r', '+num+r', '+num+r', '+num+r'((?:, [^,)]+)*)\)',s):
    x0,x1,z0,z1=map(float,m.groups()[:4]); rest=[t.strip() for t in m.group(5).split(',') if t.strip()]
    full = (not rest) or rest[0]=='0'
    high = rest and rest[0] not in('0',) 
    col=(255,0,0,110) if (full and (len(rest)<2 or rest[1]=='H')) else ((0,160,255,110) if high else (255,160,0,120))
    d.rectangle([X(x0),Y(z1),X(x1),Y(z0)],fill=col,outline=(255,0,0,255))
for m in re.finditer(r"door\('([xz])', "+num+', '+num+', '+num+', '+num,s):
    ax=m.group(1); a0,a1,c0,c1=map(float,m.groups()[1:])
    r=[X(a0),Y(c1),X(a1),Y(c0)] if ax=='x' else [X(c0),Y(a1),X(c1),Y(a0)]
    d.rectangle(r,fill=(0,255,0,150),outline=(0,120,0,255))
im.save('ovl.png')
for i,(a,b,c,e) in enumerate([(60,100,1160,820),(1060,100,2160,820),(60,760,1160,1480),(1060,760,2160,1480)]): im.crop((a,b,c,e)).save(f'ovl{i}.jpg',quality=85)
