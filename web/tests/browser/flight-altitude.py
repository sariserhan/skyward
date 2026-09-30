"""Ground labels must not mistake sea-level elevation for airborne height."""
import regression as f
from playwright.sync_api import expect

def run(page):
 original=f.rows
 f.rows=lambda:[{**a,'ground':True,'altitude':1026,'groundSpeed':0} for a in original()]
 page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f.URL+'/#airport=IAD')
 page.get_by_role('button',name='View THY111',exact=True).click(timeout=60000)
 page.get_by_role('button',name='✈ Flight view',exact=True).click()
 expect(page.locator('.flight-readings')).to_contain_text('Ground')
 expect(page.locator('.flight-readings')).to_contain_text('0 ft above ground')
 expect(page.locator('.flight-readings')).not_to_contain_text('1,026')
 page.wait_for_function("__viewer.entities.getById('aircraft-abcdef')?.model?.maximumScale?.getValue(__viewer.clock.currentTime)===1",timeout=20000)
 assert page.evaluate("__viewer.entities.getById('aircraft-abcdef').model.minimumPixelSize.getValue(__viewer.clock.currentTime)")==0
 page.screenshot(path=str(f.ARTIFACTS/'ground-altitude.png'))
 assert not errors,errors
 print('PASS reported ground at 1026 ft shows Ground / 0 ft above ground',flush=True)
f.serve(run)
