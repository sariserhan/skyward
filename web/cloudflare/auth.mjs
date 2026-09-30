import {ACCOUNT_LINK_TTL_SECONDS} from '../server/email-template.mjs';
import {betterAuth} from 'better-auth';
import {randomUUID} from 'node:crypto';
import {resendSender,accountEmail} from '../server/resend.mjs';
export function d1AuthOptions(env,{sendEmail,waitUntil}={}){
 const origin=env.SKYWARD_PUBLIC_ORIGIN,site=new URL(origin);
 if(site.origin!==origin||site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname))throw Error('Use a canonical HTTPS account origin');
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)throw Error('Set a strong BETTER_AUTH_SECRET');
 const deliver=sendEmail??resendSender(env),send=({user,url},subject)=>{
  const task=Promise.resolve().then(()=>deliver(accountEmail(user,url,subject,origin))).catch(()=>{console.error('Account email delivery failed.');});
  if(waitUntil){waitUntil(task);return;}return task;
 };
 return {appName:'Skyward',baseURL:origin,basePath:'/api/auth',secret:env.BETTER_AUTH_SECRET,database:env.DB,trustedOrigins:[origin],
  advanced:{cookiePrefix:'skyward-auth',useSecureCookies:site.protocol==='https:',ipAddress:{ipAddressHeaders:['cf-connecting-ip']},database:{generateId:()=>randomUUID()}},
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,requireEmailVerification:true,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:ACCOUNT_LINK_TTL_SECONDS,sendResetPassword:data=>send(data,'Reset your Skyward password')},
  emailVerification:{expiresIn:ACCOUNT_LINK_TTL_SECONDS,sendOnSignUp:true,sendOnSignIn:true,autoSignInAfterVerification:false,sendVerificationEmail:data=>send(data,'Verify your Skyward email')},
  databaseHooks:{session:{create:{after:async session=>{await env.DB.prepare('DELETE FROM session WHERE userId=? AND id NOT IN (SELECT id FROM session WHERE userId=? ORDER BY (id=?) DESC,createdAt DESC,id DESC LIMIT 5)').bind(session.userId,session.userId,session.id).run();}}}},
  session:{expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},rateLimit:{enabled:true,storage:'database',window:60,max:30},
  logger:{level:'error',log:()=>console.error('Authentication request failed.')}};
}
export const createD1Auth=(env,options)=>betterAuth(d1AuthOptions(env,options));
