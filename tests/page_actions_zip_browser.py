"""Per-card rotations/deletions agree with PDF/image exports and ZIP entries."""
import io
import zipfile
import tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def pdf():
 d=fitz.open()
 for label,angle in [('ONE',0),('TWO',90),('THREE',0)]:
  p=d.new_page(width=300,height=400);p.insert_text((40,70),label,fontsize=30);p.set_rotation(angle)
 return d.tobytes()
def image(fmt):
 data=io.BytesIO();Image.new('RGB',(120,80),'red').save(data,format=fmt);return data.getvalue()
def file(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1280,'height':1000})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def run():
  page.locator('#pdf-run').click();link=page.locator('#pdf-results a').first;expect(link).to_be_visible()
  with page.expect_download() as info:link.click()
  return info.value.suggested_filename,Path(info.value.path()).read_bytes()
 for prefix in ['/', '/ru/']:
  page.goto(BASE+prefix+'split-pdf/')
  expect(page.locator('#split-mode')).to_have_value('each')
  page.locator('#pdf-files').set_input_files(file('source.pdf',pdf(),'application/pdf'))
  expect(page.locator('[data-preview-page]')).to_have_count(3)
  first=page.locator('[data-preview-page="1"]')
  first.locator('[data-action=rotate]').click()
  first.scroll_into_view_if_needed();expect(first.locator('img')).to_have_attribute('data-angle','90')
  page.locator('[data-preview-page="2"] [data-action=delete]').click()
  assert page.locator('[data-preview-page]:visible').count()==2
  name,data=run();assert name.endswith('.zip')
  archive=zipfile.ZipFile(io.BytesIO(data));assert archive.testzip() is None
  assert archive.namelist()==['page-001.pdf','page-003.pdf']
  one=fitz.open(stream=archive.read('page-001.pdf'),filetype='pdf');three=fitz.open(stream=archive.read('page-003.pdf'),filetype='pdf')
  assert len(one)==len(three)==1 and one[0].rotation==90 and three[0].rotation==0
  assert one[0].get_text().strip()=='ONE' and three[0].get_text().strip()=='THREE'
  page.locator('#split-mode').select_option('range');page.locator('#page-range').fill('3,1')
  _,data=run();doc=fitz.open(stream=data,filetype='pdf')
  assert [p.get_text().strip() for p in doc]==['THREE','ONE'] and [p.rotation for p in doc]==[0,90]
  page.locator('#pdf-reset-pages').click();assert page.locator('[data-preview-page]:visible').count()==3
  page.locator('[data-preview-page="2"] [data-action=delete]').click();page.locator('[data-preview-page="3"] [data-action=delete]').click()
  assert first.locator('[data-action=delete]').is_disabled()
  page.locator('#split-mode').select_option('each');_,data=run()
  assert len(zipfile.ZipFile(io.BytesIO(data)).namelist())==1
  page.goto(BASE+prefix+'rotate-pdf/');page.locator('#pdf-files').set_input_files(file('source.pdf',pdf(),'application/pdf'))
  expect(page.locator('[data-preview-page]')).to_have_count(3)
  page.locator('[data-preview-page="1"] [data-action=rotate]').click();page.locator('[data-preview-page="2"] [data-action=delete]').click()
  _,data=run();doc=fitz.open(stream=data,filetype='pdf')
  assert [p.get_text().strip() for p in doc]==['ONE','THREE'] and [p.rotation for p in doc]==[180,90]
  page.goto(BASE+prefix+'jpg-to-pdf/')
  page.locator('#pdf-files').set_input_files([file('a.jpg',image('JPEG'),'image/jpeg'),file('b.jpg',image('JPEG'),'image/jpeg')])
  page.get_by_role('button',name=('Повернуть: ' if prefix=='/ru/' else 'Rotate: ')+'a.jpg',exact=True).click()
  page.get_by_role('button',name=('Удалить: ' if prefix=='/ru/' else 'Remove: ')+'b.jpg',exact=True).click()
  _,data=run();doc=fitz.open(stream=data,filetype='pdf');assert len(doc)==1 and doc[0].rotation==90 and doc[0].rect.width==80
  for slug,fmt,ext,mime in [('jpg-to-png','JPEG','jpg','image/jpeg'),('png-to-jpg','PNG','png','image/png')]:
   page.goto(BASE+prefix+slug+'/');page.locator('#file').set_input_files(file('image.'+ext,image(fmt),mime))
   expect(page.locator('#fileDetails')).to_be_visible();page.locator('#rotateImage').click();page.locator('#convert').click()
   link=page.locator('#modalDownload');expect(link).to_be_visible()
   with page.expect_download() as info:link.click()
   img=Image.open(info.value.path());assert img.size==(80,120)
   page.keyboard.press('Escape');page.locator('#rotateImage').click();assert page.locator('#download').is_hidden()
   page.locator('#remove').click();assert page.locator('#dropzone').is_visible()
 # ZIP names are fixed and never inherit path separators from user file names.
 page.goto(BASE+'/split-pdf/');page.locator('#pdf-files').set_input_files(file('../source.pdf',pdf(),'application/pdf'))
 expect(page.locator('[data-preview-page]')).to_have_count(3);_,data=run()
 assert all('/' not in name and '\\' not in name for name in zipfile.ZipFile(io.BytesIO(data)).namelist())
 page.set_viewport_size({'width':375,'height':812});page.locator('[data-preview-page="1"]').scroll_into_view_if_needed()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='work/page-actions-mobile.png')
 assert not errors,errors
 b.close()
print('PASS: per-card rotations/deletion across split/rotate/JPG/converters, ZIP integrity/names/single-page contents, reset/last-page guard, saved image orientation, EN/RU/mobile')
