import {parseView} from './experience';
export function initialViewHash(){
 if(location.hash)return location.hash;
 try{if(JSON.parse(localStorage.getItem('skyward.map.v1')??'{}').resumeView!==true)return '';const saved=JSON.parse(localStorage.getItem('skyward.resume.v1')??'null');if(saved&&typeof saved.hash==='string'&&saved.hash.length<600&&Number.isFinite(saved.time)&&saved.time<=Date.now()+60000&&Date.now()-saved.time<7*86400000){const view=parseView(saved.hash);if(view.hasView)return saved.hash;}}catch{}
 return '';
}
