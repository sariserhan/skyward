import type {Aircraft} from '../types';
export function ObservedFlightUpgrade({aircraft,arrival=false}:{aircraft:Aircraft;arrival?:boolean}){
 const age=aircraft.observedAt===null?null:Math.floor((Date.now()-aircraft.observedAt)/1000);
 const stamp=age===null||age<0?'Position time unavailable':`Last position ${age<60?`${age}s`:age<3600?`${Math.floor(age/60)}m`:`${Math.floor(age/3600)}h`} ago`;
 return <aside className="flight-upgrade-banner observed-flight-upgrade" aria-label="Real flight Premium upgrade"><div><strong>Watching a real flight</strong><span>{stamp} · {arrival?'arrival animation':'estimated motion'}.</span><span>Premium adds richer flight details.</span></div><button aria-haspopup="dialog" onClick={()=>window.dispatchEvent(new Event('skyward-upgrade'))}>Upgrade to Premium</button></aside>;
}
