'use strict';
// Dictionaries are bundled locally; translating never sends visitor data to a service.
(() => {
 const lang=document.documentElement.lang, messages=window.FileLocale||{};
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=Object.entries(messages).filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>{
  const indices=[];let offset=0,pattern='^';
  for(const match of key.matchAll(/\{(\d+)\}/g)){pattern+=escape(key.slice(offset,match.index))+'([\\s\\S]+?)';indices.push(Number(match[1]));offset=match.index+match[0].length;}
  return {regex:new RegExp(pattern+escape(key.slice(offset))+'$'),indices,value,weight:key.replace(/\{\d+\}/g,'').length};
 }).sort((a,b)=>b.weight-a.weight);
 function t(en,ru){
  if(lang==='ru')return ru??en;if(lang==='en')return en;
  if(Object.hasOwn(messages,en))return messages[en];
  const trimmed=en.trim();if(Object.hasOwn(messages,trimmed))return en.slice(0,en.length-en.trimStart().length)+messages[trimmed]+en.slice(en.trimEnd().length);
  for(const {regex,indices,value} of patterns){const match=regex.exec(en);if(match){const values=new Map(indices.map((id,i)=>[id,match[i+1]]));return value.replace(/\{(\d+)\}/g,(token,id)=>values.get(Number(id))??token);}}
  return en;
 }
 window.FileI18n={t,lang};
})();
