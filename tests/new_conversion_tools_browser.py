"""PDF raster export, PNG-to-PDF and image compression/resizing integration."""
import io
import random
import tomllib
import zipfile
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def pdf():
 d=fitz.open()
 for label,color in [('ONE',(1,0,0)),('TWO',(0,0,1))]:
  p=d.new_page(width=144,height=72);p.draw_rect(p.rect,fill=color,color=color);p.insert_text((20,40),label,fontsize=16)
 return d.tobytes()
def image(fmt='PNG',size=(120,80),alpha=False,noise=False):
 data=io.BytesIO()
 if noise:
  rng=random.Random(17);img=Image.frombytes('RGB',size,bytes(rng.randrange(256) for _ in range(size[0]*size[1]*3)))
 else:img=Image.new('RGBA' if alpha else 'RGB',size,(0,0,0,0) if alpha else 'red')
 img.save(data,format=fmt,quality=100);return data.getvalue()
def file(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1100})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 def result(run,link):
  page.locator(run).click();anchor=page.locator(link);expect(anchor).to_be_visible(timeout=20000)
  with page.expect_download() as info:anchor.click()
  data=Path(info.value.path()).read_bytes();return info.value.suggested_filename,data
 for prefix in ['/','/ru/']:
  for slug in ['pdf-to-jpg','pdf-to-png','png-to-pdf','compress-image','resize-image']:
   response=page.goto(BASE+prefix+slug+'/');assert response.status==200 and page.locator('h1').count()==1
   assert page.locator('.save-panel').count()==1
  for slug in ['pdf-to-jpg','pdf-to-png']:
   page.goto(BASE+prefix+slug+'/');page.locator('#pdf-files').set_input_files(file('source.pdf',pdf(),'application/pdf'))
   expect(page.locator('[data-preview-page]')).to_have_count(2)
   page.locator('[data-preview-page="1"] [data-action=rotate]').click()
   page.locator('#output-name').fill('pages.zip');name,data=result('#pdf-run','#pdf-results a');assert name=='pages.zip'
   archive=zipfile.ZipFile(io.BytesIO(data));assert len(archive.namelist())==2 and archive.testzip() is None
   ext='png' if slug.endswith('png') else 'jpg'
   first=Image.open(io.BytesIO(archive.read('page-001.'+ext)));second=Image.open(io.BytesIO(archive.read('page-002.'+ext)))
   assert first.size==(144,288) and second.size==(288,144),(first.size,second.size)
   assert first.format==('PNG' if ext=='png' else 'JPEG')
   r,g,b=first.convert('RGB').getpixel((10,10));assert r>240 and g<15 and b<15
   page.locator('[data-preview-page="2"] [data-action=delete]').click()
   _,data=result('#pdf-run','#pdf-results a');assert len(zipfile.ZipFile(io.BytesIO(data)).namelist())==1
   page.locator('#workspace-undo').click();assert page.locator('[data-preview-page]:visible').count()==2
   page.locator('#tool-settings').evaluate('(e)=>e.open=true');page.locator('#render-dpi').select_option('72');page.locator('#page-range').fill('2')
   _,data=result('#pdf-run','#pdf-results a');archive=zipfile.ZipFile(io.BytesIO(data));assert archive.namelist()==['page-002.'+ext]
   assert Image.open(io.BytesIO(archive.read('page-002.'+ext))).size==(144,72)
  page.goto(BASE+prefix+'png-to-pdf/')
  page.locator('#pdf-files').set_input_files([file('transparent.png',image(alpha=True),'image/png'),file('red.png',image(),'image/png')])
  expect(page.locator('#pdf-file-list img')).to_have_count(2)
  page.locator('#pdf-file-list li').first.locator('[data-action=rotate]').click()
  _,data=result('#pdf-run','#pdf-results a');doc=fitz.open(stream=data,filetype='pdf')
  assert len(doc)==2 and doc[0].rotation==90 and doc[0].rect.width==80
  assert doc[0].get_pixmap().pixel(20,20)==(255,255,255)
  assert doc[1].get_pixmap().pixel(20,20)==(255,0,0)
  page.locator('#tool-settings').evaluate('(e)=>e.open=true');page.locator('#page-size').select_option('a4')
  _,data=result('#pdf-run','#pdf-results a');doc=fitz.open(stream=data,filetype='pdf');assert abs(doc[1].rect.width-595.28)<.1
  page.goto(BASE+prefix+'compress-image/')
  original=image('JPEG',noise=True)
  page.locator('#lab-files').set_input_files(file('noise.jpg',original,'image/jpeg'));expect(page.locator('#lab-cards li')).to_have_count(1)
  page.locator('#output-name').fill('optimized.jpg');name,data=result('#lab-run','#lab-results a')
  assert name=='optimized.jpg' and len(data)<len(original) and Image.open(io.BytesIO(data)).size==(120,80)
  page.locator('#lab-cards [data-action=rotate]').click();page.locator('#workspace-undo').click()
  assert page.locator('#lab-cards .page-thumbnail').get_attribute('class').endswith('turn-0')
  page.locator('#lab-files').set_input_files(file('alpha.png',image(alpha=True),'image/png'));expect(page.locator('#lab-cards li')).to_have_count(2)
  name,data=result('#lab-run','#lab-results a');assert name.endswith('.zip')
  archive=zipfile.ZipFile(io.BytesIO(data));assert len(archive.namelist())==2
  alpha=Image.open(io.BytesIO(archive.read('image-002.png')));assert alpha.convert('RGBA').getpixel((20,20))[3]==0
  page.locator('#lab-cards li').last.locator('[data-action=delete]').click();page.locator('#workspace-undo').click();assert page.locator('#lab-cards li').count()==2
  page.goto(BASE+prefix+'resize-image/')
  page.locator('#lab-files').set_input_files(file('red.png',image(),'image/png'));expect(page.locator('#lab-cards li')).to_have_count(1)
  page.locator('#lab-width').fill('60');page.locator('#lab-height').fill('60')
  _,data=result('#lab-run','#lab-results a');assert Image.open(io.BytesIO(data)).size==(60,40)
  page.locator('#lab-fit').select_option('exact');page.locator('#lab-width').fill('40');page.locator('#lab-height').fill('30')
  _,data=result('#lab-run','#lab-results a');assert Image.open(io.BytesIO(data)).size==(40,30)
  page.locator('#lab-cards [data-action=rotate]').click();page.locator('#lab-fit').select_option('contain');page.locator('#lab-width').fill('60');page.locator('#lab-height').fill('60')
  _,data=result('#lab-run','#lab-results a');assert Image.open(io.BytesIO(data)).size==(40,60)
  page.locator('#lab-format').select_option('image/webp');_,data=result('#lab-run','#lab-results a');assert Image.open(io.BytesIO(data)).format=='WEBP'
  page.locator('#lab-cards [data-action=zoom]').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible();page.keyboard.press('Escape')
  # Invalid settings and inputs do not replace a valid result with stale output.
  page.locator('#lab-width').fill('0');page.locator('#lab-run').click();expect(page.locator('#lab-feedback')).not_to_be_empty();assert page.locator('#lab-results a').count()==0
  page.locator('#workspace-undo').click();expect(page.locator('#lab-width')).to_have_value('60')
  page.locator('#lab-files').set_input_files(file('bad.png',b'not-image','image/png'));expect(page.locator('#lab-feedback')).to_contain_text('Не удалось' if prefix=='/ru/' else 'Cannot decode');assert page.locator('#lab-cards li').count()==1
 # Validate all new route links and mobile overflow.
 page.set_viewport_size({'width':375,'height':812})
 for slug in ['pdf-to-jpg','pdf-to-png','png-to-pdf','compress-image','resize-image']:
  page.goto(BASE+'/ru/'+slug+'/')
  if slug.startswith('pdf-to-'):
   page.locator('#pdf-files').set_input_files(file('source.pdf',pdf(),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  elif slug=='png-to-pdf':page.locator('#pdf-files').set_input_files(file('a.png',image(),'image/png'));expect(page.locator('#pdf-file-list img')).to_have_count(1)
  else:page.locator('#lab-files').set_input_files(file('a.png',image(),'image/png'));expect(page.locator('#lab-cards li')).to_have_count(1)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),slug
 page.screenshot(path='work/new-tools-mobile.png',full_page=True)
 page.goto(BASE+'/');assert page.locator('.tool-card').count()==21
 for slug in ['pdf-to-jpg','pdf-to-png','png-to-pdf','compress-image','resize-image']:assert page.locator(f'.tool-card[href="/{slug}/"]').count()==1
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: PDF JPG/PNG ZIP pixel sizes/colors/DPI/actions, transparent PNG PDF/A4, real compression, resizing/aspect/exact/rotation/WebP, undo/error handling, EN/RU/mobile/catalog')
