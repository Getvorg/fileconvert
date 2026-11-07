"""Visual page editor integration: Playwright, system Chromium, PyMuPDF, Pillow.
Run npm run build and npm start before running this script.
"""
import base64
import io
import re
import tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def fixture(labels=('ONE','TWO','THREE','FOUR'),rotations=(0,90,0,270)):
    doc=fitz.open()
    for n,text in enumerate(labels):
        page=doc.new_page(width=300,height=400)
        page.draw_rect(fitz.Rect(20,20,100,100),color=(0,0,0),fill=(1,0,0))
        page.insert_text((40,150),text,fontsize=26)
        page.set_rotation(rotations[n] if n<len(rotations) else 0)
    return doc.tobytes()
def upload(name,data): return {'name':name,'mimeType':'application/pdf','buffer':data}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000})
    headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
    def host_headers(route):
        response=route.fetch()
        route.fulfill(response=response,headers={**response.headers,**headers})
    context.route(BASE+'/**',host_headers)
    page=context.new_page()
    errors=[];external=[];failures=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
    context.on('response',lambda r:failures.append(r.url) if r.status>=400 and not r.url.endswith('favicon.ico') else None)
    def card(id): return page.locator(f'.page-card[data-page-id="{id}"]')
    def order(): return page.locator('.page-card').evaluate_all('(nodes)=>nodes.map(n=>Number(n.dataset.pageId))')
    def open_file(data,name='source.pdf',ru=False):
        page.goto(BASE+('/ru/' if ru else '/')+'organize-pdf/')
        page.locator('#editor-file').set_input_files(upload(name,data))
        expect(page.locator('#editor-workspace')).to_be_visible()
    def thumb(id):
        card(id).scroll_into_view_if_needed()
        expect(card(id).locator('img')).to_have_attribute('src', re.compile('blob:'))
        page.wait_for_function('(id)=>{const i=document.querySelector(`[data-page-id="${id}"] img`);return i.complete&&i.naturalWidth>0}',arg=id)
    def save():
        page.locator('#editor-save').click()
        link=page.locator('#editor-result a');expect(link).to_be_visible()
        with page.expect_download() as info: link.click()
        return fitz.open(stream=Path(info.value.path()).read_bytes(),filetype='pdf')
    source=fixture()
    open_file(source)
    assert order()==[0,1,2,3]
    thumb(0)
    # The preview is an actual painted page containing non-white image pixels.
    encoded=card(0).locator('img').evaluate("i=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return c.toDataURL().split(',')[1]}")
    image=Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGB')
    assert any(r>180 and g<90 and b<90 for r,g,b in (image.getpixel((x,y)) for y in range(image.height) for x in range(image.width)))
    card(0).locator('.page-drag').drag_to(card(2))
    assert order()==[1,2,0,3]
    card(0).locator('[data-action=rotate]').click()
    expect(card(0).locator('img')).to_have_attribute('data-turn','90')
    page.wait_for_function('()=>{const i=document.querySelector("[data-page-id=\\"0\\"] img");return i.complete && i.naturalWidth>i.naturalHeight}')
    card(1).locator('input[type=checkbox]').check();card(3).locator('input[type=checkbox]').check()
    page.locator('#editor-delete-selected').click()
    assert order()==[2,0]
    output=save()
    assert [p.get_text().strip() for p in output]==['THREE','ONE']
    assert [p.rotation for p in output]==[0,90]
    # Editing after saving must invalidate the old download.
    card(2).locator('[data-action=rotate]').click()
    assert page.locator('#editor-result a').count()==0
    page.locator('#editor-undo').click();page.locator('#editor-undo').click()
    assert order()==[1,2,0,3]
    page.locator('#editor-reset').click()
    assert order()==[0,1,2,3]
    output=save();assert [p.rotation for p in output]==[0,90,0,270]
    page.locator('#editor-select-all').click()
    assert page.locator('#editor-delete-selected').is_disabled()
    page.locator('#editor-rotate-selected').click()
    output=save();assert [p.rotation for p in output]==[90,180,90,0]
    page.locator('#editor-select-none').click()
    assert page.locator('#editor-rotate-selected').is_disabled()
    # Deleting individual pages cannot remove the final page.
    for id in [3,2,1]:card(id).locator('[data-action=delete]').click()
    assert order()==[0] and card(0).locator('[data-action=delete]').is_disabled()
    page.locator('#editor-undo').click();assert order()==[0,1]
    # Replace source rapidly; no edits or previews from the previous file may survive.
    page.locator('#editor-file').set_input_files(upload('replace.pdf',fixture(('NEW',),(0,))))
    expect(page.locator('#editor-filename')).to_have_text('replace.pdf');assert order()==[0]
    output=save();assert len(output)==1 and output[0].get_text().strip()=='NEW'
    # Reject both malformed and encrypted PDFs without stale export links.
    locked=fitz.open();locked.new_page();encrypted=locked.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,owner_pw='owner',user_pw='password')
    for name,data in [('bad.pdf',b'not-pdf'),('locked.pdf',encrypted)]:
        page.locator('#editor-file').set_input_files(upload(name,data))
        expect(page.locator('#editor-feedback')).to_contain_text('Cannot open PDF')
        assert page.locator('#editor-workspace').is_hidden() and page.locator('#editor-result a').count()==0
    page.locator('#editor-file').set_input_files(upload('501.pdf',fixture(['page']*501)))
    expect(page.locator('#editor-feedback')).to_contain_text('1–500')
    # Mobile/keyboard alternatives to dragging, with original rotation preserved.
    page.set_viewport_size({'width':375,'height':812})
    open_file(source,ru=True)
    thumb(0)
    card(0).locator('[data-action=next]').click();assert order()==[1,0,2,3]
    position=card(3).locator('input[type=number]');position.fill('1');position.press('Tab')
    assert order()==[3,1,0,2]
    position=card(3).locator('input[type=number]');position.fill('9');position.press('Tab')
    expect(page.locator('#editor-feedback')).to_contain_text('Введите позицию')
    assert order()==[3,1,0,2]
    output=save();assert [p.get_text().strip() for p in output]==['FOUR','TWO','ONE','THREE']
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='work/organizer-mobile.png',full_page=True)
    page.set_viewport_size({'width':320,'height':812})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Lazy rendering: a 60-page document does not render all previews upfront.
    page.set_viewport_size({'width':1280,'height':900})
    open_file(fixture(['page']*60,()),name='long.pdf')
    thumb(0)
    assert page.locator('.page-thumbnail img[src]').count()<25
    thumb(59)
    assert page.locator('.page-thumbnail img[src]').count()<25
    # Drag-and-drop upload and recovery after failure.
    page.goto(BASE+'/ru/organize-pdf/')
    page.locator('#editor-dropzone').evaluate('(e,bytes)=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array(bytes)],"drop.pdf",{type:"application/pdf"}));e.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:d}));}',list(source))
    expect(page.locator('#editor-workspace')).to_be_visible();thumb(0)
    page.screenshot(path='work/organizer-desktop.png',full_page=True)
    # The catalog and existing PDF tools link to the visual editor in both languages.
    for prefix in ['/', '/ru/']:
        page.goto(BASE+prefix)
        assert page.locator(f'.tool-card[href="{prefix}organize-pdf/"]').count()==1
        page.goto(BASE+prefix+'rotate-pdf/')
        assert page.locator(f'.editor-link a[href="{prefix}organize-pdf/"]').count()==1
    assert not errors,errors
    assert not external,external
    assert not failures,failures
    browser.close()
print('PASS: painted lazy thumbnails under CSP, drag ordering, page/bulk deletion and rotation, undo/reset, PDF content/rotation, replacement/error recovery, mobile/keyboard, local assets')
