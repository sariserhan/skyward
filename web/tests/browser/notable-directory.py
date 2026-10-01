"""Directory -> category/search -> follow -> refresh -> evidence. No tracking requests."""
import regression as f

def run(page):
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.route('**/api/**',f.mock)
 page.goto(f.URL+'/notable-aircraft/')
 page.get_by_role('heading',name='Notable aircraft',exact=True).wait_for()
 assert 'Notable aircraft' in page.title()
 page.get_by_role('button',name='Aircraft & history',exact=True).click()
 assert page.get_by_role('article').count()==10
 page.get_by_role('button',name='Sports (3)',exact=True).click()
 assert page.get_by_role('article').count()==3
 page.get_by_role('button',name='Follow N36NE',exact=True).click()
 page.get_by_role('button',name='Unfollow N36NE',exact=True).wait_for()
 page.reload()
 page.get_by_role('button',name='Unfollow N36NE',exact=True).wait_for()
 assert page.get_by_role('button',name='Sports (3)',exact=True).get_attribute('aria-pressed')=='true'
 page.get_by_label('Search the directory').fill('N36NE')
 assert page.get_by_role('article').count()==1
 page.get_by_role('link',name='New England Patriots',exact=True).click()
 page.get_by_role('heading',name='New England Patriots',exact=True).wait_for()
 page.get_by_role('heading',name='Association sources',exact=True).wait_for()
 assert page.get_by_role('link',name='N36NE',exact=True).count()==2
 page.goto(f.URL+'/notable-aircraft/?category=Business+%26+aviation')
 page.get_by_role('heading',name='Notable aircraft',exact=True).wait_for()
 assert page.get_by_role('article').count()==4
 page.get_by_label('Search the directory').fill('not-a-real-collection')
 page.get_by_role('heading',name='No matching collections').wait_for()
 page.get_by_role('button',name='Clear filters').click()
 assert page.get_by_role('article').count()==10
 page.set_viewport_size({'width':1440,'height':1000})
 page.screenshot(path=str(f.ARTIFACTS/'notable-directory-desktop.png'))
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='Sports (3)',exact=True).click()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.airframe-page').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
 page.get_by_role('link',name='New England Patriots',exact=True).scroll_into_view_if_needed()
 page.screenshot(path=str(f.ARTIFACTS/'notable-directory-mobile.png'))
 page.get_by_role('button',name='Unfollow N36NE',exact=True).click()
 page.get_by_role('button',name='Follow N36NE',exact=True).wait_for()
 assert not any('/api/search' in r or 'Cesium.js' in r for r in requests),requests
 assert not errors,errors
 print('PASS directory categories, query URLs, follow/unfollow, refresh, sources, empty state, desktop/mobile and zero tracking fetches',flush=True)
if __name__=='__main__':f.serve(run)
