"""Optional Google CMP wiring under production CSP; no real account/consent is simulated as certified."""
import os,subprocess,tomllib,atexit
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8000'
ROOT=Path(__file__).resolve().parents[1]
def build(**values):
 env={k:v for k,v in os.environ.items() if k not in ['GOOGLE_CMP_PUBLISHER_ID','CONTACT_EMAIL','SITE_URL']};env.update(values)
 subprocess.run(['npm','run','build'],cwd=ROOT,env=env,check=True,stdout=subprocess.DEVNULL)
atexit.register(build)
headers=tomllib.loads((ROOT/'netlify.toml').read_text())['headers'][0]['values']
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 build(SITE_URL='https://fileconvert-tool.netlify.app',CONTACT_EMAIL='support@example.test')
 context=browser.new_context();page=context.new_page();external=[];errors=[]
 context.on('request',lambda r:external.append(r.url) if r.url.startswith('https:') else None)
 def host(route):
  r=route.fetch();route.fulfill(response=r,headers={**r.headers,**headers})
 context.route(BASE+'/**',host);page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/ru/contact/');expect(page.locator('a[href="mailto:support@example.test"]')).to_be_visible();assert not page.locator('[data-consent-settings]').count()
 page.goto(BASE+'/ru/privacy/');assert 'Netlify' in page.locator('main').inner_text();assert 'после выбора хостинга' not in page.locator('main').inner_text();assert not external
 # A malformed publisher ID must stop the build before deleting existing output.
 invalid=subprocess.run(['node','--input-type=module','-e',"import {advertisingConfig} from './scripts/advertising.mjs';advertisingConfig({GOOGLE_CMP_PUBLISHER_ID:'https://evil.invalid'});"],cwd=ROOT,capture_output=True);assert invalid.returncode
 build(SITE_URL='https://fileconvert-tool.netlify.app',GOOGLE_CMP_PUBLISHER_ID='pub-0000000000000000')
 requests=[]
 def cmp(route):
  requests.append(route.request.url)
  route.fulfill(content_type='application/javascript',body="""window.revocations=0;googlefc.showRevocationMessage=()=>window.revocations++;const queue=googlefc.callbackQueue;queue.forEach(item=>item.CONSENT_API_READY?.());queue.push=function(item){item.CONSENT_API_READY?.();};""")
 context.route('https://fundingchoicesmessages.google.com/**',cmp)
 for prefix in ['','/ru','/de','/ar']:
  page.goto(BASE+prefix+'/privacy/');button=page.locator('[data-consent-settings]');expect(button).to_be_visible();expect(button).to_be_enabled();button.click();assert page.evaluate('window.revocations')==1;assert page.locator('iframe[name=googlefcPresent]').count()==1
  assert 'Google' in page.locator('main').inner_text();assert page.locator('a[href="https://policies.google.com/privacy"]').count()==1
 assert len(requests)==4 and not any('adsbygoogle' in u or 'doubleclick' in u for u in external)
 # Loading CMP must not add ads, change file processing or cause script errors.
 page.goto(BASE+'/merge-pdf/');expect(page.locator('#editor-dropzone')).to_be_visible();assert not errors,errors
 context.close();browser.close()
 # Restore the ordinary build for other checks.
 build()
print('PASS: truthful policy/contact, no CMP requests by default, validated optional publisher ID, official API queue/reopening/presence, no ad loader, EN/RU/DE/AR and CSP')
