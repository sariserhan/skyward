"""Isolated HTTP, startup, and global error recovery browser checks."""
import regression as f
from playwright.sync_api import expect

def run(page):
 for path,title,status in [('/missing-page','Page not found',404),('/airports/ZZZ/','Page not found',404),('/500','Something went wrong',500)]:
  response=page.goto(f.URL+path)
  assert response.status==status
  expect(page.get_by_role('heading',name=title)).to_be_visible()
  assert page.get_by_role('link',name='Back to globe').get_attribute('href')=='/'
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'500-mobile.png'))
 print('PASS HTTP pages, navigation, mobile width',flush=True)
 held=[]
 page.route('**/cesium/Cesium.js',lambda r:held.append(r))
 page.goto(f.URL+'/',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Preparing your view')).to_be_visible()
 page.locator('.loading-skeleton').wait_for()
 page.screenshot(path=str(f.ARTIFACTS/'loading-mobile.png'))
 page.wait_for_timeout(200)
 assert held
 for r in held:r.abort()
 expect(page.get_by_role('heading',name='Let’s reconnect to the sky.')).to_be_visible(timeout=15000)
 page.screenshot(path=str(f.ARTIFACTS/'recovery-mobile.png'))
 page.unroute('**/cesium/Cesium.js')
 print('PASS loading skeleton and engine failure recovery',flush=True)
 page.goto(f.URL+'/account/',wait_until='networkidle')
 page.evaluate("window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new DOMException('cancelled','AbortError')}))")
 page.wait_for_timeout(200)
 assert not page.get_by_role('heading',name='Let’s reconnect to the sky.').count()
 page.evaluate("window.dispatchEvent(new ErrorEvent('error',{message:'private-fixture',error:new Error('private-fixture')}))")
 expect(page.get_by_role('alert',name='Background error')).to_be_visible()
 assert not page.get_by_role('heading',name='Let’s reconnect to the sky.').count()
 assert 'private-fixture' not in page.locator('body').inner_text()
 page.get_by_role('alert',name='Background error').get_by_role('button',name='Reload',exact=True).click()
 page.wait_for_load_state('networkidle')
 assert not page.get_by_role('heading',name='Let’s reconnect to the sky.').count()
 page.evaluate("window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('private-fixture')}))")
 expect(page.get_by_role('alert',name='Background error')).to_be_visible()
 page.get_by_role('button',name='Dismiss',exact=True).click()
 expect(page.get_by_role('alert',name='Background error')).to_have_count(0)
 print('PASS global errors, rejection, abort exclusion, reload',flush=True)
 page.route('**/assets/index-*.js',lambda r:r.abort())
 page.goto(f.URL+'/account/',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Unable to open Skyward')).to_be_visible()
 print('PASS initial entry script failure',flush=True)
f.serve(run)
