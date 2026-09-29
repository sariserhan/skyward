import sys,re,os
os.environ.update(NODE_ENV='development',SKYWARD_DEV_PREMIUM='1',SKYWARD_ACCOUNTS='test',SKYWARD_ACCOUNT_DB=':memory:')
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.add_init_script("localStorage.setItem('skyward.guide.v1','done');localStorage.setItem('skyward.watches.v1',JSON.stringify([{hex:'abcdef',callsign:'THY111',registration:'TC-TEST',aircraftType:'B738'}]));localStorage.setItem('skyward.last-flight.v1',JSON.stringify({hex:'abcdef',label:'THY111'}));")
 for path in ['area?*','aircraft?*','search?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/account',lambda r:r.fulfill(json={'enabled':False,'billingReady':False,'mode':'test','user':None,'usage':None}))
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).wait_for();page.locator('.unified-map-tools>summary').click();page.get_by_role('button',name='Layers',exact=True).click();page.get_by_label('Performance preset').select_option('battery');page.wait_for_function("JSON.parse(localStorage.getItem('skyward.map.v1')).batterySaver===true");page.get_by_label('Performance preset').select_option('high');page.wait_for_function("JSON.parse(localStorage.getItem('skyward.map.v1')).quality==='high'");page.keyboard.press('Escape');page.locator('.unified-map-tools>summary').click()
 page.get_by_role('button',name=re.compile('Watching')).click();notes=page.get_by_role('region',name='Organized watchlist');expect(notes).to_be_visible();page.get_by_label('Group for THY111').fill('Spotting');expect(notes).to_contain_text('Last observed');page.get_by_label('Watchlist group',exact=True).select_option('Spotting');expect(notes.get_by_role('button',name='THY111 · B738',exact=True)).to_be_visible();page.screenshot(path=str(f.ARTIFACTS/'watch-groups.jpg'),type='jpeg')
 page.unroute('**/api/account');page.goto(f.URL+'/flight-simulator/');page.get_by_role('button',name='Start flight',exact=True).click();page.get_by_role('button',name='Start guided first flight',exact=True).click(timeout=30000);coach=page.get_by_role('generic',name='Guided first flight');expect(page.locator('.guided-flight')).to_contain_text('Step 1 / 8');page.get_by_role('button',name='Repeat and show control',exact=True).click();page.get_by_role('button',name='Release brakes',exact=True).click();expect(page.locator('.guided-flight')).to_contain_text('Step 2 / 8');expect(page.get_by_role('region',name='Interactive cockpit').get_by_label('Windshield wipers')).to_be_visible();page.screenshot(path=str(f.ARTIFACTS/'guided-first-flight.jpg'),type='jpeg');assert not errors,errors
 print('PASS graphics presets, watchlist groups/last seen, guided first-flight stage transition and dashboard wiper controls',flush=True)
f.serve(run)
