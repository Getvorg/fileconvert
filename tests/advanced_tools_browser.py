"""Advanced PDF/image tools: inspect actual exports, not only page UI."""
import io,zipfile,tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000';Path('work').mkdir(exist_ok=True)
def image(fmt='PNG',size=(120,80),alpha=False):
 out=io.BytesIO();Image.new('RGBA' if alpha else 'RGB',size,(255,0,0,0) if alpha else (255,0,0)).save(out,format=fmt);return out.getvalue()
def pdf(with_image=False,rotated=False):
 d=fitz.open()
 for i in range(2):
  p=d.new_page(width=300,height=400);p.insert_text((40,50),'ORIGINAL '+str(i+1),fontsize=20)
  if with_image:p.insert_image(fitz.Rect(40,100,160,180),stream=image())
  if rotated and i==0:p.set_rotation(90)
 d.set_toc([[1,'Start',1]])
 return d.tobytes()
def upload(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=b.new_context(viewport={'width':1440,'height':1100})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def result(run='#pdf-run',link='#pdf-results a'):
  page.locator(run).click();expect(page.locator(link)).to_be_visible(timeout=20000)
  with page.expect_download() as info:page.locator(link).click()
  return Path(info.value.path()).read_bytes()
 slugs=['number-pdf','watermark-pdf','extract-images','compress-pdf','crop-image','webp-to-jpg','webp-to-png','jpg-to-webp','png-to-webp']
 for prefix in ['/','/ru/']:
  for slug in slugs:
   assert page.goto(BASE+prefix+slug+'/').status==200
   assert page.locator('h1').count()==1 and page.locator('.save-panel').count()==1
  page.goto(BASE+prefix+'number-pdf/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf(rotated=True),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  page.locator('#number-start').fill('7');page.locator('#stamp-size').fill('18')
  doc=fitz.open(stream=result(),filetype='pdf');assert all('ORIGINAL' in p.get_text() for p in doc)
  assert '7' in doc[0].get_text() and '8' in doc[1].get_text();assert doc[0].rotation==90
  # Position is bottom-center in the *visible rotated page*, not the source coordinate system.
  words=[w for w in doc[0].get_text('words') if w[4]=='7'];assert words
  transformed=fitz.Rect(words[0][:4])*doc[0].rotation_matrix
  assert transformed.y0>doc[0].rect.height*.65 and abs((transformed.x0+transformed.x1)/2-doc[0].rect.width/2)<25
  page.goto(BASE+prefix+'watermark-pdf/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf(),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  page.locator('#stamp-text').fill('ПРОВЕРКА');page.locator('#stamp-position').select_option('center');page.locator('#stamp-opacity').fill('70')
  doc=fitz.open(stream=result(),filetype='pdf');assert 'ORIGINAL' in doc[0].get_text() and len(doc[0].get_images())>0
  page.locator('#stamp-kind').select_option('image');page.locator('#stamp-image').set_input_files(upload('mark.png',image(),'image/png'))
  doc=fitz.open(stream=result(),filetype='pdf');assert len(doc[0].get_images())>0
  page.locator('#workspace-undo').click();assert page.locator('#stamp-image').evaluate('(e)=>e.files.length')==0
  page.locator('#workspace-undo').click();expect(page.locator('#stamp-kind')).to_have_value('text')
  page.goto(BASE+prefix+'extract-images/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf(with_image=True),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  data=result();archive=zipfile.ZipFile(io.BytesIO(data));assert archive.namelist()
  for name in archive.namelist():
   img=Image.open(io.BytesIO(archive.read(name))).convert('RGB');assert img.size==(120,80) and img.getpixel((50,40))==(255,0,0)
  page.goto(BASE+prefix+'compress-pdf/');source=pdf(with_image=True);page.locator('#pdf-files').set_input_files(upload('source.pdf',source,'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2)
  data=result();doc=fitz.open(stream=data,filetype='pdf');assert len(data)<=len(source) and 'ORIGINAL' in doc[0].get_text() and doc.get_toc()==[[1,'Start',1]]
  page.locator('#compress-mode').select_option('raster');data=result();doc=fitz.open(stream=data,filetype='pdf');assert len(doc)==2 and not doc[0].get_text().strip() and len(doc[0].get_images())==1
  for slug,fmt,mime,expected in [('webp-to-jpg','WEBP','image/webp','JPEG'),('webp-to-png','WEBP','image/webp','PNG'),('jpg-to-webp','JPEG','image/jpeg','WEBP'),('png-to-webp','PNG','image/png','WEBP')]:
   page.goto(BASE+prefix+slug+'/');page.locator('#lab-files').set_input_files(upload('image.'+('jpg' if fmt=='JPEG' else fmt.lower()),image(fmt,alpha=fmt!='JPEG'),mime));expect(page.locator('#lab-cards li')).to_have_count(1)
   img=Image.open(io.BytesIO(result('#lab-run','#lab-results a')));assert img.format==expected and img.size==(120,80)
   if fmt!='JPEG' and expected!='JPEG':assert img.convert('RGBA').getpixel((20,20))[3]==0
   if expected=='JPEG':assert min(img.convert('RGB').getpixel((20,20)))>240
  page.goto(BASE+prefix+'crop-image/');page.locator('#lab-files').set_input_files(upload('source.png',image(),'image/png'));expect(page.locator('#lab-cards li')).to_have_count(1)
  page.locator('#crop-ratio').select_option('1');img=Image.open(io.BytesIO(result('#lab-run','#lab-results a')));assert img.size==(80,80)
  page.locator('#crop-ratio').select_option('free');page.locator('.crop-coordinates summary').click()
  page.locator('[data-crop-field=x]').fill('25');page.locator('[data-crop-field=x]').press('Tab');page.locator('[data-crop-field=w]').fill('50');page.locator('[data-crop-field=w]').press('Tab')
  img=Image.open(io.BytesIO(result('#lab-run','#lab-results a')));assert img.size==(60,80)
  page.locator('#workspace-undo').click();assert page.locator('#lab-results a').count()==0
  wrap=page.locator('.crop-image-wrap');wrap.scroll_into_view_if_needed();page.wait_for_function('()=>document.querySelector(".crop-image-wrap img").naturalWidth>0')
  bounds=wrap.bounding_box();page.mouse.move(bounds['x']+bounds['width']*.1,bounds['y']+bounds['height']*.1);page.mouse.down();page.mouse.move(bounds['x']+bounds['width']*.6,bounds['y']+bounds['height']*.6,steps=5);page.mouse.up()
  img=Image.open(io.BytesIO(result('#lab-run','#lab-results a')));assert abs(img.width-60)<=1 and abs(img.height-40)<=1
  page.locator('#lab-cards [data-action=rotate]').click();img=Image.open(io.BytesIO(result('#lab-run','#lab-results a')));assert abs(img.width-40)<=1 and abs(img.height-60)<=1
 page.set_viewport_size({'width':375,'height':812})
 for slug in slugs:
  page.goto(BASE+'/ru/'+slug+'/');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),slug
 assert not errors,errors
 b.close()
print('PASS: page numbering including rotated position, Cyrillic/image watermarks, native-size embedded extraction, lossless/text preservation and raster compression, WebP conversions, crop ratio/coordinates/drag/undo, EN/RU/mobile')
