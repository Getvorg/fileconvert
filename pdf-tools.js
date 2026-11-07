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
 let files=[], urls=[], busy=false, previewFile=null;
 const imageUrls=new Map();
 function selectedPages(count){try{return new Set(indices(count));}catch{return new Set();}}
 const previews=jpg?null:new PDFThumbnails(get('pdf-page-previews'),{
  t:tr,
  selection:count=>split&&get('split-mode').value==='each'?new Set(Array.from({length:count},(_,i)=>i)):selectedPages(count),
  disabled:()=>busy||(split&&get('split-mode').value==='each'),
  angle:(index,count)=>tool==='rotate-pdf'&&selectedPages(count).has(index)?Number(get('rotation').value):0,
  onToggle:(index,count)=>{
   if(busy)return;
   const selected=selectedPages(count);
   if(selected.has(index)){if(selected.size===1){feedback.textContent=tr('Keep at least one page selected.','Оставьте хотя бы одну выбранную страницу.');return;}selected.delete(index);}else selected.add(index);
   get('page-range').value=[...selected].map(i=>i+1).join(',');invalidate();
  }
 });
 function clearResults() { urls.forEach(url=>URL.revokeObjectURL(url)); urls=[]; results.replaceChildren(); }
 function invalidate() { clearResults(); feedback.textContent=''; }
 function render() {
  list.replaceChildren();
  const loaded=files.length>0;
  get('pdf-dropzone').hidden=loaded;get('selection-help').hidden=loaded;get('pdf-stage-controls').hidden=!loaded;
  get('pdf-pick').disabled=busy;if(get('pdf-clear'))get('pdf-clear').disabled=busy;
  list.hidden=!loaded;
  get('pdf-page-previews').hidden=jpg||!loaded;
  for(const [file,url] of imageUrls){if(!files.includes(file)){URL.revokeObjectURL(url);imageUrls.delete(file);}}
  if(previews && files[0]!==previewFile){previewFile=files[0];void previews.setFile(previewFile);}
  previews?.refresh();
  files.forEach((file,index)=>{
   const item=document.createElement('li'), label=document.createElement('span');
   label.textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
   if(jpg){
    if(!imageUrls.has(file))imageUrls.set(file,URL.createObjectURL(file));
    const frame=document.createElement('div');frame.className='page-thumbnail';
    const img=document.createElement('img');img.src=imageUrls.get(file);img.alt=tr(`Preview: ${file.name}`,`Миниатюра: ${file.name}`);img.loading='lazy';frame.append(img);item.append(frame);
   }
   item.append(label);
   const controls=document.createElement('div');controls.className='file-controls';
   for(const [text,description,action,disabled] of [
    ['↑',tr('Move up','Переместить выше'),()=>{[files[index-1],files[index]]=[files[index],files[index-1]];},index===0],
    ['↓',tr('Move down','Переместить ниже'),()=>{[files[index+1],files[index]]=[files[index],files[index+1]];},index===files.length-1],
    ['×',tr('Remove','Удалить'),()=>files.splice(index,1),false]
   ]) {
    const button=document.createElement('button');button.type='button';button.textContent=text;
    button.setAttribute('aria-label',`${description}: ${file.name}`);button.disabled=busy||disabled;
    button.addEventListener('click',()=>{action();invalidate();render();if(!files.length){get('pdf-dropzone').focus();return;}const remaining=list.querySelectorAll('button:not(:disabled)');if(remaining.length) remaining[Math.min(index*3,remaining.length-1)].focus();else input.focus();});
    controls.append(button);
   }
   item.append(controls);list.append(item);
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
  files=next;render();
 }
 input.addEventListener('change',()=>{addFiles(input.files);input.value='';});
 get('pdf-pick').addEventListener('click',()=>input.click());
 get('pdf-clear')?.addEventListener('click',()=>{if(busy)return;files=[];invalidate();render();get('pdf-dropzone').focus();});
 const drop=get('pdf-dropzone');
 drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)input.click();}});
 for(const type of ['dragenter','dragover']) drop.addEventListener(type,e=>{e.preventDefault();if(!busy) drop.classList.add('dragging');});
 for(const type of ['dragleave','drop']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragging');});
 drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
 root.querySelectorAll('select,input[type=text]').forEach(control=>control.addEventListener('input',()=>{invalidate();previews?.refresh();}));
 get('split-mode')?.addEventListener('change',()=>{get('range-settings').hidden=get('split-mode').value==='each';previews?.refresh();});
 function indices(count) {
  const value=get('page-range').value.trim();
  if(!value) return Array.from({length:count},(_,i)=>i);
  const chosen=new Set();
  for(const part of value.split(',')) {
   const match=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
   if(!match) throw Error(tr('Use page numbers such as 1,3-5.','Укажите страницы в формате 1,3-5.'));
   const first=Number(match[1]), last=Number(match[2]||match[1]);
   if(first<1||last<first||last>count) throw Error(tr(`Page range must be between 1 and ${count}.`,`Диапазон страниц должен быть от 1 до ${count}.`));
   for(let n=first;n<=last;n++) chosen.add(n-1);
  }
  return [...chosen];
 }
 function download(bytes,name) {
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));urls.push(url);
  const link=document.createElement('a');link.href=url;link.download=name;link.className='download-button';link.textContent=`↓ ${name}`;results.append(link);
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
  for(const file of files) {
   let image;
   try {image=await doc.embedJpg(await file.arrayBuffer());}catch{throw Error(tr('Cannot open JPG. Check that the file is a valid JPEG image.','Не удалось открыть JPG. Проверьте, что это корректное JPEG-изображение.'));}
   if(image.width*image.height>40000000) throw Error(tr('JPG exceeds the 40 megapixel limit.','JPG превышает лимит 40 мегапикселей.'));
   const a4=get('page-size').value==='a4', width=a4?595.28:image.width, height=a4?841.89:image.height;
   const page=doc.addPage([width,height]), scale=a4?Math.min((width-48)/image.width,(height-48)/image.height):1;
   page.drawImage(image,{x:(width-image.width*scale)/2,y:(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
  }
  return doc.save();
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
  if(split&&get('split-mode').value==='each') {
   for(let index=0;index<source.getPageCount();index++) {
    const output=await PDFLib.PDFDocument.create(), [page]=await output.copyPages(source,[index]);output.addPage(page);
    download(await output.save(),`${base}-page-${index+1}.pdf`);
   }
  } else if(split) {
   const output=await PDFLib.PDFDocument.create(), pages=await output.copyPages(source,indices(source.getPageCount()));
   pages.forEach(page=>output.addPage(page));download(await output.save(),`${base}-extracted.pdf`);
  } else {
   const angle=Number(get('rotation').value);
   indices(source.getPageCount()).forEach(index=>{const page=source.getPage(index);page.setRotation(PDFLib.degrees((page.getRotation().angle+angle)%360));});
   download(await source.save(),`${base}-rotated.pdf`);
  }
 }
 run.addEventListener('click',async()=>{
  if(busy||run.disabled) return;
  busy=true;invalidate();
  root.querySelectorAll('input,select').forEach(control=>control.disabled=true);render();root.setAttribute('aria-busy','true');
  run.textContent=tr('Processing…','Обработка…');feedback.textContent=tr('Processing on your device…','Обработка на вашем устройстве…');
  try {
   if(!window.PDFLib) throw Error(tr('PDF library did not load. Reload the page.','Библиотека PDF не загрузилась. Перезагрузите страницу.'));
   await new Promise(resolve=>setTimeout(resolve,0));
   await processPdf();feedback.textContent=tr('Ready. Download and check your files.','Готово. Скачайте и проверьте файлы.');
  }catch(error){clearResults();feedback.textContent=error.message||tr('Could not process these files. Try a smaller document.','Не удалось обработать файлы. Попробуйте документ меньшего размера.');}
  finally{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('input,select').forEach(control=>control.disabled=false);run.textContent=tr('Create PDF','Создать PDF');render();if(results.firstElementChild) results.firstElementChild.focus();}
 });
 window.addEventListener('pagehide',clearResults);
})();
