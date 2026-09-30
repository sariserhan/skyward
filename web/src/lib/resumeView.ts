import {observatoryRoute} from './pageRoutes';
import {consumeErrorRecovery} from './errorRecovery';
import {parseView} from './experience';
export function initialViewHash(){
 const recovery=consumeErrorRecovery();if(recovery)return recovery.hash;
 const route=observatoryRoute(location.pathname);
 if(route?.kind==='airport'){const q=new URLSearchParams(location.hash.replace(/^#/,''));q.set('airport',route.id);q.delete('aircraft');return '#'+q;}
 if(route?.kind==='flight')return location.hash||'#airport=IAD';
 if(location.hash)return location.hash;
 try{if(JSON.parse(localStorage.getItem('skyward.map.v1')??'{}').resumeView!==true)return '';const saved=JSON.parse(localStorage.getItem('skyward.resume.v1')??'null');if(saved&&typeof saved.hash==='string'&&saved.hash.length<600&&Number.isFinite(saved.time)&&saved.time<=Date.now()+60000&&Date.now()-saved.time<7*86400000){const view=parseView(saved.hash);if(view.hasView)return saved.hash;}}catch{}
 return '';
}
