"""All tool previews replace the empty upload state; selections affect output."""
import io
import tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def pdf(labels):
 d=fitz.open()
 for text in labels:
  p=d.new_page(width=300,height=400);p.insert_text((40,70),text,fontsize=28);p.draw_rect(fitz.Rect(40,100,260,280),fill=(.95,.7,.3))
 return d.tobytes()
def image(fmt):
 stream=io.BytesIO();Image.new('RGB',(120,80),'red').save(stream,format=fmt);return stream.getvalue()
def file(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1280,'height':1000})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 source=pdf(['ONE','TWO','THREE'])
 def output():
  page.locator('#pdf-run').click();link=page.locator('#pdf-results a').first;expect(link).to_be_visible()
  with page.expect_download() as info:link.click()
  return fitz.open(stream=Path(info.value.path()).read_bytes(),filetype='pdf')
 for prefix in ['/', '/ru/']:
  for slug in ['merge-pdf','organize-pdf']:
   page.goto(BASE+prefix+slug+'/');expect(page.locator('#editor-dropzone')).to_be_visible()
   page.locator('#editor-file').set_input_files(file('source.pdf',source,'application/pdf'))
   expect(page.locator('.page-card')).to_have_count(3)
   assert page.locator('#editor-dropzone').is_hidden()
   assert page.locator('#editor-file-help').is_hidden()
   assert page.locator('#editor-file').evaluate('(e)=>e.classList.contains("sr-only")')
   expect(page.locator('#editor-pick')).to_be_visible()
   page.locator('.page-card').first.scroll_into_view_if_needed()
   expect(page.locator('.page-card img').first).to_have_attribute('data-turn','0')
  for slug in ['split-pdf','rotate-pdf']:
   page.goto(BASE+prefix+slug+'/')
   drop_y=page.locator('#pdf-dropzone').evaluate('(e)=>e.getBoundingClientRect().top+scrollY')
   page.locator('#pdf-files').set_input_files(file('source.pdf',source,'application/pdf'))
   expect(page.locator('[data-preview-page]')).to_have_count(3)
   assert page.locator('#pdf-dropzone').is_hidden()
   expect(page.locator('#pdf-pick')).to_be_visible()
   preview_y=page.locator('#pdf-page-previews').evaluate('(e)=>e.getBoundingClientRect().top+scrollY')
   assert abs(preview_y-drop_y)<120,(slug,drop_y,preview_y)
   first=page.locator('[data-preview-page="1"]');first.scroll_into_view_if_needed()
   expect(first.locator('img')).to_have_attribute('data-angle','90' if slug=='rotate-pdf' else '0')
   if slug=='split-pdf':
    first.locator('input[type=checkbox]').uncheck()
    expect(page.locator('#page-range')).to_have_value('2,3')
    doc=output();assert [p.get_text().strip() for p in doc]==['TWO','THREE']
    page.locator('#page-range').fill('3,1')
    assert page.locator('[data-preview-page="1"] input').is_checked()
    assert not page.locator('[data-preview-page="2"] input').is_checked()
    page.locator('#split-mode').select_option('each')
    assert first.locator('input').is_disabled()
   else:
    page.locator('[data-preview-page="2"] input').uncheck()
    expect(page.locator('#page-range')).to_have_value('1,3')
    expect(page.locator('[data-preview-page="2"] img')).to_have_attribute('data-angle','0')
    doc=output();assert [p.rotation for p in doc]==[90,0,90]
    page.locator('#rotation').select_option('180')
    expect(first.locator('img')).to_have_attribute('data-angle','180')
   page.locator('#pdf-clear').click()
   expect(page.locator('#pdf-dropzone')).to_be_visible()
   assert page.locator('#pdf-page-previews').is_hidden() and page.locator('#pdf-run').is_disabled()
   # Replacement after removal destroys old previews and shows only the new pages.
   page.locator('#pdf-files').set_input_files(file('new.pdf',pdf(['NEW']),'application/pdf'))
   expect(page.locator('[data-preview-page]')).to_have_count(1)
  page.goto(BASE+prefix+'jpg-to-pdf/')
  page.locator('#pdf-files').set_input_files([file('a.jpg',image('JPEG'),'image/jpeg'),file('b.jpg',image('JPEG'),'image/jpeg')])
  expect(page.locator('#pdf-file-list img')).to_have_count(2)
  assert page.locator('#pdf-dropzone').is_hidden()
  page.wait_for_function('()=>[...document.querySelectorAll("#pdf-file-list img")].every(i=>i.complete&&i.naturalWidth>0)')
  doc=output();assert len(doc)==2
  for name in ['a.jpg','b.jpg']:
   page.get_by_role('button',name=('Удалить: ' if prefix=='/ru/' else 'Remove: ')+name,exact=True).click()
  expect(page.locator('#pdf-dropzone')).to_be_visible()
  for slug,fmt,ext,mime in [('jpg-to-png','JPEG','jpg','image/jpeg'),('png-to-jpg','PNG','png','image/png')]:
   page.goto(BASE+prefix+slug+'/')
   old_y=page.locator('#dropzone').evaluate('(e)=>e.getBoundingClientRect().top+scrollY')
   page.locator('#file').set_input_files(file('image.'+ext,image(fmt),mime))
   expect(page.locator('#fileDetails')).to_be_visible()
   assert page.locator('#dropzone').is_hidden()
   new_y=page.locator('#fileDetails').evaluate('(e)=>e.getBoundingClientRect().top+scrollY')
   assert abs(old_y-new_y)<80
   assert page.locator('#preview').evaluate('(i)=>i.complete&&i.naturalWidth>0')
   with page.expect_file_chooser():page.locator('#changeFile').click()
   page.locator('#remove').click();expect(page.locator('#dropzone')).to_be_visible()
 # Mobile layout with actual previews.
 page.set_viewport_size({'width':375,'height':812})
 for slug in ['merge-pdf','organize-pdf','split-pdf','rotate-pdf','jpg-to-pdf','jpg-to-png','png-to-jpg']:
  page.goto(BASE+'/ru/'+slug+'/')
  if slug in ['merge-pdf','organize-pdf']:
   page.locator('#editor-file').set_input_files(file('source.pdf',source,'application/pdf'));expect(page.locator('.page-card')).to_have_count(3)
  elif slug in ['split-pdf','rotate-pdf']:
   page.locator('#pdf-files').set_input_files(file('source.pdf',source,'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(3)
  elif slug=='jpg-to-pdf':page.locator('#pdf-files').set_input_files(file('a.jpg',image('JPEG'),'image/jpeg'))
  else:
   png=slug=='png-to-jpg';page.locator('#file').set_input_files(file('a.png' if png else 'a.jpg',image('PNG' if png else 'JPEG'),'image/png' if png else 'image/jpeg'));expect(page.locator('#fileDetails')).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),slug
 page.goto(BASE+'/ru/split-pdf/');page.locator('#pdf-files').set_input_files(file('source.pdf',source,'application/pdf'))
 expect(page.locator('[data-preview-page]')).to_have_count(3)
 first=page.locator('[data-preview-page="1"]');first.scroll_into_view_if_needed();expect(first.locator('img')).to_have_attribute('data-angle','0')
 page.screenshot(path='work/preview-stage-mobile.png')
 assert not errors,errors
 assert not external,external
 b.close()
print('PASS: all 7 tools in EN/RU replace upload zones, painted previews, visual page selection/rotation, PDF output, removal/replacement, mobile layout, local assets')
