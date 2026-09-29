import { Layers, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MapPreferences } from '../lib/mapPreferences';
interface Props { value: MapPreferences; change: (value: MapPreferences) => void; }
export function MapLayers({value, change}: Props) {
  const [open,setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if(e.key === 'Escape'){setOpen(false); trigger.current?.focus();} };
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    return () => {document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="map-layers" ref={root}>
    <div className="map-tool-row"><button aria-describedby="map-layers-help" ref={trigger} className="quiet-button layers-trigger" aria-expanded={open} aria-controls="map-layers-panel" onClick={()=>setOpen(!open)}><Layers size={16}/>Layers</button><small id="map-layers-help">Choose map imagery, labels and graphics.</small></div>
    {open && <section id="map-layers-panel" className="layers-panel" aria-label="Map layers"><div className="layers-heading"><h2>Map layers</h2><button className="icon-button" aria-label="Close map layers" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></div>
      <fieldset><legend>Base map</legend>{(['satellite','atlas'] as const).map(b=><label key={b}><input type="radio" name="basemap" checked={value.basemap===b} onChange={()=>change({...value,basemap:b})}/><span>{b==='satellite'?'Satellite':'Atlas'}<small>{b==='satellite'?'Photographic imagery':'Borders, coastlines, rivers & cities'}</small></span></label>)}</fieldset>
      <fieldset><legend>Overlays</legend>{([['structures','Airport structures'],['cityBuildings','3D city buildings'],['waterMotion','Water waves · 3D'],['labels','Cities, gates & labels'],['grid','Reference grid'],['terrain','Open terrain · 3D']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={value[key]} onChange={e=>change({...value,[key]:e.target.checked})}/>{label}</label>)}</fieldset>
      <fieldset><legend>Graphics</legend><label>Quality<select aria-label="Graphics quality" value={value.quality} onChange={e=>change({...value,quality:e.target.value as MapPreferences['quality']})}><option value="low">Low · battery saver</option><option value="balanced">Balanced</option><option value="high">High detail</option></select></label><p>Day and night follow the sun. Night geography stays visible, with city-light imagery and illustrative aircraft lights. Reduced motion disables flashing.</p><label><input type="checkbox" checked={value.shadows} onChange={e=>change({...value,shadows:e.target.checked})}/>Aircraft shadows · High detail</label><label><input type="checkbox" checked={value.declutter} onChange={e=>change({...value,declutter:e.target.checked})}/>Declutter aircraft labels</label><small>Low limits nearby 3D models while retaining airplane icons and smooth ground movement. Detailed models load only near the camera. Nearby model counts are limited to protect memory. Selected aircraft stays visible.</small></fieldset>
      <p>Open terrain uses approximate elevation, without a key or account. Imagery is historical, not live video. City buildings appear when zoomed in, where mapped; heights may be approximate. Preferences stay on this device.</p>
    </section>}
  </div>;
}
