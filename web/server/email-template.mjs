import {SUPPORT_EMAIL,SITE_ORIGIN} from './site.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ACCOUNT_LINK_TTL_SECONDS=3600;
/** One fluid, table-based shell for all Skyward transactional email.
 * Inline styling works without media queries; no fixed content height or webfonts.
 * PNG branding is intentional: many email clients cannot display SVG logos.
 */
export function brandedEmail({subject,preview,heading,paragraphs,actionLabel,actionUrl,notice}){
 const safeUrl=new URL(actionUrl);if(!['https:','http:'].includes(safeUrl.protocol)||safeUrl.username||safeUrl.password)throw Error('Invalid email action URL');
 const link=safeUrl.href;
 return {subject,text:[heading,...paragraphs,`${actionLabel}: ${link}`,notice,`Need help? Reply to this email or contact ${SUPPORT_EMAIL}.`,'Skyward · SSARI Inc. · skyvvard.com',`${SITE_ORIGIN}/privacy/`,`${SITE_ORIGIN}/terms/`].join('\n\n'),html:`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(subject)}</title>
<style>html,body{margin:0!important;padding:0!important;width:100%!important}table{border-collapse:collapse}a{overflow-wrap:anywhere;word-break:break-word}@media(max-width:480px){.outer{padding:12px 8px!important}.content{padding:26px 20px!important}.headline{font-size:26px!important}}@media(prefers-color-scheme:dark){.email-body,.outer{background:#071620!important}.card,.content{background:#102937!important;color:#eaf3f5!important}.muted{color:#a8c0ca!important}}</style></head>
<body class="email-body" style="margin:0;padding:0;background-color:#071620;color:#eaf3f5;font-family:Arial,Helvetica,sans-serif;line-height:1.6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#071620"><tr><td class="outer" align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;table-layout:fixed;background-color:#102937;border:1px solid #345462;border-radius:18px">
<tr><td style="padding:28px 28px 20px;border-bottom:1px solid #345462"><a href="${SITE_ORIGIN}/" style="color:#eaf3f5;text-decoration:none"><img src="${SITE_ORIGIN}/watch/icon-192.png" width="52" height="52" alt="Skyward orbit" style="display:inline-block;width:52px;height:52px;vertical-align:middle;border:0;margin-right:12px"><span style="font-size:21px;letter-spacing:3px;font-weight:bold;vertical-align:middle">SKYWARD</span></a></td></tr>
<tr><td class="content" style="padding:32px;color:#eaf3f5;overflow-wrap:anywhere;word-break:break-word">
<p style="margin:0 0 12px;color:#92c6bd;font-size:12px;letter-spacing:2px;font-weight:bold">YOUR SKYWARD ACCOUNT</p>
<h1 class="headline" style="margin:0 0 20px;font-size:30px;line-height:1.25;font-weight:600;color:#eaf3f5">${escape(heading)}</h1>
${paragraphs.map(p=>`<p style="margin:0 0 18px;font-size:16px">${escape(p)}</p>`).join('')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;width:100%"><tr><td align="center" bgcolor="#92c6bd" style="background-color:#92c6bd;border-radius:8px"><a href="${escape(link)}" style="display:block;padding:14px 18px;border:1px solid #92c6bd;border-radius:8px;font-size:16px;font-weight:bold;color:#071620;text-decoration:none;text-align:center">${escape(actionLabel)}</a></td></tr></table>
<p class="muted" style="margin:0 0 20px;font-size:14px;color:#a8c0ca">${escape(notice)}</p>
<p class="muted" style="margin:0 0 8px;font-size:12px;color:#a8c0ca">Button not working? Copy and paste this link into your browser:</p><p style="margin:0;font-size:12px;word-break:break-all;overflow-wrap:anywhere"><a href="${escape(link)}" style="color:#92c6bd;word-break:break-all;overflow-wrap:anywhere">${escape(link)}</a></p>
</td></tr><tr><td class="muted" style="padding:22px 28px;border-top:1px solid #345462;font-size:13px;color:#a8c0ca">Need help? Reply to this email or contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#92c6bd">${SUPPORT_EMAIL}</a>.</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 8px;font-size:12px;color:#a8c0ca">Skyward · SSARI Inc. · <a href="${SITE_ORIGIN}/" style="color:#a8c0ca">skyvvard.com</a></p><p style="margin:0;font-size:12px;color:#a8c0ca"><a href="${SITE_ORIGIN}/privacy/" style="color:#a8c0ca">Privacy</a> &nbsp;·&nbsp; <a href="${SITE_ORIGIN}/terms/" style="color:#a8c0ca">Terms</a></p>
</td></tr></table></body></html>`};
}
export function accountEmail(user,url,subject,origin){
 const link=new URL(url);if(link.origin!==origin||!['http:','https:'].includes(link.protocol)||link.username||link.password)throw Error('Invalid account email link');
 const reset=subject==='Reset your Skyward password';
 if(!reset&&subject!=='Verify your Skyward email')throw Error('Unknown account email');
 const content=reset?{preview:'Securely reset your Skyward password. This link expires in one hour.',heading:'Let’s get you back to the sky.',paragraphs:['We received a request to reset your Skyward password. Choose a new password using the secure link below.'],actionLabel:'Reset password',notice:'This link expires in 1 hour and can be used once. If you did not request a password reset, ignore this email; your password will stay unchanged.'}:{preview:'Verify your email to finish creating your Skyward account.',heading:'Your sky is waiting.',paragraphs:['Confirm your email address to finish setting up your Skyward account. After verification, sign in to start saving your journeys.'],actionLabel:'Verify email address',notice:'This link expires in 1 hour. If you did not request a Skyward account or verification email, you can ignore this message.'};
 return {to:user.email,...brandedEmail({subject,actionUrl:link.href,...content})};
}
