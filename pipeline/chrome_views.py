"""Capture the five reference views with Chromium and the pinned local Three.js."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VIEWS = [('overview','drone',13), ('street','street',13), ('living','living',13),
         ('kitchen','kitchen',13), ('night','living',21)]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--chrome',default='chromium')
    parser.add_argument('--software',action='store_true',help='Use SwiftShader in a GPU-less environment')
    parser.add_argument('--html',type=Path,default=ROOT/'index.html')
    args=parser.parse_args()
    from shutil import which
    binary=which(args.chrome)
    if not binary:
        parser.error('Chrome executable missing: '+args.chrome)
    args.output.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    errors=[]
    with sync_playwright() as pw:
        flags=['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.software else []
        browser=pw.chromium.launch(executable_path=binary,args=flags)
        page=browser.new_page(viewport={'width':960,'height':560},device_scale_factor=1)
        page.route('**/index.html*',lambda r:r.fulfill(body=args.html.read_text(),content_type='text/html'))
        prefix='https://cdn.jsdelivr.net/npm/three@0.169.0/'
        def serve_three(route):
            path = ROOT/'node_modules/three'/route.request.url[len(prefix):]
            mime = 'application/wasm' if path.suffix == '.wasm' else 'application/javascript'
            route.fulfill(path=path,content_type=mime,headers={'Access-Control-Allow-Origin':'*'})
        page.route(prefix+'**',serve_three)
        results = {}
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'THREE.' in m.text else None)
        page.goto(base+'/index.html?shot&nomsaa',wait_until='domcontentloaded')
        page.wait_for_function('window.__gg',timeout=180000)
        for name,view,hour in VIEWS:
            page.evaluate("""([view,hour])=>{__gg.set({doy:168,hour,weather:'clear',lights:'auto'});
              __gg.goView(view,true); document.getElementById('stage').classList.add('clean'); __gg.frame(2)}""",[view,hour])
            page.screenshot(path=args.output/(name+'.jpg'),quality=90,timeout=150000)
            info = page.evaluate('__gg.info()')
            if 'indoorLoaded' in info:
                assert info['indoorLoaded'] == (view not in ('drone','street')), (view,info)
            if not args.software:
                info['gpuFrameMs'] = page.evaluate('''async () => {
                  const gl = document.querySelector('#cv').getContext('webgl2');
                  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
                  if (!ext) return null;
                  const q = gl.createQuery();
                  gl.beginQuery(ext.TIME_ELAPSED_EXT,q); __gg.frame(1); gl.endQuery(ext.TIME_ELAPSED_EXT);
                  gl.flush();
                  try {
                    for (let i=0; i<100; i++) {
                      await new Promise(resolve=>setTimeout(resolve,20));
                      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return null;
                      if (gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)) return gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;
                    }
                    return null;
                  } finally { gl.deleteQuery(q); }
                }''')
            results[name] = info
            print(name,info,flush=True)
        (args.output/'metrics.json').write_text(json.dumps(results,indent=2)+'\n')
        browser.close()
    server.server_close()
    if errors:
        raise RuntimeError('\n'.join(errors))

if __name__=='__main__':
    main()
