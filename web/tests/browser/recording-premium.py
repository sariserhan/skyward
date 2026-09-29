import regression as f
from playwright.sync_api import expect
# Browser plugin unavailable; exercise the existing Playwright fixture.
def run(page):
 paid=[False];errors=[];writes=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:writes.append(r.url) if r.method=='POST' and '/api/account/library' in r.url else None)
 page.add_init_script(f.INIT)
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/account',lambda r:r.fulfill(json={'enabled':True,'billingReady':False,'mode':'test','user':{'email':'test@example.test','premium':paid[0]},'usage':None}))
 page.route('**/api/account/library?*',lambda r:r.fulfill(json={'items':[],'limits':{'count':30,'bytes':1024}}))
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=30000)
 page.get_by_role('button',name='Record session · Premium',exact=True).click()
 page.get_by_role('button',name='Record with Premium',exact=True).click()
 expect(page.get_by_role('heading',name='See more of every journey.')).to_be_visible()
 assert not writes,writes
 page.get_by_role('button',name='Close upgrade details',exact=True).click()
 paid[0]=True;page.evaluate("dispatchEvent(new Event('skyward-account-changed'))")
 page.get_by_role('button',name='Start recording',exact=True).click()
 expect(page.get_by_role('button',name='Stop recording',exact=True)).to_be_enabled()
 paid[0]=False;page.evaluate("dispatchEvent(new Event('skyward-account-changed'))")
 expect(page.get_by_role('button',name='Stop recording',exact=True)).to_be_disabled()
 expect(page.get_by_text('Recording stopped because Premium access is unavailable. You can still export your recording.',exact=True)).to_be_visible()
 page.screenshot(path=str(f.ARTIFACTS/'recording-premium.jpg'),type='jpeg',quality=60)
 assert not errors,errors
 print('PASS free recording paywall, Premium start, access-loss stop, no free account library writes',flush=True)
if __name__=='__main__':f.serve(run)
