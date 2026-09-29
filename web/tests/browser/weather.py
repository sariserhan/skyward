"""Deterministic globe-cloud and storm-flight rendering checks. No live weather required."""
import time, math
from playwright.sync_api import expect
import regression as f

def run(page):
    page.add_init_script(f.INIT)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    report=dict(station='TEST',lat=38.95,lon=-77.8,elevationM=100,observedAt=int(time.time()*1000),distanceKm=0,raw='Fixture',clouds=[dict(cover='OVC',baseM=8500)],cloudsKnown=True,rain=.8,snow=0,hail=False,storm=True,fog=False,visibilityKm=6,temperatureC=10,windDirection=270,windKnots=12,gustKnots=28)
    overview=[{**report,'lat':28+i*.12+math.sin(i*2.4)*1.7,'lon':-98+i*.16+math.cos(i*.08)*3+math.cos(i*3.1)*2} for i in range(150)]
    page.route('**/api/weather-overview',lambda r:r.fulfill(json=dict(status='current',reports=overview)))
    page.route('**/api/local-weather?*',lambda r:r.fulfill(json=dict(status='current',report=report)))
    for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
    page.goto(f.URL+'/#airport=IAD')
    page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=30000)
    page.evaluate("__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-80,37,16000000)});__viewer.scene.requestRender()")
    page.wait_for_function("__viewer.imageryLayers._layers.some(l=>l.show&&l.imageryProvider instanceof Cesium.SingleTileImageryProvider&&l.imageryProvider.url.startsWith('data:image/png'))",timeout=30000)
    page.wait_for_timeout(1800)
    page.screenshot(path=str(f.ARTIFACTS/'globe-clouds.jpg'),type='jpeg',quality=75)
    page.get_by_role('button',name='View THY111',exact=True).click()
    page.get_by_role('button',name='✈ Flight view',exact=True).click()
    page.wait_for_timeout(4000)
    page.wait_for_function("__viewer.scene.primitives._primitives.some(p=>p instanceof Cesium.PrimitiveCollection&&p._primitives.some(c=>c.appearance?.material?.type==='SkywardCloudVolume'))",timeout=30000)
    page.wait_for_function("__viewer.scene.primitives._primitives.flatMap(p=>p instanceof Cesium.PrimitiveCollection?p._primitives:[]).some(c=>c.appearance?.fragmentShaderSource?.includes('float(6)'))",timeout=30000)
    assert not page.evaluate("__viewer.scene.primitives._primitives.some(p=>p instanceof Cesium.CloudCollection&&p.length>0)")
    page.evaluate("window.__cloud=__viewer.scene.primitives._primitives.flatMap(p=>p instanceof Cesium.PrimitiveCollection?p._primitives:[]).find(c=>c.appearance?.material?.type==='SkywardCloudVolume');window.__cloudStart=Cesium.Matrix4.getTranslation(__cloud.modelMatrix,new Cesium.Cartesian3());")
    assert page.evaluate("__cloud.appearance.material.uniforms.cloudDarkness===1")
    page.wait_for_timeout(1500)
    assert page.evaluate("Cesium.Cartesian3.distance(__cloudStart,Cesium.Matrix4.getTranslation(__cloud.modelMatrix,new Cesium.Cartesian3()))>0.1")
    page.get_by_role('button',name='Bird’s-eye',exact=True).click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(f.ARTIFACTS/'clouds-from-above.jpg'),type='jpeg',quality=75)
    page.get_by_role('button',name='side',exact=True).click()
    # Verify the actual model has smoothly changing roll in this straight-track storm fixture.
    samples=[]
    for _ in range(8):
        samples.append(page.evaluate("(()=>{const v=__viewer,e=v.entities.getById('aircraft-abcdef');const q=e.orientation.getValue(v.clock.currentTime);return Cesium.Transforms.fixedFrameToHeadingPitchRoll(Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(q),e.position.getValue(v.clock.currentTime))).roll;})()"))
        page.wait_for_timeout(200)
    assert max(samples)-min(samples)>.005,samples
    page.screenshot(path=str(f.ARTIFACTS/'storm-flight.jpg'),type='jpeg',quality=75)
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_timeout(500)
    page.evaluate("window.__cloudStart=Cesium.Matrix4.getTranslation(__cloud.modelMatrix,new Cesium.Cartesian3())")
    reduced=[]
    for _ in range(3):
        reduced.append(page.evaluate("(()=>{const v=__viewer,e=v.entities.getById('aircraft-abcdef');const q=e.orientation.getValue(v.clock.currentTime);return Cesium.Transforms.fixedFrameToHeadingPitchRoll(Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(q),e.position.getValue(v.clock.currentTime))).roll;})()"))
        page.wait_for_timeout(200)
    assert max(reduced)-min(reduced)<.001,reduced
    assert page.evaluate("Cesium.Cartesian3.distance(__cloudStart,Cesium.Matrix4.getTranslation(__cloud.modelMatrix,new Cesium.Cartesian3()))<0.001")
    page.get_by_role('button',name='Pilot cockpit',exact=True).click()
    page.wait_for_timeout(1500)
    assert not page.locator('.cesium-widget-errorPanel').count()
    assert not errors,errors
    print('PASS dimensional grey storm clouds, wind drift, reduced-motion pause, globe clouds, storm aircraft and cockpit without render errors',flush=True)

if __name__=='__main__':f.serve(run)
