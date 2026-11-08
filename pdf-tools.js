import {appendPages} from './pdf-page-actions.js';
import {LiveStampPreview} from './live-stamp.js';
import {zipSync} from '/vendor/fflate.mjs';
import {PDFThumbnails} from './pdf-thumbnails.js';
'use strict';
(() => {
 const root=document.querySelector('[data-pdf-tool]');
 if (!root) return;
 const tr=(en,r)=>FileI18n.t(en,r);
 const tool=root.dataset.pdfTool, png=tool==='png-to-pdf',raster=tool==='pdf-to-jpg'||tool==='pdf-to-png',jpg=tool==='jpg-to-pdf'||png, merge=tool==='merge-pdf', split=tool==='split-pdf';
 const stamps=tool==='number-pdf'||tool==='watermark-pdf';
 const extra=['number-pdf','watermark-pdf','extract-images','compress-pdf'].includes(tool);
 const pageEditing=['split-pdf','rotate-pdf','number-pdf','watermark-pdf','pdf-to-jpg','pdf-to-png'].includes(tool);
 const get=id=>document.getElementById(id);
 const input=get('pdf-files'), run=get('pdf-run'), list=get('pdf-file-list'), feedback=get('pdf-feedback'), results=get('pdf-results');
 const runLabel=run.textContent;
 const MAX_TOTAL=50*1024*1024;
 let files=[], urls=[], busy=false, previewFile=null, pageOrder=[],lastStampFile=null,activeIndex=0,documentEdits=new Map(),live=null;
 const savePanel=FileWorkspace.savePanel({root,button:run,results,name:jpg?'images.pdf':raster?'document-images.zip':split?'document-pages.zip':'document-rotated.pdf'});
 const edits=FileWorkspace.history();let lastSettings={};
 const settings=()=>Object.fromEntries([...new Set(['page-size','page-range','rotation','split-mode','render-dpi',...Array.from(root.querySelectorAll('[data-extra-option]')).map(el=>el.id)])].map(id=>[id,get(id)?.value]).filter(([,value])=>value!==undefined));
 const undo=FileWorkspace.undoRow(get('pdf-stage-controls'),()=>{
  if(busy||!edits.length)return;const state=edits.pop();files=[...state.files];activeIndex=state.activeIndex||0;documentEdits=new Map(state.documentEdits||[]);
  if(previews&&files[activeIndex]!==previewFile){previewFile=files[activeIndex];previews.ready=previews.setFile(previewFile);}
  imageTurns.clear();state.imageTurns.forEach(([f,a])=>imageTurns.set(f,a));pageTurns.clear();state.pageTurns.forEach(([i,a])=>pageTurns.set(i,a));removedPages.clear();state.removed.forEach(i=>removedPages.add(i));pageOrder=[...state.order];
  if(get('stamp-image')){const transfer=new DataTransfer();if(state.stampFile)transfer.items.add(state.stampFile);get('stamp-image').files=transfer.files;lastStampFile=state.stampFile||null;}
  Object.entries(state.settings).forEach(([id,value])=>{if(get(id))get(id).value=value;});
  if(split)get('range-settings').hidden=get('split-mode').value==='each';invalidate();render();
 });
 function snapshot(){storeDocumentEdits();return {activeIndex,documentEdits:[...documentEdits],files:[...files],stampFile:get('stamp-image')?.files[0]||null,retainedFiles:get('stamp-image')?.files[0]?[get('stamp-image').files[0]]:[],imageTurns:[...imageTurns],pageTurns:[...pageTurns],removed:[...removedPages],order:[...pageOrder],settings:settings()};}
 function remember(previous){const state=snapshot();if(previous)state.settings={...previous};edits.push(state);undo.update(edits.length,busy);}
 function defaultName(){const base=files[activeIndex]?.name.replace(/\.[^.]+$/,'')||'document';return stamps&&files.length>1?'stamped-documents.zip':extra?base+'-'+(tool==='extract-images'?'images.zip':'result.pdf'):jpg?'images.pdf':raster?base+'-images.zip':split?(get('split-mode').value==='each'?base+'-pages.zip':base+'-extracted.pdf'):base+'-rotated.pdf';}
 let insertAfter=0;const insertInput=document.createElement('input');insertInput.type='file';insertInput.multiple=true;insertInput.accept='application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp';insertInput.className='sr-only';insertInput.tabIndex=-1;insertInput.disabled=!pageEditing;insertInput.setAttribute('aria-label',tr('Insert files after page','Вставить файлы после страницы'));insertInput.id='pdf-insert-files';root.append(insertInput);insertInput.addEventListener('change',()=>{const incoming=[...insertInput.files];insertInput.value='';if(incoming.length)void editPages('insert',insertAfter,incoming);});
 async function editPages(kind,index,inputs=[]){
  if(busy||!files[activeIndex]||!previews?.cards.length)return;const previous=snapshot(),old=files[activeIndex],selected=selectedPages(previews.cards.length),range=get('page-range').value;busy=true;render();feedback.dataset.state='working';feedback.textContent=tr('Preparing…','Подготовка…');
  try{if(inputs.length+files.length>50)throw Error();const result=await appendPages(old,{kind,index,inputs,t:tr,maxBytes:MAX_TOTAL-files.filter((_,i)=>i!==activeIndex).reduce((n,f)=>n+f.size,0)});edits.push(previous);const order=[...orderFor(result.count)],at=order.indexOf(index);order.splice(at<0?order.length:at+1,0,...result.added);pageOrder=order;result.added.forEach(id=>{pageTurns.set(id,kind==='duplicate'?turn(index):0);selected.add(id);});if(range.trim())get('page-range').value=order.filter(id=>selected.has(id)).map(id=>id+1).join(',');files[activeIndex]=result.file;documentEdits.delete(old);previewFile=result.file;previews.ready=previews.setFile(result.file);await previews.ready;invalidate();
  }catch{feedback.dataset.state='error';feedback.textContent=tr('Could not add pages. Use supported PDFs or images within the file and page limits. Current edits are kept.','Не удалось добавить страницы. Проверьте формат PDF или изображений и лимиты файлов и страниц. Текущие изменения сохранены.');}
  finally{busy=false;render();}
 }
 const imageUrls=new Map(), imageTurns=new Map(), pageTurns=new Map(), removedPages=new Set();
 const turn=index=>pageTurns.get(index)||0;
 const orderFor=count=>pageOrder.length===count?pageOrder:Array.from({length:count},(_,i)=>i);
 const remaining=count=>orderFor(count).filter(i=>!removedPages.has(i));
 function selectedPages(count){try{return new Set(indices(count));}catch{return new Set();}}
 const previews=jpg?null:new PDFThumbnails(get('pdf-page-previews'),{
  t:tr,
  selectable:()=>tool!=='compress-pdf'&&!(split&&get('split-mode').value==='each'),
  onPageAction:pageEditing?(kind,index)=>{if(kind==='insert'){insertAfter=index;insertInput.click();}else void editPages(kind,index);}:null,
  selection:count=>tool==='compress-pdf'||(split&&get('split-mode').value==='each')?new Set(remaining(count)):selectedPages(count),
  disabled:()=>busy||tool==='compress-pdf'||(split&&get('split-mode').value==='each'),
  order:count=>orderFor(count),onReady:count=>{if(pageOrder.length!==count)pageOrder=Array.from({length:count},(_,i)=>i);live?.request();},
  onMove:(from,to)=>{if(busy)return;remember();const order=[...orderFor(previews.cards.length)],a=order.indexOf(from),b=order.indexOf(to);order.splice(b,0,...order.splice(a,1));pageOrder=order;if((raster||(split&&get('split-mode').value==='range'))&&get('page-range').value.trim()){const selected=selectedPages(previews.cards.length);get('page-range').value=pageOrder.filter(i=>selected.has(i)).map(i=>i+1).join(',');}invalidate();previews.refresh();},
  busy:()=>busy,removed:index=>removedPages.has(index),
  angle:(index,count)=>(turn(index)+(tool==='rotate-pdf'&&selectedPages(count).has(index)?Number(get('rotation').value):0))%360,
  onRotate:index=>{remember();pageTurns.set(index,(turn(index)+90)%360);invalidate();},
  onDelete:(index,count)=>{if(remaining(count).length<=1)return;remember();removedPages.add(index);if(get('page-range').value.trim()&&!selectedPages(count).size)get('page-range').value='';invalidate();},
  onToggle:(index,count)=>{
   if(busy)return;
   const selected=selectedPages(count);
   if(selected.has(index)){if(selected.size===1){feedback.dataset.state='error';feedback.textContent=tr('Keep at least one page selected.','Оставьте хотя бы одну выбранную страницу.');return;}selected.delete(index);}else selected.add(index);
   remember();get('page-range').value=[...selected].map(i=>i+1).join(',');invalidate();
  }
 });
 function captureDocument(){return {order:[...pageOrder],turns:[...pageTurns],removed:[...removedPages],range:get('page-range')?.value||''};}
 function storeDocumentEdits(){if(stamps&&files[activeIndex])documentEdits.set(files[activeIndex],captureDocument());}
 function restoreDocument(file){const state=documentEdits.get(file);pageOrder=state?[...state.order]:[];pageTurns.clear();removedPages.clear();state?.turns.forEach(([i,a])=>pageTurns.set(i,a));state?.removed.forEach(i=>removedPages.add(i));if(stamps)get('page-range').value=state?.range||'';}
 function indicesFor(state,count){const order=state.order.length===count?state.order:Array.from({length:count},(_,i)=>i),removed=new Set(state.removed);if(!state.range.trim())return order.filter(i=>!removed.has(i));const result=new Set();for(const part of state.range.split(',')){const m=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);if(!m)throw Error(tr('Invalid page range.','Некорректный диапазон страниц.'));const start=Number(m[1]),end=Number(m[2]||m[1]);if(start<1||end<start||end>count)throw Error(tr('Page range exceeds document length.','Диапазон превышает число страниц документа.'));for(let i=start;i<=end;i++)if(!removed.has(i-1))result.add(i-1);}if(!result.size)throw Error(tr('Choose at least one page.','Выберите хотя бы одну страницу.'));return [...result];}
 if(stamps){live=new LiveStampPreview({tool,helper:previews,file:()=>files[activeIndex],status:get('live-preview-status'),t:tr,state:count=>({order:remaining(count),selected:indices(count),turns:new Map(pageTurns),settings:settings(),imageFile:get('stamp-image')?.files[0]})});}
 function clearResults() { urls.forEach(url=>URL.revokeObjectURL(url)); urls=[]; results.replaceChildren();savePanel.invalidate(); }
 function invalidate() { clearResults();savePanel.invalidate();savePanel.setDefault(defaultName());lastSettings=settings();storeDocumentEdits();live?.request(); feedback.removeAttribute('data-state');feedback.textContent=''; }
 if(split){const mode=get('split-mode').closest('.pdf-settings'),primary=document.createElement('div');primary.className='primary-tool-options';mode.before(primary);primary.append(mode);get('pdf-page-previews').before(primary);}
 if(jpg){const options=document.createElement('div');options.className='lab-options image-options';options.append(get('page-size').closest('.pdf-settings'));savePanel.panel.querySelector('label').before(options);}
 if(extra&&root.querySelector('.lab-options')){const options=root.querySelector('.lab-options');options.classList.add('stamp-options');savePanel.panel.querySelector('label').before(options);}
 if(tool==='rotate-pdf'){const rotateAll=document.createElement('button');rotateAll.id='rotate-all';rotateAll.hidden=true;rotateAll.type='button';rotateAll.className='secondary-button rotate-all-pages';rotateAll.textContent=tr('Rotate all pages','Повернуть все страницы');rotateAll.addEventListener('click',()=>{if(busy||!previews.cards.length)return;remember();remaining(previews.cards.length).forEach(index=>pageTurns.set(index,(turn(index)+90)%360));invalidate();previews.refresh();});get('pdf-stage-controls').after(rotateAll);}
 if(stamps){get('batch-document').closest('label').hidden=true;root.querySelector('.batch-preview-help').hidden=true;}
 function syncExtraOptions(){
  if(get('stamp-position'))for(const id of ['stamp-x','stamp-y'])get(id).closest('.pdf-settings').hidden=get('stamp-position').value!=='custom';
  if(get('stamp-kind')){const image=get('stamp-kind').value==='image';get('stamp-image').closest('.pdf-settings').hidden=!image;get('stamp-text').closest('.pdf-settings').hidden=image;get('stamp-color').closest('.pdf-settings').hidden=image;get('stamp-size').labels[0].textContent=image?tr('Image width (%)','Ширина изображения (%)'):tr('Text size','Размер текста');get('stamp-size').min=image?'1':'6';get('stamp-size').max=image?'90':'144';}
  if(get('compress-mode')){get('range-settings').hidden=true;const raster=get('compress-mode').value==='raster';get('compress-quality').closest('.pdf-settings').hidden=!raster;get('compress-dpi').closest('.pdf-settings').hidden=!raster;}
  get('tool-settings').hidden=![...get('tool-settings').querySelectorAll('.pdf-settings')].some(field=>!field.hidden);
 }
 function render() {
  insertInput.disabled=busy||!pageEditing;
  syncExtraOptions();
  savePanel.setDefault(defaultName());undo.update(edits.length,busy);
  list.replaceChildren();
  const loaded=files.length>0;
  get('pdf-dropzone').hidden=loaded;get('selection-help').hidden=loaded;get('pdf-stage-controls').hidden=!loaded;
  if(get('rotate-all')){get('rotate-all').hidden=!loaded;get('rotate-all').disabled=busy;}
  const batchHelp=root.querySelector('.batch-preview-help');if(batchHelp)batchHelp.hidden=files.length<2;
  get('pdf-pick').disabled=busy;if(get('batch-remove')){get('batch-remove').disabled=busy;get('batch-remove').hidden=files.length<2;}if(get('batch-document')){const picker=get('batch-document');picker.replaceChildren();files.forEach((file,i)=>{const option=document.createElement('option');option.value=i;option.textContent=file.name;picker.append(option);});picker.value=activeIndex;picker.disabled=busy;picker.closest('label').hidden=files.length<2;}if(get('pdf-reset-pages'))get('pdf-reset-pages').disabled=busy;if(get('pdf-clear'))get('pdf-clear').disabled=busy;
  list.hidden=!loaded||(stamps&&files.length>1);
  if(stamps)get('pdf-clear').textContent=files.length>1?tr('Remove all PDFs','Удалить все PDF'):tr('Remove PDF','Удалить PDF');
  get('pdf-page-previews').hidden=jpg||!loaded;
  for(const [file,url] of imageUrls){if(!files.includes(file)){URL.revokeObjectURL(url);imageUrls.delete(file);imageTurns.delete(file);}}
  if(previews && files[activeIndex]!==previewFile){previewFile=files[activeIndex];removedPages.clear();pageTurns.clear();pageOrder=[];if(stamps)restoreDocument(previewFile);previews.ready=previews.setFile(previewFile);}
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
    ['zoom',tr('Preview','Просмотр'),()=>FileWorkspace.openImages(files.map(f=>({url:imageUrls.get(f),title:f.name,angle:imageTurns.get(f)||0})),index),false],
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
  const next=jpg||merge||stamps ? [...files,...batch] : batch;
  if(next.length>50 || (!jpg&&!merge&&!stamps&&next.length>1)) {feedback.textContent=tr('Select up to 50 files; this tool accepts one PDF at a time.','Выберите до 50 файлов; этот инструмент принимает один PDF за раз.');return;}
  if(next.some(f=>!f.size || (jpg ? (png?!/\.png$/i.test(f.name)&&f.type!=='image/png':!/\.jpe?g$/i.test(f.name)&&f.type!=='image/jpeg') : !/\.pdf$/i.test(f.name) && f.type!=='application/pdf'))) {feedback.textContent=tr('Select non-empty files in the correct format.','Выберите непустые файлы нужного формата.');return;}
  if(next.reduce((sum,f)=>sum+f.size,0)>MAX_TOTAL || (jpg&&next.some(f=>f.size>20*1024*1024))) {feedback.textContent=tr('Limit: 50 MB total, JPG up to 20 MB each.','Лимит: 50 МБ всего, JPG до 20 МБ каждое.');return;}
  remember();files=next;render();
 }
 input.addEventListener('change',()=>{addFiles(input.files);input.value='';});
 get('pdf-reset-pages')?.addEventListener('click',()=>{if(busy)return;remember();removedPages.clear();pageTurns.clear();pageOrder=[];get('page-range').value='';invalidate();previews?.refresh();});
 get('batch-remove')?.addEventListener('click',()=>{if(busy||!files.length)return;remember();documentEdits.delete(files[activeIndex]);files.splice(activeIndex,1);activeIndex=Math.max(0,Math.min(activeIndex,files.length-1));render();invalidate();});
 get('batch-document')?.addEventListener('change',event=>{if(busy)return;remember();storeDocumentEdits();activeIndex=Number(event.target.value);render();invalidate();});
 get('stamp-image')?.addEventListener('change',()=>{const state=snapshot();state.stampFile=lastStampFile;state.retainedFiles=lastStampFile?[lastStampFile]:[];edits.push(state);lastStampFile=get('stamp-image').files[0]||null;invalidate();render();});
 get('pdf-pick').addEventListener('click',()=>input.click());
 get('pdf-clear')?.addEventListener('click',()=>{if(busy)return;remember();files=[];activeIndex=0;documentEdits=new Map();invalidate();render();get('pdf-dropzone').focus();});
 const drop=get('pdf-dropzone');
 drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)input.click();}});
 for(const type of ['dragenter','dragover']) drop.addEventListener(type,e=>{e.preventDefault();if(!busy) drop.classList.add('dragging');});
 for(const type of ['dragleave','drop']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragging');});
 drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
 root.querySelectorAll('#page-size,#page-range,#rotation,#split-mode,#render-dpi,[data-extra-option]').forEach(control=>control.addEventListener('input',()=>{remember(lastSettings);invalidate();syncExtraOptions();previews?.refresh();}));
 get('split-mode')?.addEventListener('change',()=>{get('range-settings').hidden=get('split-mode').value==='each';syncExtraOptions();previews?.refresh();});
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
   throw Error(file.name+': '+tr('Cannot open PDF: it may be encrypted, damaged or empty.','Не удалось открыть PDF: он может быть зашифрован, повреждён или пуст.'));
  }
 }
 async function createFromImages() {
  const doc=await PDFLib.PDFDocument.create();
  let processed=0;for(const file of files) {
   let image;
   try {const data=await file.arrayBuffer();if(png&&data.byteLength>=24){const view=new DataView(data);if(view.getUint32(0)===0x89504e47&&view.getUint32(16)*view.getUint32(20)>40000000)throw Error('pixel-limit');}image=png?await doc.embedPng(data):await doc.embedJpg(data);}catch(error){if(error.message==='pixel-limit')throw Error(tr('Image exceeds 40 megapixels.','Изображение превышает 40 мегапикселей.'));throw Error(tr('Cannot open image. Check the file format.','Не удалось открыть изображение. Проверьте формат файла.'));}
   if(image.width*image.height>40000000) throw Error(tr('JPG exceeds the 40 megapixel limit.','JPG превышает лимит 40 мегапикселей.'));
   const a4=get('page-size').value==='a4',fit=Math.min(1,14400/image.width,14400/image.height),width=a4?595.28:image.width*fit,height=a4?841.89:image.height*fit;
   const page=doc.addPage([width,height]), scale=a4?Math.min((width-48)/image.width,(height-48)/image.height):fit;
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
  const source=await loadPdf(files[activeIndex]), base=files[activeIndex].name.replace(/\.pdf$/i,'');
  if(raster){
   const chosen=indices(source.getPageCount());if(chosen.length>100)throw Error(tr('Export up to 100 pages at a time.','Экспортируйте до 100 страниц за раз.'));
   await previews.ready;if(!previews.doc)throw Error(tr('Cannot render this PDF.','Не удалось отрисовать PDF.'));
   const archive=Object.create(null),ext=tool==='pdf-to-png'?'png':'jpg',mime=ext==='png'?'image/png':'image/jpeg';let total=0,done=0;
   for(const index of chosen){
    const page=await previews.doc.getPage(index+1),viewport=page.getViewport({scale:Number(get('render-dpi').value)/72,rotation:(page.rotate+turn(index))%360});
    if(!Number.isFinite(viewport.width*viewport.height)||Math.ceil(viewport.width)*Math.ceil(viewport.height)>40000000)throw Error(tr('Rendered page exceeds 40 megapixels. Choose lower DPI.','Страница превышает 40 мегапикселей. Уменьшите DPI.'));
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    try{
     await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.9));if(!blob)throw Error(tr('Image encoding failed.','Не удалось сохранить изображение.'));
     total+=blob.size;if(total>200*1024*1024)throw Error(tr('Images exceed 200 MB. Export fewer pages or lower DPI.','Изображения превышают 200 МБ. Выберите меньше страниц или уменьшите DPI.'));
     archive[`page-${String(index+1).padStart(3,'0')}.${ext}`]=new Uint8Array(await blob.arrayBuffer());savePanel.progress(++done,chosen.length);await new Promise(resolve=>setTimeout(resolve,0));
    }finally{canvas.width=0;canvas.height=0;try{page.cleanup();}catch{}}
   }
   savePanel.wait(tr('Packaging images…','Упаковка изображений…'));await new Promise(resolve=>setTimeout(resolve,0));download(zipSync(archive,{level:0}),`${base}-images.zip`,'application/zip');return;
  }
  if(extra){
   await previews.ready;if(!previews.doc)throw Error(tr('Preview unavailable. Check your PDF.','Предпросмотр недоступен. Проверьте PDF.'));
   const {processExtra}=await import('./pdf-extras.js');
   if(stamps&&files.length>1){
    storeDocumentEdits();const archive=Object.create(null);let total=0,totalPages=0;
    for(let i=0;i<files.length;i++){
     const file=files[i],doc=await loadPdf(file),state=documentEdits.get(file)||{order:[],removed:[],turns:[],range:''};const order=(state.order.length===doc.getPageCount()?state.order:Array.from({length:doc.getPageCount()},(_,n)=>n)).filter(n=>!state.removed.includes(n)),selected=indicesFor(state,doc.getPageCount()),turns=new Map(state.turns);
     totalPages+=doc.getPageCount();if(totalPages>500)throw Error(tr('Batch exceeds 500 source pages.','Пакет превышает 500 исходных страниц.'));
     const progress={progress(done,count){savePanel.progress(i+done/count,files.length,`${file.name} · ${done}/${count}`);},wait(message){savePanel.wait(`${file.name} · ${message}`);}};
     let out;try{out=await processExtra({tool,source:doc,preview:null,chosen:selected,order,turn:n=>turns.get(n)||0,panel:progress,t:tr,file});}catch(error){throw Error(file.name+': '+error.message);}
     total+=out.bytes.length;if(total>200*1024*1024)throw Error(tr('Batch output exceeds 200 MB.','Пакетный результат превышает 200 МБ.'));
     const safe=file.name.replace(/\.pdf$/i,'').replace(/[\/\\\x00-\x1f]/g,'-').slice(0,70)||'document';archive[`${String(i+1).padStart(3,'0')}-${safe}-${tool==='number-pdf'?'numbered':'watermarked'}.pdf`]=out.bytes;savePanel.progress(i+1,files.length,tr(`Documents: ${i+1}/${files.length}`,`Документы: ${i+1}/${files.length}`));await new Promise(r=>setTimeout(r,0));
    }
    savePanel.wait(tr('Packaging documents…','Упаковка документов…'));download(zipSync(archive,{level:0}),'stamped-documents.zip','application/zip');return;
   }
   const cached=live?.cached();const result=cached||await processExtra({tool,source,preview:previews.doc,chosen:indices(source.getPageCount()),order:remaining(source.getPageCount()),turn,panel:savePanel,t:tr,file:files[activeIndex]});
   download(result.bytes,result.name,result.mime);if(tool==='compress-pdf')feedback.textContent=`${FileWorkspace.formatBytes(files[activeIndex].size)} → ${FileWorkspace.formatBytes(result.bytes.length)} · `+(result.bytes.length<files[activeIndex].size?tr('Reduced','Размер уменьшен'):tr('No size reduction','Размер не уменьшился'));return;
  }
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
  run.textContent=tr('Processing…','Обработка…');feedback.dataset.state='working';feedback.textContent='';
  try {
   if(!window.PDFLib) throw Error(tr('PDF library did not load. Reload the page.','Библиотека PDF не загрузилась. Перезагрузите страницу.'));
   await new Promise(resolve=>setTimeout(resolve,0));
   await processPdf();feedback.dataset.state='success';
  }catch(error){clearResults();savePanel.fail();feedback.dataset.state='error';feedback.textContent=error.message||tr('Could not process these files. Try a smaller document.','Не удалось обработать файлы. Попробуйте документ меньшего размера.');}
  finally{busy=false;savePanel.idle();root.removeAttribute('aria-busy');root.querySelectorAll('input,select').forEach(control=>control.disabled=false);run.textContent=runLabel;render();if(results.firstElementChild) results.firstElementChild.focus();}
 });
 FileWorkspace.reorder(list,{selector:'li[data-file-index]',key:card=>Number(card.dataset.fileIndex),busy:()=>busy,onMove:(from,to)=>{remember();files.splice(to,0,...files.splice(from,1));invalidate();render();}});
 syncExtraOptions();lastSettings=settings();
 window.addEventListener('pagehide',clearResults);
})();
