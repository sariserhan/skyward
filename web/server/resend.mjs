import {createHash} from 'node:crypto';
import {CONTACT_EMAIL,SUPPORT_EMAIL} from './site.mjs';
export {accountEmail} from './email-template.mjs';
export function resendSender(env=process.env,fetchImpl=fetch){
 const from=env.RESEND_FROM||`Skyward <${CONTACT_EMAIL}>`,reply=env.RESEND_REPLY_TO||SUPPORT_EMAIL;
 if(!env.RESEND_API_KEY||/[\r\n]/.test(from+reply))throw Error('Configure RESEND_API_KEY and a verified RESEND_FROM.');
 return async message=>{
  const body={from,to:[message.to],reply_to:reply,subject:message.subject,text:message.text,html:message.html};
  const id=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Account email delivery failed');
  return {ok:true};
 };
}
