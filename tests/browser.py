from playwright.sync_api import sync_playwright
import base64
from pathlib import Path
Path("work").mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
 page=browser.new_page()
 errors=[]
 page.on('pageerror', lambda e: errors.append(str(e)))
 for language in ['', 'ru/']:
  for slug in ['', 'jpg-to-png/', 'png-to-jpg/', 'about/', 'contact/', 'privacy/']:
   response=page.goto('http://127.0.0.1:8000/'+language+slug)
   assert response.status==200
   assert page.locator('h1').count()==1
   assert page.locator('html').get_attribute('lang')==('ru' if language else 'en')
   assert page.locator('title').inner_text()
 page.goto('http://127.0.0.1:8000/png-to-jpg/')
 png=page.evaluate('''() => {const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL('image/png').split(',')[1]}''')
 page.locator('#file').set_input_files({'name':'transparent.png','mimeType':'image/png','buffer':base64.b64decode(png)})
 page.locator('#convert').click()
 page.locator('#modalDownload').wait_for(state='visible')
 assert page.locator('#modalDownload').get_attribute('download')=='transparent.jpg'
 jpeg=page.evaluate("async () => {const b=await (await fetch(document.querySelector('#modalDownload').href)).blob();const i=await createImageBitmap(b);const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {mime:b.type,pixel:[...x.getImageData(0,0,1,1).data],url:await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})}}")
 assert jpeg['mime']=='image/jpeg' and jpeg['pixel']==[255,255,255,255],jpeg
 page.keyboard.press('Escape')
 assert page.locator('#successModal').is_hidden()
 page.goto('http://127.0.0.1:8000/ru/jpg-to-png/')
 page.locator('#file').set_input_files({'name':'image.jpg','mimeType':'image/jpeg','buffer':base64.b64decode(jpeg['url'])})
 page.locator('#convert').click()
 page.locator('#modalDownload').wait_for(state='visible')
 assert page.locator('#modalDownload').get_attribute('download')=='image.png'
 assert page.evaluate("async () => (await (await fetch(document.querySelector('#modalDownload').href)).blob()).type")=='image/png'
 page.keyboard.press('Escape')
 page.locator('#file').set_input_files({'name':'bad.txt','mimeType':'text/plain','buffer':b'invalid'})
 assert page.locator('#convert').is_disabled()
 assert page.locator('#feedback').inner_text()
 page.set_viewport_size({'width':375,'height':812})
 page.goto('http://127.0.0.1:8000/ru/png-to-jpg/')
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path='work/mobile.png',full_page=True)
 assert not errors, errors
 browser.close()
print('PASS: 12 routes, EN/RU, PNG/JPG output MIME, white transparency background, modal, invalid type, mobile overflow, no JS errors')
