"""Automatic airport refreshes are fresh-aware; manual refresh respects provider cooldown."""
import regression as f

def run(page):
 count=[0];limited=[False];errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def mock(route):
  if '/api/aircraft?' in route.request.url:
   count[0]+=1
   if limited[0]:
    route.fulfill(status=429,headers={'Retry-After':'60'},body='Fixture rate limit');return
  f.mock(route)
 page.add_init_script(f.INIT);page.route('**/api/**',mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.get_by_role('button',name='View THY111',exact=True).wait_for()
 initial=count[0]
 for _ in range(10):page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_timeout(500);assert count[0]==initial,(initial,count)
 limited[0]=True
 button=page.get_by_role('button',name='Refresh airport traffic',exact=True)
 button.click();page.wait_for_timeout(500);assert count[0]==initial+1
 for _ in range(3):button.click()
 page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_timeout(500);assert count[0]==initial+1
 limited[0]=False
 page.evaluate('window.__shift=61000');button.click();page.wait_for_timeout(500)
 assert count[0]==initial+2,(initial,count)
 assert not errors,errors
 print('PASS fresh tab returns issue no extra airport requests; manual retry respects 60s cooldown and recovers',flush=True)
if __name__=='__main__':f.serve(run)
