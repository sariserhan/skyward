"""Side menu discovery remains usable on desktop and phone without extra feed requests."""
import regression as f

def run(page):
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT)
 page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 menu=page.locator('.live-collections')
 menu.locator('summary').click()
 page.get_by_text('No matching airborne aircraft detected in the loaded map area.',exact=True).wait_for()
 assert menu.get_by_role('button').count()==0
 page.screenshot(path=str(f.ARTIFACTS/'live-collections-desktop.png'))
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='Flights',exact=True).click()
 assert menu.is_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'live-collections-mobile.png'))
 menu.get_by_role('link',name='Browse the reference directory').click()
 page.get_by_role('heading',name='Notable aircraft',exact=True).wait_for()
 assert not errors,errors
 print('PASS desktop/mobile live menu, hidden inactive entries, reference navigation, no script errors',flush=True)
if __name__=='__main__':f.serve(run)
