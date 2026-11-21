"""Pack Poly Haven asphalt_04 (CC0) as a single mipmapped material source."""
import hashlib
import io
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

root=Path(__file__).resolve().parents[1]
def fetch_image(meta,channel):
    item=meta[channel]['1k']['jpg']
    data=urlopen(item['url'],timeout=30).read()
    if hashlib.md5(data).hexdigest()!=item['md5']:
        raise ValueError('Unexpected download: '+channel)
    return Image.open(io.BytesIO(data))
if __name__=='__main__':
    meta=json.load(urlopen('https://api.polyhaven.com/files/asphalt_04',timeout=30))
    albedo=fetch_image(meta,'Diffuse').convert('L')
    nx,ny,_=fetch_image(meta,'nor_gl').convert('RGB').split()
    rough=fetch_image(meta,'Rough').convert('L')
    packed=Image.merge('RGBA',(albedo,nx,ny,rough))
    with tempfile.TemporaryDirectory() as tmp:
        source=Path(tmp)/'asphalt.png'
        packed.save(source)
        subprocess.run(['basisu','-ktx2','-uastc','-uastc_level','2','-uastc_rdo_l','1',
                        '-linear','-y_flip','-mipmap','-file',str(source),'-output_file',str(root/'data/asphalt.ktx2')],check=True)
    packed.resize((512,512),Image.Resampling.BOX).save(root/'data/asphalt.webp',lossless=True,method=6)
