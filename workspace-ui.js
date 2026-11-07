'use strict';
(() => {
 const ru=document.documentElement.lang==='ru',t=(en,r)=>ru?r:en;
 const icons={zoom:'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',rotate:'M20 10a8 8 0 1 1-2.3-5.7M20 3v6h-6',delete:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7',previous:'M15 5l-7 7 7 7',next:'M9 5l7 7-7 7',undo:'M9 4L3 10l6 6M3 10h10a7 7 0 0 1 7 7'};
 function action(kind,label,click){
  const button=document.createElement('button');button.type='button';button.className='workspace-action';button.dataset.action=kind;button.setAttribute('aria-label',label);button.title=label;button.dataset.tooltip=label;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',icons[kind]||icons.rotate);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);button.append(svg);if(click)button.addEventListener('click',click);return button;
 }
 function decorate(button,kind,label){const icon=action(kind,label);button.replaceChildren(...icon.childNodes);button.classList.add('workspace-action');button.dataset.action=kind;button.title=label;button.dataset.tooltip=label;button.setAttribute('aria-label',label);}
 function history(){
  const states=[];
  return {get length(){return states.length;},clear(){states.length=0;},push(state){states.push(state);if(states.length>30)states.shift();let total=0;const seen=new Set();for(let i=states.length-1;i>=0;i--){for(const file of [...(states[i].files||[]),...(states[i].retainedFiles||[])]){if(!seen.has(file)){seen.add(file);total+=file.size;}}if(total>100*1024*1024){states.splice(0,i+1);break;}}},pop(){return states.pop();}};
 }
 function undoRow(before,handler){const row=document.createElement('div');row.className='workspace-undo-row';const button=action('undo',t('Undo last edit','Отменить последнее действие'),handler);button.id='workspace-undo';const text=document.createElement('span');text.textContent=t('Undo','Отменить');button.append(text);button.classList.add('secondary-button');row.append(button);before.before(row);return {button,row,update(length,busy=false){row.hidden=!length;button.disabled=busy||!length;}};}
 function bytes(value){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(2)} MB`;}
 function savePanel({root,button,results,name='result.pdf'}){
  const panel=document.createElement('aside');panel.className='save-panel';panel.setAttribute('aria-label',t('Save result','Сохранение результата'));
  const heading=document.createElement('h2');heading.textContent=t('Your result','Результат');
  const label=document.createElement('label');label.htmlFor='output-name';label.textContent=t('File name','Имя файла');
  const input=document.createElement('input');input.id='output-name';input.type='text';input.maxLength=160;input.value=name;input.autocomplete='off';
  const meta=document.createElement('p');meta.id='output-meta';meta.textContent=t('File size appears after processing.','Размер появится после обработки.');
  const progress=document.createElement('progress');progress.id='processing-progress';progress.max=100;progress.hidden=true;progress.setAttribute('aria-label',t('Processing progress','Ход обработки'));
  const stage=document.createElement('p');stage.id='processing-stage';stage.setAttribute('role','status');stage.setAttribute('aria-live','polite');
  button.remove();results.remove();
  const content=document.createElement('div');content.className='workspace-content';content.append(...root.childNodes);root.append(content,panel);root.classList.add('workspace-with-save');
  panel.append(heading,label,input,meta,progress,stage,button,results);
  let dirty=false,suggested=name,size=null;
  function outputName(defaultName=suggested){const extension=/\.[^.]+$/.exec(defaultName)?.[0]||'';let value=input.value.trim().replace(/[\\/\x00-\x1f\x7f]/g,'-').replace(/^\.+/,'').slice(0,140);if(!value)value=defaultName;value=value.replace(/\.(pdf|png|jpe?g|zip)$/i,'');return value+extension;}
  function rename(){if(size===null)return;const name=outputName(suggested);document.querySelectorAll('a[download]').forEach(link=>{link.download=name;if(link.classList.contains('download-button'))link.textContent=`↓ ${name}`;});const modalName=document.getElementById('modalFileName');if(modalName)modalName.textContent=name;meta.textContent=`${bytes(size)} · ${name}`;}
  input.addEventListener('input',()=>{dirty=true;rename();});
  return {panel,input,outputName,setDefault(value){suggested=value;if(!dirty)input.value=value;},invalidate(){size=null;meta.textContent=t('File size appears after processing.','Размер появится после обработки.');progress.hidden=true;stage.textContent='';},begin(message=t('Preparing…','Подготовка…')){input.disabled=true;progress.hidden=false;progress.removeAttribute('value');stage.textContent=message;},progress(done,total,message){progress.hidden=false;progress.max=total||1;progress.value=done;stage.textContent=message||t(`Pages: ${done} / ${total}`,`Страницы: ${done} / ${total}`);},wait(message){progress.hidden=false;progress.removeAttribute('value');stage.textContent=message;},complete(defaultName,count){suggested=defaultName;if(!dirty)input.value=defaultName;input.value=outputName(defaultName);size=count;input.disabled=false;progress.hidden=false;progress.max=100;progress.value=100;stage.textContent=t('Ready to download','Готово к скачиванию');rename();},fail(){input.disabled=false;progress.hidden=true;stage.textContent=t('Processing stopped. Check the message in the workspace.','Обработка остановлена. Проверьте сообщение в рабочей области.');},idle(){input.disabled=false;}};
 }
 let previewVersion=0,previewFocus=null,previewCancel=null;
 function dialog(){
  let node=document.getElementById('workspace-preview-dialog');if(node)return node;
  node=document.createElement('dialog');node.id='workspace-preview-dialog';node.className='shared-preview-dialog';node.setAttribute('aria-labelledby','workspace-preview-title');
  const header=document.createElement('div');header.className='preview-dialog-header';const title=document.createElement('h2');title.id='workspace-preview-title';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.id='workspace-preview-close';close.setAttribute('aria-label',t('Close preview','Закрыть просмотр'));header.append(title,close);
  const status=document.createElement('p');status.id='workspace-preview-status';status.setAttribute('role','status');const canvas=document.createElement('canvas');canvas.id='workspace-preview-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',t('Page preview','Просмотр страницы'));node.append(header,status,canvas);document.body.append(node);
  close.addEventListener('click',closePreview);node.addEventListener('cancel',event=>{event.preventDefault();closePreview();});node.addEventListener('click',event=>{if(event.target===node)closePreview();});return node;
 }
 function closePreview(){previewVersion++;previewCancel?.();previewCancel=null;const node=document.getElementById('workspace-preview-dialog');if(!node)return;const wasOpen=node.open;if(wasOpen)node.close();const canvas=node.querySelector('canvas');canvas.width=0;canvas.height=0;if(wasOpen&&previewFocus?.isConnected)previewFocus.focus();}
 async function openPreview(title,draw){const trigger=document.activeElement;closePreview();previewFocus=trigger;const version=++previewVersion,node=dialog();node.querySelector('h2').textContent=title;const status=node.querySelector('[role=status]');status.textContent=t('Loading preview…','Загрузка страницы…');node.showModal();node.querySelector('button').focus();try{await draw(node.querySelector('canvas'),()=>version===previewVersion,cancel=>{if(version===previewVersion)previewCancel=cancel;});if(version===previewVersion)status.textContent='';}catch{if(version===previewVersion)status.textContent=t('Preview unavailable.','Просмотр недоступен.');}}
 function openImage(url,title,angle=0){return openPreview(title,async(canvas,current)=>{const image=new Image();image.src=url;await image.decode();if(!current())return;const sideways=angle%180!==0,w=sideways?image.naturalHeight:image.naturalWidth,h=sideways?image.naturalWidth:image.naturalHeight,scale=Math.min(1,1200/w,1500/h);canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(image,-image.naturalWidth*scale/2,-image.naturalHeight*scale/2,image.naturalWidth*scale,image.naturalHeight*scale);});}
 function reorder(container,{selector,key,onMove,busy=()=>false}){
  let from=null;
  container.addEventListener('dragstart',event=>{const card=event.target.closest(selector);if(!card||busy()||event.target.closest('button,input'))return;from=key(card);event.dataTransfer.setData('text/plain',String(from));event.dataTransfer.effectAllowed='move';card.classList.add('is-dragging');});
  let touch=null;
  container.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||!event.target.closest('.page-drag')||busy())return;const card=event.target.closest(selector);if(!card)return;touch={id:event.pointerId,from:key(card),target:key(card),startX:event.clientX,startY:event.clientY,moved:false};event.target.setPointerCapture?.(event.pointerId);});
  container.addEventListener('pointermove',event=>{if(!touch||touch.id!==event.pointerId)return;if(Math.hypot(event.clientX-touch.startX,event.clientY-touch.startY)>8)touch.moved=true;if(!touch.moved)return;event.preventDefault();const card=document.elementFromPoint(event.clientX,event.clientY)?.closest(selector);container.querySelectorAll(selector).forEach(node=>node.classList.remove('is-drop-target'));if(card){touch.target=key(card);card.classList.add('is-drop-target');}if(event.clientY<70)window.scrollBy(0,-18);else if(event.clientY>innerHeight-70)window.scrollBy(0,18);});
  container.addEventListener('pointerup',event=>{if(!touch||touch.id!==event.pointerId)return;const state=touch;touch=null;container.querySelectorAll(selector).forEach(node=>node.classList.remove('is-drop-target'));if(state.moved&&state.from!==state.target&&!busy())onMove(state.from,state.target);});
  container.addEventListener('pointercancel',()=>{touch=null;container.querySelectorAll(selector).forEach(card=>card.classList.remove('is-drop-target'));});
  const clear=()=>{from=null;container.querySelectorAll(selector).forEach(card=>card.classList.remove('is-dragging','is-drop-target'));};
  container.addEventListener('dragover',event=>{const card=event.target.closest(selector);if(card&&from!==null&&!busy()){event.preventDefault();card.classList.add('is-drop-target');}});
  container.addEventListener('dragleave',event=>event.target.closest(selector)?.classList.remove('is-drop-target'));
  container.addEventListener('drop',event=>{const card=event.target.closest(selector);if(card&&from!==null&&!busy()){event.preventDefault();const first=from,last=key(card);clear();if(first!==last)onMove(first,last);}});container.addEventListener('dragend',clear);
 }
 window.FileWorkspace={formatBytes:bytes,action,decorate,history,undoRow,savePanel,openPreview,openImage,closePreview,reorder};
})();
