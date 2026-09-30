import type {NearbyFeature} from './placeLabels';
let features:NearbyFeature[]=[];
export function nearbyFeatures(){return features;}
export function publishNearbyFeatures(value:NearbyFeature[]){features=value.slice(0,600);window.dispatchEvent(new Event('skyward-nearby-features'));}
