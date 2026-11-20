import xml.etree.ElementTree as ET,glob,pickle,collections
from geo import *
nodes={};ways={};rels={}
for f in glob.glob('osm/*.xml'):
    for ev,el in ET.iterparse(f):
        if el.tag=='node':
            nodes[el.get('id')]=((float(el.get('lon'))-LON0)*MX,-(float(el.get('lat'))-LAT0)*MY)
        elif el.tag=='way':
            t={x.get('k'):x.get('v') for x in el.findall('tag')}
            if t: ways[el.get('id')]=([n.get('ref') for n in el.findall('nd')],t)
            else: ways[el.get('id')]=([n.get('ref') for n in el.findall('nd')],{})
        elif el.tag=='relation':
            rels[el.get('id')]=([(m.get('type'),m.get('ref'),m.get('role')) for m in el.findall('member')],{x.get('k'):x.get('v') for x in el.findall('tag')})
        if el.tag in('node','way','relation'): el.clear()
pickle.dump((nodes,ways,rels),open('osm2.pkl','wb'))
c=collections.Counter()
for nd,t in ways.values():
    for k in('building','highway','natural','landuse','leisure','waterway'):
        if k in t: c[(k,t[k])]+=1
    if 'building' in t: c[('lv','building:levels' in t,'height' in t)]+=1
for k,v in sorted(c.items(),key=lambda x:-x[1])[:70]: print(k,v)
