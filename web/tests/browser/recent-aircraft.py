"""A watched aircraft remains searchable after leaving its map area; no typing requests."""
import time
import regression as f
from playwright.sync_api import expect
old=f.rows
f.rows=lambda:[{**old()[0],'callsign':'UAL613','registration':'N613TEST','observedAt':int(time.time()*1000)-180000}]

def run(page):
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url) if '/api/search?' in r.url else None)
 page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.locator('.search-trigger').click(timeout=60000)
 search=page.get_by_role('dialog',name='Search Skyward')
 search.get_by_role('textbox',name='Search airports, flights and controls').fill('UAL613')
 search.locator('.search-active').first.click()
 page.get_by_role('button',name='✈ Flight view',exact=True).click(timeout=30000)
 page.get_by_role('region',name='Passenger flight view').wait_for(timeout=30000)
 page.get_by_role('link',name='Skyward globe',exact=True).click()
 # World view has no airport-sized camera area; the aircraft must survive in session history.
 sidebar=page.get_by_role('complementary',name='Aircraft browser')
 sidebar.get_by_role('textbox',name='Search aircraft',exact=True).fill('  UAL613 ')
 recent=sidebar.get_by_role('region',name='Previously viewed or received aircraft')
 expect(recent).to_contain_text('UAL613',timeout=30000)
 expect(recent).to_contain_text('Last observation:')
 before=len(requests);page.wait_for_timeout(800);assert len(requests)==before,'Typing must not trigger global requests'
 recent.get_by_role('button',name='Reopen UAL613',exact=True).click()
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('UAL613')
 assert '/flights/UAL613/' in page.url,page.url
 page.get_by_role('link',name='Skyward globe',exact=True).click()
 page.locator('.search-trigger').click()
 search.get_by_role('textbox',name='Search airports, flights and controls').fill('UAL613')
 retained=search.get_by_role('button',name='Flight · UA613 · UAL613',exact=False)
 expect(retained).to_contain_text('Last observation')
 retained.click()
 expect(page.get_by_role('region',name='Aircraft details')).to_contain_text('UAL613')
 page.screenshot(path=str(f.ARTIFACTS/'recent-aircraft.png'))
 assert not errors,errors
 print('PASS UAL613 flight → globe → sidebar and global search → reopen, original age, no typing lookups',flush=True)
if __name__=='__main__':f.serve(run)
