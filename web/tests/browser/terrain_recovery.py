"""Real Cesium terrain provider with deterministic elevation tiles and failed children."""
import struct,zlib,collections
import regression as f

def tile():
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 raw=(b'\0'+bytes([128,100,0])*256)*256
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',256,256,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
def run(page):
 errors=[];requests=collections.Counter();failed=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT.replace('terrain:false,','')) # Missing preference must enable terrain by default.
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 data=tile()
 def elevation(r):
  key=r.request.url.split('/terrarium/')[1];requests[key]+=1
  if key.startswith('4/') and (not failed or key==failed[0]):
   if not failed:failed.append(key)
   r.fulfill(status=503,body='fixture outage');return
  r.fulfill(body=data,content_type='image/png')
 page.route('**/elevation-tiles-prod/terrarium/**',elevation)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded');page.wait_for_function('window.__viewer');page.wait_for_function("localStorage.getItem('skyward.map.v1')&&JSON.parse(localStorage.getItem('skyward.map.v1')).terrain")
 page.evaluate("__viewer.camera.cancelFlight();__viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-77.46,38.95,25000)});__viewer.scene.requestRender()")
 page.get_by_role('button',name='Retry elevation',exact=True).wait_for(timeout=30000)
 assert page.evaluate('__viewer.terrainProvider instanceof Cesium.CustomHeightmapTerrainProvider')
 assert failed,requests
 page.get_by_role('button',name='Retry elevation',exact=True).wait_for(timeout=20000)
 assert requests[failed[0]]==3,(failed,requests)
 assert page.evaluate('__viewer.terrainProvider instanceof Cesium.CustomHeightmapTerrainProvider')
 page.wait_for_function("__viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(-77.46,38.95))>90",timeout=30000)
 page.screenshot(path=str(f.ARTIFACTS/'terrain-local-failure.jpg'),type='jpeg')
 page.get_by_role('button',name='Retry elevation',exact=True).click()
 for _ in range(30):
  if requests[failed[0]]>=4:break
  page.wait_for_timeout(500)
 assert requests[failed[0]]>=4,requests
 assert not errors,errors
 print('PASS terrain on by default; failed child bounded retries; nearby 100m terrain retained; manual retry remains local to provider',flush=True)
if __name__=='__main__':f.serve(run)
