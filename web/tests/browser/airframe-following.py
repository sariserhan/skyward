"""Aircraft directory -> follow -> refresh -> unfollow; no Cesium or automatic feed."""
import json,time
import regression as f

def run(page):
 errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.route('**/api/**',f.mock)
 page.goto(f.URL+'/aircraft/')
 page.get_by_role('heading',name='Follow the aircraft, beyond one flight').wait_for()
 page.get_by_label('Search aircraft',exact=True).fill('N905NA')
 page.get_by_role('link',name='N905NA',exact=True).click()
 page.get_by_role('heading',name='N905NA',exact=True).wait_for()
 page.get_by_role('button',name='Follow aircraft',exact=True).click()
 page.reload();page.get_by_role('button',name='Unfollow aircraft',exact=True).wait_for()
 assert not any('/api/search' in r or 'Cesium.js' in r for r in requests),requests
 page.get_by_role('link',name='Following (1)',exact=True).click()
 page.get_by_role('button',name='Unfollow aircraft',exact=True).click()
 page.reload();page.get_by_text('No aircraft followed yet.',exact=False).wait_for()
 # Explicit sync merges an account list without an unnecessary write, then saves removal.
 saved={'ids':['nasa-sca-911']};sync_requests=[]
 def account(r):
  sync_requests.append(r.request.method)
  if r.request.method=='POST':
   saved['ids']=r.request.post_data_json['value']['ids'];r.fulfill(json={'revision':2,'key':'airframes'})
  else:r.fulfill(json={'items':[{'key':'airframes','revision':1,'value':saved}],'limits':{'count':1,'bytes':4096}})
 page.route('**/api/account/library*',account)
 page.get_by_role('button',name='Merge with account · Premium',exact=True).click()
 page.get_by_role('button',name='Unfollow aircraft',exact=True).wait_for()
 assert sync_requests==['GET'],sync_requests
 page.get_by_role('button',name='Unfollow aircraft',exact=True).click()
 page.get_by_role('button',name='Save this list to account · Premium',exact=True).click()
 page.wait_for_function("document.querySelector('[role=status]')?.textContent.includes('Following list synced')")
 assert saved['ids']==[],saved
 assert sync_requests==['GET','GET','POST'],sync_requests
 page.goto(f.URL+'/notable/nasa/')
 page.get_by_role('heading',name='NASA',exact=True).wait_for()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'airframes-mobile.png'))
 page.goto(f.URL+'/admin/notable-aircraft/')
 page.get_by_role('heading',name='Aircraft review workbench').wait_for()
 page.get_by_role('button',name='Validate draft').click()
 page.get_by_role('status').filter(has_text='Valid:').wait_for()
 page.get_by_text('Advanced catalog JSON',exact=True).click()
 page.get_by_label('Catalog JSON',exact=True).fill('{"version":9}')
 page.get_by_role('button',name='Validate draft').click()
 page.get_by_role('status').filter(has_text='Unsupported catalog').wait_for()
 # Guided editing imports locally, creates/archives entities and reviews associations.
 source_catalog=(f.ROOT/'data/airframe-catalog.json').read_bytes()
 association_count=len(json.loads((f.ROOT/'public/data/airframes.json').read_text())['associations'])
 page.get_by_label('Import source catalog').set_input_files({'name':'catalog.json','mimeType':'application/json','buffer':source_catalog})
 page.get_by_role('status').filter(has_text='Imported locally').wait_for()
 page.get_by_role('button',name='Entities',exact=True).click()
 page.get_by_label('Permanent record ID').fill('test-organization')
 page.get_by_label('Display name').fill('Test organization')
 page.get_by_label('URL slug').fill('test-organization')
 page.get_by_label('Description',exact=True).fill('Browser test fixture')
 page.get_by_role('button',name='Save record to draft').click()
 page.get_by_role('status').filter(has_text='Saved to local draft').wait_for()
 assert page.get_by_label('Permanent record ID').input_value()=='test-organization'
 page.get_by_role('button',name='Associations',exact=True).click()
 page.get_by_label('Permanent record ID').fill('test-association')
 page.get_by_label('Aircraft',exact=True).select_option('nasa-sca-905')
 page.get_by_label('Entity',exact=True).select_option('test-organization')
 assert page.get_by_label('Verification status',exact=True).input_value()=='UNVERIFIED'
 page.get_by_label('Verification status',exact=True).select_option('VERIFIED')
 page.get_by_label('Source name',exact=True).fill('Fixture source')
 page.get_by_label('Source URL',exact=True).fill('https://example.org/evidence')
 page.get_by_label('Confidence',exact=True).select_option('HIGH')
 page.get_by_label('I checked the source').check()
 page.get_by_role('button',name='Save record to draft').click()
 page.get_by_role('status').filter(has_text='Saved to local draft').wait_for()
 page.get_by_role('button',name='Validate draft').click()
 page.get_by_role('status').filter(has_text=f'{association_count+1} publishable associations').wait_for()
 page.get_by_role('button',name='Entities',exact=True).click()
 page.get_by_label('Record',exact=True).select_option('test-organization')
 page.get_by_label('Archive entity').check()
 page.get_by_role('button',name='Save record to draft').click()
 page.get_by_role('button',name='Validate draft').click()
 page.get_by_role('status').filter(has_text=f'{association_count} publishable associations').wait_for()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.get_by_role('heading',name='Catalog editor',exact=True).scroll_into_view_if_needed()
 page.screenshot(path=str(f.ARTIFACTS/'airframes-editor-mobile.png'))

 # Active-airframe observation fixture: passive browsing makes no paid or free feed request.
 catalog=json.loads((f.ROOT/'public/data/airframes.json').read_text())
 catalog['aircraft'][0]['retired']=False
 catalog['aircraft'][0]['status']='VERIFIED'
 page.route('**/watch/data/airframes.json',lambda r:r.fulfill(json=catalog))
 lookup=[]
 def observation(r):
  lookup.append(r.request.url);r.fulfill(json={'source':'Test observations','aircraft':[{'hex':'abcdef','registration':'N905NA','callsign':'TEST1','observedAt':int(time.time()*1000),'ground':False,'lat':39,'lon':-77,'altitude':12000,'groundSpeed':300}]})
 page.route('**/api/search?*',observation)
 page.goto(f.URL+'/aircraft/nasa-sca-905/')
 page.get_by_role('button',name='Check latest observation',exact=True).wait_for()
 assert len(lookup)==0
 page.get_by_role('button',name='Check latest observation',exact=True).click()
 page.get_by_text('Airborne',exact=True).wait_for()
 assert page.get_by_role('button',name='Check available shortly',exact=True).is_disabled()
 assert page.get_by_role('link',name='View aircraft on globe',exact=True).get_attribute('href')=='/#aircraft=abcdef'
 assert len(lookup)==1
 page.get_by_text('Aircraft activity alerts · off',exact=True).click()
 assert page.get_by_label('First observed in this session',exact=True).is_disabled()
 page.get_by_role('button',name='Follow aircraft',exact=True).click()
 page.get_by_role('button',name='Monitor this page · 10 checks',exact=True).click()
 page.get_by_role('button',name='Stop monitoring (10 checks left)',exact=True).click()
 assert len(lookup)==1
 page.get_by_label('Airborne state confirmed by repeated observations',exact=True).check()
 page.get_by_text('Aircraft activity alerts · on',exact=True).wait_for()
 page.get_by_text('Import historical observations',exact=True).click()
 history={'version':1,'aircraftId':'nasa-sca-905','sourceName':'Local fixture','sourceUrl':'https://example.org/archive','license':'Test fixture','observations':[{'hex':'abcdef','registration':'N905NA','observedAt':int(time.time()*1000)-3600000,'lat':39,'lon':-77}]}
 page.get_by_label('History JSON').set_input_files({'name':'history.json','mimeType':'application/json','buffer':json.dumps(history).encode()})
 page.get_by_role('link',name='Local fixture',exact=True).wait_for()
 page.get_by_role('button',name='Clear imported history').click()
 assert page.get_by_role('link',name='Local fixture',exact=True).count()==0
 page.reload()
 page.get_by_text('Airborne',exact=True).wait_for()
 assert page.get_by_role('button',name='Check available shortly',exact=True).is_disabled()
 assert len(lookup)==1
 # Withdrawing a catalog entry must not erase a user's explicit follow.
 page.evaluate("localStorage.setItem('skyward.airframe-follows.v1',JSON.stringify(['unavailable-frame']))")
 page.goto(f.URL+'/following/')
 page.get_by_role('heading',name='Aircraft currently unavailable').wait_for()
 page.get_by_role('button',name='Unfollow unavailable aircraft').click()
 page.get_by_text('No aircraft followed yet.',exact=False).wait_for()
 page.goto(f.URL+'/aircraft/nasa-sca-905/')
 page.get_by_text('Airborne',exact=True).wait_for()
 page.set_viewport_size({'width':1440,'height':1000})
 page.screenshot(path=str(f.ARTIFACTS/'airframes-profile.png'))
 assert not errors,errors
 print('PASS directory, durable local follows, mobile, workbench validation and explicit single observation; no globe engine',flush=True)
if __name__=='__main__':f.serve(run)
