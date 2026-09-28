import type {Journey} from './membership';
const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function flightCardSVG(j:Journey&{from?:string;to?:string},status='Saved journey · status not verified'){
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560"><rect width="1000" height="560" rx="28" fill="#102330"/><g font-family="Arial,sans-serif" fill="#e8f4f2"><text x="64" y="80" font-size="22" fill="#9bd8c6">SKYWARD · FLIGHT CARD</text><text x="64" y="175" font-size="56">${escape(j.callsign)}</text><text x="64" y="255" font-size="42">${escape(j.from||'Origin unknown')} → ${escape(j.to||'Destination unknown')}</text><text x="64" y="330" font-size="28">${escape(j.date)} · departure date (UTC)</text><text x="64" y="395" font-size="22">${escape(status)}</text><text x="64" y="490" font-size="18" fill="#adc2ce">Shared snapshot · not a live tracker or boarding pass</text></g></svg>`;
}
export function downloadText(name:string,text:string,type='application/json'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
