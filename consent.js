'use strict';
// Uses Google's published Privacy & messaging API, not a custom consent banner.
(() => {
 const publisher=document.currentScript?.dataset.publisher;
 if(!/^pub-\d{16}$/.test(publisher||''))return;
 const t=(en,ru)=>FileI18n.t(en,ru),controls=[...document.querySelectorAll('[data-consent-settings]')],statuses=[...document.querySelectorAll('[data-consent-status]')];
 const status=message=>statuses.forEach(node=>node.textContent=message);
 window.googlefc=window.googlefc||{};googlefc.callbackQueue=googlefc.callbackQueue||[];
 controls.forEach(control=>{control.hidden=false;control.disabled=true;control.addEventListener('click',()=>{googlefc.callbackQueue.push({CONSENT_API_READY:()=>{try{googlefc.showRevocationMessage();status('');}catch{status(t('Privacy settings are unavailable. Please reload the page.','Настройки конфиденциальности недоступны. Обновите страницу.'));}}});});});
 googlefc.callbackQueue.push({CONSENT_API_READY:()=>{controls.forEach(control=>control.disabled=false);status('');}});
 // Presence signal included in Google's message tag. It stores no consent itself.
 if(!window.frames.googlefcPresent){const frame=document.createElement('iframe');frame.name='googlefcPresent';frame.title='Google Privacy & messaging';frame.hidden=true;frame.setAttribute('aria-hidden','true');document.body.append(frame);}
 const script=document.createElement('script');script.async=true;script.src=`https://fundingchoicesmessages.google.com/i/${publisher}?ers=1`;
 script.addEventListener('error',()=>status(t('Privacy settings are unavailable. Please reload the page.','Настройки конфиденциальности недоступны. Обновите страницу.')));
 document.head.append(script);
 // No AdSense loader, ad requests or consent defaults are installed by this file.
})();
