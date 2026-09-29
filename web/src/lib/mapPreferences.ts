import { useEffect, useState } from 'react';
export interface MapPreferences { waterMotion:boolean; cityBuildings:boolean; batterySaver:boolean; resumeView:boolean; offlineMaps:boolean; autoQuality:boolean; lighting:'natural'; shadows:boolean; quality:'low'|'balanced'|'high'; declutter:boolean; basemap: 'satellite' | 'atlas'; structures: boolean; labels: boolean; grid: boolean; terrain: boolean; reducedMotion:boolean; largeLabels:boolean; highContrast:boolean; }
const compactDevice=matchMedia('(max-width: 759px) and (pointer: coarse)').matches;
const defaults: MapPreferences = { waterMotion:true,cityBuildings:true,batterySaver:false,resumeView:false, offlineMaps:true,autoQuality:true,lighting:'natural',shadows:!compactDevice,quality:compactDevice?'low':'balanced',declutter:true,basemap: 'satellite', structures: !compactDevice, labels: true, grid: false, terrain:true, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,largeLabels:false,highContrast:false };
export function useMapPreferences() {
  const [preferences, setPreferences] = useState<MapPreferences>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('skyward.map.v1') || 'null');
      if (!value || typeof value !== 'object') return defaults;
      return { waterMotion:value.waterMotion!==false,cityBuildings:value.cityBuildings!==false,batterySaver:value.batterySaver===true,resumeView:value.resumeView===true,offlineMaps:value.offlineMaps!==false,autoQuality:value.autoQuality!==false,lighting:'natural',shadows:value.shadows!==false,quality:value.quality==='low'||value.quality==='high'?value.quality:'balanced',declutter:value.declutter!==false,basemap: value.basemap === 'atlas' ? 'atlas' : 'satellite',
        structures: typeof value.structures === 'boolean' ? value.structures : true,
        labels: typeof value.labels === 'boolean' ? value.labels : true,
        reducedMotion:typeof value.reducedMotion==='boolean'?value.reducedMotion:defaults.reducedMotion,largeLabels:value.largeLabels===true,highContrast:value.highContrast===true,
        terrain: value.terrain !== false, grid: value.grid === true };
    } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem('skyward.map.v1', JSON.stringify(preferences)); } catch { /* Optional device preferences. */ } }, [preferences]);
  return [preferences, setPreferences] as const;
}
