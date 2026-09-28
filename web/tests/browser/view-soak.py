"""Five-minute wall-clock view/audio lifecycle check with local fixture traffic."""
import json, time, os
import regression as f
from playwright.sync_api import expect
base=f.rows()[0]
f.rows=lambda:[{**base,'observedAt':int(time.time()*1000),'lat':38.947,'lon':-77.55,'groundSpeed':150,'altitude':2200,'heading':90,'verticalRate':-700},{**base,'observedAt':int(time.time()*1000),'hex':'123abc','callsign':'SIA222','lat':38.947,'lon':-77.40,'altitude':5200,'groundSpeed':180,'heading':90,'verticalRate':900}]
def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.add_init_script("window.__audio=[];const AC=window.AudioContext;window.AudioContext=new Proxy(AC,{construct(T,args){const c=new T(...args);c.__voices=0;const oscillator=c.createOscillator.bind(c);c.createOscillator=()=>{c.__voices++;return oscillator();};window.__audio.push(c);return c;}})")
 page.route('**/api/**',f.mock);page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 start=time.monotonic();samples=[];cycle=0;cdp=page.context.new_cdp_session(page)
 while time.monotonic()-start<float(os.environ.get('SKYWARD_VIEW_SOAK_SECONDS','300')) or cycle<3:
  page.get_by_role('button',name='View IAD airport',exact=True).click();page.get_by_role('button',name='Tower view',exact=True).click();tower=page.get_by_role('region',name='Virtual airport tower');tower.get_by_role('button',name='Auto-director off',exact=True).click();expect(tower.get_by_label('Tower aircraft',exact=True)).to_have_value('abcdef');tower.get_by_role('button',name='Next departure',exact=True).click();expect(tower.get_by_role('button',name='Auto-director off',exact=True)).to_be_visible()
  tower.get_by_role('button',name='Tower audio off',exact=True).click();page.wait_for_function("__audio.at(-1)?.state==='running'");tower.get_by_label('Tower audio volume').fill('0.2');page.wait_for_timeout(500);assert page.evaluate('__audio.at(-1).__voices')==3
  if cycle==0:
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");page.wait_for_function("__audio.at(-1).state==='suspended'");page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");page.wait_for_function("__audio.at(-1).state==='running'")
  page.screenshot(path=str(f.ARTIFACTS/'tower-audio.jpg'),type='jpeg',quality=60) if cycle==0 else None
  tower.get_by_role('button',name='Close tower view').click();page.wait_for_function("__audio.every(c=>c.state==='closed')")
  page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('button',name='Pilot cockpit',exact=True).click();radar=page.get_by_role('complementary',name='Cockpit traffic radar');radar.get_by_label('Radar range').select_option('25');radar.get_by_label('Radar altitude band').select_option('1000');expect(radar.get_by_role('button',name='Track SIA222 on cockpit radar')).to_have_count(0);radar.get_by_label('Radar altitude band').select_option('5000');track=radar.get_by_role('button',name='Track SIA222 on cockpit radar');track.wait_for();track.locator('.radar-hit').click();expect(radar.locator('.radar-selection')).to_contain_text('relative bearing')
  if cycle==0:
   page.set_viewport_size({'width':390,'height':844});radar.get_by_role('button',name='Expand radar',exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(f.ARTIFACTS/'radar-filter-mobile.jpg'),type='jpeg',quality=65);page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1000})
  page.get_by_role('button',name='Close cockpit',exact=True).click();page.get_by_role('button',name='Close aircraft details',exact=True).click()
  if cycle==0:
   page.locator('.unified-map-tools>summary').click();page.get_by_role('button',name='Performance',exact=True).click()
   with page.expect_download() as download:page.get_by_role('button',name='Download problem snapshot',exact=True).click()
   data=json.load(open(download.value.path()));assert data['format']=='skyward-problem-snapshot';assert 'camera' in data and len(data['feedTimings'])<=30;page.get_by_role('button',name='Close performance',exact=True).click();page.locator('.unified-map-tools>summary').click()
  cdp.send('HeapProfiler.collectGarbage');sample={'cycle':cycle,'seconds':round(time.monotonic()-start,1),'heap':cdp.send('Runtime.getHeapUsage')['usedSize'],**page.evaluate("({entities:__viewer.entities.values.length,sources:__viewer.dataSources.length,dom:document.querySelectorAll('*').length,openAudio:__audio.filter(c=>c.state!=='closed').length})")};samples.append(sample);print(json.dumps(sample),flush=True);assert sample['openAudio']==0;assert not errors,errors
  page.wait_for_timeout(500);cycle+=1
 assert samples[-1]['heap']-samples[1]['heap']<64*1024*1024;assert samples[-1]['dom']-samples[1]['dom']<1000;assert samples[-1]['sources']<=samples[1]['sources']+1
 (f.ARTIFACTS/'view-soak.json').write_text(json.dumps(samples,indent=2));print('PASS wall-clock view soak, audio teardown, director manual override, radar filters, mobile layout and snapshot download',flush=True)
if __name__=='__main__':f.serve(run)
