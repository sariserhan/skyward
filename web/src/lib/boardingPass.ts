/** Read only the mandatory BCBP fields; never return PNR, ticket or full name. */
export type BoardingPassDraft={displayName:string;flight:string;from:string;to:string;seat:string;dayOfYear:number;date:string;callsign:string;journeyKey:string};
export function boardingDate(day:number,year:number){
 if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(day)||day<1||day>366)throw Error('Choose a valid flight year and day.');
 const date=new Date(Date.UTC(year,0,day));if(date.getUTCFullYear()!==year)throw Error('Day 366 requires a leap year. Confirm the flight date.');return date.toISOString().slice(0,10);
}
function initials(name:string){const parts=name.trim().split(/[\s/]+/).filter(Boolean);return parts.slice(0,3).map(p=>p[0].toUpperCase()+'.').join('')||'Traveller';}
export function parseBoardingPass(raw:string,year:number):BoardingPassDraft[]{
 const value=raw.replace(/^\][A-Za-z]\d/,'').replace(/[\r\n]+$/,'');
 if(value.length<60||value.length>4096||value[0]!=='M'||!/[1-4]/.test(value[1])||/[^\x20-\x7e]/.test(value))throw Error('No supported boarding-pass barcode found. Use a clearer image or enter the trip manually.');
 const count=Number(value[1]),displayName=initials(value.slice(2,22)),legs:BoardingPassDraft[]=[];let offset=23;
 for(let i=0;i<count;i++){
  const v=value.slice(offset,offset+37);if(v.length!==37||!/^\d{3}$/.test(v.slice(21,24))||! /^[0-9A-F]{2}$/i.test(v.slice(35,37)))throw Error('The boarding-pass barcode is incomplete. Try another image or enter it manually.');
  const from=v.slice(7,10),to=v.slice(10,13),carrier=v.slice(13,16).trim(),number=v.slice(16,21).trim(),dayOfYear=Number(v.slice(21,24)),seat=v.slice(25,29).trim().replace(/^0+(?=\d)/,'');
  if(!/^[A-Z]{3}$/.test(from)||! /^[A-Z]{3}$/.test(to)||! /^[A-Z0-9]{2,3}$/.test(carrier)||! /^\d{1,5}[A-Z]?$/.test(number)||! /^[A-Z0-9]{0,4}$/.test(seat))throw Error('Some boarding-pass fields are unsupported. Enter the flight manually.');
  const length=parseInt(v.slice(35,37),16);offset+=37+length;if(offset>value.length)throw Error('The boarding-pass barcode is truncated.');
  legs.push({displayName,flight:carrier+number.replace(/^0+(?=\d)/,''),from,to,seat,dayOfYear,date:boardingDate(dayOfYear,year),callsign:'',journeyKey:''});
 }
 return legs;
}
