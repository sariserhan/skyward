"""Local, deterministic customer-flow regression. No live feed or paid service needed."""
from pathlib import Path
import json, os, socket, subprocess, tempfile, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
ARTIFACTS=Path(os.environ.get('SKYWARD_QA_ARTIFACTS',tempfile.mkdtemp(prefix='skyward-browser-')));ARTIFACTS.mkdir(parents=True,exist_ok=True)
INIT="""Object.defineProperty(window,'Cesium',{configurable:true,get(){return this.__C},set(value){const V=value.Viewer;this.__C=new Proxy(value,{get(t,k){if(k==='Viewer')return new Proxy(V,{construct(t,args){const v=Reflect.construct(t,args);window.__viewer=v;return v;}});return t[k]}})}});window.__shift=0;const actualNow=Date.now.bind(Date);Date.now=()=>actualNow()+window.__shift;localStorage.setItem('skyward.map.v1',JSON.stringify({basemap:'atlas',structures:false,quality:'low',autoQuality:false,offlineMaps:false,reducedMotion:false}));"""
phase=0;anchor=int(time.time()*1000)
def rows():
 a=dict(hex='abcdef',callsign='THY111',registration='TC-TEST',aircraftType='B738',lat=38.95,lon=-77.8+phase*.2,altitude=35000,ground=False,groundSpeed=500,heading=90,verticalRate=0,observedAt=anchor-60000+phase*30000,sourceType='test fixture',category='A3',targetKind='aircraft')
 return [a,{**a,'hex':'123abc','callsign':'SIA222','registration':'9V-TEST','aircraftType':'A320','lon':a['lon']-.1},{**a,'hex':'dddddd','callsign':'OLD333','lon':a['lon']+1,'lat':a['lat']+.5,'observedAt':anchor-300000}]
def mock(r):
 u=urllib.parse.urlparse(r.request.url);q=urllib.parse.parse_qs(u.query);stamp=int(time.time()*1000)
 if u.path=='/api/status':r.fulfill(json=dict(started=10,failed=0,pending=0,cacheHits=3,meanProviderMs=200,lastSuccessAt=stamp,lastPositionAt=stamp));return
 if u.path=='/api/route':r.fulfill(json=dict(callsign=q.get('callsign',['THY111'])[0],source='Test fixture',sourceUrl='https://example.invalid',fetchedAt=stamp,status='PLAUSIBLE',airports=[dict(icao='KIAD',iata='IAD',name='Dulles',city='Washington',lat=38.947,lon=-77.46),dict(icao='EGLL',iata='LHR',name='Heathrow',city='London',lat=51.47,lon=-.45)]));return
 data=rows()
 if u.path=='/api/search':data=[a for a in data if a['hex']==q.get('q',[''])[0] or a['callsign']==q.get('q',[''])[0]]
 r.fulfill(json=dict(source='fixture',sourceAt=stamp,fetchedAt=stamp,aircraft=data))
