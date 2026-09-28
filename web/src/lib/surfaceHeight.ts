/** Coarse globe tiles can return deep chord-intersection artifacts while loading.
 * Use the ellipsoid until a physically plausible surface sample is available. */
export function surfaceHeight(sample:number|undefined){return sample!==undefined&&Number.isFinite(sample)&&sample>=-500&&sample<=9000?sample:0;}
