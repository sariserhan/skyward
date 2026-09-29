"""Deterministic building streaming and mapped-airport detail rendering."""
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.add_init_script("""const p=JSON.parse(localStorage.getItem('skyward.map.v1'));Object.assign(p,{structures:true,cityBuildings:true,quality:'balanced'});localStorage.setItem('skyward.map.v1',JSON.stringify(p));
 const NativeWorker=window.Worker;window.Worker=new Proxy(NativeWorker,{construct(T,args){if(!String(args[0]).includes('cityBuildings'))return Reflect.construct(T,args);return {onmessage:null,onerror:null,done:false,postMessage({tile}){setTimeout(()=>{if(this.done)return;const n=2**tile.z,x=(tile.x+.5)/n*360-180,y=Math.atan(Math.sinh(Math.PI*(1-2*(tile.y+.5)/n)))*180/Math.PI;this.onmessage?.({data:{key:tile.key,buildings:[{rings:[[[x-.0003,y-.0003],[x+.0003,y-.0003],[x+.0003,y+.0003],[x-.0003,y+.0003]]],height:25,base:0}]}})},150)},terminate(){this.done=true}}}});""")
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='Close airport details',exact=True).click(timeout=30000)
 page.evaluate("__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-77.44,38.95,1400),orientation:{heading:0,pitch:-1.2,roll:0}});__viewer.scene.requestRender()")
 page.wait_for_function("__viewer.scene.primitives._primitives.some(p=>p.appearance?.material?.type==='SkywardBuildingFade'&&p.appearance.material.uniforms.visibility<1)",timeout=30000)
 page.wait_for_function("__viewer.dataSources._dataSources.some(s=>s.name==='mapped-airport-detail'&&s.entities.values.some(e=>e.id.startsWith('illustrative-bridge-')))")
 page.wait_for_timeout(3000)
 assert page.evaluate("__viewer.scene.primitives._primitives.some(p=>p.appearance?.material?.type==='SkywardBuildingFade'&&p.appearance.material.uniforms.visibility===1)")
 page.screenshot(path=str(f.ARTIFACTS/'scenery-detail.jpg'),type='jpeg',quality=75)
 page.evaluate("__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-77.2,39.05,1400),orientation:{heading:0,pitch:-1.2,roll:0}});__viewer.scene.requestRender()")
 page.wait_for_timeout(4000)
 assert not page.evaluate("__viewer.dataSources._dataSources.some(s=>s.name==='mapped-airport-detail')")
 assert not errors,errors
 assert not page.locator('.cesium-widget-errorPanel').count()
 print('PASS streamed building fade, departure cleanup, mapped bridges and airport-detail culling',flush=True)
if __name__=='__main__':f.serve(run)
