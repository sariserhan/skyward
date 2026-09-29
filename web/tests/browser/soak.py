"""Accelerated reliability and customer flows; fixture traffic, no live provider usage.
Six-hour timestamp span with 60 browser update cycles, plus normal-cadence retention
coverage in server/airport-camera-reliability.test.mjs. Not a six-hour wall-clock run.
"""
import json, time, urllib.parse
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.route('**/api/**',f.mock);page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded');page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=30000)
 for i in [1,2]:
  f.phase=i;page.get_by_role('button',name='Refresh airport traffic',exact=True).click();page.wait_for_timeout(500)
 page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='Compare flight',exact=True).click();page.get_by_label('Comparison flight 2',exact=True).select_option('123abc');page.get_by_role('region',name='Flight comparison differences').wait_for();assert 'Observation time difference' in page.get_by_role('region',name='Flight comparison differences').inner_text();assert 'Airbus A320' in page.get_by_role('dialog').inner_text();page.screenshot(path=str(f.ARTIFACTS/'comparison.png'));page.get_by_role('button',name='Close explore tools').click();print('PASS side-by-side model, route, metrics and timestamp differences',flush=True)
 page.get_by_role('button',name='✈ Flight view',exact=True).click();page.wait_for_timeout(1800);flight=page.get_by_role('region',name='Passenger flight view');flight.get_by_role('button',name='free',exact=True).click();page.evaluate("__viewer.camera.moveUp(500);__viewer.scene.requestRender()");before=page.evaluate("[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y,__viewer.camera.positionWC.z]");flight.get_by_role('button',name='Resume flight camera').click();page.wait_for_timeout(100);during=page.evaluate("[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y,__viewer.camera.positionWC.z]");page.wait_for_timeout(1800);after=page.evaluate("[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y,__viewer.camera.positionWC.z]");assert during!=after and before!=after;assert page.evaluate('__viewer.camera.positionCartographic.height>=24');assert flight.get_by_role('button',name='chase',exact=True).get_attribute('aria-pressed')=='true';print('PASS camera reattachment and above-ground clearance',flush=True)
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500);handle=flight.get_by_role('button',name='Resize details panel');box=handle.bounding_box();initial=flight.bounding_box()['height'];page.mouse.move(box['x']+box['width']/2,box['y']+15);page.mouse.down();page.mouse.move(box['x']+box['width']/2,box['y']-140,steps=12);page.mouse.up();page.wait_for_timeout(500);assert flight.bounding_box()['height']>initial+40;handle.focus();page.keyboard.press('ArrowDown');page.screenshot(path=str(f.ARTIFACTS/'mobile-sheet.png'));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');flight.get_by_role('button',name='Close flight view').click();page.get_by_role('button',name='Search /',exact=True).click();page.get_by_role('dialog',name='Search Skyward').wait_for();page.keyboard.press('Escape');page.get_by_role('button',name='More',exact=True).click();page.get_by_role('button',name='Record session',exact=True).click();page.get_by_role('button',name='Close explore tools').click();page.get_by_role('button',name='Less',exact=True).click();page.set_viewport_size({'width':1440,'height':1000});print('PASS compact mobile toolbar, search and draggable sheet',flush=True)
 # Imported airport recording: one approaching and one departing track.
 home={'lat':38.947,'lon':-77.46};stamp=f.anchor-120000
 def point(t,offset):return dict(time=stamp+t,lat=home['lat'],lon=home['lon']+offset,altitude=10000,ground=False,groundSpeed=300)
 r=dict(format='skyward-session',version=1,name='Airport fixture',createdAt=stamp,tracks=[dict(identity=dict(hex='abcdef',callsign='INBOUND',aircraftType='B738'),points=[point(0,.3),point(30000,.2),point(60000,.1)]),dict(identity=dict(hex='123abc',callsign='OUTBOUND',aircraftType='A320'),points=[point(0,.1),point(30000,.2),point(60000,.3)])])
 page.get_by_role('button',name='Record session',exact=True).click();page.get_by_label('Open saved session',exact=True).set_input_files({'name':'airport.json','mimeType':'application/json','buffer':json.dumps(r).encode()});page.get_by_label('Replay area',exact=True).select_option('airport');page.get_by_label('Airport replay movement',exact=True).select_option('ground');page.get_by_role('button',name='Replay session on globe',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('No recorded tracks match');page.get_by_label('Airport replay movement',exact=True).select_option('approaching');page.get_by_role('button',name='Replay session on globe',exact=True).click();controls=page.get_by_role('region',name='Session replay controls');controls.wait_for();assert 'IAD · approaching' in controls.inner_text();page.get_by_label('Recorded aircraft',exact=True).select_option('abcdef');assert page.get_by_label('Recorded aircraft',exact=True).locator('option').count()==2;page.get_by_label('Session playback time',exact=True).fill(str(stamp+30000));page.get_by_role('button',name='Exit session replay',exact=True).click();print('PASS airport replay direction filters, empty result, scrubbing and selection',flush=True)
 # Repeated network, selection and rendering work over six simulated hours.
 page.get_by_role('button',name='Close aircraft details',exact=True).click();page.unroute('**/api/**');epoch=0;mode='normal';seen=0
 def data():
  now=f.anchor+epoch*360000;count=[60,120,240][epoch%3]
  return [dict(hex=(0x100000+i).to_bytes(3,'big').hex(),callsign=f'SOAK{i}',registration=f'TEST{i}',aircraftType='B738' if i%2 else 'A320',lat=38.95+i*.0001,lon=-77.4+i*.0001,altitude=30000,ground=False,groundSpeed=450,heading=90,verticalRate=0,observedAt=now-15000,sourceType='fixture',category='A3',targetKind='aircraft') for i in range(count)]
 def mock(route):
  nonlocal seen
  u=urllib.parse.urlparse(route.request.url)
  if u.path in ['/api/route','/api/status']:f.mock(route);return
  if mode=='error':route.fulfill(status=503,json={'error':'Simulated provider interruption'});seen+=1;return
  rows=[] if mode=='empty' else data()
  if mode=='stale':rows=[{**a,'observedAt':a['observedAt']-300000} for a in rows]
  if u.path=='/api/search':
   q=urllib.parse.parse_qs(u.query).get('q',[''])[0];rows=[a for a in rows if a['hex']==q or a['callsign']==q]
  route.fulfill(json=dict(source='fixture',sourceAt=f.anchor+epoch*360000,fetchedAt=f.anchor+epoch*360000,aircraft=rows));seen+=1
 page.route('**/api/**',mock)
 def refresh():
  # Keep the sampled region on the fixture airport after flight-camera exits.
  page.evaluate("__viewer.camera.cancelFlight();__viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-77.46,38.947,80000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});__viewer.scene.requestRender()")
  page.wait_for_timeout(400)
  page.evaluate('(t)=>{window.__shift=t-(Date.now()-window.__shift)}',f.anchor+epoch*360000)
  button=page.get_by_role('button',name='Refresh traffic',exact=True)
  deadline=time.time()+30
  while time.time()<deadline:
   coverage=page.locator('.coverage-details')
   if coverage.get_attribute('open') is None:coverage.locator('summary').click()
   if button.is_visible() and button.is_enabled():break
   page.wait_for_timeout(100)
  expect(button).to_be_enabled();old=seen;button.click()
  deadline=time.time()+12
  while seen==old and time.time()<deadline:page.wait_for_timeout(50)
  assert seen>old;page.wait_for_timeout(120)
 cdp=page.context.new_cdp_session(page);samples=[]
 for step in range(61):
  epoch=step;mode='error' if step%12==6 else 'normal';page.evaluate('(t)=>{window.__shift=t-(Date.now()-window.__shift)}',f.anchor+epoch*360000);refresh()
  if step%12==6:expect(page.get_by_role('region',name='Traffic coverage') if False else page.get_by_label('Traffic coverage')).to_contain_text('Simulated provider interruption')
  if step%10==0 and step>0:
   page.get_by_role('button',name='View SOAK0',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();page.wait_for_timeout(200);page.get_by_role('button',name='Close flight view').click();page.get_by_role('button',name='Close aircraft details',exact=True).click()
   cdp.send('HeapProfiler.collectGarbage');heap=cdp.send('Runtime.getHeapUsage')['usedSize'];counts=page.evaluate("({entities:__viewer.entities.values.length,aircraft:__viewer.entities.values.filter(e=>e.id.startsWith('aircraft-')).length,synthetic:__viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-')).length,dom:document.querySelectorAll('*').length,sources:__viewer.dataSources.length})");samples.append(dict(hour=step/10,heap=heap,**counts));assert counts['aircraft']-counts['synthetic']<=240;assert counts['synthetic']<=20;assert counts['aircraft']<=260;assert counts['sources']<=3;print('SOAK '+json.dumps(samples[-1]),flush=True)
 assert samples[-1]['heap']-samples[0]['heap']<64*1024*1024;assert samples[-1]['dom']-samples[0]['dom']<1000
 mode='empty';epoch+=1;refresh();expect(page.get_by_label('Traffic coverage')).to_contain_text('No aircraft reported')
 mode='normal';epoch+=1;refresh();page.get_by_label('Traffic altitude filter',exact=True).select_option('ground');expect(page.get_by_label('Traffic coverage')).to_contain_text('Filters hide');page.get_by_role('button',name='Clear traffic filter').click()
 mode='stale';epoch+=1;refresh();expect(page.get_by_label('Traffic coverage')).to_contain_text('Only stale');page.screenshot(path=str(f.ARTIFACTS/'coverage.png'))
 mode='normal';epoch+=1;page.context.set_offline(True);expect(page.get_by_label('Traffic coverage')).to_contain_text('Offline',timeout=10000);page.context.set_offline(False);refresh();expect(page.get_by_label('Traffic coverage')).to_contain_text('targets in camera area',timeout=10000)
 (f.ARTIFACTS/'soak-metrics.json').write_text(json.dumps(samples,indent=2));assert not errors,errors;assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count();print('PASS six-hour accelerated browser span, 61 updates, recovery, bounded heap/entities and coverage states',flush=True)

if __name__=='__main__':f.serve(run)
