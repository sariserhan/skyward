"""Local Godot web export: Dulles launch, custom confirmation and responsive host."""
import os
import regression as f
os.environ['NODE_ENV']='development';os.environ['SKYWARD_DEV_PREMIUM']='1';os.environ['SKYWARD_ACCOUNTS']='test'
def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if 'SCRIPT ERROR' in m.text or 'Parse Error' in m.text else None)
 page.goto(f.URL+'/airport-simulation/',wait_until='domcontentloaded')
 page.wait_for_function("!document.getElementById('cloud-start').disabled",timeout=90000)
 assert page.locator('#cloud-scenario').input_value()=='dulles'
 page.get_by_role('button',name='Start scenario',exact=True).click()
 page.get_by_role('dialog').get_by_role('button',name='Start scenario',exact=True).click()
 page.wait_for_function("document.getElementById('cloud-status').textContent.includes('Scenario started')",timeout=60000)
 page.wait_for_timeout(7000)
 before=page.locator('iframe').bounding_box()['height']
 page.get_by_role('button',name='Hide setup',exact=True).click()
 assert page.locator('iframe').bounding_box()['height']>before
 assert page.get_by_role('button',name='Show setup',exact=True).get_attribute('aria-expanded')=='false'
 page.get_by_role('button',name='Show setup',exact=True).click()
 page.locator('.save-tools summary').click()
 assert page.get_by_role('button',name='Export full backup',exact=True).is_visible()
 page.locator('.save-tools summary').click()
 page.screenshot(path=str(f.ARTIFACTS/'dulles-concourse.jpg'),type='jpeg',quality=75)
 page.mouse.click(645,300)
 page.wait_for_timeout(2000)
 page.screenshot(path=str(f.ARTIFACTS/'dulles-night.jpg'),type='jpeg',quality=75)
 page.set_viewport_size({'width':900,'height':900})
 page.wait_for_timeout(1200)
 page.screenshot(path=str(f.ARTIFACTS/'dulles-tablet.jpg'),type='jpeg',quality=75)
 assert page.locator('iframe').bounding_box()['height']>500
 assert not errors,errors
 print('PASS Dulles default starts and renders without script errors', f.ARTIFACTS,flush=True)
if __name__=='__main__':f.serve(run)
