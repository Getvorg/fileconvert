"""Exercise localized guide navigation and ensure advice does not break tool exports."""
import json,subprocess,tomllib,io,zipfile
from pathlib import Path
import fitz
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
config=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {languages} from './scripts/localization.mjs';import {guides} from './scripts/seo-content.mjs';console.log(JSON.stringify({languages,guides:guides.map(g=>({slug:g.slug,tool:g.tool}))}))"]))
def pdf():
 doc=fitz.open()
 for n in range(2):doc.new_page().insert_text((40,50),'PAGE '+str(n+1))
 return doc.tobytes()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1360,'height':1000});page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(BASE) else None)
 headers=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']
 def host(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,**headers})
 context.route(BASE+'/**',host)
 for lang in config['languages']:
  prefix='/' if lang=='en' else '/'+lang+'/'
  page.goto(BASE+prefix+'guides/');expect(page.locator('.guide-list article')).to_have_count(3)
  for guide in config['guides']:
   page.locator('.guide-list a[href="'+prefix+'guides/'+guide['slug']+'/"]').click();expect(page.locator('.guide-article')).to_be_visible();expect(page.locator('.guide-contents a')).to_have_count(5)
   page.locator('.guide-tool-link').click();expect(page).to_have_url(BASE+prefix+guide['tool']+'/');expect(page.locator('.tool-advice')).to_be_visible()
   assert 'FileConvert' in page.title()
   page.locator('.tool-advice a[href="'+prefix+'guides/'+guide['slug']+'/"]').click();expect(page.locator('.guide-article h1')).to_be_visible()
   page.goto(BASE+prefix+'guides/')
  if lang in ['en','ru','ar']:
   page.goto(BASE+prefix+'split-pdf/');page.locator('#pdf-files').set_input_files({'name':'report.pdf','mimeType':'application/pdf','buffer':pdf()});expect(page.locator('[data-preview-page]')).to_have_count(2)
   page.locator('#pdf-run').click();expect(page.locator('#pdf-results a')).to_be_visible(timeout=20000)
   with page.expect_download() as download:page.locator('#pdf-results a').click()
   archive=zipfile.ZipFile(io.BytesIO(Path(download.value.path()).read_bytes()));assert len(archive.namelist())==2
   assert [fitz.open(stream=archive.read(name),filetype='pdf')[0].get_text().strip() for name in archive.namelist()]==['PAGE 1','PAGE 2']
  if lang in ['ru','de','ar','th']:
   page.set_viewport_size({'width':375,'height':812});page.goto(BASE+prefix+'guides/'+config['guides'][0]['slug']+'/');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='work/seo-guide-'+lang+'-mobile.png',full_page=True);page.set_viewport_size({'width':1360,'height':1000})
 assert not errors,errors
 assert not external,external
 browser.close()
print('PASS: guides and reciprocal tool links in 22 languages, actual split ZIP exports, RU/DE/AR/TH mobile layout, production CSP and local-only requests')
