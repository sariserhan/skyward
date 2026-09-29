"""Recovery UI under lost connections and expired reset links; no email is sent."""
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));attempt=[0]
 def account(r):
  attempt[0]+=1
  if attempt[0]==1:r.abort('failed');return
  r.fulfill(json={'enabled':True,'authProvider':'better-auth','billingReady':False,'mode':'neon','user':None})
 page.route('**/api/account',account)
 page.route('**/api/auth/request-password-reset',lambda r:r.fulfill(json={}))
 page.goto(f.URL+'/account/')
 page.get_by_role('button',name='Retry account connection').click(timeout=30000)
 page.get_by_role('button',name='Forgot password?',exact=True).click();page.get_by_label('Email',exact=True).fill('test@example.test');page.get_by_role('button',name='Send reset link',exact=True).click()
 expect(page.get_by_text('If an account exists for this email, a reset link will arrive shortly.',exact=True)).to_be_visible()
 page.route('**/api/auth/reset-password',lambda r:r.fulfill(status=400,json={'message':'Reset link expired. Request a new link.'}))
 page.goto(f.URL+'/account/?token=fixture-expired');page.get_by_label('New password',exact=True).fill('test-password-12345');page.get_by_role('button',name='Save new password',exact=True).click()
 expect(page.get_by_text('Reset link expired. Request a new link.',exact=True)).to_be_visible()
 assert 'token=' not in page.url
 page.get_by_role('button',name='Back to sign in',exact=True).click();expect(page.get_by_role('button',name='Sign in',exact=True)).to_be_enabled()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'account-recovery.jpg'),type='jpeg',quality=75)
 assert not errors,errors
 print('PASS failed account load retry, recovery request, expired token, token URL cleanup, mobile sign-in',flush=True)
if __name__=='__main__':f.serve(run)
