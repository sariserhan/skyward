import regression as f
from playwright.sync_api import expect

def run(page):
 page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).click(timeout=60000);page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('region',name='Passenger flight view').get_by_role('button',name='orbit',exact=True).click();page.wait_for_timeout(2000)
 def reload_error():
  page.evaluate("dispatchEvent(new ErrorEvent('error',{message:'Recovery test',error:new Error('Recovery test')}))")
  notice=page.get_by_role('alert',name='Background error');expect(notice).to_be_visible();notice.get_by_role('button',name='Reload',exact=True).click()
 def check(name,view):
  panel=page.get_by_role('region',name='Passenger flight view');expect(panel).to_be_visible(timeout=60000);expect(panel).to_contain_text(name);expect(panel.get_by_role('button',name=view,exact=True)).to_have_attribute('aria-pressed','true');assert page.evaluate("sessionStorage.getItem('skyward.error-recovery.v1')===null")
 reload_error();check('THY111','orbit');print('PASS real aircraft + orbit restored with resume setting off',flush=True)
 page.goto(f.URL+'/?test=simulation#airport=IAD');page.get_by_role('button',name='View SKYIAD101',exact=True).click(timeout=60000);page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('region',name='Passenger flight view').get_by_role('button',name='Bird’s-eye',exact=True).click();page.wait_for_timeout(2000)
 reload_error();check('SKYIAD101','Bird’s-eye');page.wait_for_timeout(2000)
 assert page.evaluate("!!__viewer.entities.getById('aircraft-skyward-iad-0')")
 print('PASS simulated aircraft + bird view restored',flush=True)
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=60000)
 page.wait_for_timeout(2000)
 page.evaluate("__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(29,41,70000),orientation:{heading:.4,pitch:-1.2,roll:0}})")
 page.wait_for_timeout(300)
 before=page.evaluate("({lon:__viewer.camera.positionCartographic.longitude,lat:__viewer.camera.positionCartographic.latitude,height:__viewer.camera.positionCartographic.height})")
 reload_error();page.wait_for_function('window.__viewer');page.wait_for_timeout(3000)
 after=page.evaluate("({lon:__viewer.camera.positionCartographic.longitude,lat:__viewer.camera.positionCartographic.latitude,height:__viewer.camera.positionCartographic.height})")
 assert abs(before['lon']-after['lon'])<.001 and abs(before['lat']-after['lat'])<.001 and abs(before['height']-after['height'])<100,(before,after)
 print('PASS free map camera restored',flush=True)
 assert not page.locator('.cesium-widget-errorPanel,vite-error-overlay').count()
f.serve(run)
