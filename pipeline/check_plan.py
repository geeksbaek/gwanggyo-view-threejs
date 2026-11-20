"""Cross-check relative tower registration against the 1095 x 2400 published plan."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

world = json.loads((Path(__file__).resolve().parents[1] / 'world.json').read_text())
image = np.asarray(Image.open(sys.argv[1]).convert('RGB'), dtype=int)
if image.shape[:2] != (2400, 1095):
    raise ValueError('Expected the 1095 × 2400 site plan and stack chart.')
colors = [(242,154,126),(246,185,29),(241,123,124),(106,132,194),
          (131,183,227),(212,228,131),(166,207,121)]
# Search windows around each tower, in a 3/8-scale overview.
windows = [(78,373,145,425),(98,292,152,345),(100,189,165,254),
           (106,116,177,172),(199,115,260,164),(222,184,292,234),
           (187,262,256,325),(193,341,242,389),(190,399,247,448)]
pixels, coordinates = [], []
frame = world['frame']
for number, box in enumerate(windows, 1701):
    left, top, right, bottom = [round(p*8/3) for p in box]
    crop = image[top:bottom, left:right]
    mask = np.zeros(crop.shape[:2], dtype=bool)
    for color in colors:
        mask |= ((crop-color)**2).sum(axis=2) < 18**2
    y, x = np.where(mask)
    pixels.append([x.mean()+left, y.mean()+top, 1])
    weight = cx = cz = 0
    for tower in world['towers']:
        if tower['name'] != str(number):
            continue
        ring = np.array(tower['p'])
        following = np.roll(ring, -1, axis=0)
        cross = ring[:,0]*following[:,1] - following[:,0]*ring[:,1]
        weight += cross.sum()
        sx, sz = ((ring+following)*cross[:,None]).sum(axis=0)
        cx += sx
        cz += sz
    cx, cz = cx/(3*weight), cz/(3*weight)
    coordinates.append([cx*frame['rE']-cz*frame['nE'], cx*frame['rN']-cz*frame['nN']])

pixels, coordinates = np.array(pixels), np.array(coordinates)
errors = []
for index in range(len(windows)):
    use = np.arange(len(windows)) != index
    transform = np.linalg.lstsq(pixels[use], coordinates[use], rcond=None)[0]
    errors.append(np.linalg.norm(pixels[index] @ transform - coordinates[index]))
print('Full-plan pixel to east/north affine coefficients')
print(np.linalg.lstsq(pixels, coordinates, rcond=None)[0])
print(f'Leave-one-out RMS {np.sqrt(np.mean(np.square(errors))):.2f} m, max {max(errors):.2f} m')
