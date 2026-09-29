"""Coordinated demo, full journey persistence, cameras, feedback and mode cleanup.
Browser plugin not available: isolated Chromium/Playwright, mocked traffic only.
"""
import time,json,urllib.parse,os
os.environ.update(NODE_ENV='development',SKYWARD_DEV_PREMIUM='1',SKYWARD_ACCOUNTS='test',SKYWARD_ACCOUNT_DB=':memory:')
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.add_init_script(f.INIT)
 page.add_init_script("localStorage.setItem('skyward.guide.v1','done');if(!localStorage.getItem('skyward.demo.v2.TAS'))localStorage.setItem('skyward.demo.v2.TAS',JSON.stringify({version:2,airport:'TAS',seed:7,time:0,journeyTime:0,speed:1,paused:false,flight:'skyward-demo-0',camera:'side',journey:false}));")
 def empty(r):r.fulfill(json={'aircraft':[],'source':'fixture','fetchedAt':int(time.time()*1000),'sourceAt':int(time.time()*1000)})
 for path in ['area?*','aircraft?*']:page.route('**/api/'+path,empty)
 for path in ['route?*','search?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/account',lambda r:r.fulfill(json={'enabled':False,'billingReady':False,'mode':'test','user':None,'usage':None}))
 page.goto(f.URL+'/#airport=TAS');assert 'Skyward' in page.title()
 demo=page.get_by_role('region',name='Skyward simulated traffic')
 def start():page.get_by_role('button',name='Try Skyward simulated traffic',exact=True).click();expect(demo).to_be_visible();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic')[0]?.entities.values.filter(e=>e.model).length===6")
 start();expect(demo).to_contain_text('movement area reserved');assert page.evaluate("__viewer.entities.values.filter(e=>e.id.startsWith('aircraft-')).length")==0
 for camera in ['cockpit','cabin','tower','side','free','side']:
  demo.get_by_label('Demo camera').select_option(camera);page.wait_for_timeout(350);assert page.evaluate('Number.isFinite(__viewer.camera.position.x)')
  if camera=='cockpit':expect(page.get_by_role('region',name='Demo cockpit instruments')).to_be_visible();page.screenshot(path=str(f.ARTIFACTS/'demo-cockpit.jpg'),type='jpeg')
 demo.get_by_role('button',name='Watch next arrival').click();expect(demo.get_by_label('Demo camera')).to_have_value('tower');demo.locator('li button').first.click()
 demo.get_by_role('button',name='Fly complete journey').click();expect(demo.get_by_role('progressbar',name='Journey progress')).to_be_visible(timeout=30000);expect(demo).to_contain_text('Complete fictional journey')
 position=page.evaluate("(()=>{const e=__viewer.dataSources.getByName('skyward-fictional-traffic')[0].entities.getById('skyward-demo-0'),p=Cesium.Cartographic.fromCartesian(e.position.getValue(__viewer.clock.currentTime));return p.height-(__viewer.scene.globe.getHeight(p)||0)})()");assert position<12,position
 demo.get_by_label('Simulation speed').select_option('120');page.wait_for_timeout(2400);demo.get_by_role('button',name='Pause demo').click();page.wait_for_timeout(2200);snapshot=page.evaluate("JSON.parse(localStorage.getItem('skyward.demo.v2.TAS'))");assert snapshot['journey'] and snapshot['journeyTime']>0
 demo.get_by_label('Demo camera').select_option('cockpit');page.screenshot(path=str(f.ARTIFACTS/'demo-journey.jpg'),type='jpeg');page.reload();start();expect(demo.get_by_role('progressbar',name='Journey progress')).to_be_visible(timeout=30000);page.wait_for_timeout(2200);restored=page.evaluate("JSON.parse(localStorage.getItem('skyward.demo.v2.TAS'))");assert abs(snapshot['journeyTime']-restored['journeyTime'])<2
 demo.get_by_role('button',name='Return to airport activity').click();expect(demo.locator('li')).to_have_count(6)
 page.set_viewport_size({'width':390,'height':844});demo.get_by_label('Demo camera').select_option('cockpit');expect(page.get_by_role('region',name='Demo cockpit instruments')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(f.ARTIFACTS/'demo-mobile.jpg'),type='jpeg')
 demo.get_by_role('button',name='Close simulated traffic').click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0");assert not page.get_by_role('region',name='Demo cockpit instruments').count();page.set_viewport_size({'width':1440,'height':1000})
 for _ in range(3):start();demo.get_by_role('button',name='Close simulated traffic').click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0");assert page.evaluate('__viewer.trackedEntity===undefined')
 page.get_by_role('button',name='Report a problem',exact=True).click();report=page.get_by_role('dialog',name='Report a problem');report.get_by_label('Problem description').fill('Demo camera issue: steps and expected result');report.get_by_role('button',name='Review report',exact=True).click();expect(report).to_contain_text('Report ready');diag=json.loads(report.get_by_label('Problem report diagnostics').input_value());assert 'camera' not in diag and 'account' not in diag
 with page.expect_download() as dl:report.get_by_role('button',name='Download reviewed report',exact=True).click()
 payload=json.load(open(dl.value.path()));assert payload['description'].startswith('Demo camera') and 'diagnostics' in payload;report.get_by_label('Attach technical diagnostics').uncheck();report.get_by_role('button',name='Review report',exact=True).click()
 with page.expect_download() as dl:report.get_by_role('button',name='Download reviewed report',exact=True).click()
 assert 'diagnostics' not in json.load(open(dl.value.path()));page.screenshot(path=str(f.ARTIFACTS/'problem-report.jpg'),type='jpeg');report.get_by_role('button',name='Close problem report').click()
 page.get_by_role('button',name='Upgrade',exact=True).click();page.get_by_text('Compare Free and Premium',exact=True).click();expect(page.get_by_role('table')).to_contain_text('Same observed map coverage');expect(page.get_by_role('table')).to_contain_text('Unavailable');page.screenshot(path=str(f.ARTIFACTS/'premium-comparison.jpg'),type='jpeg');page.get_by_role('button',name='Close upgrade details').click()
 # Demo -> observed flight -> replay transitions leave no synthetic entities behind.
 start();page.get_by_role('button',name='Search /',exact=True).click();page.get_by_label('Search airports, flights and controls').fill('THY111');page.get_by_role('button',name='Look up callsign · THY111',exact=True).click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0");page.get_by_role('button',name='✈ Flight view',exact=True).click();expect(page.get_by_role('region',name='Passenger flight view')).to_be_visible();page.get_by_role('button',name='Close flight view').click()
 # Repeat demo -> replay -> simulator -> map on desktop and mobile.
 for width,height in [(1440,1000),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.goto(f.URL+'/#airport=TAS');start()
  if width<700:page.get_by_role('button',name='More',exact=True).click()
  page.get_by_role('button',name='Record session',exact=True).click();now=int(time.time()*1000);record={'format':'skyward-session','version':1,'name':'Transition check','createdAt':now,'tracks':[{'identity':f.rows()[0],'points':[{'time':now-60000+i*30000,'lat':38.947,'lon':-77.60+i*.04,'altitude':2200-i*500,'ground':False,'groundSpeed':150} for i in range(3)]}]};page.get_by_label('Open saved session',exact=True).set_input_files({'name':'transition.json','mimeType':'application/json','buffer':json.dumps(record).encode()});page.get_by_role('button',name='Replay session on globe',exact=True).click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0");page.get_by_role('region',name='Session replay controls').get_by_role('button',name='Exit session replay').click()
  page.unroute('**/api/account');page.goto(f.URL+'/flight-simulator/');page.get_by_role('button',name='Start flight',exact=True).click();expect(page.get_by_role('region',name='Interactive cockpit')).to_be_visible(timeout=30000);page.goto(f.URL+'/#airport=TAS');start();demo.get_by_role('button',name='Close simulated traffic').click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0")
 assert not errors,errors;assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count();assert not [r for r in requests if '/api/premium/' in r or '/api/billing/' in r or '/api/report' in r]
 print('PASS demo cameras, journey persistence, desktop/mobile cleanup, reviewed report export, accurate Premium comparison, no paid requests or runtime errors',flush=True)
if __name__=='__main__':f.serve(run)
