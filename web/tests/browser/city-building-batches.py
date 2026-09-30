"""Dense city tiles upload incrementally without dropping building detail."""
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 init=f.INIT.replace("if(k==='Viewer')", "if(k==='Primitive')return new Proxy(value.Primitive,{construct(t,args){const o=args[0];if(o?.appearance?.material?.type==='SkywardBuildingFade'&&o.allowPicking===false)window.__batches.push(o.geometryInstances.length);return Reflect.construct(t,args);}});if(k==='Viewer')")
 page.add_init_script('window.__batches=[];'+init)
 page.add_init_script("""const p=JSON.parse(localStorage.getItem('skyward.map.v1'));Object.assign(p,{structures:false,cityBuildings:true,quality:'balanced'});localStorage.setItem('skyward.map.v1',JSON.stringify(p));
 const NativeWorker=window.Worker;window.Worker=new Proxy(NativeWorker,{construct(T,args){if(!String(args[0]).includes('cityBuildings'))return Reflect.construct(T,args);return {onmessage:null,onerror:null,done:false,postMessage({tile,places}){if(places)return;setTimeout(()=>{if(this.done)return;const n=2**tile.z,x=(tile.x+.5)/n*360-180,y=Math.atan(Math.sinh(Math.PI*(1-2*(tile.y+.5)/n)))*180/Math.PI;this.onmessage?.({data:{key:tile.key,buildings:Array.from({length:120},(_,i)=>{const lon=x+(i%12)*.0002,lat=y+Math.floor(i/12)*.0002;return {rings:[[[lon,lat],[lon+.0001,lat],[lon+.0001,lat+.0001],[lon,lat+.0001]]],height:25,base:0}})}})},100)},terminate(){this.done=true}}}});""")
 page.route('**/api/**',f.mock);page.goto(f.URL+'/#airport=IAD')
 page.get_by_role('button',name='Close airport details',exact=True).click(timeout=30000)
 page.evaluate("__viewer.camera.cancelFlight();__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-77.44,38.95,1400),orientation:{heading:0,pitch:-1.2,roll:0}})")
 page.wait_for_function('window.__batches.length>=3',timeout=90000)
 sizes=page.evaluate('window.__batches');assert sizes[:3]==[48,48,24],sizes
 page.wait_for_timeout(2500)
 assert not errors,errors
 assert page.locator('.cesium-widget-errorPanel,.recovery-screen').count()==0
 page.screenshot(path=str(f.ARTIFACTS/'batched-buildings.png'))
 print('PASS complete 120-building tile uploaded as 48/48/24 without dropping geometry:',sizes,flush=True)
if __name__=='__main__':f.serve(run)