def run(page):
 global phase
 errors=[];console=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
 page.add_init_script(INIT);page.route('**/api/**',mock);page.goto(URL+'/#airport=IAD',wait_until='domcontentloaded');page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=30000);page.wait_for_function('window.__viewer');assert 'Skyward' in page.title()
 def tools():
  if page.locator('.unified-map-tools').get_attribute('open') is None:page.locator('.unified-map-tools>summary').click()
 def close_tools():page.locator('.unified-map-tools').evaluate('(e)=>e.open=false')
 def disjoint(a,b):
  x=a.bounding_box();y=b.bounding_box();assert x and y
  assert x['x']+x['width']<=y['x'] or y['x']+y['width']<=x['x'] or x['y']+x['height']<=y['y'] or y['y']+y['height']<=x['y'],(x,y)
 tools();page.get_by_label('Hide stale aircraft',exact=False).check();page.wait_for_function("!__viewer.entities.getById('aircraft-dddddd')");page.get_by_label('Hide stale aircraft',exact=False).uncheck();close_tools();print('PASS stale filter',flush=True)
 for i in [1,2]:
  phase=i;page.get_by_role('button',name='Refresh airport traffic',exact=True).click();page.wait_for_timeout(700)
 page.keyboard.press('/');search=page.get_by_role('dialog',name='Search Skyward');search.get_by_role('textbox',name='Search airports, flights and controls').fill('Turkish');page.get_by_label('Search type',exact=True).fill('738');page.get_by_label('Search registration',exact=True).fill('TC-');search.locator('.search-active').click();page.get_by_role('region',name='Aircraft details').wait_for();page.keyboard.press('/');search.get_by_role('region',name='Recent searches').wait_for();search.get_by_role('button',name='Clear search filters').click();search.get_by_role('textbox',name='Search airports, flights and controls').fill('nothingmatches');assert 'does not contain every flight worldwide' in search.inner_text();page.keyboard.press('Escape');print('PASS combined search, history and empty state',flush=True)
 route=page.get_by_role('region',name='Flight route overview');route.get_by_role('button',name='Show full route',exact=True).click();mode=page.get_by_role('region',name='Route mode');mode.wait_for();mode.get_by_label('Route distance units').select_option('km');assert 'km' in route.inner_text();mode.get_by_role('button',name='Fit complete route').click();page.wait_for_timeout(1400);assert page.evaluate("__viewer.entities.values.some(e=>!e.id.startsWith('facility-')&&e.polyline&&e.polyline.material instanceof Cesium.PolylineDashMaterialProperty)");page.screenshot(path=str(ARTIFACTS/'route.png'));mode.get_by_role('button',name='Exit route mode').click();page.wait_for_timeout(1000);assert not mode.count();print('PASS dedicated route mode and unit conversion',flush=True)
 page.get_by_role('button',name='✈ Flight view',exact=True).click();flight=page.get_by_role('region',name='Passenger flight view');flight.wait_for();page.wait_for_timeout(1600)
 page.wait_for_function("__viewer.entities.getById('aircraft-abcdef')?.model?.uri",timeout=20000)
 pos=lambda:page.evaluate("Cesium.Cartographic.fromCartesian(__viewer.entities.getById('aircraft-abcdef').position.getValue(__viewer.clock.currentTime)).longitude")
 # Position the fixture clock inside the observed interval, even on slow CI GPUs.
 page.evaluate('(target)=>{window.__shift=target-(Date.now()-window.__shift)}',anchor+10000);page.wait_for_timeout(500)
 before=pos();page.wait_for_timeout(1600);assert pos()>before
 page.wait_for_function("__viewer.entities.getById('aircraft-abcdef').billboard.distanceDisplayCondition.getValue(__viewer.clock.currentTime).near>0",timeout=20000)
 tools();page.get_by_role('button',name='Viewpoints',exact=True).click();page.get_by_role('dialog',name='Camera bookmarks').wait_for();page.keyboard.press('Escape');tools();page.get_by_role('button',name='Performance',exact=True).click();page.get_by_role('dialog',name='Performance monitor').wait_for();page.keyboard.press('Escape');close_tools();disjoint(page.locator('.unified-map-tools>summary'),flight);page.screenshot(path=str(ARTIFACTS/'desktop.png'));print('PASS moving model and non-overlapping map tools',flush=True)
 flight.get_by_role('button',name='Route',exact=True).click();page.wait_for_timeout(1400);flight.get_by_role('button',name='chase',exact=True).click();page.wait_for_function("!__viewer.entities.values.some(e=>!e.id.startsWith('facility-')&&e.polyline&&e.polyline.material instanceof Cesium.PolylineDashMaterialProperty)");print('PASS route overlay cleanup',flush=True)
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500);disjoint(page.locator('.unified-map-tools>summary'),flight);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');tools();page.get_by_role('button',name='Viewpoints',exact=True).click();assert page.get_by_role('dialog',name='Camera bookmarks').bounding_box()['width']<390;page.keyboard.press('Escape');close_tools();page.screenshot(path=str(ARTIFACTS/'mobile.png'));page.get_by_role('button',name='Close flight view').click();page.set_viewport_size({'width':1440,'height':1000});print('PASS mobile controls',flush=True)
 # Hold the detailed resource request, then verify timed fallback and explicit retry.
 held=[];page.route('**/models/sourced/**',lambda r:held.append(r));page.get_by_role('button',name='View SIA222',exact=True).click();page.wait_for_timeout(1300);page.get_by_role('button',name='✈ Flight view',exact=True).click();page.wait_for_timeout(1500);assert held
 page.evaluate('window.__shift+=16000');page.get_by_role('button',name='Retry detailed model').wait_for(timeout=12000);page.wait_for_function("__viewer.entities.getById('aircraft-123abc').model.uri.getValue(__viewer.clock.currentTime).includes('/models/fleet/')",timeout=10000);page.wait_for_function("__viewer.entities.getById('aircraft-123abc').billboard.distanceDisplayCondition.getValue(__viewer.clock.currentTime).near>0",timeout=15000)
 page.unroute('**/models/sourced/**')
 for r in held:r.continue_()
 page.get_by_role('button',name='Retry detailed model').click();page.wait_for_function("__viewer.entities.getById('aircraft-123abc').model.uri.getValue(__viewer.clock.currentTime).includes('retry=1')");page.wait_for_function("__viewer.entities.getById('aircraft-123abc').billboard.distanceDisplayCondition.getValue(__viewer.clock.currentTime).near>0",timeout=20000);print('PASS timed model fallback and retry',flush=True)
 page.evaluate('window.__shift+=180000');page.wait_for_timeout(1500);flight=page.get_by_role('region',name='Passenger flight view');assert 'Awaiting live position' in flight.inner_text();old=page.evaluate("__viewer.entities.getById('aircraft-123abc').position.getValue(__viewer.clock.currentTime).x");page.wait_for_timeout(1000);assert abs(old-page.evaluate("__viewer.entities.getById('aircraft-123abc').position.getValue(__viewer.clock.currentTime).x"))<.01;print('PASS stale prediction pauses while waiting for observed position',flush=True)
 page.get_by_role('button',name='Close flight view').click();route=page.get_by_role('region',name='Flight route overview');route.get_by_role('button',name='View destination airport LHR').click();page.get_by_role('region',name='Airport details and traffic').wait_for();assert 'LHR' in page.locator('.airport-inspector').inner_text();print('PASS route endpoint navigation',flush=True)
 assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count();assert not errors,errors;assert not console,console;print('PASS no JavaScript or console errors',flush=True)
def serve(test_flow):
 global URL
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 URL=f'http://127.0.0.1:{port}'
 with open(ARTIFACTS/'server.log','w') as log:
  server=subprocess.Popen(['node','server/index.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1'},stdout=log,stderr=log)
  try:
   for _ in range(50):
    try:
     with urllib.request.urlopen(URL+'/healthz',timeout=1) as r:assert json.load(r)['service']=='skyward'
     break
    except Exception:time.sleep(.1)
   else:raise RuntimeError('Isolated server did not start')
   with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader']);page=browser.new_page(viewport={'width':1440,'height':1000})
    try:test_flow(page)
    except Exception:
     page.screenshot(path=str(ARTIFACTS/'failure.png'));raise
    finally:browser.close()
  finally:
   server.terminate()
   try:server.wait(timeout=5)
   except subprocess.TimeoutExpired:server.kill();server.wait()
   print('Browser evidence:',ARTIFACTS,flush=True)

if __name__=='__main__':serve(run)
