export const SITE_ORIGIN='https://skyvvard.com';
export const SITE_NAME='Skyward';
export const CONTACT_EMAIL='contact@skyvvard.com';
export const SITE_DESCRIPTION='Explore aircraft on a 3D globe, follow flights, discover airports and experience aviation with Skyward.';
export function siteSchema(origin=SITE_ORIGIN){return {'@context':'https://schema.org','@graph':[{'@type':'WebSite','@id':origin+'/#website',name:SITE_NAME,url:origin+'/',description:SITE_DESCRIPTION},{'@type':'Organization','@id':origin+'/#organization',name:SITE_NAME,url:origin+'/',email:CONTACT_EMAIL}]};}
