"""Navigation/catalog UX, progressive settings and reusable PDF page actions."""
import io,json,zipfile,tomllib,os
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
ORDER=['merge-pdf','split-pdf','compress-pdf','organize-pdf','jpg-to-pdf','pdf-to-jpg','compress-image','resize-image']
def pdf(labels=('ONE','TWO')):
 d=fitz.open()
 for text in labels:d.new_page(width=300,height=400).insert_text((40,50),text)
 return d.tobytes()
def photo():
 out=io.BytesIO();Image.new('RGB',(80,60),'red').save(out,format='PNG');return out.getvalue()
def upload(name,data,mime='application/pdf'):return {'name':name,'buffer':data,'mimeType':mime}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1660,'height':1100});page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 def result(run='#pdf-run',link='#pdf-results a'):
  page.locator(run).click();expect(page.locator(link)).to_be_visible(timeout=20000)
  with page.expect_download() as info:page.locator(link).click()
  return Path(info.value.path()).read_bytes()
 for language in os.environ.get('UI_LANGUAGES','en,ru,ar').split(','):
  prefix='/' if language=='en' else '/'+language+'/'
  page.goto(BASE+prefix);assert page.locator('.site-header #main-navigation').count()==1 and page.locator('header + .tool-navigation').count()==0
  expect(page.locator('.tool-card')).to_have_count(21);expect(page.locator('.card-action')).to_have_count(0);expect(page.locator('.tool-card svg')).to_have_count(21)
  assert page.locator('.tool-card').evaluate_all('(cards)=>cards.slice(0,8).map(c=>c.getAttribute("href").split("/").filter(Boolean).pop())')==ORDER
  assert page.locator('.tool-card').first.evaluate('(e)=>getComputedStyle(e).padding')=='28px'
  assert page.locator('[data-filter]').first.evaluate('(e)=>getComputedStyle(e).padding')=='11px 20px'
  for key,count in {'organize':4,'convert':2,'frompdf':3,'edit':2,'optimize':2,'images':2,'imageconvert':6}.items():
   page.locator('[data-filter='+key+']').click();expect(page.locator('.tool-card:visible')).to_have_count(count)
  page.locator('[data-filter=all]').click();page.locator('[data-nav-kind=pdf] summary').click();expect(page.locator('[data-nav-kind=pdf] a')).to_have_count(12)
  page.locator('[data-nav-kind=images] summary').click();expect(page.locator('[data-nav-kind=pdf]')).to_have_js_property('open',False);expect(page.locator('[data-nav-kind=images] a')).to_have_count(9);page.keyboard.press('Escape')
  page.screenshot(path='work/ui-final-home-'+('en' if prefix=='/' else prefix.strip('/'))+'.png',full_page=True)
  # Copies, blank pages and inserted documents/images remain independently editable.
  page.goto(BASE+prefix+'rotate-pdf/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf()));expect(page.locator('[data-preview-page]')).to_have_count(2)
  page.locator('[data-preview-page="1"] [data-action=duplicate]').click();expect(page.locator('[data-preview-page]')).to_have_count(3)
  page.locator('[data-preview-page="3"] [data-action=rotate]').click();page.locator('[data-preview-page="3"] [data-action=blank]').click();expect(page.locator('[data-preview-page]')).to_have_count(4)
  with page.expect_file_chooser() as chooser:page.locator('[data-preview-page="4"] [data-action=insert]').click()
  chooser.value.set_files([upload('insert.pdf',pdf(('INSERTED',))),upload('photo.png',photo(),'image/png')]);expect(page.locator('[data-preview-page]')).to_have_count(6)
  doc=fitz.open(stream=result(),filetype='pdf');assert [p.get_text().strip() for p in doc]==['ONE','ONE','','INSERTED','','TWO'];assert [p.rotation for p in doc]==[0,90,0,0,0,0];assert doc[4].get_pixmap().pixel(20,20)==(255,0,0)
  page.locator('#workspace-undo').click();expect(page.locator('[data-preview-page]')).to_have_count(4);page.locator('#workspace-undo').click();expect(page.locator('[data-preview-page]')).to_have_count(3);page.locator('#workspace-undo').click();page.locator('#workspace-undo').click();expect(page.locator('[data-preview-page]')).to_have_count(2)
  with page.expect_file_chooser() as chooser:page.locator('[data-preview-page="1"] [data-action=insert]').click()
  chooser.value.set_files(upload('bad.pdf',b'not a PDF'));expect(page.locator('#pdf-feedback')).not_to_be_empty();expect(page.locator('[data-preview-page]')).to_have_count(2)
  page.locator('#rotate-all').click();doc=fitz.open(stream=result(),filetype='pdf');assert [p.rotation for p in doc]==[90,90]
  # Main output mode is visible above thumbnails, while secondary ranges stay advanced.
  page.goto(BASE+prefix+'split-pdf/');assert page.locator('#split-mode').evaluate('(e)=>!e.closest("details")');page.locator('#pdf-files').set_input_files(upload('report.pdf',pdf()));expect(page.locator('[data-preview-page]')).to_have_count(2)
  first=page.locator('[data-preview-page="1"]');first.scroll_into_view_if_needed();page.locator('[data-preview-page="2"] .page-drag').drag_to(first);assert page.locator('[data-preview-page]').first.get_attribute('data-preview-page')=='2';page.locator('#workspace-undo').click()
  expect(page.locator('[data-preview-page="1"] input')).not_to_be_visible();page.locator('#split-mode').select_option('range');expect(page.locator('[data-preview-page="1"] input')).to_be_visible();page.locator('#split-mode').select_option('each')
  page.locator('[data-preview-page="1"] [data-action=duplicate]').click();expect(page.locator('[data-preview-page]')).to_have_count(3)
  archive=zipfile.ZipFile(io.BytesIO(result()));assert len(archive.namelist())==3
  page.goto(BASE+prefix+'number-pdf/');expect(page.locator('#stamp-x')).not_to_be_visible();page.locator('#stamp-position').select_option('custom');expect(page.locator('#stamp-x')).to_be_visible();page.locator('#stamp-position').select_option('bottom-center');expect(page.locator('#stamp-y')).not_to_be_visible()
  page.locator('#pdf-files').set_input_files(upload('number.pdf',pdf()));expect(page.locator('[data-preview-page]')).to_have_count(2);page.locator('[data-preview-page="1"] [data-action=duplicate]').click();expect(page.locator('[data-preview-page]')).to_have_count(3);doc=fitz.open(stream=result(),filetype='pdf');assert len(doc)==3 and all(str(i+1) in p.get_text() for i,p in enumerate(doc))
  assert page.locator('.save-panel #stamp-position').count()==1
  page.locator('#pdf-files').set_input_files(upload('second.pdf',pdf(('SECOND',))));expect(page.locator('#batch-document option')).to_have_count(2);page.locator('#batch-document').select_option('1');expect(page.locator('[data-preview-page]')).to_have_count(1)
  page.locator('[data-preview-page="1"] [data-action=blank]').click();expect(page.locator('[data-preview-page]')).to_have_count(2)
  batch=zipfile.ZipFile(io.BytesIO(result()));names=batch.namelist();assert len(names)==2
  assert len(fitz.open(stream=batch.read(names[0]),filetype='pdf'))==3 and len(fitz.open(stream=batch.read(names[1]),filetype='pdf'))==2
  page.locator('#workspace-undo').click();expect(page.locator('[data-preview-page]')).to_have_count(1);page.locator('#batch-document').select_option('0');expect(page.locator('[data-preview-page]')).to_have_count(3)
  page.goto(BASE+prefix+'compress-image/');assert page.locator('.save-panel #lab-quality').count()==1
  # Mobile navigation, sticky actions and download proxy remain usable.
  page.set_viewport_size({'width':375,'height':812});page.goto(BASE+prefix);expect(page.locator('#main-navigation')).not_to_be_visible();page.locator('.mobile-menu-toggle').click();expect(page.locator('#main-navigation')).to_be_visible();page.locator('[data-nav-kind=pdf] summary').click();assert page.locator('[data-nav-kind=pdf] .nav-menu').bounding_box()['width']<=351;page.keyboard.press('Escape');expect(page.locator('#main-navigation')).not_to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.goto(BASE+prefix+'split-pdf/');expect(page.locator('.mobile-primary-action')).not_to_be_visible();page.locator('#pdf-files').set_input_files(upload('mobile.pdf',pdf()));expect(page.locator('[data-preview-page]')).to_have_count(2);expect(page.locator('.mobile-primary-action')).to_be_visible();page.locator('.mobile-primary-action').click();expect(page.locator('#pdf-results a')).to_be_visible(timeout=20000)
  with page.expect_download() as info:page.locator('.mobile-primary-action').click()
  assert len(zipfile.ZipFile(info.value.path()).namelist())==2
  page.screenshot(path='work/ui-final-workspace-'+('en' if prefix=='/' else prefix.strip('/'))+'-mobile.png',full_page=True);page.set_viewport_size({'width':1660,'height':1100})
 # Long native language names must not push the header off a narrow phone.
 for code in ['pt-BR','id','de','hu','zh-Hans','th']:
  page.set_viewport_size({'width':320,'height':812});page.goto(BASE+'/'+code+'/');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),code
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: catalog order/icons/unchanged dimensions, grouped navigation/filters, independent PDF copies/blank/insertion/undo/error recovery, output modes, conditional settings, mobile menus and actual downloads, EN/RU/AR and narrow translated headers')
