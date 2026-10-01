import type {DirectoryCategory} from './notableDirectory';
export const discoveryCategories: {slug:string;title:string;category:DirectoryCategory;description:string}[]=[
 {slug:'sports',title:'Sports-team aircraft',category:'Sports',description:'Explore aircraft with sourced team ownership, charter or special-livery associations. Team branding does not establish who is onboard.'},
 {slug:'companies',title:'Company and aviation aircraft',category:'Business & aviation',description:'Discover aircraft publicly associated with companies and aviation organizations, with registration details and reference sources.'},
 {slug:'special',title:'Special aircraft and liveries',category:'Special Aircraft',description:'Discover distinctive aircraft, research missions and special paint schemes. Available 3D paint may differ from the real aircraft.'},
 {slug:'historic',title:'Historic aircraft',category:'Historic',description:'Explore aviation history through sourced aircraft records. Retired aircraft are reference records, not live flights.'},
 {slug:'public-service',title:'Public-service aircraft',category:'Public service',description:'Explore research, humanitarian and organizational aircraft and the documented work behind them.'},
];
export const discoveryCategory=(path:string)=>discoveryCategories.find(c=>path.replace(/\/+$/,'')===`/collections/${c.slug}`);
