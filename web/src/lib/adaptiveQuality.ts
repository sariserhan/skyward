export type Quality='low'|'balanced'|'high';
export function suggestedQuality(quality:Quality,frameTimes:number[]):Quality|null{const valid=frameTimes.filter(n=>Number.isFinite(n)&&n>0&&n<1000);if(valid.length<60||quality==='low')return null;const slow=valid.filter(n=>n>45).length/valid.length;return slow>=.75?(quality==='high'?'balanced':'low'):null;}
export function lowerQuality(a:Quality,b:Quality|null){const ranks={low:0,balanced:1,high:2};return b&&ranks[b]<ranks[a]?b:a;}

export function graphicsPreset(preset:'battery'|'balanced'|'high'){
 return preset==='battery'?{quality:'low' as const,batterySaver:true,autoQuality:true,shadows:false,waterMotion:false,cityBuildings:false,declutter:true}:preset==='high'?{quality:'high' as const,terrain:true,basemap:'satellite' as const,structures:true,batterySaver:false,autoQuality:true,shadows:true,waterMotion:true,cityBuildings:true,declutter:true}:{quality:'balanced' as const,batterySaver:false,autoQuality:true,shadows:false,waterMotion:true,cityBuildings:true,declutter:true};
}
