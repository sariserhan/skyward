import type {Aircraft} from '../types';
export function coverageMessage(rows:Pick<Aircraft,'observedAt'>[],shown:number,now:number,loading:boolean,error:string,filtered:boolean,online=true){
 if(!online)return {title:'Offline · no new observations',detail:'Reconnect to receive positions. Retained fixes keep their original timestamps.'};
 if(error)return {title:rows.length?'Feed interrupted · retained observations':'Position feed unavailable',detail:'The provider could not complete this update. Retry; an empty map does not mean the airspace is empty.'};
 if(loading&&!rows.length)return {title:'Loading flights in this area',detail:'Receiving observations for this camera area. Coverage is not yet known.'};
 if(rows.length&&rows.every(a=>a.observedAt===null||now-a.observedAt>120000||a.observedAt>now+5000))return {title:'Only stale or untimed positions',detail:filtered&&!shown?'No fresh positions are available. Clear filters to inspect retained observations, or refresh.':'The last fixes are over two minutes old or have no usable time. Refresh or try another area.'};
 if(filtered&&!shown&&rows.length)return {title:'Filters hide the received traffic',detail:`${rows.length} observations were received. Clear the active filters to show them.`};
 if(!rows.length)return {title:'No aircraft reported in this area',detail:'The request returned no observations. Receiver coverage may be incomplete; move or zoom the map, or look up a callsign.'};
 return {title:`${shown} targets in camera area`,detail:'Only received observations are shown. Missing aircraft do not prove empty airspace.'};
}
