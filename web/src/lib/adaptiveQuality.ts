export type Quality='low'|'balanced'|'high';
export function suggestedQuality(quality:Quality,frameTimes:number[]):Quality|null{const valid=frameTimes.filter(n=>n>0&&n<250);if(valid.length<60||quality==='low')return null;const slow=valid.filter(n=>n>45).length/valid.length;return slow>=.75?(quality==='high'?'balanced':'low'):null;}
export function lowerQuality(a:Quality,b:Quality|null){const ranks={low:0,balanced:1,high:2};return b&&ranks[b]<ranks[a]?b:a;}
