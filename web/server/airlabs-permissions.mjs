import policy from '../data/airlabs-permissions.json' with {type:'json'};
export const airlabsPermissions=policy;
export function airlabsUsageAllowed(record=policy){
 // Public details are cached and may be saved to a user's journey. All applicable
 // permissions need account-specific evidence; marketing and API keys are not grants.
 const required=['publicDisplay','commercialUse','caching','historicalRetention','derivedData','attribution'];
 return !!record&&typeof record.planName==='string'&&!!record.planName.trim()&&
 typeof record.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedAt)&&Number.isFinite(Date.parse(record.reviewedAt))&&
 Array.isArray(record.evidence)&&record.evidence.length>0&&record.evidence.every(e=>typeof e==='string'&&/^https:\/\//.test(e))&&
 required.every(k=>record.permissions?.[k]==='VERIFIED');
}
export function airlabsPositionUsageAllowed(record=policy){return airlabsUsageAllowed(record)&&record.permissions?.privateAircraftCoverage==='VERIFIED'&&record.permissions?.registrationIcaoLookup==='VERIFIED';}
