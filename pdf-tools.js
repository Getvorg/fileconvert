import {zipSync} from '/vendor/fflate.mjs';
import {PDFThumbnails} from './pdf-thumbnails.js';
'use strict';
(() => {
 const root=document.querySelector('[data-pdf-tool]');
 if (!root) return;
 const ru=document.documentElement.lang==='ru', tr=(en,r)=>ru?r:en;
 const tool=root.dataset.pdfTool, jpg=tool==='jpg-to-pdf', merge=tool==='merge-pdf', split=tool==='split-pdf';
 const get=id=>document.getElementById(id);
 const input=get('pdf-files'), run=get('pdf-run'), list=get('pdf-file-list'), feedback=get('pdf-feedback'), results=get('pdf-results');
 const MAX_TOTAL=50*1024*1024;
 let files=[], urls=[], busy=false, previewFile=null, pageOrder=[];
 const savePanel=FileWorkspace.savePanel({root,button:run,results,name:jpg?'images.pdf':split?'document-pages.zip':'document-rotated.pdf'});
 const edits=FileWorkspace.history();let lastSettings={};
 const settings=()=>Object.fromEntries(['page-size','page-range','rotation','split-mode'].map(id=>[id,get(id)?.value]).filter(([,value])=>value!==undefined));
 const undo=FileWorkspace.undoRow(get('pdf-stage-controls'),()=>{
  if(busy||!edits.length)return;const state=edits.pop();files=[...state.files];
  if(previews&&files[0]!==previewFile){previewFile=files[0];void previews.setFile(previewFile);}
  imageTurns.clear();state.imageTurns.forEach(([f,a])=>imageTurns.set(f,a));pageTurns.clear();state.pageTurns.forEach(([i,a])=>pageTurns.set(i,a));removedPages.clear();state.removed.forEach(i=>removedPages.add(i));pageOrder=[...state.order];
  Object.entries(state.settings).forEach(([id,value])=>{if(get(id))get(id).value=value;});
  if(split)get('range-settings').hidden=get('split-mode').value==='each';invalidate();render();
 });
 function snapshot(){return {files:[...files],imageTurns:[...imageTurns],pageTurns:[...pageTurns],removed:[...removedPages],order:[...pageOrder],settings:settings()};}
 function remember(previous){const state=snapshot();if(previous)state.settings={...previous};edits.push(state);undo.update(edits.length,busy);}
 function defaultName(){const base=files[0]?.name.replace(/\.[^.]+$/,'')||'document';return jpg?'images.pdf':split?(get('split-mode').value==='each'?base+'-pages.zip':base+'-extracted.pdf'):base+'-rotated.pdf';}
 const imageUrls=new Map(), imageTurns=new Map(), pageTurns=new Map(), removedPages=new Set();
 const turn=index=>pageTurns.get(index)||0;
 const orderFor=count=>pageOrder.length===count?pageOrder:Array.from({length:count},(_,i)=>i);
 const remaining=count=>orderFor(count).filter(i=>!removedPages.has(i));
 function selectedPages(count){try{return new Set(indices(count));}catch{return new Set();}}
 const previews=jpg?null:new PDFThumbnails(get('pdf-page-previews'),{
  t:tr,
  selection:count=>split&&get('split-mode').value==='each'?new Set(remaining(count)):selectedPages(count),
  disabled:()=>busy||(split&&get('split-mode').value==='each'),
  order:count=>orderFor(count),onReady:count=>{if(pageOrder.length!==count)pageOrder=Array.from({length:count},(_,i)=>i);},
  onMove:(from,to)=>{if(busy)return;remember();const order=[...orderFor(previews.cards.length)],a=order.indexOf(from),b=order.indexOf(to);order.splice(b,0,...order.splice(a,1));pageOrder=order;if(split&&get('split-mode').value==='range'&&get('page-range').value.trim()){const selected=selectedPages(previews.cards.length);get('page-range').value=pageOrder.filter(i=>selected.has(i)).map(i=>i+1).join(',');}invalidate();previews.refresh();},
  busy:()=>busy,removed:index=>removedPages.has(index),
  angle:(index,count)=>(turn(index)+(tool==='rotate-pdf'&&selectedPages(count).has(index)?Number(get('rotation').value):0))%360,
  onRotate:index=>{remember();pageTurns.set(index,(turn(index)+90)%360);invalidate();},
  onDelete:(index,count)=>{if(remaining(count).length<=1)return;remember();removedPages.add(index);if(get('page-range').value.trim()&&!selectedPages(count).size)get('page-range').value='';invalidate();},
  onToggle:(index,count)=>{
   if(busy)return;
   const selected=selectedPages(count);
   if(selected.has(index)){if(selected.size===1){feedback.textContent=tr('Keep at least one page selected.','Оставьте хотя бы одну выбранную страницу.');return;}selected.delete(index);}else selected.add(index);
   remember();get('page-range').value=[...selected].map(i=>i+1).join(',');invalidate();
  }
 });
 function clearResults() { urls.forEach(url=>URL.revokeObjectURL(url)); urls=[]; results.replaceChildren();savePanel.invalidate(); }
 function invalidate() { clearResults();savePanel.invalidate();savePanel.setDefault(defaultName());lastSettings=settings(); feedback.textContent=''; }
 function render() {
  savePanel.setDefault(defaultName());undo.update(edits.length,busy);
  list.replaceChildren();
  const loaded=files.length>0;
  get('pdf-dropzone').hidden=loaded;get('selection-help').hidden=loaded;get('pdf-stage-controls').hidden=!loaded;
  get('pdf-pick').disabled=busy;if(get('pdf-reset-pages'))get('pdf-reset-pages').disabled=busy;if(get('pdf-clear'))get('pdf-clear').disabled=busy;
  list.hidden=!loaded;
  get('pdf-page-previews').hidden=jpg||!loaded;
  for(const [file,url] of imageUrls){if(!files.includes(file)){URL.revokeObjectURL(url);imageUrls.delete(file);imageTurns.delete(file);}}
  if(previews && files[0]!==previewFile){previewFile=files[0];removedPages.clear();pageTurns.clear();pageOrder=[];void previews.setFile(previewFile);}
  previews?.refresh();
  files.forEach((file,index)=>{
   const item=document.createElement('li'), label=document.createElement('span');
   item.classList.add('page-card');item.dataset.fileIndex=index;
   label.textContent=`${file.name} · ${FileWorkspace.formatBytes(file.size)}`;
   if(!jpg){item.classList.remove('page-card');item.append(label);list.append(item);return;}
   if(jpg){
    if(!imageUrls.has(file))imageUrls.set(file,URL.createObjectURL(file));
    const frame=document.createElement('div');frame.className='page-thumbnail turn-'+(imageTurns.get(file)||0);
    const img=document.createElement('img');img.src=imageUrls.get(file);img.alt=tr(`Preview: ${file.name}`,`Миниатюра: ${file.name}`);img.loading='lazy';img.draggable=false;frame.append(img);item.append(frame);
   }
   item.append(label);
   const controls=document.createElement('div');controls.className='file-controls card-move-controls';const overlay=document.createElement('div');overlay.className='page-overlay';
   if(jpg){const handle=document.createElement('span');handle.className='page-drag';handle.textContent='⠿';handle.draggable=!busy;handle.title=tr('Drag to reorder','Перетащите для изменения порядка');item.prepend(handle);}
   for(const [text,description,action,disabled] of [
    ['zoom',tr('Preview','Просмотр'),()=>FileWorkspace.openImage(imageUrls.get(file),file.name,imageTurns.get(file)||0),false],
    ['↑',tr('Move up','Переместить выше'),()=>{[files[index-1],files[index]]=[files[index],files[index-1]];},index===0],
    ['↓',tr('Move down','Переместить ниже'),()=>{[files[index+1],files[index]]=[files[index],files[index+1]];},index===files.length-1],
    ['↻',tr('Rotate','Повернуть'),()=>imageTurns.set(file,((imageTurns.get(file)||0)+90)%360),false],
    ['×',tr('Remove','Удалить'),()=>files.splice(index,1),false]
   ]) {
    const kind={zoom:'zoom','↑':'previous','↓':'next','↻':'rotate','×':'delete'}[text];
    const button=FileWorkspace.action(kind,`${description}: ${file.name}`,()=>{
     if(busy)return;if(kind==='zoom'){action();return;}remember();action();invalidate();render();if(!files.length){get('pdf-dropzone').focus();return;}
    });button.disabled=busy||disabled;(kind==='previous'||kind==='next'?controls:overlay).append(button);
   }
   item.append(overlay,controls);list.append(item);
  });
  run.disabled=busy||files.length<(merge?2:1);
 }
 function addFiles(incoming) {
  if(busy) return;
  invalidate();
  const batch=Array.from(incoming);
  const next=jpg||merge ? [...files,...batch] : batch;
  if(next.length>50 || (!jpg&&!merge&&next.length>1)) {feedback.textContent=tr('Select up to 50 files; this tool accepts one PDF at a time.','Выберите до 50 файлов; этот инструмент принимает один PDF за раз.');return;}
  if(next.some(f=>!f.size || (jpg ? !/\.jpe?g$/i.test(f.name) && f.type!=='image/jpeg' : !/\.pdf$/i.test(f.name) && f.type!=='application/pdf'))) {feedback.textContent=tr('Select non-empty files in the correct format.','Выберите непустые файлы нужного формата.');return;}
  if(next.reduce((sum,f)=>sum+f.size,0)>MAX_TOTAL || (jpg&&next.some(f=>f.size>20*1024*1024))) {feedback.textContent=tr('Limit: 50 MB total, JPG up to 20 MB each.','Лимит: 50 МБ всего, JPG до 20 МБ каждое.');return;}
  remember();files=next;render();
 }
 input.addEventListener('change',()=>{addFiles(input.files);input.value='';});
 get('pdf-reset-pages')?.addEventListener('click',()=>{if(busy)return;remember();removedPages.clear();pageTurns.clear();pageOrder=[];get('page-range').value='';invalidate();previews?.refresh();});
 get('pdf-pick').addEventListener('click',()=>input.click());
 get('pdf-clear')?.addEventListener('click',()=>{if(busy)return;remember();files=[];invalidate();render();get('pdf-dropzone').focus();});
 const drop=get('pdf-dropzone');
 drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)input.click();}});
 for(const type of ['dragenter','dragover']) drop.addEventListener(type,e=>{e.preventDefault();if(!busy) drop.classList.add('dragging');});
 for(const type of ['dragleave','drop']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragging');});
 drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
 root.querySelectorAll('#page-size,#page-range,#rotation,#split-mode').forEach(control=>control.addEventListener('input',()=>{remember(lastSettings);invalidate();previews?.refresh();}));
 get('split-mode')?.addEventListener('change',()=>{get('range-settings').hidden=get('split-mode').value==='each';previews?.refresh();});
 function indices(count) {
  const value=get('page-range').value.trim();
  if(!value)return remaining(count);
  const chosen=new Set();
  for(const part of value.split(',')) {
   const match=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
   if(!match) throw Error(tr('Use page numbers such as 1,3-5.','Укажите страницы в формате 1,3-5.'));
   const first=Number(match[1]), last=Number(match[2]||match[1]);
   if(first<1||last<first||last>count) throw Error(tr(`Page range must be between 1 and ${count}.`,`Диапазон страниц должен быть от 1 до ${count}.`));
   for(let n=first;n<=last;n++) chosen.add(n-1);
  }
  const result=[...chosen].filter(i=>!removedPages.has(i));
  if(!result.length)throw Error(tr('Select at least one remaining page.','Выберите хотя бы одну оставшуюся страницу.'));
  return result;
 }
 function download(bytes,name,mime='application/pdf') {
  const suggested=name;name=savePanel.outputName(suggested);
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));urls.push(url);
  const link=document.createElement('a');link.href=url;link.download=name;link.className='download-button';link.textContent=`↓ ${name}`;results.append(link);savePanel.complete(suggested,bytes.length);
 }
 async function loadPdf(file) {
  try {
   const doc=await PDFLib.PDFDocument.load(await file.arrayBuffer());
   if(!doc.getPageCount()) throw Error('empty');
   if(doc.getPageCount()>500) throw Error('limit');
   return doc;
  } catch(e) {
   if(e.message==='limit') throw Error(tr('Limit: 500 pages per document.','Лимит: 500 страниц на документ.'));
   throw Error(tr('Cannot open PDF: it may be encrypted, damaged or empty.','Не удалось открыть PDF: он может быть зашифрован, повреждён или пуст.'));
  }
 }
 async function createFromImages() {
  const doc=await PDFLib.PDFDocument.create();
  let processed=0;for(const file of files) {
   let image;
   try {image=await doc.embedJpg(await file.arrayBuffer());}catch{throw Error(tr('Cannot open JPG. Check that the file is a valid JPEG image.','Не удалось открыть JPG. Проверьте, что это корректное JPEG-изображение.'));}
   if(image.width*image.height>40000000) throw Error(tr('JPG exceeds the 40 megapixel limit.','JPG превышает лимит 40 мегапикселей.'));
   const a4=get('page-size').value==='a4', width=a4?595.28:image.width, height=a4?841.89:image.height;
   const page=doc.addPage([width,height]), scale=a4?Math.min((width-48)/image.width,(height-48)/image.height):1;
   page.drawImage(image,{x:(width-image.width*scale)/2,y:(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale});page.setRotation(PDFLib.degrees(imageTurns.get(file)||0));savePanel.progress(++processed,files.length);await new Promise(resolve=>setTimeout(resolve,0));
  }
  savePanel.wait(tr('Writing PDF…','Запись PDF…'));return doc.save();
 }
 async function processPdf() {
  if(jpg) {download(await createFromImages(),'images.pdf');return;}
  if(merge) {
   const output=await PDFLib.PDFDocument.create();
   for(const file of files) {
    const source=await loadPdf(file);
    if(output.getPageCount()+source.getPageCount()>500) throw Error(tr('The merged document exceeds 500 pages.','Объединённый документ превышает 500 страниц.'));
    const pages=await output.copyPages(source,source.getPageIndices());pages.forEach(page=>output.addPage(page));
   }
   download(await output.save(),'merged.pdf');return;
  }
  const source=await loadPdf(files[0]), base=files[0].name.replace(/\.pdf$/i,'');
  const applyTurn=(page,index)=>page.setRotation(PDFLib.degrees((page.getRotation().angle+turn(index))%360));
  if(split&&get('split-mode').value==='each') {
   const archive=Object.create(null);
   // Simple ASCII entry names are safe on every ZIP extractor; original page numbers stay stable.
   const chosen=remaining(source.getPageCount());let processed=0;for(const index of chosen) {
    const output=await PDFLib.PDFDocument.create(), [page]=await output.copyPages(source,[index]);applyTurn(page,index);output.addPage(page);
    archive[`page-${String(index+1).padStart(3,'0')}.pdf`]=await output.save();savePanel.progress(++processed,chosen.length);if(processed%5===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   savePanel.wait(tr('Packaging ZIP…','Упаковка ZIP…'));await new Promise(resolve=>setTimeout(resolve,0));
   download(zipSync(archive,{level:0}),`${base}-pages.zip`,'application/zip');
  } else if(split) {
   const chosen=indices(source.getPageCount());
   const output=await PDFLib.PDFDocument.create(), pages=await output.copyPages(source,chosen);
   pages.forEach((page,index)=>{applyTurn(page,chosen[index]);output.addPage(page);});download(await output.save(),`${base}-extracted.pdf`);
  } else {
   const angle=Number(get('rotation').value), selected=new Set(indices(source.getPageCount()));
   for(const index of remaining(source.getPageCount())){const page=source.getPage(index);page.setRotation(PDFLib.degrees((page.getRotation().angle+turn(index)+(selected.has(index)?angle:0))%360));}
   const output=await PDFLib.PDFDocument.create();const chosen=remaining(source.getPageCount()),copied=await output.copyPages(source,chosen);copied.forEach(page=>output.addPage(page));savePanel.progress(chosen.length,chosen.length);savePanel.wait(tr('Writing PDF…','Запись PDF…'));
   download(await output.save(),`${base}-rotated.pdf`);
  }
 }
 if(split)get('range-settings').hidden=get('split-mode').value==='each';
 run.addEventListener('click',async()=>{
  if(busy||run.disabled) return;
  busy=true;invalidate();savePanel.begin();
  root.querySelectorAll('input,select').forEach(control=>control.disabled=true);render();root.setAttribute('aria-busy','true');
  run.textContent=tr('Processing…','Обработка…');feedback.textContent=tr('Processing on your device…','Обработка на вашем устройстве…');
  try {
   if(!window.PDFLib) throw Error(tr('PDF library did not load. Reload the page.','Библиотека PDF не загрузилась. Перезагрузите страницу.'));
   await new Promise(resolve=>setTimeout(resolve,0));
   await processPdf();feedback.textContent=tr('Ready. Download and check your files.','Готово. Скачайте и проверьте файлы.');
  }catch(error){clearResults();savePanel.fail();feedback.textContent=error.message||tr('Could not process these files. Try a smaller document.','Не удалось обработать файлы. Попробуйте документ меньшего размера.');}
  finally{busy=false;savePanel.idle();root.removeAttribute('aria-busy');root.querySelectorAll('input,select').forEach(control=>control.disabled=false);run.textContent=split?tr('Split PDF','Разделить PDF'):tr('Create PDF','Создать PDF');render();if(results.firstElementChild) results.firstElementChild.focus();}
 });
 FileWorkspace.reorder(list,{selector:'li[data-file-index]',key:card=>Number(card.dataset.fileIndex),busy:()=>busy,onMove:(from,to)=>{remember();files.splice(to,0,...files.splice(from,1));invalidate();render();}});
 lastSettings=settings();
 window.addEventListener('pagehide',clearResults);
})();
