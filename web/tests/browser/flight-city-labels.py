"""Flight labels remain visible without rebuilding entities or covering aircraft."""
import json
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT+'''const NativeWorker=Worker;window.Worker=class extends NativeWorker {postMessage(data,...rest){if(!data.places)return super.postMessage(data,...rest);const places=[];for(let x=0;x<6;x++)for(let y=0;y<6;y++){const n=2**data.tile.z;places.push({name:'Town '+data.tile.x+'-'+x+'-'+y,lon:(data.tile.x+(x+.5)/6)/n*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*(data.tile.y+(y+.5)/6)/n)))*180/Math.PI,rank:8,capital:false})}queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{key:data.tile.key,places,features:[]}})));}};''')
 page.route('**/api/**',f.mock);page.goto(f.URL+'/#airport=IAD')
 page.get_by_role('button',name='View THY111',exact=True).click(timeout=60000);page.get_by_role('button',name='✈ Flight view',exact=True).click()
 panel=page.get_by_role('region',name='Passenger flight view')
 # Offscreen country names must not consume the city-label placement budget.
 page.evaluate("(()=>{const v=__viewer,C=Cesium;const outside=()=>C.Cartesian3.add(v.camera.positionWC,C.Cartesian3.add(C.Cartesian3.multiplyByScalar(v.camera.rightWC,1e9,new C.Cartesian3()),C.Cartesian3.multiplyByScalar(v.camera.directionWC,1e3,new C.Cartesian3()),new C.Cartesian3()),new C.Cartesian3());for(let i=0;i<30;i++)v.entities.add({id:'atlas-country-test-'+i,position:new C.CallbackPositionProperty(outside,false),label:{text:'Offscreen country'}});})()")

 for view in ['Bird’s-eye','side','orbit']:
  panel.get_by_role('button',name=view,exact=True).click();page.wait_for_timeout(4500)
  result=page.evaluate("(()=>{const v=__viewer,rows=v.entities.values.filter(e=>e.id.startsWith('city-')&&e.show);return {count:rows.length,readable:rows.every(e=>e.label.disableDepthTestDistance.getValue()===Infinity&&e.label.heightReference.getValue()===Cesium.HeightReference.NONE)};})()")
  print(view,json.dumps(result),flush=True);assert result['count']>0 and result['readable'],result
  page.screenshot(path=str(f.ARTIFACTS/('cities-'+('bird' if view=='Bird’s-eye' else view)+'.png')))
 assert not errors,errors
 assert not page.locator('.cesium-widget-errorPanel').count()
 print('PASS city labels in bird, side, orbit; no rendering errors',flush=True)
if __name__=='__main__':f.serve(run)
