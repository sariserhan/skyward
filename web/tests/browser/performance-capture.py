"""Opt-in local capture, cancellation and audio mixer persistence."""
import json
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='Close airport details',exact=True).click(timeout=30000)
 page.locator('.unified-map-tools>summary').click()
 page.get_by_role('button',name='Performance',exact=True).click()
 dialog=page.get_by_role('dialog',name='Performance monitor')
 dialog.get_by_text('Sound mix',exact=True).click()
 slider=dialog.get_by_role('slider',name='weather sound level');slider.fill('0.25')
 assert page.evaluate("JSON.parse(localStorage.getItem('skyward.audio-mix.v1')).weather")==.25
 dialog.get_by_role('button',name='Record performance',exact=True).click()
 dialog.get_by_role('button',name='Cancel recording',exact=True).click()
 dialog.get_by_role('button',name='Record performance',exact=True).click()
 dialog.get_by_role('button',name='Close performance',exact=True).click()
 page.evaluate('__viewer.camera.rotateRight(.02);__viewer.scene.requestRender()')
 page.wait_for_timeout(1000)
 page.get_by_role('button',name='Performance',exact=True).click()
 dialog.get_by_role('button',name='Download performance recording',exact=True).wait_for(timeout=65000)
 with page.expect_download() as info:dialog.get_by_role('button',name='Download performance recording',exact=True).click()
 report=json.load(open(info.value.path()));assert report['visibleSeconds']>=30
 assert report['browserFrames']['samples']>10 and report['renderSubmission']['samples']>0
 assert 'tokens' not in report and 'feed' not in report
 info.value.save_as(str(f.ARTIFACTS/'performance-capture.json'))
 page.screenshot(path=str(f.ARTIFACTS/'performance-monitor.jpg'),type='jpeg',quality=70)
 dialog.get_by_role('button',name='Close performance',exact=True).click()
 assert not errors,errors
 print('PASS local 30-second capture, cancellation, download and persisted sound mix',flush=True)
if __name__=='__main__':f.serve(run)
