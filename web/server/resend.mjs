import {createHash} from 'node:crypto';
import {CONTACT_EMAIL} from './site.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountEmail(user,url,subject,origin){
 const link=new URL(url);if(link.origin!==origin||!['https:','http:'].includes(link.protocol))throw Error('Invalid account email link');
 return {to:user.email,subject,text:`${subject}\n\n${link.href}\n\nIf you did not request this, you can ignore this email.\nSkyward · ${CONTACT_EMAIL}`,html:`<div style="font:16px/1.6 system-ui;color:#132d3d;max-width:560px"><h1>Skyward</h1><h2>${escape(subject)}</h2><p><a href="${escape(link.href)}">${escape(subject)}</a></p><p>If you did not request this, you can ignore this email.</p><p>Need help? <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p></div>`};
}
export function resendSender(env=process.env,fetchImpl=fetch){
 const from=env.RESEND_FROM||`Skyward <${CONTACT_EMAIL}>`,reply=env.RESEND_REPLY_TO||CONTACT_EMAIL;
 if(!env.RESEND_API_KEY||/[\r\n]/.test(from+reply))throw Error('Configure RESEND_API_KEY and a verified RESEND_FROM.');
 return async message=>{
  const body={from,to:[message.to],reply_to:reply,subject:message.subject,text:message.text,html:message.html};
  const id=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Account email delivery failed');
  return {ok:true};
 };
}
