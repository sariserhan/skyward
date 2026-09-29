"""Public URLs, entry isolation, protected metrics and cockpit regression."""
import os,json,urllib.request,urllib.error
import regression as f
os.environ.update(NODE_ENV='test',SKYWARD_ACCOUNTS='test',SKYWARD_ACCOUNT_DB=':memory:',SKYWARD_METRICS_TOKEN='t'*32,SKYWARD_DEV_PREMIUM='0')
os.environ.pop('SKYWARD_FLYITALY_API_KEY',None)
from playwright.sync_api import expect

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));requests=[];page.on('request',lambda r:requests.append(r.url))
 page.goto(f.URL+'/airports/?q=Tashkent');expect(page.get_by_role('heading',name='Airport directory',exact=True)).to_be_visible();page.get_by_role('link',name='TAS ·',exact=False).click();expect(page.get_by_role('heading',level=1)).to_contain_text('Tashkent');assert not any('Cesium.js' in u for u in requests);page.screenshot(path=str(f.ARTIFACTS/'architecture-airport.jpg'),type='jpeg')
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(f.ARTIFACTS/'architecture-airport-mobile.jpg'),type='jpeg');page.set_viewport_size({'width':1440,'height':1000})
 requests.clear();page.goto(f.URL+'/account/');expect(page.get_by_role('heading',name='Your Skyward account')).to_be_visible();expect(page.get_by_role('button',name='Sign in',exact=True)).to_be_visible();assert not any('Cesium.js' in u or '/assets/App-' in u or '/assets/Globe-' in u or '/assets/FlightSimulator-' in u for u in requests),requests;page.screenshot(path=str(f.ARTIFACTS/'architecture-account.jpg'),type='jpeg')
 for endpoint in ['/healthz','/readyz']:
  with urllib.request.urlopen(f.URL+endpoint) as r:assert json.load(r)['status']=='ok'
 try:urllib.request.urlopen(f.URL+'/metrics');raise AssertionError('Public metrics')
 except urllib.error.HTTPError as e:assert e.code==401
 req=urllib.request.Request(f.URL+'/metrics',headers={'Authorization':'Bearer '+('t'*32)})
 with urllib.request.urlopen(req) as r:assert 'feeds' in json.load(r)
 page.add_init_script(f.INIT)
 for path in ['area?*','aircraft?*','search?*','status','route?*']:page.route('**/api/'+path,f.mock)
 page.goto(f.URL+'/?flight=THY111');expect(page.get_by_role('button',name='✈ Flight view',exact=True)).to_be_visible(timeout=30000);page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('button',name='Pilot cockpit',exact=True).click();expect(page.get_by_role('region',name='Cockpit route map')).to_be_visible();expect(page.get_by_label('Windshield wipers')).to_be_visible();page.screenshot(path=str(f.ARTIFACTS/'architecture-cockpit.jpg'),type='jpeg')
 assert not errors,errors;assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel,.recovery-screen').count()
 print('PASS public airport desktop/mobile, standalone account without globe downloads, health/metrics auth, direct callsign lookup and refactored cockpit',flush=True)
f.serve(run)
