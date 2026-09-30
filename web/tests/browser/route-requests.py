"""Fresh route results survive tab switching without redundant API requests."""
import regression as f

def run(page):
 count=[0];errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def mock(route):
  if '/api/route?' in route.request.url:count[0]+=1
  f.mock(route)
 page.add_init_script(f.INIT);page.route('**/api/**',mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.get_by_role('button',name='View THY111',exact=True).click()
 page.wait_for_function("document.body.innerText.includes('LHR')")
 page.wait_for_timeout(500);initial=count[0];assert initial>=1
 for _ in range(10):page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_timeout(500);assert count[0]==initial,(initial,count)
 page.evaluate("window.__shift=301000;document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_timeout(1000);assert count[0]==initial+1,(initial,count)
 assert not errors,errors
 print('PASS ten fresh-tab events: zero extra route requests; expired result refreshes once',flush=True)
if __name__=='__main__':f.serve(run)
