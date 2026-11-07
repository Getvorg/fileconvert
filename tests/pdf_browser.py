"""Integration tests using system Chromium, Playwright, PyMuPDF and Pillow.
Run npm run build and npm start before this script.
"""
import io
import zipfile
import tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def document(labels, rotations=None):
    doc=fitz.open()
    for i,label in enumerate(labels):
        page=doc.new_page(width=300+i*10,height=400)
        page.insert_text((40,40),label)
        if rotations: page.set_rotation(rotations[i])
    return doc.tobytes()
def upload(name,data,mime='application/pdf'):
    return {'name':name,'mimeType':mime,'buffer':data}
def read(data): return fitz.open(stream=data,filetype='pdf')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
    def apply_host_headers(route):
        response=route.fetch()
        route.fulfill(response=response,headers={**response.headers,**headers})
    page.route(BASE+'/**',apply_host_headers)
    errors=[]; external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
    def visit(slug,ru=False):
        response=page.goto(BASE+('/ru/' if ru else '/')+slug+('/' if slug else ''))
        assert response.status==200
        assert page.locator('h1').count()==1
    def run():
        page.locator('#pdf-run').click()
        split=page.locator('[data-pdf-tool]').get_attribute('data-pdf-tool')=='split-pdf'
        expect(page.locator('#pdf-run')).to_have_text(('Split PDF' if split else 'Create PDF') if page.locator('html').get_attribute('lang')=='en' else ('Разделить PDF' if split else 'Создать PDF'))
    def output(index=0):
        link=page.locator('#pdf-results a').nth(index)
        expect(link).to_be_visible()
        with page.expect_download() as info: link.click()
        return Path(info.value.path()).read_bytes()
    for ru in [False,True]:
        for slug in ['', 'jpg-to-png','png-to-jpg','merge-pdf','split-pdf','rotate-pdf','jpg-to-pdf','organize-pdf','about','contact','privacy']:
            visit(slug,ru)
            assert page.locator('.tool-navigation').count()==1
            assert page.locator('html').get_attribute('lang')==('ru' if ru else 'en')
    visit('',True)
    assert page.locator('.tool-card:visible').count()==7
    page.locator('[data-filter=organize]').click()
    assert page.locator('.tool-card:visible').count()==3
    page.locator('[data-filter=all]').click()
    assert page.locator('.tool-card:visible').count()==7
    page.locator('.nav-group summary').first.click()
    expect(page.locator('.nav-menu').first).to_be_visible()
    page.keyboard.press('Escape')
    assert not page.locator('.nav-group').first.evaluate('(e)=>e.open')
    page.set_viewport_size({'width':1366,'height':900})
    page.screenshot(path='work/catalog-desktop.png',full_page=True)
    a=document(['A1','A2'],[90,0]); b=document(['B1'])
    visit('merge-pdf')
    page.locator('#editor-file').set_input_files(upload('a.pdf',a))
    expect(page.locator('#editor-workspace')).to_be_visible()
    assert page.locator('#editor-save').is_disabled()
    page.locator('#editor-file').set_input_files(upload('b.pdf',b))
    expect(page.locator('.page-card')).to_have_count(3)
    page.locator('[data-page-id="2"] .page-order-controls').evaluate('(e)=>e.open=true')
    position=page.locator('[data-page-id="2"] input[type=number]');position.fill('1');position.press('Tab')
    page.locator('#editor-save').click()
    link=page.locator('#editor-result a');expect(link).to_be_visible()
    with page.expect_download() as info: link.click()
    result=read(Path(info.value.path()).read_bytes())
    assert len(result)==3
    assert [x.get_text().strip() for x in result]==['B1','A1','A2']
    assert result[1].rotation==90
    page.locator('[data-page-id="0"] [data-action=delete]').click()
    assert page.locator('#editor-result a').count()==0
    visit('split-pdf',True)
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#split-mode').select_option('range')
    source=document(['one','two','three'])
    page.locator('#pdf-files').set_input_files(upload('source.pdf',source))
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#page-range').fill('3,1-2,3')
    run(); result=read(output())
    assert [x.get_text().strip() for x in result]==['three','one','two']
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#page-range').fill('0,4')
    run(); assert page.locator('#pdf-results a').count()==0
    assert 'Диапазон' in page.locator('#pdf-feedback').inner_text()
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#split-mode').select_option('each')
    assert page.locator('#range-settings').is_hidden()
    run(); assert page.locator('#pdf-results a').count()==1
    archive=zipfile.ZipFile(io.BytesIO(output()))
    assert len(archive.namelist())==3
    assert read(archive.read('page-002.pdf'))[0].get_text().strip()=='two'
    visit('rotate-pdf')
    page.locator('#pdf-files').set_input_files(upload('a.pdf',a))
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#page-range').fill('1');page.locator('#rotation').select_option('180')
    run();result=read(output())
    assert [x.rotation for x in result]==[270,0]
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#page-range').fill('');page.locator('#rotation').select_option('90')
    run();result=read(output());assert [x.rotation for x in result]==[180,90]
    # Encrypted and malformed PDFs must fail without providing a partial result.
    secret=fitz.open();secret.new_page();encrypted=secret.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,owner_pw='owner',user_pw='user')
    for name,data in [('locked.pdf',encrypted),('bad.pdf',b'not a PDF')]:
        page.locator('#pdf-files').set_input_files(upload(name,data));run()
        assert page.locator('#pdf-results a').count()==0
        assert 'Cannot open PDF' in page.locator('#pdf-feedback').inner_text()
    visit('rotate-pdf')
    oversized=document(['page']*501)
    page.locator('#pdf-files').set_input_files(upload('501-pages.pdf',oversized));run()
    assert page.locator('#pdf-results a').count()==0
    assert '500 pages' in page.locator('#pdf-feedback').inner_text()
    visit('merge-pdf')
    page.locator('#editor-file').set_input_files([upload('a.pdf',document(['A']*300)),upload('b.pdf',document(['B']*201))])
    expect(page.locator('#editor-feedback')).to_contain_text('500 pages')
    assert page.locator('#editor-result a').count()==0
    visit('jpg-to-pdf')
    image=io.BytesIO();Image.new('RGB',(120,80),'red').save(image,format='JPEG')
    page.locator('#pdf-files').set_input_files([upload('red.jpg',image.getvalue(),'image/jpeg'),upload('red2.jpg',image.getvalue(),'image/jpeg')])
    run();result=read(output())
    assert len(result)==2 and result[0].rect.width==120 and result[0].rect.height==80
    pix=result[0].get_pixmap(); assert pix.pixel(60,40)[0]>240
    page.locator('#tool-settings').evaluate('(e)=>e.open=true')
    page.locator('#page-size').select_option('a4');run();result=read(output())
    assert abs(result[0].rect.width-595.28)<0.1 and abs(result[0].rect.height-841.89)<0.1
    assert result[0].get_pixmap().pixel(0,0)==(255,255,255)
    # Drop input: accept a valid PDF without opening the picker.
    visit('rotate-pdf')
    data=list(b)
    page.locator('#pdf-dropzone').evaluate('(e,bytes)=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array(bytes)],"drop.pdf",{type:"application/pdf"}));e.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:d}));}',data)
    assert page.locator('#pdf-file-list li').count()==1
    # File names are rendered as text, not HTML.
    page.locator('#pdf-files').set_input_files(upload('<b>name</b>.pdf',b))
    assert page.locator('#pdf-file-list b').count()==0
    # Mobile directory and PDF tool have no horizontal overflow.
    page.set_viewport_size({'width':375,'height':812})
    for slug in ['', 'merge-pdf','split-pdf','rotate-pdf','jpg-to-pdf']:
        visit(slug,True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),slug
    visit('',True)
    page.locator('.nav-group summary').first.click()
    page.locator('.nav-menu a').first.click()
    assert page.url.endswith('/ru/organize-pdf/')
    visit('',True);page.screenshot(path='work/catalog-mobile.png',full_page=True)
    assert not errors,errors
    assert not external,external
    browser.close()
print('PASS: 22 routes, catalog filters/menu, merge order, split/ranges, relative rotations, JPG/A4, encrypted/damaged rejection, drops, mobile, no external requests')
