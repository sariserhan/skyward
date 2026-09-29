import type {Recording} from './sessionRecording';
import {contiguous} from './positionQuality.ts';
export function replayHighlights(recording:Recording){return recording.tracks.flatMap(t=>t.points.flatMap((p,i)=>{const before=t.points[i-1];if(!before||!contiguous(before,p)||before.ground===p.ground)return [];return [{hex:t.identity.hex,callsign:t.identity.callsign||t.identity.hex,time:p.time,kind:p.ground?'Landing transition':'Takeoff transition'}];})).sort((a,b)=>a.time-b.time).slice(0,40);}
