import {ACCOUNT_LINK_TTL_SECONDS} from './email-template.mjs';
import {SUPPORT_EMAIL} from './site.mjs';
import {resendSender,accountEmail} from './resend.mjs';
import {Pool} from 'pg';
import {betterAuth} from 'better-auth';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
export function neonConfig(env=process.env){
 const origin=env.SKYWARD_PUBLIC_ORIGIN,secret=env.BETTER_AUTH_SECRET;
 let site,database;try{site=new URL(origin);database=new URL(env.DATABASE_URL);}catch{throw Error('Set SKYWARD_PUBLIC_ORIGIN and DATABASE_URL for Neon accounts.');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(site.hostname),localDB=['localhost','127.0.0.1','[::1]'].includes(database.hostname);
 if(site.origin!==origin||!['https:','http:'].includes(site.protocol)||(!loopback&&site.protocol!=='https:')||(env.NODE_ENV==='production'&&site.protocol!=='https:'))throw Error('Use a canonical HTTPS public origin (HTTP is local-development only).');
 if(!['postgres:','postgresql:'].includes(database.protocol))throw Error('DATABASE_URL must be a Postgres connection string.');
 if(typeof secret!=='string'||secret.length<32)throw Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
 if(env.SKYWARD_LOCAL_PREMIUM==='1')throw Error('Local SQLite Premium grants are not supported in Neon mode.');
 if(env.NODE_ENV==='production'&&localDB)throw Error('Production Neon mode requires a remote TLS database.');
 // Set TLS explicitly: URL sslmode options otherwise override pg's ssl object.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])database.searchParams.delete(key);
 const max=Number(env.SKYWARD_DB_POOL_SIZE||5);if(!Number.isInteger(max)||max<1||max>20)throw Error('Database pool size must be 1–20.');
 return {origin,secret,connectionString:database.href,ssl:localDB?false:{rejectUnauthorized:true},max};
}
export function createNeonPool(env=process.env){
 const config=neonConfig(env);
 const pool=new Pool({connectionString:config.connectionString,ssl:config.ssl,max:config.max,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:20000});
 pool.on('error',()=>console.error('Neon database connection failed.')); // Never log connection strings.
 return pool;
}
function smtpSender(env){
 if(!env.SMTP_HOST||!env.SMTP_FROM)throw Error('Configure SMTP_HOST and SMTP_FROM for verification and password recovery.');
 const port=Number(env.SMTP_PORT||587);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid SMTP_PORT.');
 const transport=nodemailer.createTransport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined,tls:{rejectUnauthorized:true},connectionTimeout:10000,socketTimeout:20000});
 return message=>transport.sendMail({...message,from:env.SMTP_FROM,replyTo:env.RESEND_REPLY_TO||SUPPORT_EMAIL});
}
export function createNeonAuth(pool,{env=process.env,sendEmail}={}){
 const config=neonConfig(env),deliver=sendEmail??(env.SKYWARD_EMAIL_PROVIDER==='resend'||env.RESEND_API_KEY?resendSender(env):smtpSender(env));
 // The Node server stays alive for delivery; keep account-enumeration timing out
 // of HTTP responses. Never log mail addresses, URLs or verification tokens.
 const send=(user,url,subject)=>{void Promise.resolve().then(()=>deliver(accountEmail(user,url,subject,config.origin))).catch(()=>console.error('Account email delivery failed.'));};
 return betterAuth({
  appName:'Skyward',baseURL:config.origin,basePath:'/api/auth',secret:config.secret,database:pool,
  trustedOrigins:[config.origin],
  advanced:{ipAddress:{ipAddressHeaders:['x-skyward-client-ip']},cookiePrefix:'skyward-auth',useSecureCookies:config.origin.startsWith('https:'),database:{generateId:()=>randomUUID()}},
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,requireEmailVerification:true,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:ACCOUNT_LINK_TTL_SECONDS,sendResetPassword:({user,url})=>send(user,url,'Reset your Skyward password')},
  emailVerification:{expiresIn:ACCOUNT_LINK_TTL_SECONDS,sendOnSignUp:true,sendOnSignIn:true,autoSignInAfterVerification:false,sendVerificationEmail:({user,url})=>send(user,url,'Verify your Skyward email')},
  session:{expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:60},
  logger:{level:'error',log:level=>{if(level==='error')console.error('Authentication request failed.');}}
 });
}
