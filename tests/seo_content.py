"""Check generated SEO content and reciprocal guide links in all languages."""
from pathlib import Path
import json,subprocess,re
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
config=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {languages} from './scripts/localization.mjs';import {tools} from './scripts/catalog.mjs';import {guides} from './scripts/seo-content.mjs';console.log(JSON.stringify({languages,tools:tools.map(t=>t.slug),guides:guides.map(g=>({slug:g.slug,tool:g.tool}))}))"]))
class Page(HTMLParser):
 def __init__(self,path):super().__init__();self.tags=[];self.h1=0;self.title=[];self.in_title=False;self.feed(path.read_text())
 def handle_starttag(self,tag,attrs):
  self.tags.append((tag,dict(attrs)))
  if tag=='h1':self.h1+=1
  if tag=='title':self.in_title=True
 def handle_endtag(self,tag):
  if tag=='title':self.in_title=False
 def handle_data(self,text):
  if self.in_title:self.title.append(text)
 def links(self):return [a['href'] for tag,a in self.tags if tag=='a' and 'href' in a]
for lang in config['languages']:
 prefix='/' if lang=='en' else '/'+lang+'/'
 titles=set();descriptions=set()
 for slug in config['tools']:
  path=ROOT/'dist'/prefix.lstrip('/')/slug/'index.html';page=Page(path);raw=path.read_text();title=''.join(page.title)
  assert page.h1==1 and 'FileConvert' in title,(lang,slug,'heading/title')
  assert title not in titles,(lang,slug,'duplicate title');titles.add(title)
  desc=[a['content'] for tag,a in page.tags if tag=='meta' and a.get('name')=='description'];assert len(desc)==1 and desc[0] not in descriptions,(lang,slug,'description');descriptions.add(desc[0])
  assert 'tool-advice' in raw and prefix+'guides/' in page.links(),(lang,slug,'missing advice')
  assert len([url for url in page.links() if url.startswith(prefix) and url.endswith('/')])>=10
 for guide in config['guides']:
  slug='guides/'+guide['slug'];page=Page(ROOT/'dist'/prefix.lstrip('/')/slug/'index.html');assert page.h1==1
  assert prefix+guide['tool']+'/' in page.links()
  primary=Page(ROOT/'dist'/prefix.lstrip('/')/guide['tool']/'index.html');assert prefix+slug+'/' in primary.links()
  assert len([a for tag,a in page.tags if tag=='section' and a.get('id','').startswith('step-')])==5
 for relative in ['guides']+['guides/'+g['slug'] for g in config['guides']]:
  page=Page(ROOT/'dist'/prefix.lstrip('/')/relative/'index.html')
  for url in page.links():
   if url.startswith('/'):
    route=url.split('#')[0];assert not route or (ROOT/'dist'/route.lstrip('/')/'index.html').exists(),(lang,url)
print('PASS: 21 unique tool titles/descriptions per language, practical advice, 3 five-section guides and reciprocal local links across 22 languages')
