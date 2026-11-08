"""Undo, shared cards/previews, file naming, progress and export metadata."""
import io
import tomllib
import zipfile
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def pdf(labels=('ONE','TWO','THREE')):
 d=fitz.open()
 for text in labels:
  p=d.new_page(width=300,height=400);p.insert_text((45,60),text,fontsize=28);p.draw_rect(fitz.Rect(40,100,260,300),fill=(.8,.6,.9))
 return d.tobytes()
def image(fmt='JPEG'):
 out=io.BytesIO();Image.new('RGB',(120,80),'red').save(out,format=fmt);return out.getvalue()
def upload(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True)
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 def download(link):
  expect(link).to_be_visible()
  with page.expect_download() as event:link.click()
  data=Path(event.value.path()).read_bytes()
  return event.value.suggested_filename,data
 def check_meta(data):
  expected=f'{len(data)} B' if len(data)<1024 else f'{len(data)/1024:.1f} KB' if len(data)<1024*1024 else f'{len(data)/1024/1024:.2f} MB'
  assert expected in page.locator('#output-meta').inner_text()
  assert page.locator('#processing-progress').get_attribute('value')=='100'
 for prefix in ['/','/ru/']:
  page.goto(BASE+prefix+'jpg-to-png/')
  page.locator('#file').set_input_files(upload('photo.jpg',image(),'image/jpeg'));expect(page.locator('#fileDetails')).to_be_visible()
  page.locator('#rotateImage').click();page.locator('#remove').click();assert page.locator('#dropzone').is_visible()
  page.locator('#workspace-undo').click();expect(page.locator('#fileDetails')).to_be_visible()
  assert page.locator('#imagePreviewFrame').get_attribute('class').endswith('turn-90')
  page.locator('#workspace-undo').click();expect(page.locator('#fileDetails')).to_be_visible()
  assert page.locator('#imagePreviewFrame').get_attribute('class').endswith('turn-0')
  page.locator('#zoomImage').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible()
  page.wait_for_function('()=>document.querySelector("#workspace-preview-status").textContent===""')
  assert page.locator('#workspace-preview-canvas').get_attribute('width')=='120'
  page.keyboard.press('Escape');assert page.locator('#zoomImage').evaluate('(e)=>document.activeElement===e')
  page.locator('#output-name').fill('my-photo.png');page.locator('#convert').click()
  name,data=download(page.locator('#modalDownload'));assert name=='my-photo.png';check_meta(data)
  page.keyboard.press('Escape');page.locator('#output-name').fill('renamed.png')
  assert page.locator('#download').get_attribute('download')=='renamed.png'
  page.locator('#rotateImage').click();assert page.locator('#download').is_hidden()
  page.goto(BASE+prefix+'jpg-to-pdf/')
  page.locator('#pdf-files').set_input_files([upload('a.jpg',image(),'image/jpeg'),upload('b.jpg',image(),'image/jpeg')])
  page.locator('#pdf-file-list [data-action=delete]').last.click();assert page.locator('#pdf-file-list img').count()==1
  page.locator('#workspace-undo').click();assert page.locator('#pdf-file-list img').count()==2
  first=page.locator('#pdf-file-list li').first
  first.locator('[data-action=zoom]').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible();page.keyboard.press('Escape')
  first.locator('[data-action=rotate]').click();page.locator('#workspace-undo').click()
  assert first.locator('.page-thumbnail').get_attribute('class').endswith('turn-0')
  page.locator('#pdf-file-list li').last.locator('.page-drag').drag_to(first)
  assert 'b.jpg' in page.locator('#pdf-file-list li').first.inner_text()
  page.locator('#workspace-undo').click();assert 'a.jpg' in page.locator('#pdf-file-list li').first.inner_text()
  page.locator('#output-name').fill('images-custom.pdf');page.locator('#pdf-run').click();name,data=download(page.locator('#pdf-results a'))
  assert name=='images-custom.pdf' and len(fitz.open(stream=data,filetype='pdf'))==2;check_meta(data)
  for slug in ['split-pdf','rotate-pdf']:
   page.goto(BASE+prefix+slug+'/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf(),'application/pdf'))
   expect(page.locator('[data-preview-page]')).to_have_count(3)
   first=page.locator('[data-preview-page="1"]')
   first.locator('[data-action=zoom]').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible();page.keyboard.press('Escape')
   first.locator('[data-action=rotate]').click();page.locator('[data-preview-page="2"] [data-action=delete]').click()
   assert page.locator('[data-preview-page]:visible').count()==2
   page.locator('#workspace-undo').click();assert page.locator('[data-preview-page]:visible').count()==3
   first.scroll_into_view_if_needed()  # Keep the complete target card visible before starting a native drag.
   page.locator('[data-preview-page="3"] .page-drag').drag_to(first)
   assert page.locator('[data-preview-page]').first.get_attribute('data-preview-page')=='3'
   page.locator('#workspace-undo').click();assert page.locator('[data-preview-page]').first.get_attribute('data-preview-page')=='1'
   ext='zip' if slug=='split-pdf' else 'pdf';page.locator('#output-name').fill('custom.'+ext)
   page.evaluate('''()=>{window.progressSteps=[];new MutationObserver(()=>{const p=document.querySelector('#processing-progress');window.progressSteps.push([p.getAttribute('value'),p.max]);}).observe(document.querySelector('#processing-progress'),{attributes:true});}''')
   page.locator('#pdf-run').click();name,data=download(page.locator('#pdf-results a'));assert name=='custom.'+ext;check_meta(data)
   if slug=='split-pdf':
    z=zipfile.ZipFile(io.BytesIO(data));assert len(z.namelist())==3
    assert fitz.open(stream=z.read('page-001.pdf'),filetype='pdf')[0].rotation==90
    assert page.evaluate('()=>window.progressSteps.some(([value,max])=>value!==null&&max===3)')
   else:assert [p.rotation for p in fitz.open(stream=data,filetype='pdf')]==[90,0,0]
   page.locator('#workspace-undo').click();assert page.locator('#pdf-results a').count()==0
  for slug in ['merge-pdf','organize-pdf']:
   page.goto(BASE+prefix+slug+'/')
   files=[upload('source.pdf',pdf(),'application/pdf')]
   if slug=='merge-pdf':files.append(upload('extra.pdf',pdf(('EXTRA',)),'application/pdf'))
   page.locator('#editor-file').set_input_files(files);expect(page.locator('.page-card')).to_have_count(4 if slug=='merge-pdf' else 3)
   assert page.locator('.page-overlay [data-action=zoom] svg').count()==(4 if slug=='merge-pdf' else 3)
   page.locator('.page-card').first.locator('[data-action=delete]').click();page.locator('#editor-undo').click()
   page.locator('#output-name').fill('document-custom.pdf');page.locator('#editor-save').click()
   name,data=download(page.locator('#editor-result a'));assert name=='document-custom.pdf';check_meta(data)
   # Save panel is alongside the workspace on desktop.
   assert page.locator('.save-panel').evaluate('(e)=>e.getBoundingClientRect().left')>page.locator('.workspace-content').evaluate('(e)=>e.getBoundingClientRect().right')
 page.screenshot(path='work/workspace-polish-desktop.png',full_page=True)
 # Real touch events use the same reorder handles as mouse dragging.
 for slug in ['rotate-pdf','organize-pdf']:
  page.goto(BASE+'/'+slug+'/');page.locator('#pdf-files' if slug=='rotate-pdf' else '#editor-file').set_input_files(upload('source.pdf',pdf(),'application/pdf'))
  selector='[data-preview-page]' if slug=='rotate-pdf' else '[data-page-id]';expect(page.locator(selector)).to_have_count(3)
  handle=page.locator(selector).first.locator('.page-drag');handle.scroll_into_view_if_needed();start=handle.bounding_box();target=page.locator(selector).nth(1).bounding_box()
  sx=start['x']+start['width']/2;sy=start['y']+start['height']/2;tx=target['x']+target['width']/2;ty=target['y']+70
  session=context.new_cdp_session(page);session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
  for step in range(1,9):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':sx+(tx-sx)*step/8,'y':sy+(ty-sy)*step/8}]})
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  expect(page.locator(selector).first).to_have_attribute('data-preview-page' if slug=='rotate-pdf' else 'data-page-id','2' if slug=='rotate-pdf' else '1')
 page.set_viewport_size({'width':375,'height':812})
 page.goto(BASE+'/ru/rotate-pdf/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf(),'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(3)
 first=page.locator('[data-preview-page="1"]');first.scroll_into_view_if_needed();expect(first.locator('img')).to_have_attribute('data-angle','0')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.save-panel').evaluate('(e)=>e.getBoundingClientRect().top')>page.locator('.workspace-content').evaluate('(e)=>e.getBoundingClientRect().top')
 page.screenshot(path='work/workspace-polish-mobile.png',full_page=True)
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: shared card previews, undo/remove/rotate/reorder, custom filenames and exact sizes, measured ZIP progress, PDF/image output, EN/RU, desktop sidebar/mobile flow')
