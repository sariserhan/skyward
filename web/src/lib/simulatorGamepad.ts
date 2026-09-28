import type {FlightInput} from './flightSimulator.ts';
export interface ControllerSettings {enabled:boolean;pitch:number;roll:number;rudder:number;throttle:number;invertPitch:boolean;deadZone:number;sensitivity:number;brakes:number;gear:number;}
export const DEFAULT_CONTROLLER:ControllerSettings={enabled:false,pitch:1,roll:0,rudder:2,throttle:-1,invertPitch:false,deadZone:.12,sensitivity:1,brakes:0,gear:1};
export function controllerAxis(value:number,deadZone:number,sensitivity:number){if(!Number.isFinite(value)||Math.abs(value)<=deadZone)return 0;return Math.sign(value)*Math.min(1,(Math.abs(value)-deadZone)/(1-deadZone)*sensitivity);}
export function readController(pad:Pick<Gamepad,'axes'|'buttons'>,settings:ControllerSettings,previous:Set<number>){
 const axis=(n:number)=>controllerAxis(pad.axes[n]??0,settings.deadZone,settings.sensitivity);
 const input:FlightInput={pitch:axis(settings.pitch)*(settings.invertPitch?-1:1),roll:axis(settings.roll),rudder:axis(settings.rudder)};
 const pressed=new Set(pad.buttons.flatMap((b,i)=>b.pressed?[i]:[]));
 return {input,throttle:settings.throttle>=0?Math.max(0,Math.min(1,(1-(pad.axes[settings.throttle]??1))/2)):undefined,brakes:pressed.has(settings.brakes)&&!previous.has(settings.brakes),gear:pressed.has(settings.gear)&&!previous.has(settings.gear),pressed};
}
export function loadController():ControllerSettings {try{const v=JSON.parse(localStorage.getItem('skyward.controller.v1')??'null');if(!v)return {...DEFAULT_CONTROLLER};const next={...DEFAULT_CONTROLLER};for(const k of ['pitch','roll','rudder','throttle','brakes','gear'] as const)if(Number.isInteger(v[k])&&v[k]>=-1&&v[k]<=31)next[k]=v[k];if(typeof v.invertPitch==='boolean')next.invertPitch=v.invertPitch;if(Number.isFinite(v.deadZone))next.deadZone=Math.max(0,Math.min(.4,v.deadZone));if(Number.isFinite(v.sensitivity))next.sensitivity=Math.max(.2,Math.min(2,v.sensitivity));return next;}catch{return {...DEFAULT_CONTROLLER};}}
