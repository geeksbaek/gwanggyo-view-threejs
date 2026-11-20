import sys,os
from PIL import Image
for t in sys.argv[1:]:
    fs=[f'v_{t}_{i}.jpg' for i in range(8) if os.path.exists(f'v_{t}_{i}.jpg')]
    if len(fs)<8: print('short',t,len(fs)); continue
    for part in (0,1):
        m=Image.new('RGB',(1920,1080))
        for i in range(4): m.paste(Image.open(fs[part*4+i]).resize((960,540)),((i%2)*960,(i//2)*540))
        m.save(f'g_{t}_{part}.jpg',quality=85)
