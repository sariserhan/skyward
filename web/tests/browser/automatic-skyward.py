"""Automatic sparse-area traffic uses the same real-aircraft controls; no paid lookups."""
import time,urllib.parse,re
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];requests=[];count=0
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.add_init_script(f.INIT);page.add_init_script("localStorage.setItem('skyward.guide.v1','done')")
 def area(r):
  now=int(time.time()*1000);rows=[{**f.rows()[0],'hex':format(i+1,'06x'),'callsign':'REAL'+str(i),'lat':41.258+i*.001,'lon':69.28+i*.001,'observedAt':now,'altitude':5000} for i in range(count)];r.fulfill(json={'aircraft':rows,'source':'fixture','fetchedAt':now,'sourceAt':now})
 for path in ['area?*','aircraft?*']:page.route('**/api/'+path,area)
 for path in ['route?*','search?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/account',lambda r:r.fulfill(json={'enabled':False,'billingReady':False,'mode':'test','user':None,'usage':None}))
 page.goto(f.URL+'/#airport=TAS');assert 'Skyward' in page.title();page.wait_for_function("window.__viewer && __viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-tas-')).length===20",timeout=60000)
 assert not page.get_by_role('button',name='Try Skyward simulated traffic').count();assert not page.get_by_role('region',name='Skyward simulated traffic').count();expect(page.get_by_role('complementary',name='Simulated flight Premium upgrade')).to_have_count(0)
 assert page.evaluate("__viewer.entities.getById('aircraft-skyward-tas-0').billboard!==undefined")
 page.screenshot(path=str(f.ARTIFACTS/'automatic-map.jpg'),type='jpeg')
 # Click a visible aircraft icon on the canvas before exercising the list and cameras.
 page.wait_for_timeout(800)
 hit=page.evaluate("""()=>{const v=__viewer,r=v.canvas.getBoundingClientRect();for(const e of v.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-'))){const p=Cesium.SceneTransforms.worldToWindowCoordinates(v.scene,e.position.getValue(v.clock.currentTime));if(!p)continue;const x=r.left+p.x,y=r.top+p.y;if(document.elementFromPoint(x,y)!==v.canvas)continue;const picked=v.scene.pick(p);if(picked?.id===e)return{x,y};}return null;}""")
 assert hit,'No selectable Skyward airplane icon';page.mouse.click(hit['x'],hit['y']);expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('Simulated')
 page.get_by_role('button',name='View SKYTAS101',exact=True).click();expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('Simulated');page.get_by_role('button',name='✈ Flight view',exact=True).click();flight=page.get_by_role('region',name='Passenger flight view');expect(flight).to_contain_text('Skyward · Simulated')
 page.wait_for_function("__viewer.entities.getById('aircraft-skyward-tas-0').model?.uri.getValue(__viewer.clock.currentTime).includes('SKYWARD')")
 before=page.evaluate("__viewer.entities.getById('aircraft-skyward-tas-0').position.getValue(__viewer.clock.currentTime).x");page.wait_for_timeout(1000);after=page.evaluate("__viewer.entities.getById('aircraft-skyward-tas-0').position.getValue(__viewer.clock.currentTime).x");assert before!=after
 page.screenshot(path=str(f.ARTIFACTS/'skyward-shared-flight-view.jpg'),type='jpeg')
 for camera in ['Pilot cockpit','Cabin','Bird’s-eye','side']:
  flight.get_by_role('button',name=camera,exact=True).click();page.wait_for_timeout(400);assert page.evaluate('Number.isFinite(__viewer.camera.position.x)')
  if camera=='Pilot cockpit':
   cockpit=page.get_by_role('region',name='Pilot cockpit');expect(cockpit).to_contain_text('SIMULATED DATA');cockpit.get_by_role('button',name='Side view',exact=True).click()
 flight.get_by_role('button',name='Right side',exact=True).click();expect(flight.get_by_role('button',name='Right side',exact=True)).to_have_attribute('aria-pressed','true')
 expect(flight.get_by_role('region',name='Flight route overview')).to_contain_text('Fictional Skyward itinerary');page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(f.ARTIFACTS/'skyward-shared-mobile.jpg'),type='jpeg');page.get_by_role('button',name='Close flight view').click();page.set_viewport_size({'width':1440,'height':1000})
 # Nine actual aircraft yields eleven fictional aircraft; ten yields none.
 for n,expected in [(9,11),(10,0),(0,20)]:
  count=n;print('Checking observed count',n,flush=True);page.goto(f.URL+f'/?population={n}#airport=TAS');page.wait_for_function("n=>window.__viewer && __viewer.entities.values.filter(e=>/^aircraft-0000/.test(e.id)).length===n",arg=n);page.wait_for_function("expected=>window.__viewer && __viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-tas-')).length===expected",arg=expected,timeout=60000);page.wait_for_timeout(800)
  assert page.evaluate("window.__viewer && __viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-tas-')).length")==expected
 print('PASS population thresholds',flush=True)
 # Real lookup still opens its normal flight view; no Skyward identifier reaches aviation APIs.
 page.get_by_role('button',name='Search /',exact=True).click();page.get_by_label('Search airports, flights and controls').fill('THY111');page.get_by_role('button',name='Look up callsign · THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();expect(page.get_by_role('region',name='Passenger flight view')).to_contain_text('THY111')
 bad=[url for url in requests if ('/api/search' in url or '/api/route?' in url or '/api/premium/' in url) and ('skyward-' in url.lower() or 'skytas' in url.lower())];assert not bad,bad;assert not errors,errors;assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count()
 print('PASS automatic 20/11/0 sparse traffic, shared flight controls/cockpit/route, branded models, motion, desktop/mobile and no synthetic aviation lookups',flush=True)
if __name__=='__main__':f.serve(run)
