"""Shared merge/organize cards, multiple sources, modal and output fidelity."""
import tomllib
from pathlib import Path
import fitz
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def pdf(texts,rotations=()):
 d=fitz.open()
 for n,text in enumerate(texts):
  p=d.new_page(width=300,height=420);p.insert_text((45,65),text,fontsize=30)
  p.draw_rect(fitz.Rect(45,100,255,270),color=(.4,.2,.6),fill=(.95,.8,.5))
  p.set_rotation(rotations[n] if n<len(rotations) else 0)
 return d.tobytes()
def upload(name,data):return {'name':name,'mimeType':'application/pdf','buffer':data}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1280,'height':1000})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def card(id):return page.locator(f'[data-page-id="{id}"]')
 def order():return page.locator('.page-card').evaluate_all('(nodes)=>nodes.map(n=>Number(n.dataset.pageId))')
 def download():
  page.locator('#editor-save').click();link=page.locator('#editor-result a');expect(link).to_be_visible()
  with page.expect_download() as info:link.click()
  return fitz.open(stream=Path(info.value.path()).read_bytes(),filetype='pdf')
 page.goto(BASE+'/ru/merge-pdf/')
 page.locator('#editor-file').set_input_files([upload('alpha.pdf',pdf(['A1','A2'],[90,0])),upload('beta.pdf',pdf(['B1','B2']))])
 expect(page.locator('.page-card')).to_have_count(4)
 assert order()==[0,1,2,3]
 assert page.locator('.page-source-name').all_text_contents()==['alpha.pdf','alpha.pdf','beta.pdf','beta.pdf']
 card(2).scroll_into_view_if_needed();expect(card(2).locator('img')).to_have_attribute('data-turn','0')
 card(2).locator('[data-action=zoom]').click()
 expect(page.locator('#page-preview-dialog')).to_be_visible()
 page.wait_for_function('document.querySelector("#page-preview-canvas").width>0 && document.querySelector("#page-preview-status").textContent===""')
 expect(page.locator('#page-preview-title')).to_contain_text('beta.pdf')
 page.keyboard.press('Escape');expect(page.locator('#page-preview-dialog')).not_to_be_visible()
 assert card(2).locator('[data-action=zoom]').evaluate('(e)=>document.activeElement===e')
 card(2).locator('[data-action=rotate]').click()
 expect(card(2).locator('img')).to_have_attribute('data-turn','90')
 card(1).locator('[data-action=delete]').click()
 card(3).locator('.page-drag').drag_to(card(0))
 assert order()==[3,0,2]
 doc=download();assert [p.get_text().strip() for p in doc]==['B2','A1','B1'];assert [p.rotation for p in doc]==[0,90,90]
 page.locator('#editor-file').set_input_files(upload('gamma.pdf',pdf(['C1'])))
 expect(page.locator('.page-card')).to_have_count(4);assert order()==[3,0,2,4]
 assert page.locator('#editor-result a').count()==0
 # Invalid append is atomic: none of the new batch is added and old edits survive.
 page.locator('#editor-file').set_input_files([upload('valid.pdf',pdf(['NEW'])),upload('bad.pdf',b'bad')])
 expect(page.locator('#editor-feedback')).to_contain_text('Не удалось открыть')
 assert order()==[3,0,2,4]
 doc=download();assert [p.get_text().strip() for p in doc]==['B2','A1','B1','C1']
 page.locator('#editor-reset').click();assert order()==[0,1,2,3,4]
 doc=download();assert [p.get_text().strip() for p in doc]==['A1','A2','B1','B2','C1']
 assert [p.rotation for p in doc]==[90,0,0,0,0]
 # Capture shared card style with painted thumbnails.
 page.locator('#editor-pages').scroll_into_view_if_needed()
 for id in range(5):expect(card(id).locator('img')).to_have_attribute('data-turn','0')
 page.screenshot(path='work/merge-cards-desktop.png',full_page=True)
 page.set_viewport_size({'width':375,'height':812})
 card(0).scroll_into_view_if_needed()
 card(0).locator('[data-action=zoom]').click();expect(page.locator('#page-preview-dialog')).to_be_visible()
 page.locator('#page-preview-close').click();expect(page.locator('#page-preview-dialog')).not_to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='work/merge-cards-mobile.png')
 # Both pages use the same card controls, while organize replaces its document.
 page.goto(BASE+'/organize-pdf/')
 page.locator('#editor-file').set_input_files(upload('one.pdf',pdf(['ONE'])))
 expect(page.locator('.page-card')).to_have_count(1)
 assert page.locator('.page-overlay button').count()==3
 assert page.locator('[data-action=delete]').is_disabled()
 page.locator('#editor-file').set_input_files(upload('two.pdf',pdf(['TWO','THREE'])))
 expect(page.locator('.page-card')).to_have_count(2)
 assert page.locator('.page-source-name').all_text_contents()==['two.pdf','two.pdf']
 assert not errors,errors
 b.close()
print('PASS: visual merge cards, multi-file append, cross-file reorder/delete/rotate, atomic failure, reset, modal keyboard/mobile, independent PDF text and rotations')
