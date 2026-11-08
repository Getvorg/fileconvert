"""Check all localized routes, translation coverage, SEO and placeholder integrity."""
import json,re,html,subprocess
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
LOCALES=['en','ru','uk','de','it','es','pl','pt-BR','fr','ja','ko','id','tr','vi','nl','ar','zh-Hans','cs','ro','hu','el','th']
class Page(HTMLParser):
 def __init__(self,text):super().__init__();self.tags=[];self.text=[];self.feed(text)
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
 def handle_data(self,value):self.text.append(value.strip())
english=[]
for path in (ROOT/'dist').rglob('index.html'):
 if path.relative_to(ROOT/'dist').parts[0] not in LOCALES[1:]:english.append(path.relative_to(ROOT/'dist'))
assert len(english)==29
messages={lang:json.loads((ROOT/'locales'/f'{lang}.json').read_text()) for lang in LOCALES[2:]}
keys=set(messages['uk'])
for lang,dictionary in messages.items():
 assert set(dictionary)==keys,(lang,'missing keys')
 for key,value in dictionary.items():
  assert isinstance(value,str) and value.strip(),(lang,key)
  assert sorted(re.findall(r'\{\d+\}',key))==sorted(re.findall(r'\{\d+\}',value)),(lang,key)
  if 'FileConvert' in key:assert 'FileConvert' in value,(lang,key,value)
for relative in english:
 source=Page((ROOT/'dist'/relative).read_text())
 neutral={'File','Convert','English','Deutsch','Italiano','Español','Polski','Português (Brasil)','Français','Bahasa Indonesia','Türkçe','Tiếng Việt','Nederlands','Čeština','Română','Magyar','WebP','W','PDF','PNG','JPG','DPI'}
 for text in source.text:
  if re.search('[a-zA-Z]',text) and text not in neutral and not re.fullmatch(r'\d+ DPI',text):assert text in keys,('missing source text',text)

 for lang in LOCALES:
  prefix='' if lang=='en' else lang+'/'
  path=ROOT/'dist'/prefix/relative;raw=path.read_text();page=Page(raw)
  assert ('html',{'lang':lang,**({'dir':'rtl'} if lang=='ar' else {})}) in page.tags,(path,'lang')
  links=[attrs for tag,attrs in page.tags if tag=='a' and 'hreflang' in attrs]
  assert {a['hreflang'] for a in links}==set(LOCALES),(path,'language picker')
  assert sum(a.get('aria-current')=='page' for a in links)==1
  for a in links:
   assert (ROOT/'dist'/a['href'].lstrip('/')/'index.html').exists(),(path,a)
  for tag,attrs in page.tags:
   url=attrs.get('href','')
   if tag=='a' and url.startswith('/') and 'hreflang' not in attrs:
    route=url.split('#')[0];assert not route or route.startswith('/'+prefix),(path,url)
  assert raw.index('src="/i18n.js"')<raw.index('src="/workspace-ui.js"')
  if lang in messages:
   assert raw.index(f'src="/locales/{lang}.js"')<raw.index('src="/i18n.js"')
   values=page.text+[a[k] for tag,a in page.tags for k in ('aria-label','alt','title','placeholder','data-page-title') if k in a]+[a['content'] for tag,a in page.tags if tag=='meta' and a.get('name')=='description']
   for text in values:
    assert not (text in messages[lang] and messages[lang][text]!=text),(path,'untranslated',text)
  canonical=[a for tag,a in page.tags if tag=='link' and a.get('rel')=='canonical']
  if canonical:
   alternates=[a for tag,a in page.tags if tag=='link' and a.get('rel')=='alternate']
   assert {a['hreflang'] for a in alternates}==set(LOCALES+['x-default'])
   assert canonical[0]['href'].endswith('/'+prefix+str(relative.parent).replace('.','').strip('/')+('/' if relative.parent!=Path('.') else ''))
# Dynamic UI messages have translation patterns too. Never pass filenames through a DOM translator.
pattern=re.compile(r'(?:\bt|\btr|\.t)\(\s*(\x27(?:\\.|[^\x27\\])*\x27|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)',re.S)
for path in ROOT.glob('*.js'):
 if path.name in ('app.js','i18n.js'):continue
 for match in pattern.finditer(path.read_text()):
  literal=match[1];value=re.sub(r'\\([\x27"`\\])',r'\1',literal[1:-1]);index=[0]
  def placeholder(m):n=index[0];index[0]+=1;return '{'+str(n)+'}'
  if literal.startswith('`'):value=re.sub(r'\$\{[^}]+\}',placeholder,value)
  if re.search('[a-zA-Z]',value):assert value.strip() in keys,(path,value)
print('PASS: 638 localized pages, 20 complete dictionaries, dynamic placeholders, language links, asset order and SEO alternates')
