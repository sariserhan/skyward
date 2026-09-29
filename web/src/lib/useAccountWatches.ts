import {useCallback,useEffect,useRef,useState} from 'react';
import {accountRequest,type Account} from './membership';
import {listAccountItems,saveAccountItem,deleteAccountItem,watchlistChanged} from './accountLibrary';
import type {WatchItem} from './useObservatory';
export function localWatches():WatchItem[]{try{const rows=JSON.parse(localStorage.getItem('skyward.watches.v1')??'[]');return Array.isArray(rows)?rows.filter(a=>a&&/^[a-f\d]{6}$/.test(a.hex)&&['callsign','registration','aircraftType'].every(k=>typeof a[k]==='string')).slice(0,30):[];}catch{return [];}}
export function useAccountWatches(){
 const [watches,setWatches]=useState<WatchItem[]>(localWatches),[error,setError]=useState(''),account=useRef<string|null>(null),rows=useRef(watches),serial=useRef(0),busy=useRef(false);rows.current=watches;
 useEffect(()=>{
  let alive=true;const refresh=async(check=false)=>{if(document.hidden||busy.current&&!check)return;const ticket=++serial.current;
   try{if(check){const a=await accountRequest<Account>('/api/account');if(!alive||ticket!==serial.current)return;const next=a.user?.email??null;if(next!==account.current){account.current=next;setWatches(next?[]:localWatches());}}
    if(!account.current){if(alive)setWatches(localWatches());return;}
    const result=await listAccountItems<WatchItem>('watchlist');if(alive&&ticket===serial.current){setWatches(result.items.map(i=>i.value));setError('');}
   }catch(e){if(alive)setError(e instanceof Error?e.message:'Watchlist sync unavailable.');}
  };
  const changed=(event?:Event)=>{if(event instanceof CustomEvent&&event.detail?.signedOut){++serial.current;account.current=null;setWatches(localWatches());setError('');}void refresh(true);},sync=()=>{void refresh();};changed();
  addEventListener('skyward-account-changed',changed);addEventListener('skyward-watchlist-changed',sync);addEventListener('focus',changed);
  return()=>{alive=false;++serial.current;removeEventListener('skyward-account-changed',changed);removeEventListener('skyward-watchlist-changed',sync);removeEventListener('focus',changed);};
 },[]);
 const toggleWatch=useCallback(async(a:WatchItem)=>{
  if(busy.current)return;busy.current=true;++serial.current;const owner=account.current,old=rows.current,exists=old.some(w=>w.hex===a.hex),item={hex:a.hex,callsign:a.callsign,registration:a.registration,aircraftType:a.aircraftType};
  try{
   if(!exists&&old.length>=30)throw Error('Watchlist is full (30 aircraft). Remove one before adding another.');
   if(owner){if(exists)await deleteAccountItem('watchlist',{key:a.hex,revision:0,updated:0,value:item});else await saveAccountItem('watchlist',a.hex,item);}
   const next=exists?old.filter(w=>w.hex!==a.hex):[...old,item];
   if(owner===account.current){setWatches(next);if(!owner)localStorage.setItem('skyward.watches.v1',JSON.stringify(next));setError('');}
  }catch(e){setError(e instanceof Error?e.message:'Watchlist was not saved.');}
  finally{busy.current=false;watchlistChanged();}
 },[]);
 return {watches,toggleWatch,watchSyncError:error};
}
