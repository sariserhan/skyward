"""Companion controls against the built app; no paid/live feed required."""
import time
import regression as f
from playwright.sync_api import expect

def run(p):
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.add_init_script(f.INIT)
 for path in ['area','aircraft','search','status','route']:p.route('**/api/'+path+'*',f.mock)
 p.route('**/api/local-weather*',lambda r:r.fulfill(json={'status':'unavailable','report':None,'fetchedAt':None}))
 p.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 p.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=60000)
 for i in [1,2]:
  f.phase=i;p.get_by_role('button',name='Refresh airport traffic',exact=True).click();p.wait_for_timeout(1100)
 p.get_by_role('button',name='View THY111',exact=True).click()
 p.get_by_role('button',name='✈ Flight view',exact=True).click()
 panel=p.get_by_role('region',name='Passenger flight view')
 companion=panel.get_by_role('region',name='Journey companion')
 expect(companion).to_be_visible(timeout=30000)
 expect(companion.locator('.coverage-pill')).to_contain_text('motion')
 companion.get_by_text('Viewing preferences',exact=True).click()
 companion.get_by_label('Ground label density').select_option('sparse')
 companion.get_by_label('Journey highlights',exact=True).check()
 companion.get_by_text('Arrival preview · LHR',exact=True).click()
 expect(companion).to_contain_text('Destination weather unavailable',timeout=15000)
 companion.locator('summary').filter(has_text='Revisit this flight').click()
 expect(companion.get_by_role('button',name='Review observations',exact=True)).to_be_enabled(timeout=15000)
 companion.get_by_role('button',name='Review observations',exact=True).click()
 expect(companion).to_contain_text('Historical observation · not current')
 companion.get_by_role('button',name='Next fix',exact=True).click()
 expect(companion.locator('canvas')).to_have_attribute('aria-label',__import__('re').compile('Retained fix'))
 companion.get_by_role('button',name='Return to current position',exact=True).click()
 expect(companion.get_by_role('button',name='Review observations',exact=True)).to_be_visible()
 p.screenshot(path=str(f.ARTIFACTS/'companion-details.jpg'),type='jpeg',quality=60)
 print('PASS companion coverage, preferences, unavailable weather, retained timeline',flush=True)
 panel.get_by_role('button',name='Passenger window',exact=True).click()
 window=p.get_by_role('region',name='Passenger window view')
 window.get_by_label('Window seat position').select_option('0.2')
 window.get_by_role('button',name='Left window',exact=True).click()
 window.get_by_label('Window shade',exact=True).fill('50')
 window.get_by_role('button',name='Exit window view',exact=True).click()
 panel.get_by_role('button',name='Restore flight panel',exact=True).click()
 panel.get_by_role('button',name='Passenger window',exact=True).click()
 assert window.get_by_label('Window shade',exact=True).input_value()=='50'
 assert window.get_by_label('Window seat position').input_value()=='0.2'
 p.evaluate('__viewer.useDefaultRenderLoop=false')
 p.screenshot(path=str(f.ARTIFACTS/'companion-window.jpg'),type='jpeg',quality=60)
 assert not errors,errors
 prefs=p.evaluate("JSON.parse(localStorage.getItem('skyward.flight-view.v1'))")
 assert prefs['cabinSide']=='left' and prefs['shade']==50 and prefs['labelDensity']=='sparse'
 p.set_viewport_size({'width':390,'height':844})
 assert window.bounding_box()['width']<=390
 print('PASS window settings persisted, mobile bounds, no JavaScript errors',flush=True)
 p.set_viewport_size({'width':1440,'height':1000})
 window.get_by_role('button',name='Exit window view',exact=True).click()
 panel.get_by_role('button',name='Restore flight panel',exact=True).click()
 panel.get_by_role('button',name='Close flight view',exact=True).click()
 p.get_by_role('button',name='Explore tools',exact=True).click()
 dialog=p.get_by_role('dialog',name='Explore tools')
 expect(dialog.get_by_role('heading',name='Scenic flights',exact=True)).to_be_visible()
 dialog.get_by_label('Scenic flight filter').select_option('sun')
 dialog.get_by_label('Scenic flight filter').select_option('land')
 expect(dialog).to_contain_text('not a global search')
 assert not errors,errors
 print('PASS scenic filters and honest local-coverage description',flush=True)
f.serve(run)
