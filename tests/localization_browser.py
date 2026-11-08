"""Exercise translated runtime controls and actual exports under production CSP."""
import io,json,tomllib,os
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
def pdf():
 doc=fitz.open()
 for n in range(2):doc.new_page(width=300,height=400).insert_text((40,50),'SOURCE '+str(n+1))
 return doc.tobytes()
def image():
 data=io.BytesIO();Image.new('RGB',(100,80),'red').save(data,format='JPEG');return data.getvalue()
def upload(name,data,mime):return {'name':name,'buffer':data,'mimeType':mime}
def interpolate(dictionary,key,*values):
 text=dictionary[key]
 for n,value in enumerate(values):text=text.replace('{'+str(n)+'}',str(value))
 return text
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 for lang in os.environ.get('TEST_LANGUAGES','uk,de,it,es,pl,pt-BR,fr,ja,ko,id,tr,vi,nl,ar,zh-Hans,cs,ro,hu,el,th').split(','):
  d=json.loads(Path('locales',lang+'.json').read_text());prefix='/'+lang+'/'
  page.goto(BASE+prefix);expect(page.locator('.tool-card')).to_have_count(21);page.locator('[data-filter=edit]').click();expect(page.locator('#catalog-status')).to_have_text(interpolate(d,'{0} tools',2))
  page.goto(BASE+prefix+'number-pdf/');expect(page.locator('.save-panel h2')).to_have_text(d['Your result'])
  page.locator('#pdf-files').set_input_files(upload('DOCUMENT.pdf',pdf(),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  expect(page.locator('#live-preview-status')).to_have_text(d['Preview matches the saved result.'],timeout=20000);expect(page.locator('.stamp-move-handle')).to_have_count(0)
  first=page.locator('[data-preview-page="1"]');expect(first.locator('.preview-page-choice input')).to_have_attribute('aria-label',interpolate(d,'Use page {0}',1))
  expect(first.locator('[data-action=rotate]')).to_have_attribute('title',d['Rotate page']+' 1')
  page.locator('#stamp-position').select_option('custom');page.locator('#stamp-x').fill('25');page.locator('#stamp-y').fill('35');page.locator('#number-start').fill('12')
  expect(page.locator('#live-preview-status')).to_have_text(d['Preview matches the saved result.'],timeout=20000)
  first.locator('[data-action=zoom]').click();expect(page.locator('#workspace-preview-title')).to_have_text(interpolate(d,'Page {0}',1));expect(page.locator('[data-viewer-action=fit]')).to_have_text(d['Fit']);page.keyboard.press('Escape')
  page.locator('#pdf-run').click();expect(page.locator('#pdf-results a')).to_be_visible(timeout=20000)
  with page.expect_download() as download:page.locator('#pdf-results a').click()
  doc=fitz.open(download.value.path());assert len(doc)==2 and '12' in doc[0].get_text() and '13' in doc[1].get_text()
  number=[w for w in doc[0].get_text('words') if w[4]=='12'][0];assert abs((number[0]+number[2])/2/300-.25)<.03
  # Switching languages preserves the tool path and native language names.
  page.locator('.language-picker summary').click();expect(page.locator('.language-picker a')).to_have_count(22)
  page.locator('.language-picker [hreflang=de]').click();expect(page).to_have_url(BASE+'/de/number-pdf/')
  page.goto(BASE+prefix+'watermark-pdf/');expect(page.locator('#stamp-text')).to_have_value(d['SAMPLE']);page.locator('#stamp-text').fill('DOCUMENT NOT TRANSLATED');expect(page.locator('#stamp-text')).to_have_value('DOCUMENT NOT TRANSLATED')
  if lang=='ar':
   assert page.locator('html').get_attribute('dir')=='rtl'
   page.locator('#pdf-files').set_input_files(upload('arabic.pdf',pdf(),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
   assert page.locator('#pdf-page-previews').evaluate('(e)=>getComputedStyle(e).direction')=='ltr'
   page.locator('#stamp-text').fill('اختبار العلامة المائية');page.locator('#stamp-angle').fill('0');page.locator('#stamp-opacity').fill('100');page.locator('#stamp-position').select_option('center')
   expect(page.locator('#live-preview-status')).to_have_text(d['Preview matches the saved result.'],timeout=20000)
   page.locator('#pdf-run').click();expect(page.locator('#pdf-results a')).to_be_visible(timeout=20000)
   with page.expect_download() as watermark:page.locator('#pdf-results a').click()
   stamped=fitz.open(watermark.value.path());assert len(stamped)==2 and 'SOURCE 1' in stamped[0].get_text()
   item=stamped[0].get_images()[0];mask=fitz.Pixmap(stamped,item[1]);alpha=Image.frombytes('L',(mask.width,mask.height),mask.samples);bounds=alpha.getbbox();assert bounds and (bounds[2]-bounds[0])/mask.width>.7,('clipped RTL watermark',bounds,mask.width)
   page.screenshot(path='work/arabic-watermark-desktop.png',full_page=True)
  page.goto(BASE+prefix+'merge-pdf/');page.locator('#editor-file').set_input_files(upload('UNCHANGED.pdf',pdf(),'application/pdf'));expect(page.locator('.page-card')).to_have_count(2)
  expect(page.locator('[data-page-id="0"] [data-action=duplicate]')).to_have_attribute('title',d['Duplicate page']+' 1');expect(page.locator('#editor-filename')).to_have_text(interpolate(d,'{0} files',1))
  page.goto(BASE+prefix+'jpg-to-png/');expect(page.locator('#convert')).to_have_text(d['Convert to PNG']);page.locator('#file').set_input_files(upload('wrong.png',image(),'image/png'));expect(page.locator('#feedback')).to_have_text(d['Please choose a file in the correct format.']);page.locator('#file').set_input_files(upload('MY PHOTO.jpg',image(),'image/jpeg'));page.locator('#convert').click();expect(page.locator('#download')).to_be_visible(timeout=20000)
  expect(page.locator('#modalTitle')).to_have_text(d['Conversion complete!'])
  with page.expect_download() as download:page.locator('#modalDownload').click()
  assert Image.open(download.value.path()).format=='PNG'
  page.goto(BASE+prefix+'webp-to-jpg/');page.locator('#lab-files').set_input_files(upload('wrong.jpg',image(),'image/jpeg'));expect(page.locator('#lab-feedback')).to_have_text(interpolate(d,'Choose {0} images: up to 20 MB each and 50 MB total.','WEBP'))
  page.goto(BASE+prefix+'resize-image/');expect(page.locator('.save-panel h2')).to_have_text(d['Your result']);page.locator('#lab-files').set_input_files(upload('original.jpg',image(),'image/jpeg'));expect(page.locator('#lab-cards li')).to_have_count(1);expect(page.locator('#lab-cards [data-action=rotate]')).to_have_attribute('title',d['Rotate']+': original.jpg')
  page.set_viewport_size({'width':375,'height':812});page.goto(BASE+prefix);expect(page.locator('.eyebrow')).to_have_text(d['FREE · IN YOUR BROWSER · NO SIGN-UP']);page.locator('.language-picker summary').click();expect(page.locator('.language-picker [hreflang=uk]')).to_be_visible();menu=page.locator('.language-picker nav');assert menu.evaluate('(e)=>e.scrollHeight>e.clientHeight');last=menu.locator('a').last;last.scroll_into_view_if_needed();expect(last).to_be_visible();assert abs(menu.locator('a').first.bounding_box()['x']-last.bounding_box()['x'])<2;menu.evaluate('(e)=>e.scrollTop=0');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='work/language-'+lang+'-mobile.png');page.set_viewport_size({'width':1440,'height':1000})
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: selected languages, translated dynamic cards/status/errors/save/viewer, PDF/image exports, no stamp drag handle, native language switching, mobile and local-only requests')
