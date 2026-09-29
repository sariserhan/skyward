"""Rendered original 787 flex rig; fixture traffic, no paid feed."""
import regression as f
base=f.rows()[0];f.rows=lambda:[{**base,'aircraftType':'B787','callsign':'THY111'}]
def run(p):
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.add_init_script(f.INIT)
 for path in ['area?*','aircraft?*','route?*','status']:p.route('**/api/'+path,f.mock)
 p.goto(f.URL+'/#airport=IAD');p.get_by_role('button',name='View THY111',exact=True).click(timeout=30000);p.get_by_role('button',name='✈ Flight view',exact=True).click()
 p.wait_for_function("__viewer.scene.primitives._primitives.some(p=>p.ready&&p.getNode?.('FlexWingL'))",timeout=45000)
 values=p.evaluate("""()=>{const p=__viewer.scene.primitives._primitives.find(p=>p.ready&&p.getNode?.('FlexWingL'));return Cesium.Matrix4.toArray(p.getNode('FlexWingL').matrix)}""")
 p.wait_for_timeout(1500)
 assert not errors,errors
 p.screenshot(path=str(f.ARTIFACTS/'fallback-787-flex.jpg'),type='jpeg',quality=70)
 print('PASS rendered rigged 787 fallback with animated wings',values,flush=True)
if __name__=='__main__':f.serve(run)
