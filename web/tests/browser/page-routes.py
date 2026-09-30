"""Direct route entry, selection without globe reload, history, sharing, dates and 404s."""
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 response=page.goto(f.URL+'/airports/IAD/');assert response.status==200
 assert 'Dulles' in response.text() and 'rel="canonical"' in response.text()
 page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=60000)
 page.wait_for_function('window.__viewer');page.evaluate('()=>{window.__originalViewer=__viewer;}')
 assert 'IAD' in page.title()
 page.get_by_role('button',name='View THY111',exact=True).click()
 expect(page).to_have_url(f.URL+'/flights/THY111/')
 assert page.evaluate('__viewer===__originalViewer')
 page.get_by_role('button',name='✈ Flight view',exact=True).click()
 panel=page.get_by_role('region',name='Passenger flight view');expect(panel).to_be_visible(timeout=30000)
 panel.get_by_role('button',name='orbit',exact=True).click()
 page.wait_for_function("location.hash.includes('view=orbit')")
 n=page.evaluate('history.length');page.wait_for_timeout(2000);assert page.evaluate('history.length')==n
 page.go_back();expect(page).to_have_url(f.URL+'/airports/IAD/')
 expect(panel).not_to_be_visible();assert page.evaluate('__viewer===__originalViewer')
 page.go_forward();expect(panel).to_be_visible(timeout=30000)
 expect(panel.get_by_role('button',name='orbit',exact=True)).to_have_attribute('aria-pressed','true')
 assert page.evaluate('__viewer===__originalViewer')
 print('PASS airport → flight → orbit → Back / Forward with same viewer and stable history',flush=True)
 page.reload();expect(page.get_by_role('region',name='Passenger flight view')).to_be_visible(timeout=60000)
 assert 'THY111' in page.title();assert page.locator('link[rel=canonical]').get_attribute('href')=='https://skyvvard.com/flights/THY111/'
 print('PASS direct flight URL reload restores orbit',flush=True)
 page.screenshot(path=str(f.ARTIFACTS/'flight-route.png'))
 page.goto(f.URL+'/flights/THY111/#camera=-77,39,70000,0.4,-1.2,0')
 page.get_by_role('button',name='✈ Flight view',exact=True).wait_for(timeout=60000)
 page.wait_for_function('window.__viewer && Math.abs(__viewer.camera.positionCartographic.height-70000)<100',timeout=30000)
 assert abs(page.evaluate('__viewer.camera.heading')-.4)<.01
 print('PASS shared camera pose retained on flight route',flush=True)
 response=page.goto(f.URL+'/flights/THY111/2020-01-01/');assert response.status==200
 expect(page.get_by_text('No historical tracking is available',exact=False)).to_be_visible(timeout=60000)
 expect(page.get_by_role('region',name='Passenger flight view')).not_to_be_visible()
 assert page.locator('meta[name=robots]').get_attribute('content')=='noindex,follow'
 print('PASS historical date never substituted with current flight',flush=True)
 response=page.goto(f.URL+'/airports/ZZZ/');assert response.status==404
 response=page.goto(f.URL+'/flights/THY111/2026-02-30/');assert response.status==404
 page.set_viewport_size({'width':390,'height':844});response=page.goto(f.URL+'/airports/IAD/')
 page.wait_for_function('window.__viewer',timeout=60000);expect(page.get_by_role('link',name='Skyward globe',exact=True)).to_be_visible()
 page.screenshot(path=str(f.ARTIFACTS/'airport-route-mobile.png'))
 assert not errors,errors
 assert not page.locator('.cesium-widget-errorPanel,vite-error-overlay').count()
 print('PASS invalid routes 404 and mobile entry',flush=True)
f.serve(run)
