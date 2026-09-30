import {parseRecording} from './sessionRecording';
export function premiumDemoRecording(){
 const start=Date.UTC(2026,8,30,12),points=Array.from({length:61},(_,i)=>({time:start+i*1000,lat:38.96+i*.0005,lon:-77.46-i*.0004,altitude:5000+i*5,ground:false,groundSpeed:150}));
 return parseRecording({format:'skyward-session',version:1,name:'SAMPLE · DEMO101 · fictional flight',createdAt:start,source:'Skyward fictional Premium preview — not received aircraft observations',license:'Skyward sample',tracks:[{identity:{hex:'de0101',callsign:'DEMO101',registration:'SAMPLE',aircraftType:'B738',heading:330},points}]});
}
