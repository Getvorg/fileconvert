"""Local handoff, opt-in recovery and review of generated files under production CSP."""
import io,tomllib,zipfile
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
d=fitz.open()
for text in ['FIRST','SECOND']:
 p=d.new_page(width=300,height=400);p.insert_text((40,70),text)
pdf=d.tobytes(); out=io.BytesIO();Image.new('RGB',(800,500),'red').save(out,format='JPEG')
def upload(name,data,mime):return dict(name=name,buffer=data,mimeType=mime)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context();page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  r=route.fetch();route.fulfill(response=r,headers={**r.headers,**headers})
 context.route(BASE+'/**',host)
 page.goto(BASE+'/organize-pdf/');expect(page.locator('.work-recovery')).to_be_visible();assert not page.locator('.work-recovery input').is_checked()
 page.locator('.work-recovery input').check();page.locator('#editor-file').set_input_files(upload('test.pdf',pdf,'application/pdf'));expect(page.locator('.page-card')).to_have_count(2)
 page.locator('[data-action=rotate]').first.click();expect(page.locator('.work-recovery')).to_have_attribute('data-state','saved');page.wait_for_timeout(450);page.reload();page.get_by_role('button',name='Restore work',exact=True).click();expect(page.locator('.page-card')).to_have_count(2)
 page.locator('#output-name').fill('continued.pdf');page.locator('#editor-save').click();expect(page.locator('.result-preview')).to_be_visible();page.locator('.result-preview').click();page.wait_for_timeout(600);assert page.locator('dialog[open]').count() or page.locator('.preview-dialog:not([hidden])').count();page.keyboard.press('Escape')
 page.locator('.continue-tools summary').click();page.locator('[data-next-tool=number-pdf]').click();page.wait_for_url('**/number-pdf/**');expect(page.locator('.page-card')).to_have_count(2);assert not page.evaluate('location.hash')
 page.locator('#pdf-run').click();expect(page.locator('#pdf-results a')).to_be_visible()
 with page.expect_download() as event:page.locator('#pdf-results a').click()
 handed=fitz.open(stream=Path(event.value.path()).read_bytes(),filetype='pdf');assert len(handed)==2 and handed[0].rotation==90 and 'FIRST' in handed[0].get_text()

 page.goto(BASE+'/jpg-to-png/');page.locator('#file').set_input_files(upload('red.jpg',out.getvalue(),'image/jpeg'));expect(page.locator('#fileDetails')).to_be_visible();page.locator('#rotateImage').click();page.wait_for_timeout(450);page.reload();page.get_by_role('button',name='Restore work',exact=True).click();expect(page.locator('#fileDetails')).to_be_visible();assert page.locator('#imagePreviewFrame').get_attribute('class').endswith('90');page.locator('#convert').click();expect(page.locator('#successModal')).to_be_visible();page.locator('#successModal').get_by_role('button',name='Preview result',exact=True).click();expect(page.locator('.comparison-grid img')).to_have_count(2);assert page.locator('.comparison-grid img').last.evaluate('(el)=>[el.naturalWidth,el.naturalHeight]')==[500,800];page.keyboard.press('Escape');page.locator('.memory-delete').click();page.reload();expect(page.locator('.recovery-offer')).to_be_hidden();assert not page.locator('.work-recovery input').is_checked()
 page.goto(BASE+'/split-pdf/');page.locator('input[type=file]').first.set_input_files(upload('split.pdf',pdf,'application/pdf'));page.wait_for_timeout(800);page.locator('.save-panel button').filter(has_text='Split').first.click();expect(page.locator('.result-preview')).to_be_visible();page.locator('.result-preview').click();expect(page.locator('#result-archive-entry option')).to_have_count(2)
 # ZIP entry review uses the exported image, and returns to the archive picker.
 page.locator('.result-dialog button').filter(has_text='Preview result').click();expect(page.locator('#workspace-preview-dialog')).to_be_visible();page.keyboard.press('Escape');expect(page.locator('#result-archive-entry')).to_be_visible();page.keyboard.press('Escape')
 # Restore organizer insertions, duplicated and blank pages, including their source mapping.
 page.goto(BASE+'/organize-pdf/');page.locator('.work-recovery input').check();page.locator('#editor-file').set_input_files(upload('edit.pdf',pdf,'application/pdf'));expect(page.locator('.page-card')).to_have_count(2)
 page.locator('[data-action=duplicate]').first.click();page.locator('#editor-add-blank').click();expect(page.locator('.page-card')).to_have_count(4)
 page.locator('#editor-insert-file').set_input_files(upload('extra.jpg',out.getvalue(),'image/jpeg'));expect(page.locator('.page-card')).to_have_count(5);page.locator('[data-action=rotate]').last.click();page.wait_for_timeout(500);page.reload();page.get_by_role('button',name='Restore work',exact=True).click();expect(page.locator('.page-card')).to_have_count(5);page.locator('#editor-save').click();expect(page.locator('#editor-result a')).to_be_visible()
 with page.expect_download() as event:page.locator('#editor-result a').click()
 result=fitz.open(stream=Path(event.value.path()).read_bytes(),filetype='pdf');assert len(result)==5 and result[-1].rotation==90 and sum('FIRST' in p.get_text() for p in result)==2
 # PDF settings and page deletion survive reload, including the generated ZIP output.
 page.goto(BASE+'/number-pdf/');page.locator('#pdf-files').set_input_files(upload('number.pdf',pdf,'application/pdf'));expect(page.locator('[data-preview-page]')).to_have_count(2);page.locator('#number-start').fill('9');page.locator('[data-preview-page="2"] [data-action=delete]').click();page.wait_for_timeout(500);page.reload();page.get_by_role('button',name='Restore work',exact=True).click();expect(page.locator('#number-start')).to_have_value('9');expect(page.locator('[data-preview-page]:visible')).to_have_count(1);page.locator('#pdf-run').click();expect(page.locator('#pdf-results a')).to_be_visible()
 with page.expect_download() as event:page.locator('#pdf-results a').click()
 result=fitz.open(stream=Path(event.value.path()).read_bytes(),filetype='pdf');assert len(result)==1 and '9' in result[0].get_text()
 # Image lab restores rotations and resize dimensions; comparison shows real output dimensions.
 page.goto(BASE+'/resize-image/');page.locator('#lab-files').set_input_files(upload('resize.jpg',out.getvalue(),'image/jpeg'));expect(page.locator('.page-card')).to_have_count(1);page.locator('#lab-width').fill('200');page.locator('#lab-height').fill('125');page.wait_for_timeout(500);page.reload();page.get_by_role('button',name='Restore work',exact=True).click();expect(page.locator('#lab-width')).to_have_value('200');page.locator('#lab-run').click();expect(page.locator('.result-preview')).to_be_visible();page.locator('.result-preview').click();expect(page.locator('.comparison-grid img')).to_have_count(2);assert page.locator('.comparison-grid img').last.evaluate('(el)=>[el.naturalWidth,el.naturalHeight]')==[200,125];page.keyboard.press('Escape')
 # Expired records are removed and never offered for restoration.
 page.evaluate("""async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('fileconvert-work',1);r.onsuccess=()=>ok(r.result);r.onerror=no;});await new Promise(ok=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.getAll();r.onsuccess=()=>r.result.forEach(x=>{x.expires=0;s.put(x);});tx.oncomplete=ok;});}""");page.reload();expect(page.locator('.recovery-offer')).to_be_hidden()
 # A restrictive browser can still convert without IndexedDB.
 isolated=browser.new_context();isolated.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw Error('Blocked');}})");restricted=isolated.new_page();restricted.goto(BASE+'/jpg-to-png/');restricted.locator('#file').set_input_files(upload('blocked.jpg',out.getvalue(),'image/jpeg'));expect(restricted.locator('#fileDetails')).to_be_visible();restricted.locator('#convert').click();expect(restricted.locator('#download')).to_be_visible();isolated.close()
 # Mobile result controls remain within the viewport.
 page.set_viewport_size({'width':375,'height':812});page.goto(BASE+'/ru/jpg-to-png/');page.locator('#file').set_input_files(upload('mobile.jpg',out.getvalue(),'image/jpeg'));expect(page.locator('#fileDetails')).to_be_visible();page.locator('#convert').click();expect(page.locator('#successModal')).to_be_visible();page.locator('#modalDone').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='work/file-workflow-mobile.png',full_page=True)
 assert not errors,errors
 browser.close();print('File workflow passed')
