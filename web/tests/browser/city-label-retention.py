"""New place tiles must preserve existing city label entities and display cadence."""
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT+'''window.__placeWorkers=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker {postMessage(data,...rest){if(!data.places)return super.postMessage(data,...rest);__placeWorkers.push({worker:this,data});this.dispatchEvent(new MessageEvent('message',{data:{key:data.tile.key,places:[],features:[]}}));}};''')
 page.route('**/api/**',f.mock);page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click()
 page.get_by_role('region',name='Passenger flight view').get_by_role('button',name='Bird’s-eye',exact=True).click();page.wait_for_timeout(3000)
 page.evaluate("window.__oldCities=new Map(__viewer.entities.values.filter(e=>e.id.startsWith('city-')).map(e=>[JSON.stringify([e.label.text.getValue(),e.position.getValue()]),e]));for(const {worker,data} of __placeWorkers)worker.dispatchEvent(new MessageEvent('message',{data:{key:data.tile.key,places:[{name:'New fixture town',lon:-77.3,lat:39,rank:10,capital:false}],features:[]}}))")
 page.wait_for_function("__viewer.entities.values.some(e=>e.label?.text?.getValue()==='• New fixture town')");page.wait_for_timeout(300)
 result=page.evaluate("(()=>{const cities=__viewer.entities.values.filter(e=>e.id.startsWith('city-'));return {existing:__oldCities.size,replaced:cities.filter(e=>__oldCities.has(JSON.stringify([e.label.text.getValue(),e.position.getValue()]))&&__oldCities.get(JSON.stringify([e.label.text.getValue(),e.position.getValue()]))!==e).length}})()")
 page.evaluate("window.__retainedTown=__viewer.entities.values.find(e=>e.label?.text?.getValue()==='• New fixture town');for(const {worker,data} of __placeWorkers)worker.dispatchEvent(new MessageEvent('message',{data:{key:data.tile.key,places:[],features:[]}}))")
 page.wait_for_timeout(700)
 assert page.evaluate("__viewer.entities.values.includes(__retainedTown)"),'a temporarily empty tile must not remove the existing town'
 assert result['existing']>1000 and result['replaced']==0,result
 assert page.evaluate('__viewer.targetFrameRate === undefined')
 assert not errors,errors
 print('PASS label updates preserve existing entities; native display cadence',result,flush=True)
if __name__=='__main__':f.serve(run)
