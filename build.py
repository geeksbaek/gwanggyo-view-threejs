import sys,glob
local=len(sys.argv)>1
base='./node_modules/three/' if local else 'https://cdn.jsdelivr.net/npm/three@0.169.0/'
imp='{"imports":{"three":"%sbuild/three.module.min.js","three/addons/":"%sexamples/jsm/"}}'%(base,base)
js="const NEIGHBORHOOD = " + open('data/neighborhood.json').read().strip() + ";\n"
js+="const JUNCTION = " + open('data/junction.json').read().strip() + ";\n"
js+=''.join(open(f).read()+'\n' for f in sorted(glob.glob('src/*.js')))
hdr="import * as THREE from 'three';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';\nimport { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';\n"
body=open('src/head.html').read()+'<script type="importmap">'+imp+'</script>\n<script type="module">\n'+hdr+js+'</script>\n'
if local: body='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'+body+'</body></html>'
open('gwanggyo-view.html','w').write(body)
if not local:
    wrap='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'+body+'</body></html>'
    open('index.html','w').write(wrap)
else:
    open('index.html','w').write(body)
