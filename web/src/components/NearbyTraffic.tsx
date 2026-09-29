import {busyObservedAirports} from '../lib/discovery';
import {trackDistance} from '../lib/positionQuality';
import {useMemo} from 'react';
import type {Aircraft} from '../types';
import {nearbyTraffic} from '../lib/airportActivity';
export function NearbyTraffic({rows,center,now,select,airport}:{airport:(id:string)=>void;rows:Aircraft[];center:{lat:number;lon:number};now:number;select:(a:Aircraft)=>void}){
 const suggestions=useMemo(()=>nearbyTraffic(rows,center,now),[rows,center,now]);
 const ports=useMemo(()=>busyObservedAirports(rows,now).filter(p=>trackDistance(center,p.airport)<500).slice(0,3),[rows,center,now]);
 return <div className="nearby-traffic"><small>Recently observed nearby</small>{suggestions.length?suggestions.map(({aircraft:a,distance})=><button key={a.hex} onClick={()=>select(a)}>{a.callsign||a.hex} · {Math.round(distance)} nm away</button>):<small>No recent nearby positions retained yet. Try another airport or refresh traffic.</small>}{ports.length>0&&<><small>Airports with recent observations</small>{ports.map(p=><button key={p.id} onClick={()=>airport(p.id)}>{p.id} · {p.count} recently observed</button>)}</>}</div>;
}
