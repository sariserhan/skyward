"""Methodology, review queue and historical publication boundaries."""
import json
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/api/**',f.mock)
 page.goto(f.URL+'/methodology/')
 page.get_by_role('heading',name='Aircraft data methodology',exact=True).wait_for()
 assert page.get_by_role('link',name='Open Database License',exact=True).count()==1
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'methodology-mobile.png'))
 page.goto(f.URL+'/admin/notable-aircraft/')
 page.get_by_role('heading',name='Aircraft review workbench',exact=True).wait_for()
 c=json.loads((f.ROOT/'data/airframe-catalog.json').read_text())
 c['associations'][0]['lastVerifiedAt']='2020-01-01'
 page.get_by_label('Import source catalog').set_input_files({'name':'review.json','mimeType':'application/json','buffer':json.dumps(c).encode()})
 page.get_by_text('90-day review due',exact=False).wait_for()
 page.goto(f.URL+'/notable/nasa/')
 page.get_by_role('heading',name='Historical aircraft',exact=True).wait_for()
 page.goto(f.URL+'/aircraft/nasa-sca-905/')
 page.get_by_text('Historic aircraft record',exact=True).wait_for()
 assert page.get_by_role('button',name='Check latest observation',exact=True).count()==0
 page.get_by_role('link',name='Methodology',exact=True).click()
 page.get_by_role('heading',name='Aircraft data methodology',exact=True).wait_for()
 assert not errors,errors
 print('PASS methodology mobile, local review queue, historical lookup disabled and navigation',flush=True)
if __name__=='__main__':f.serve(run)
