import {useMemo} from 'react';
import type {Aircraft} from '../types';
import {nearbyTraffic} from '../lib/airportActivity';
export function NearbyTraffic({rows,center,now,select}:{rows:Aircraft[];center:{lat:number;lon:number};now:number;select:(a:Aircraft)=>void}){
 const suggestions=useMemo(()=>nearbyTraffic(rows,center,now),[rows,center,now]);
 return <div className="nearby-traffic"><small>Recently observed nearby</small>{suggestions.length?suggestions.map(({aircraft:a,distance})=><button key={a.hex} onClick={()=>select(a)}>{a.callsign||a.hex} · {Math.round(distance)} nm away</button>):<small>No recent nearby positions retained yet. Try another airport or refresh traffic.</small>}</div>;
}
