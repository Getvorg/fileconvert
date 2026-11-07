"""Live stamps, drag placement, per-document batch edits and editor insertion."""
import io,zipfile,base64,tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000';Path('work').mkdir(exist_ok=True)
def pdf(labels=('ONE','TWO')):
 d=fitz.open()
 for text in labels:d.new_page(width=300,height=400).insert_text((40,50),text,fontsize=25)
 return d.tobytes()
def image():
 b=io.BytesIO();Image.new('RGB',(80,60),'red').save(b,format='PNG');return b.getvalue()
def upload(name,data,mime='application/pdf'):return {'name':name,'mimeType':mime,'buffer':data}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=b.new_context(viewport={'width':1440,'height':1100})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host);page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 def result(run,link):
  page.locator(run).click();expect(page.locator(link)).to_be_visible(timeout=20000)
  with page.expect_download() as info:page.locator(link).click()
  return info.value.suggested_filename,Path(info.value.path()).read_bytes()
 def live_ready():expect(page.locator('#live-preview-status')).to_contain_text('соответствует' if page.locator('html').get_attribute('lang')=='ru' else 'matches',timeout=20000)
 for prefix in ['/','/ru/']:
  for slug in ['organize-pdf','merge-pdf']:
   page.goto(BASE+prefix+slug+'/');page.locator('#editor-file').set_input_files(upload('source.pdf',pdf()));expect(page.locator('.page-card')).to_have_count(2)
   page.locator('[data-page-id="0"] [data-action=duplicate]').click();expect(page.locator('.page-card')).to_have_count(3)
   page.locator('[data-page-id="2"] [data-action=rotate]').click()
   page.locator('[data-page-id="2"] [data-action=blank]').click();expect(page.locator('.page-card')).to_have_count(4)
   with page.expect_file_chooser() as chooser:page.locator('[data-page-id="3"] [data-action=insert]').click()
   chooser.value.set_files([upload('insert.pdf',pdf(('INSERTED',))),upload('photo.png',image(),'image/png')]);expect(page.locator('.page-card')).to_have_count(6)
   _,data=result('#editor-save','#editor-result a');doc=fitz.open(stream=data,filetype='pdf')
   assert [p.get_text().strip() for p in doc]==['ONE','ONE','','INSERTED','','TWO']
   assert doc[0].rotation==0 and doc[1].rotation==90 and abs(doc[2].rect.width-595.28)<.1
   assert doc[4].get_pixmap().pixel(20,20)==(255,0,0)
   page.locator('#editor-undo').click();expect(page.locator('.page-card')).to_have_count(4)
   page.locator('#editor-undo').click();expect(page.locator('.page-card')).to_have_count(3)
   page.locator('[data-page-id="0"] [data-action=zoom]').click();expect(page.locator('#page-preview-dialog')).to_be_visible()
   page.wait_for_function('()=>document.querySelector("#page-preview-status").textContent===""')
   width=page.locator('#page-preview-canvas').evaluate('(e)=>e.width');page.locator('[data-viewer-action=in]').click();page.wait_for_function('(width)=>document.querySelector("#page-preview-canvas").width>width',arg=width)
   page.locator('[data-viewer-action=next]').click();expect(page.locator('.viewer-controls span')).to_contain_text('2 / 3')
   page.keyboard.press('ArrowLeft');expect(page.locator('.viewer-controls span')).to_contain_text('1 / 3')
   page.locator('[data-viewer-action=full]').click();page.wait_for_function('()=>document.fullscreenElement!==null||document.querySelector("#page-preview-dialog").classList.contains("viewer-expanded")')
   page.locator('#page-preview-close').click();expect(page.locator('#page-preview-dialog')).not_to_be_visible()
  page.goto(BASE+prefix+'number-pdf/');page.locator('#pdf-files').set_input_files([upload('first.pdf',pdf()),upload('second.pdf',pdf(('SECOND',)))]);expect(page.locator('[data-preview-page]')).to_have_count(2)
  page.locator('#number-start').fill('7');page.locator('#stamp-color').evaluate('(e)=>{e.value="#00ff00";e.dispatchEvent(new Event("input",{bubbles:true}));}');live_ready()
  first=page.locator('[data-preview-page="1"]');first.scroll_into_view_if_needed();handle=first.locator('.stamp-move-handle');expect(handle).to_be_visible()
  bounds=first.locator('img').bounding_box();target=(bounds['x']+bounds['width']*.25,bounds['y']+bounds['height']*.35);start=handle.bounding_box();page.mouse.move(start['x']+start['width']/2,start['y']+start['height']/2);page.mouse.down();page.mouse.move(*target,steps=6);page.mouse.up();live_ready()
  expect(page.locator('#stamp-position')).to_have_value('custom');assert abs(float(page.locator('#stamp-x').input_value())-25)<2 and abs(float(page.locator('#stamp-y').input_value())-35)<2
  expect(first.locator('img')).to_have_attribute('data-angle','0');page.wait_for_function('()=>{const i=document.querySelector("[data-preview-page=\\"1\\"] img");return i.complete&&i.naturalWidth>0}')
  encoded=first.locator('img').evaluate('i=>{const c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext("2d").drawImage(i,0,0);return c.toDataURL().split(",")[1]}')
  preview=Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGB');points=[(x,y) for y in range(preview.height) for x in range(preview.width) if preview.getpixel((x,y))[1]>150 and preview.getpixel((x,y))[0]<100 and preview.getpixel((x,y))[2]<100]
  assert points and abs(sum(x for x,y in points)/len(points)/preview.width-.25)<.04 and abs(sum(y for x,y in points)/len(points)/preview.height-.35)<.05
  page.locator('[data-preview-page="2"] [data-action=delete]').click();live_ready()
  page.locator('#batch-document').select_option('1');expect(page.locator('[data-preview-page]')).to_have_count(1);live_ready();page.locator('[data-preview-page="1"] [data-action=rotate]').click();live_ready()
  name,data=result('#pdf-run','#pdf-results a');assert name.endswith('.zip');archive=zipfile.ZipFile(io.BytesIO(data));assert len(archive.namelist())==2
  a=fitz.open(stream=archive.read(archive.namelist()[0]),filetype='pdf');bb=fitz.open(stream=archive.read(archive.namelist()[1]),filetype='pdf')
  assert len(a)==len(bb)==1 and '7' in a[0].get_text() and '7' in bb[0].get_text() and bb[0].rotation==90
  word=[w for w in a[0].get_text('words') if w[4]=='7'][0];assert abs((word[0]+word[2])/2/300-.25)<.03 and abs((word[1]+word[3])/2/400-.35)<.06
  page.locator('#batch-document').select_option('0');expect(page.locator('[data-preview-page]:visible')).to_have_count(1);live_ready()
  # Stamp viewer uses the generated result and supports page navigation/zoom.
  page.locator('[data-preview-page="1"] [data-action=zoom]').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible();expect(page.locator('.viewer-controls span')).to_contain_text('1 / 1');page.keyboard.press('Escape')
  page.locator('#batch-remove').click();expect(page.locator('#batch-document option')).to_have_count(1);page.locator('#workspace-undo').click();expect(page.locator('#batch-document option')).to_have_count(2)
  page.goto(BASE+prefix+'watermark-pdf/');page.locator('#pdf-files').set_input_files([upload('one.pdf',pdf(('A',))),upload('two.pdf',pdf(('B',)))]);expect(page.locator('[data-preview-page]')).to_have_count(1)
  page.locator('#stamp-text').fill('ПРОВЕРКА');page.locator('#stamp-position').select_option('center');live_ready();_,data=result('#pdf-run','#pdf-results a');archive=zipfile.ZipFile(io.BytesIO(data));assert len(archive.namelist())==2
  assert all(fitz.open(stream=archive.read(name),filetype='pdf')[0].get_images() for name in archive.namelist())
 page.set_viewport_size({'width':375,'height':812});page.goto(BASE+'/ru/number-pdf/');page.locator('#pdf-files').set_input_files(upload('source.pdf',pdf()));expect(page.locator('[data-preview-page]')).to_have_count(2);live_ready()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='work/editor-workflow-mobile.png',full_page=True)
 assert not errors,errors
 assert not external,external
 b.close()
print('PASS: insertion/duplicate/blank/independent rotations/undo, viewer navigation/zoom/fullscreen, live stamp pixels/drag and saved positions, per-document batch edits, numbering restart and watermark ZIP, EN/RU/mobile')
