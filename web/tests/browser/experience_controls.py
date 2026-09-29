"""Deterministic window, music, voice, and discoverable globe-control checks."""
import io, wave
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.add_init_script('''window.__spoken=[];window.__busy=false;const voices=[{name:'Local One',voiceURI:'one',lang:'en-US',localService:true,default:true},{name:'Local Two',voiceURI:'two',lang:'en-GB',localService:true,default:false}];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};Object.defineProperty(window,'speechSynthesis',{value:{get speaking(){return __busy},pending:false,resume(){},getVoices:()=>voices,addEventListener(){},removeEventListener(){},speak(u){__spoken.push({text:u.text,voice:u.voice.voiceURI});__busy=true;u.onstart?.();window.__speechTimer=setTimeout(()=>{__busy=false;u.onend?.()},300)},cancel(){clearTimeout(window.__speechTimer);__busy=false}}});''')
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/aurowall',lambda r:r.fulfill(json={'tracks':[{'id':'rain','title':'Rain','url':'https://audio.example.test/rain.wav'},{'id':'ocean','title':'Ocean','url':'https://audio.example.test/ocean.wav'},{'id':'prayer/a.mp3','title':'Excluded','url':'https://audio.example.test/no.wav'}]}))
 audio=io.BytesIO()
 with wave.open(audio,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*8000*4)
 page.route('https://audio.example.test/**',lambda r:r.fulfill(body=audio.getvalue(),content_type='audio/wav'))
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 spin=page.get_by_role('button',name='Spin globe',exact=True);spin.wait_for(timeout=30000)
 assert spin.is_visible();assert spin.bounding_box()['y']==page.get_by_role('button',name='Reset view',exact=True).bounding_box()['y']
 music=page.get_by_role('button',name='Music',exact=True);music.click();dialog=page.get_by_role('dialog',name='Music and sounds')
 select=dialog.get_by_role('combobox',name='Aurowall music or sound');assert 'Excluded' not in select.inner_text();select.select_option('rain')
 dialog.get_by_role('button',name='Favorite selected track').click();dialog.get_by_label('Favorites only',exact=True).check();assert 'Ocean' not in select.inner_text()
 dialog.get_by_role('slider',name='Aurowall music volume').fill('0.65');dialog.get_by_role('button',name='Play music',exact=True).click();page.wait_for_function("document.querySelector('audio').paused===false")
 dialog.get_by_role('button',name='Close music').click();page.get_by_role('button',name='Pause music playback',exact=True).click();assert page.evaluate("document.querySelector('audio').paused")
 page.reload(wait_until='domcontentloaded');music.click();dialog=page.get_by_role('dialog',name='Music and sounds');select=dialog.get_by_role('combobox',name='Aurowall music or sound');select.wait_for()
 assert select.input_value()=='rain';assert dialog.get_by_role('slider',name='Aurowall music volume').input_value()=='0.65';assert dialog.get_by_role('button',name='Favorite selected track').get_attribute('aria-pressed')=='true';assert page.evaluate("document.querySelector('audio').paused")
 dialog.get_by_role('button',name='Close music').click()
 page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click()
 panel=page.get_by_role('region',name='Passenger flight view');assert panel.get_by_role('region',name='Camera views',exact=True).is_visible()
 voices=panel.locator('.flight-voices');voices.locator(':scope>summary').click();voices.get_by_role('combobox',name='Announcement voice').select_option('two');voices.get_by_role('button',name='Test voice',exact=True).click()
 page.wait_for_function("__spoken.some(x=>x.text.includes('announcements are ready')&&x.voice==='two')")
 assert page.evaluate("localStorage.getItem('skyward.voice.v1')")=='two'
 panel.get_by_role('button',name='Passenger window',exact=True).click();window=page.get_by_role('region',name='Passenger window view');window.wait_for();page.wait_for_timeout(1600)
 heading=page.evaluate('__viewer.camera.heading');window.get_by_role('slider',name='Window look around').fill('30');page.wait_for_timeout(1200);assert abs(page.evaluate('__viewer.camera.heading')-heading)>.3
 window.get_by_role('combobox',name='Window seat position').select_option('0.2');page.wait_for_timeout(800);window.get_by_role('combobox',name='Window seat position').select_option('-0.28');window.get_by_role('button',name='Center look',exact=True).click();assert window.get_by_role('slider',name='Window look around').input_value()=='0'
 window.get_by_role('button',name='Left window',exact=True).click();window.get_by_role('slider',name='Window shade').fill('35')
 page.screenshot(path=str(f.ARTIFACTS/'experience-desktop.jpg'),type='jpeg')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 for label in ['Left window','Center look','Exit window view']:
  box=window.get_by_role('button',name=label,exact=True).bounding_box();assert box['x']>=0 and box['x']+box['width']<=390 and box['y']+box['height']<=844,box
 page.screenshot(path=str(f.ARTIFACTS/'experience-mobile.jpg'),type='jpeg')
 window.get_by_role('button',name='Exit window view',exact=True).click();panel.get_by_role('button',name='Restore flight panel',exact=True).click();panel.get_by_role('button',name='Close flight view',exact=True).click()
 spin.click();page.wait_for_timeout(1500);first=page.evaluate('[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y]');page.wait_for_timeout(700);second=page.evaluate('[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y]');assert first!=second
 page.locator('.cesium-widget canvas').click(position={'x':195,'y':250});page.wait_for_timeout(400);first=page.evaluate('[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y]');page.wait_for_timeout(400);assert first==page.evaluate('[__viewer.camera.positionWC.x,__viewer.camera.positionWC.y]')
 assert not errors,errors;assert not page.locator('.cesium-widget-errorPanel').count()
 print('PASS discoverable spin/stop; music playback, favorites and persistence; selected test voice; smooth window controls; desktop/mobile layout',flush=True)
if __name__=='__main__':f.serve(run)
