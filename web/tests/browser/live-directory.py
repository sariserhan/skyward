"""Explicit live checks, identity matching, inactive filtering and mobile layout."""
import json,time
import regression as f

def run(page):
 errors=[];calls=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 catalog=json.loads((f.ROOT/'public/data/airframes.json').read_text())
 a=next(a for a in catalog['aircraft'] if any(r['value']=='N36NE' for r in a['registrations']))
 hexid=a['icaoIdentities'][-1]['value']
 def response(route):
  calls.append(route.request.url)
  route.fulfill(json={'aircraft':[{'hex':hexid,'registration':'N36NE','lat':40,'lon':-70,'altitude':30000,'ground':False,'groundSpeed':450,'observedAt':int(time.time()*1000)}]})
 page.route('**/api/**',f.mock)
 page.route('**/api/search?*',response)
 page.goto(f.URL+'/notable-aircraft/')
 page.get_by_role('heading',name='Catch them in flight.',exact=True).wait_for()
 assert page.get_by_label('Choose a collection').locator('option',has_text='NOAA').count()==1
 page.get_by_label('Choose a collection').select_option('finnair')
 assert page.get_by_label('Aircraft batch').locator('option').count()==8
 page.get_by_label('Aircraft batch').select_option('7')
 assert not calls
 page.get_by_label('Choose a collection').select_option('new-england-patriots')
 assert not calls
 assert page.get_by_role('article').count()==0
 page.get_by_role('button',name='Find airborne aircraft',exact=True).click()
 page.get_by_text('Checked ',exact=False).wait_for(timeout=20000)
 assert len(calls)==2
 assert page.get_by_role('article').count()==1
 link=page.get_by_role('link',name='Watch live →',exact=True)
 assert '#aircraft='+hexid in link.get_attribute('href')
 assert 'Destination unknown' in page.get_by_role('article').inner_text()
 assert 'Passengers unknown' in page.get_by_role('article').inner_text()
 assert page.get_by_role('button',name='Check available shortly',exact=True).is_disabled()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'live-directory-mobile.png'))
 page.get_by_role('button',name='Aircraft & history',exact=True).click()
 page.get_by_role('button',name='Watch live',exact=True).click()
 assert page.get_by_role('button',name='Check available shortly',exact=True).is_disabled()
 page.reload()
 page.get_by_role('button',name='Check available shortly',exact=True).wait_for()
 assert page.get_by_role('button',name='Check available shortly',exact=True).is_disabled()
 assert not errors,errors
 print('PASS explicit bounded lookup, identity filtering, live navigation, cooldown and mobile layout',flush=True)
if __name__=='__main__':f.serve(run)
