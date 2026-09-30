import {travelMetric} from './travelMetrics';
/** Aggregate diagnostics stay in memory; no URLs, messages or identifiers are collected.
 * Resource status 0 means no HTTP response (including blocked/aborted requests). */
const state={scriptErrors:0,cockpitErrors:0,renderErrors:0,feedRequests:0,feedFailures:0,durations:[] as number[]};
export function cockpitFailure(){state.cockpitErrors++;travelMetric('client_cockpit_error');}
export function renderFailure(){state.renderErrors++;travelMetric('client_render_error');}
export function sessionHealth(){const d=state.durations;return {scriptErrors:state.scriptErrors,cockpitErrors:state.cockpitErrors,renderErrors:state.renderErrors,feedRequests:state.feedRequests,feedFailures:state.feedFailures,meanFeedMs:d.length?Math.round(d.reduce((a,b)=>a+b,0)/d.length):null,slowestFeedMs:d.length?Math.round(Math.max(...d)):null,mapReadyMs:performance.getEntriesByName('skyward-map-ready')[0]?.startTime??null};}
export function installSessionHealth(){
 addEventListener('error',()=>{state.scriptErrors++;travelMetric('client_script_error');});addEventListener('unhandledrejection',()=>{state.scriptErrors++;travelMetric('client_script_error');});
 try{new PerformanceObserver(list=>{for(const entry of list.getEntries() as PerformanceResourceTiming[]){const url=new URL(entry.name);if(url.origin!==location.origin||!['/api/area','/api/aircraft','/api/search'].includes(url.pathname))continue;state.feedRequests++;if(entry.responseStatus===0||entry.responseStatus>=400){state.feedFailures++;travelMetric('client_feed_error');}state.durations.push(entry.duration);if(state.durations.length>100)state.durations.shift();}}).observe({type:'resource',buffered:true});}catch{}
}
