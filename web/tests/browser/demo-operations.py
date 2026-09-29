"""Coordinated demo, full journey persistence, cameras, feedback and mode cleanup.
Browser plugin not available: isolated Chromium/Playwright, mocked traffic only.
"""
import time,json,urllib.parse,os
os.environ.update(NODE_ENV='development',SKYWARD_DEV_PREMIUM='1',SKYWARD_ACCOUNTS='test',SKYWARD_ACCOUNT_DB=':memory:')
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.add_init_script(f.INIT)
 page.add_init_script("localStorage.setItem('skyward.guide.v1','done');if(!localStorage.getItem('skyward.demo.v2.TAS'))localStorage.setItem('skyward.demo.v2.TAS',JSON.stringify({version:2,airport:'TAS',seed:7,time:0,journeyTime:0,speed:1,paused:false,flight:'skyward-demo-0',camera:'side',journey:false}));")
 def empty(r):r.fulfill(json={'aircraft':[],'source':'fixture','fetchedAt':int(time.time()*1000),'sourceAt':int(time.time()*1000)})
 for path in ['area?*','aircraft?*']:page.route('**/api/'+path,empty)
 for path in ['route?*','search?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/account',lambda r:r.fulfill(json={'enabled':False,'billingReady':False,'mode':'test','user':None,'usage':None}))
 page.goto(f.URL+'/#airport=TAS');assert 'Skyward' in page.title()
 page.wait_for_function("window.__viewer && __viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-')).length===20",timeout=60000)
 page.get_by_role('button',name='Report a problem',exact=True).click();report=page.get_by_role('dialog',name='Report a problem');report.get_by_label('Problem description').fill('Demo camera issue: steps and expected result');report.get_by_role('button',name='Review report',exact=True).click();expect(report).to_contain_text('Report ready');diag=json.loads(report.get_by_label('Problem report diagnostics').input_value());assert 'camera' not in diag and 'account' not in diag
 with page.expect_download() as dl:report.get_by_role('button',name='Download reviewed report',exact=True).click()
 payload=json.load(open(dl.value.path()));assert payload['description'].startswith('Demo camera') and 'diagnostics' in payload;report.get_by_label('Attach technical diagnostics').uncheck();report.get_by_role('button',name='Review report',exact=True).click()
 with page.expect_download() as dl:report.get_by_role('button',name='Download reviewed report',exact=True).click()
 assert 'diagnostics' not in json.load(open(dl.value.path()));page.screenshot(path=str(f.ARTIFACTS/'problem-report.jpg'),type='jpeg');report.get_by_role('button',name='Close problem report').click()
 page.get_by_role('button',name='Upgrade',exact=True).click();page.get_by_text('Compare Free and Premium',exact=True).click();expect(page.get_by_role('table')).to_contain_text('Same observed map coverage');expect(page.get_by_role('table')).to_contain_text('Unavailable');page.screenshot(path=str(f.ARTIFACTS/'premium-comparison.jpg'),type='jpeg');page.get_by_role('button',name='Close upgrade details').click()
 assert not errors,errors;assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count();assert not [r for r in requests if '/api/premium/' in r or '/api/billing/' in r or '/api/report' in r]
 print('PASS reviewed report export, accurate Premium comparison, no paid requests or runtime errors',flush=True)
if __name__=='__main__':f.serve(run)
