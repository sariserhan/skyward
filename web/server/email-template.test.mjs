import test from 'node:test';
import assert from 'node:assert/strict';
import {accountEmail,brandedEmail,ACCOUNT_LINK_TTL_SECONDS} from './email-template.mjs';
import {d1AuthOptions} from '../cloudflare/auth.mjs';
const origin='https://skyvvard.com';
test('verification and reset share branded responsive HTML and plain text with safe links',()=>{
 for(const subject of ['Verify your Skyward email','Reset your Skyward password']){
  const link=origin+'/api/auth/verify-email?token='+ 'a'.repeat(800)+'&callbackURL=%2Faccount%2F';
  const m=accountEmail({email:'test@example.invalid'},link,subject,origin);
  assert.match(m.html,/max-width:600px/);assert.match(m.html,/table-layout:fixed/);assert.match(m.html,/icon-192.png/);assert.match(m.html,/alt="Skyward orbit"/);assert.match(m.html,/&amp;callbackURL/);assert.ok(m.text.includes(link));assert.match(m.text,/1 hour/);assert.match(m.html,/mailto:support@skyvvard.com/);assert.doesNotMatch(m.html,/<script|<iframe|<svg|height:600px/);
 }
 const escaped=brandedEmail({subject:'<unsafe>',preview:'<img>',heading:'<script>',paragraphs:['<b>text</b>'],actionLabel:'Go',actionUrl:origin,notice:'<iframe>'});assert.doesNotMatch(escaped.html,/<script>|<iframe>/);assert.match(escaped.html,/&lt;script&gt;/);
 for(const url of ['https://evil.invalid/x','javascript:alert(1)','https://user:password@skyvvard.com/x'])assert.throws(()=>accountEmail({email:'x'},url,'Verify your Skyward email',origin));
});
test('D1 mail links and auth share one-hour expiration with serverless delivery lifetime',async()=>{
 const tasks=[],messages=[];const options=d1AuthOptions({SKYWARD_PUBLIC_ORIGIN:origin,BETTER_AUTH_SECRET:'a'.repeat(40)},{waitUntil:p=>tasks.push(p),sendEmail:async m=>messages.push(m)});
 assert.equal(options.emailVerification.expiresIn,ACCOUNT_LINK_TTL_SECONDS);assert.equal(options.emailAndPassword.resetPasswordTokenExpiresIn,ACCOUNT_LINK_TTL_SECONDS);assert.equal(options.emailAndPassword.requireEmailVerification,true);
 options.emailVerification.sendVerificationEmail({user:{email:'example@example.invalid'},url:origin+'/api/auth/verify-email?token=test'});await Promise.all(tasks);assert.equal(messages.length,1);assert.match(messages[0].html,/Verify email address/);
});
