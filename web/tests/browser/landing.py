"""A late runway fix must land and taxi, with gear on the sourced airframe.
Uses the bundled IAD geometry and local fixtures; no live aviation API required.
"""
import time
import os
import urllib.parse
import regression as f
from playwright.sync_api import expect


def run(page):
    multi = os.environ.get('SKYWARD_LANDING_MULTISTOP') == '1'
    callsign = 'UAL2131' if multi else 'THY111'
    stamp = int(time.time() * 1000)
    base = {**f.rows()[0], 'callsign': callsign, 'aircraftType': 'A319' if multi else 'B738'}
    f.rows = lambda: [{**base, 'observedAt': stamp, 'lat': 38.944,
                      'lon': -77.4597, 'altitude': 430, 'groundSpeed': 140,
                      'heading': .65, 'verticalRate': -200}]
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f.INIT)

    def mock(route):
        path = urllib.parse.urlparse(route.request.url).path
        if path == '/api/account':
            route.fulfill(json={'enabled': False, 'billingReady': False,
                                'mode': 'test', 'user': None})
        elif path == '/api/route':
            route.fulfill(json={'callsign': callsign, 'source': 'Fixture',
                                'sourceUrl': 'https://example.invalid',
                                'fetchedAt': stamp, 'status': 'UNVERIFIED' if multi else 'PLAUSIBLE',
                                'airports': ([{'icao':'KATL','iata':'ATL','lat':33.6367,'lon':-84.428101},{'icao':'KIAD','iata':'IAD','lat':38.9445,'lon':-77.455803},{'icao':'KCLE','iata':'CLE','lat':41.411701,'lon':-81.8498}] if multi else [
                                    {'icao': 'EGLL', 'iata': 'LHR', 'lat': 51.47, 'lon': -.45},
                                    {'icao': 'KIAD', 'iata': 'IAD', 'lat': 38.947, 'lon': -77.46}])})
        else:
            f.mock(route)

    page.route('**/api/**', mock)
    page.goto(f.URL + '/#airport=IAD', wait_until='domcontentloaded')
    page.get_by_role('button', name=f'View {callsign}', exact=True).click()
    page.get_by_role('button', name='✈ Flight view', exact=True).click()
    if os.environ.get('SKYWARD_VISUAL_NIGHT')=='1':page.evaluate("__viewer.clock.clockStep=Cesium.ClockStep.TICK_DEPENDENT;__viewer.clock.currentTime=Cesium.JulianDate.fromIso8601('2026-09-29T03:00:00Z');__viewer.clock.shouldAnimate=false")
    if not multi:
        expect(page.locator('.map-flight-route')).to_have_text('LHR → IAD')
    assert page.evaluate('__viewer.scene.screenSpaceCameraController.enableCollisionDetection') is False
    page.wait_for_function("__viewer.entities.values.filter(e=>e.id.startsWith('landing-gear-')&&e.show).length>=6")
    # Freeze only the fixture clock to verify actual rendered wheel geometry,
    # not merely entities marked show=true, even on slow headless rendering.
    page.evaluate('window.__movingClock=Date.now;const n=Date.now();Date.now=()=>n')
    page.wait_for_timeout(3000)
    page.wait_for_function("""(()=>{const v=__viewer,C=Cesium;return v.entities.values
      .filter(e=>e.id.startsWith('landing-gear-')&&e.ellipsoid&&e.show)
      .some(e=>{const p=e.position.getValue(v.clock.currentTime),
        screen=C.SceneTransforms.worldToWindowCoordinates(v.scene,p);
        return screen&&v.scene.pick(screen,7,7)?.id?.id?.startsWith('landing-gear-');});})()""")
    page.evaluate('Date.now=window.__movingClock')
    page.screenshot(path=str(f.ARTIFACTS / ('multistop-landing-gear.jpg' if multi else 'landing-gear.jpg')), type='jpeg', quality=75)
    flight = page.get_by_role('region', name='Passenger flight view')
    assert 'Arrival animation' in flight.inner_text()
    uri = page.evaluate("__viewer.entities.getById('aircraft-abcdef').model.uri.getValue(__viewer.clock.currentTime)")
    assert '/models/sourced/' in uri, uri
    for shift in [10000, 30000, 90000, 180000]:
        page.evaluate('(s)=>window.__shift=s', shift)
        page.wait_for_timeout(1200)
        pose = page.evaluate("""(()=>{const C=Cesium,v=__viewer,
          e=v.entities.getById('aircraft-abcdef'),
          p=C.Cartographic.fromCartesian(e.position.getValue(v.clock.currentTime));
          return {lon:C.Math.toDegrees(p.longitude),lat:C.Math.toDegrees(p.latitude),height:p.height};})()""")
        assert pose['lat'] < 38.9707, pose
        assert (1 < pose['height'] < 2 if multi else 2 < pose['height'] < 4.5), pose
    page.screenshot(path=str(f.ARTIFACTS/'landing-taxi.jpg'),type='jpeg',quality=75)
    assert any(phase in page.locator('.flight-motion-status').inner_text() for phase in ['taxi', 'parked']), flight.inner_text()
    assert not errors, errors
    assert not page.locator('.recovery-screen,.cesium-widget-errorPanel').count()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(1800)
    expect(page.locator('.map-flight-route')).to_be_visible()
    page.wait_for_function("""(()=>{const v=__viewer,C=Cesium,e=v.entities.getById('aircraft-abcdef'),
      p=C.SceneTransforms.worldToWindowCoordinates(v.scene,e.position.getValue(v.clock.currentTime)),
      panel=document.querySelector('.flight-experience').getBoundingClientRect(),canvas=v.canvas.getBoundingClientRect();
      return p&&p.y+canvas.top<panel.top-10;})()""")
    page.get_by_role('button', name='Pilot cockpit', exact=True).click()
    page.wait_for_timeout(1000)
    assert page.evaluate('__viewer.camera.positionCartographic.height') > 0
    page.get_by_role('button', name='Close cockpit', exact=True).click()
    assert page.evaluate('__viewer.scene.screenSpaceCameraController.enableCollisionDetection') is True
    assert not errors, errors
    print(f'PASS {callsign}: late runway fix lands, sourced gear stays visible, and mapped taxi follows touchdown', flush=True)


if __name__ == '__main__':
    f.serve(run)
