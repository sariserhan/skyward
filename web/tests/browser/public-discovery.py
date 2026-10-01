"""Read-only post-deployment mobile discovery smoke; artifacts stay outside source."""
import os,sys,tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
origin=(sys.argv[1] if len(sys.argv)>1 else 'https://skyvvard.com').rstrip('/')
assert urlparse(origin).scheme=='https' or urlparse(origin).hostname in ('127.0.0.1','localhost')
out=Path(os.environ.get('SKYWARD_QA_ARTIFACTS',tempfile.mkdtemp(prefix='skyward-public-')));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for slug,title in [('sports','Sports-team aircraft'),('historic','Historic aircraft')]:
  response=page.goto(origin+'/collections/'+slug+'/',wait_until='domcontentloaded');assert response.status==200
  expect(page.get_by_role('heading',name=title,exact=True)).to_be_visible(timeout=60000)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  nav=page.get_by_role('navigation',name='Aircraft collections');expect(nav).to_be_visible()
  page.screenshot(path=str(out/(slug+'-mobile.png')))
  assert not page.locator('vite-error-overlay').count()
 assert not errors,errors
 browser.close()
print('PASS deployed mobile collection pages, headings, links, width and runtime health. Screenshots:',out)
