"""Fresh visitors can find a callsign absent from map feeds and browsing history.
Browser plugin not available; use the existing isolated Playwright harness.
"""
import time, urllib.parse
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];lookups=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT)
 page.add_init_script("window.__rejections=[];addEventListener('unhandledrejection',e=>__rejections.push(String(e.reason?.stack||e.reason)));")
 def mock(r):
  u=urllib.parse.urlparse(r.request.url);q=urllib.parse.parse_qs(u.query)
  if u.path=='/api/search':
   code=q.get('q',[''])[0];lookups.append(code)
   rows=[{**f.rows()[0],'callsign':code,'hex':'fedcba','lat':48.2,'lon':16.3,'observedAt':int(time.time()*1000)}] if code in ('UAL613','DAL999') else []
   if code=='UAL222':rows=[{**f.rows()[0],'callsign':code,'hex':hex} for hex in ['fedcba','abc123']]
   r.fulfill(json=dict(aircraft=rows,fetchedAt=int(time.time()*1000)));return
  f.mock(r)
 page.route('**/api/**',mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.locator('.search-trigger').click(timeout=60000)
 search=page.get_by_role('dialog',name='Search Skyward');field=search.get_by_role('textbox',name='Search airports, flights and controls')
 field.fill('UA613')
 expect(search.locator('.search-active')).to_contain_text('Find flight worldwide · UA613')
 assert not lookups,'No requests while typing'
 field.press('Enter')
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('UAL613',timeout=30000)
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('UA613 · UAL613')
 assert '/flights/UAL613/' in page.url
 assert 'UAL613' in lookups
 page.get_by_role('link',name='Skyward globe',exact=True).click()
 sidebar=page.get_by_role('complementary',name='Aircraft browser')
 sidebar.get_by_role('textbox',name='Search aircraft',exact=True).fill('DL 999')
 sidebar.get_by_role('textbox',name='Search aircraft',exact=True).press('Enter')
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('DAL999',timeout=30000)
 assert 'DAL999' in lookups
 page.get_by_role('link',name='Skyward globe',exact=True).click()
 page.locator('.search-trigger').click();field.fill('UAL0000');field.press('Enter')
 expect(search.get_by_role('alert')).to_contain_text('No current observation',timeout=30000)
 page.screenshot(path=str(f.ARTIFACTS/'worldwide-search-unavailable.png'))
 search.get_by_role('button',name='Close search').click()
 sidebar.get_by_role('textbox',name='Search aircraft',exact=True).fill('UA222')
 sidebar.get_by_role('textbox',name='Search aircraft',exact=True).press('Enter')
 expect(sidebar.locator('.inline-message')).to_contain_text('More than one aircraft',timeout=30000)
 assert '/flights/UAL222/' not in page.url
 page.goto(f.URL+'/flights/UA613/',wait_until='domcontentloaded')
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('UA613 · UAL613',timeout=60000)
 page.screenshot(path=str(f.ARTIFACTS/'passenger-flight-link.png'))
 rejections=page.evaluate('window.__rejections');assert not rejections,rejections
 assert not errors,errors
 print('PASS unseen UA613 → UAL613 global search Enter, unseen DL999 → DAL999 sidebar Enter, whitespace normalization, unavailable observation, no typing requests',flush=True)
if __name__=='__main__':f.serve(run)
