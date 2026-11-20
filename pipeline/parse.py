import xml.etree.ElementTree as ET,glob,json,sys
nodes={};ways={};rels={}
for f in glob.glob('osm/t_*.xml'):
    for ev,el in ET.iterparse(f):
        if el.tag=='node':
            nodes[el.get('id')]=(float(el.get('lat')),float(el.get('lon')),{t.get('k'):t.get('v') for t in el.findall('tag')})
        elif el.tag=='way':
            ways[el.get('id')]=([n.get('ref') for n in el.findall('nd')],{t.get('k'):t.get('v') for t in el.findall('tag')})
        elif el.tag=='relation':
            rels[el.get('id')]=([(m.get('type'),m.get('ref'),m.get('role')) for m in el.findall('member')],{t.get('k'):t.get('v') for t in el.findall('tag')})
        if el.tag in('node','way','relation'): el.clear()
import pickle;pickle.dump((nodes,ways,rels),open('osm.pkl','wb'))
print(len(nodes),len(ways),len(rels))
for i,(nd,t) in ways.items():
    n=t.get('name','')
    if '법원' in n or '구법원' in n:
        p=[nodes[x] for x in nd if x in nodes]
        print(n,t.get('highway'),t.get('tunnel'),t.get('layer'),round(sum(a[0] for a in p)/len(p),5),round(sum(a[1] for a in p)/len(p),5))
for i,(la,lo,t) in nodes.items():
    if '법원' in t.get('name',''): print(t['name'],la,lo)
