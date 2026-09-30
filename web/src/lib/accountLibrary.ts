import {validBackupValue} from './localBackup';
import {accountRequest} from './membership';
export type LibraryKind='boardingpasses'|'watchlist'|'views'|'recordings'|'logbook'|'simulator'|'trips'|'journal'|'airports'|'missions';
export interface LibraryItem<T=unknown>{key:string;revision:number;updated:number;name?:string;bytes?:number;value:T;}
export const listAccountItems=<T>(kind:LibraryKind)=>accountRequest<{items:LibraryItem<T>[];limits:{count:number;bytes:number}}>(`/api/account/library?kind=${kind}`);
export const getAccountItem=<T>(kind:LibraryKind,key:string)=>accountRequest<LibraryItem<T>>(`/api/account/library?kind=${kind}&key=${encodeURIComponent(key)}`);
export const saveAccountItem=(kind:LibraryKind,key:string,value:unknown,revision=0)=>accountRequest<{key:string;revision:number}>('/api/account/library',{kind,key,value,revision});
export const deleteAccountItem=(kind:LibraryKind,item:LibraryItem)=>accountRequest('/api/account/library',{kind,key:item.key,revision:item.revision,remove:true});
export {accountChanged} from './accountEvents';
export const watchlistChanged=()=>window.dispatchEvent(new Event('skyward-watchlist-changed'));
export const VIEW_KEYS=['skyward.map.v1','skyward.flight-view.v1','skyward.camera-bookmarks.v1','skyward.favorites.v1','skyward.cabin-audio.v1'];
export function captureViewSettings(){return Object.fromEntries(VIEW_KEYS.flatMap(k=>{const v=localStorage.getItem(k);return v===null?[]:[[k,v]];}));}
export function restoreViewSettings(settings:Record<string,string>){
 const entries=VIEW_KEYS.filter(k=>Object.hasOwn(settings,k));for(const k of entries)if(k==='skyward.cabin-audio.v1'?!['on','off'].includes(settings[k]):!validBackupValue(k,settings[k]))throw Error('Invalid viewing setup.');
 const before=entries.map(k=>[k,localStorage.getItem(k)] as const);try{for(const k of entries)localStorage.setItem(k,settings[k]);}catch{for(const [k,v]of before){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}throw Error('Settings could not be restored. Browser storage may be full.');}location.reload();
}
