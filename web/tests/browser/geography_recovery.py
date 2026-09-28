import regression as f
from playwright.sync_api import expect

def run(page):
 page=page.context.browser.new_page(viewport={"width":1440,"height":1000},service_workers="block")
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT);page.route('**/api/**',f.mock);fail=True;attempts=0;airport_attempts=0
 def geography(route):
  nonlocal attempts
  attempts+=1
  if fail:route.fulfill(status=503,body='Fixture temporary outage')
  else:route.fulfill(path=str(f.ROOT/'public/data/world.geojson'))
 def airport_geometry(route):
  nonlocal airport_attempts
  airport_attempts+=1
  if fail:route.fulfill(status=503,body='Fixture temporary outage')
  else:route.fulfill(path=str(f.ROOT/'public/data/airports/IAD.json'))
 page.route('**/data/airports/IAD.json',airport_geometry)
 page.route('**/data/world.geojson',geography);page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.get_by_role('button',name='View THY111',exact=True).wait_for();page.wait_for_function("__viewer.entities.values.some(e=>e.id.startsWith('aircraft-')&&e.show)")
 page.evaluate('__viewer.useDefaultRenderLoop=false')
 button=page.get_by_role('button',name='Retry map & traffic',exact=True);button.wait_for(timeout=20000);assert attempts==3,attempts
 page.locator('.geometry-error').wait_for(timeout=20000);assert airport_attempts==3,airport_attempts
 assert page.evaluate("__viewer.entities.values.some(e=>e.id==='aircraft-abcdef'&&e.show)")
 page.evaluate('()=>{window.__originalViewer=__viewer;}');fail=False;button.click(timeout=10000);page.wait_for_function('__viewer.scene.groundPrimitives.length>0');expect(button).to_have_count(0);expect(page.locator('.geometry-error')).to_have_count(0);page.wait_for_function("__viewer.entities.values.some(e=>e.id.startsWith('facility-'))")
 assert page.evaluate('__viewer===__originalViewer');assert page.evaluate("__viewer.entities.values.some(e=>e.id==='aircraft-abcdef'&&e.show)")
 assert not errors,errors;print('PASS country and airport geometry outage keeps aircraft visible, retries automatically, and recovers without replacing viewer',flush=True)
def checked(page):
 try:run(page)
 except Exception as error:
  print(type(error).__name__,str(error),flush=True)
  raise
f.serve(checked)
