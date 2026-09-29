"""Captured Narita approach: watched arrival owns animation through late-feed gaps."""
import time
import regression as f
from playwright.sync_api import expect

def run(page):
 page.add_init_script(f.INIT)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for path in ['area?*','aircraft?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/local-weather?*',lambda r:r.fulfill(json={'status':'unavailable','report':None}))
 page.route('**/api/weather-overview',lambda r:r.fulfill(json={'reports':[]}))
 page.add_init_script("const prefs=JSON.parse(localStorage.getItem('skyward.map.v1')||'{}');prefs.waterMotion=false;prefs.cityBuildings=false;localStorage.setItem('skyward.map.v1',JSON.stringify(prefs));")
 stamp=int(time.time()*1000)
 base={**f.rows()[0],'callsign':'KAL2129','hex':'71c711','aircraftType':'A21N','lat':35.711711,'lon':140.445596,'altitude':1825,'groundSpeed':153.8,'heading':329.1,'verticalRate':-768,'observedAt':stamp}
 f.rows=lambda:[base]
 route_data={'callsign':'KAL2129','status':'UNVERIFIED','fetchedAt':stamp,'airports':[{'iata':'PUS','icao':'RKPK','lat':35.179501,'lon':128.938004},{'iata':'NRT','icao':'RJAA','lat':35.764702,'lon':140.386002}]}
 page.route('**/api/route?*',lambda r:r.fulfill(json=route_data))
 page.goto(f.URL+'/#airport=NRT');page.get_by_role('button',name='View KAL2129',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click()
 page.wait_for_function("document.querySelector('.flight-motion-status')?.textContent.includes('Arrival animation')",timeout=25000)
 page.wait_for_function("__viewer.entities.values.filter(e=>e.id.startsWith('landing-gear-')&&e.show).length>=6",timeout=20000)
 page.wait_for_timeout(3000)
 page.screenshot(path=str(f.ARTIFACTS/'arrival-nrt-gear.jpg'),type='jpeg',quality=80)
 pose="(()=>{const C=Cesium,v=__viewer,e=v.entities.getById('aircraft-71c711'),p=C.Cartographic.fromCartesian(e.position.getValue(v.clock.currentTime));return {lon:C.Math.toDegrees(p.longitude),lat:C.Math.toDegrees(p.latitude),height:p.height}})()"
 heights=[]
 for shift in [15000,30000,45000,60000,75000,90000,120000,180000,300000,600000]:
  page.evaluate('(s)=>window.__shift=s',shift);page.wait_for_timeout(650);heights.append(page.evaluate(pose))
 assert heights[-1]['height']<10,heights
 assert 'parked' in page.locator('.flight-motion-status').inner_text(),page.locator('.flight-motion-status').inner_text()
 assert 'illustrative stand' in page.locator('.flight-motion-status').inner_text()
 page.screenshot(path=str(f.ARTIFACTS/'arrival-nrt-parked.jpg'),type='jpeg',quality=80)
 page.get_by_role('button',name='Pilot cockpit',exact=True).click();expect(page.get_by_text('ARRIVAL ANIMATION · SIMULATION',exact=True)).to_be_visible()
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(600);page.screenshot(path=str(f.ARTIFACTS/'arrival-nrt-mobile.jpg'),type='jpeg',quality=75)
 page.get_by_role('button',name='Return to live tracking',exact=True).click();expect(page.get_by_text('FOLLOWING OBSERVED FLIGHT',exact=True)).to_be_visible(timeout=10000)
 assert not errors,errors;assert page.locator('.cesium-widget-errorPanel,.recovery-screen').count()==0
 print('PASS captured NRT approach, visible gear, full landing/taxi/fallback parking, cockpit disclosure, mobile and return to live',heights,flush=True)

if __name__=='__main__':f.serve(run)
