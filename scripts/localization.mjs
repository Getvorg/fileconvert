import fs from 'node:fs';
export const languages={en:'English',ru:'Русский',uk:'Українська',de:'Deutsch',it:'Italiano',es:'Español',pl:'Polski'};
export const dictionaries=Object.fromEntries(Object.keys(languages).filter(code=>!['en','ru'].includes(code)).map(code=>[code,JSON.parse(fs.readFileSync(new URL(`../locales/${code}.json`,import.meta.url),'utf8'))]));
export const localePrefix=code=>code==='en'?'/':`/${code}/`;
const decode=value=>value.replace(/&(?:amp|quot|lt|gt|apos|#39|nbsp|#\d+|#x[\da-f]+);/gi,entity=>({ '&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&apos;':"'",'&#39;':"'",'&nbsp;':'\u00a0' }[entity]??String.fromCodePoint(entity.startsWith('&#x')?parseInt(entity.slice(3),16):parseInt(entity.slice(2),10))));
const encode=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function localizeHtml(html,lang){
 const messages=dictionaries[lang];if(!messages)return html;
 const translate=value=>{const text=decode(value.trim());if(!Object.hasOwn(messages,text))return value;return value.slice(0,value.length-value.trimStart().length)+encode(messages[text])+value.slice(value.trimEnd().length);};
 return html.replace(/<[^>]*>|[^<]+/g,token=>token.startsWith('<')?token.replace(/\b(aria-label|title|alt|placeholder|content|data-page-title)="([^"]*)"/g,(_,key,value)=>`${key}="${translate(value)}"`).replace(/\b(id="stamp-text"[^>]*\bvalue|value)="SAMPLE"/g,(_,key)=>`${key}="${encode(messages.SAMPLE||'SAMPLE')}"`):translate(token));
}
