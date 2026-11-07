"""Mixed PDF/image import, browser decoding, and independently parsed output."""
import io
import tomllib
from pathlib import Path
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8000'
Path('work').mkdir(exist_ok=True)
def image(format,**kwargs):
 out=io.BytesIO();Image.new('RGB',(80,60),(255,0,0)).save(out,format=format,**kwargs);return out.getvalue()
def upload(name,data,mime):return {'name':name,'mimeType':mime,'buffer':data}
doc=fitz.open();doc.new_page(width=300,height=400).insert_text((40,40),'Original PDF text');pdf=doc.tobytes()
svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="red"/></svg>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1280,'height':1000})
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 context.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 def save():
  page.locator('#editor-save').click();link=page.locator('#editor-result a');expect(link).to_be_visible()
  with page.expect_download() as info:link.click()
  return fitz.open(stream=Path(info.value.path()).read_bytes(),filetype='pdf')
 page.goto(BASE+'/merge-pdf/')
 formats=[('PNG','png','image/png'),('JPEG','JPG','image/jpeg'),('WEBP','webp','image/webp'),('GIF','gif','image/gif'),('BMP','bmp','image/bmp'),('AVIF','avif','image/avif')]
 files=[upload('document.pdf',pdf,'application/pdf')]+[upload('image.'+ext,image(fmt),mime) for fmt,ext,mime in formats]+[upload('vector.svg',svg,'')]
 page.locator('#editor-file').set_input_files(files)
 expect(page.locator('.page-card')).to_have_count(8,timeout=20000)
 output=save();assert len(output)==8
 assert output[0].get_text().strip()=='Original PDF text'
 for index in range(1,8):
  page_pdf=output[index]
  assert abs(page_pdf.rect.width-80)<.1 and abs(page_pdf.rect.height-60)<.1
  r,g,b=page_pdf.get_pixmap().pixel(40,30)
  assert r>225 and g<35 and b<35,(index,r,g,b)
 # Imported images retain their names and work with the same page actions.
 assert page.locator('.page-source-name').all_text_contents()==[f['name'] for f in files]
 page.locator('[data-page-id="1"] [data-action=rotate]').click()
 page.locator('[data-page-id="2"] [data-action=delete]').click()
 output=save();assert len(output)==7 and output[1].rotation==90
 # Append transparency, EXIF orientation, and an animated GIF.
 transparent=io.BytesIO();Image.new('RGBA',(80,60),(0,0,0,0)).save(transparent,format='PNG')
 oriented=io.BytesIO();photo=Image.new('RGB',(20,30),'red');exif=Image.Exif();exif[274]=6;photo.save(oriented,format='JPEG',exif=exif)
 animated=io.BytesIO();Image.new('RGB',(80,60),'red').save(animated,format='GIF',save_all=True,append_images=[Image.new('RGB',(80,60),'blue')],duration=100,loop=0)
 page.locator('#editor-file').set_input_files([upload('transparent.png',transparent.getvalue(),'image/png'),upload('phone.jpg',oriented.getvalue(),'image/jpeg'),upload('animated.gif',animated.getvalue(),'image/gif')])
 expect(page.locator('.page-card')).to_have_count(10,timeout=15000)
 output=save();assert len(output)==10
 assert output[7].get_pixmap().pixel(40,30)==(255,255,255)
 assert output[8].rect.width==30 and output[8].rect.height==20
 assert output[9].get_pixmap().pixel(40,30)==(255,0,0)
 # Unsupported/corrupt formats fail atomically and keep the previous edits.
 for name,data,mime in [('bad.heic',b'not-heic','image/heic'),('bad.png',b'not-png','image/png')]:
  page.locator('#editor-file').set_input_files([upload('valid.png',image('PNG'),'image/png'),upload(name,data,mime)])
  expect(page.locator('#editor-feedback')).to_contain_text('Cannot open image',timeout=10000)
  assert page.locator('.page-card').count()==10
 # Per-image size and decoded-pixel limits reject without losing the workspace.
 page.locator('#editor-file').set_input_files(upload('large.png',b'0'*(20*1024*1024+1),'image/png'))
 expect(page.locator('#editor-feedback')).to_contain_text('20 MB')
 huge_svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="7000" height="6000"></svg>'
 page.locator('#editor-file').set_input_files(upload('huge.svg',huge_svg,'image/svg+xml'))
 expect(page.locator('#editor-feedback')).to_contain_text('40 megapixel')
 assert page.locator('.page-card').count()==10
 # Image-only merge works, as does image file dropping. Organizer remains PDF-only.
 page.goto(BASE+'/ru/merge-pdf/')
 page.locator('#editor-dropzone').evaluate('(e,bytes)=>{const d=new DataTransfer();for(const name of ["a.png","b.png"])d.items.add(new File([new Uint8Array(bytes)],name,{type:"image/png"}));e.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:d}));}',list(image('PNG')))
 expect(page.locator('.page-card')).to_have_count(2)
 output=save();assert len(output)==2
 page.goto(BASE+'/organize-pdf/')
 page.locator('#editor-file').set_input_files(upload('a.png',image('PNG'),'image/png'))
 expect(page.locator('#editor-feedback')).to_contain_text('Organize accepts one PDF')
 assert page.locator('#editor-workspace').is_hidden()
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: PDF + PNG/JPEG/WebP/GIF/BMP/AVIF/SVG, color/dimensions, alpha, EXIF, static animation, atomic errors, image limits, image-only/drop merge, PDF-only organizer')
