// Lazy page previews for split/rotate; file processing remains in pdf-tools.js.
export class PDFThumbnails {
 constructor(container, options) {
  this.container=container; this.options=options; this.version=0; this.task=null; this.doc=null; this.cards=[];this.queue=[];this.rendering=false;this.visible=new Set();
  this.observer=new IntersectionObserver(entries=>{for(const entry of entries){const index=Number(entry.target.dataset.previewPage)-1;if(entry.isIntersecting){this.visible.add(index);this.enqueue(index);}else{this.visible.delete(index);this.release(this.cards[index]);}}},{rootMargin:'300px'});
 }
 release(card){if(!card)return;const img=card.querySelector('img');if(img.dataset.url)URL.revokeObjectURL(img.dataset.url);img.removeAttribute('src');delete img.dataset.url;delete img.dataset.angle;}
 clear(){this.version++;this.observer.disconnect();this.cards.forEach(card=>this.release(card));this.cards=[];this.visible.clear();this.queue=[];this.container.replaceChildren();const old=this.task;this.task=null;this.doc=null;void old?.destroy().catch(()=>{});}
 async setFile(file){
  this.clear();if(!file)return;const version=this.version;
  const loading=document.createElement('p');loading.textContent=this.options.t('Loading page previews…','Загрузка миниатюр страниц…');this.container.append(loading);
  try{
   const pdfjs=await import('/vendor/pdfjs/pdf.mjs');if(version!==this.version)return;
   pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
   const bytes=new Uint8Array(await file.arrayBuffer());if(version!==this.version)return;
   this.task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
   const doc=await this.task.promise;if(version!==this.version)return;this.doc=doc;
   if(doc.numPages>500)throw Error('limit');
   this.container.replaceChildren();
   for(let index=0;index<doc.numPages;index++){
    const card=document.createElement('li');card.className='page-card';card.dataset.previewPage=index+1;
    const label=document.createElement('label');label.className='preview-page-choice';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label',this.options.t(`Use page ${index+1}`,`Использовать страницу ${index+1}`));
    checkbox.addEventListener('change',()=>{this.options.onToggle(index,doc.numPages);this.refresh();});
    label.append(checkbox,document.createTextNode(this.options.t(`Page ${index+1}`,`Страница ${index+1}`)));
    const frame=document.createElement('div');frame.className='page-thumbnail';
    const img=document.createElement('img');img.alt=this.options.t(`Preview of page ${index+1}`,`Миниатюра страницы ${index+1}`);
    const status=document.createElement('span');status.className='thumbnail-status';frame.append(img,status);
    const actions=document.createElement('div');actions.className='page-overlay';
    for(const [action,text,title] of [['rotate','↻',this.options.t('Rotate page','Повернуть страницу')],['delete','×',this.options.t('Delete page','Удалить страницу')]]){
     const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.action=action;button.title=title;button.setAttribute('aria-label',`${title} ${index+1}`);
     button.addEventListener('click',()=>{if(this.options.busy())return;action==='rotate'?this.options.onRotate(index):this.options.onDelete(index,doc.numPages);this.refresh();});actions.append(button);
    }
    card.append(label,actions,frame);this.cards.push(card);this.container.append(card);this.observer.observe(card);
   }
   this.refresh();
  }catch{if(version===this.version){this.container.replaceChildren();const message=document.createElement('p');message.textContent=this.options.t('Preview unavailable. Check that the PDF is not encrypted or damaged.','Миниатюры недоступны. Проверьте, что PDF не зашифрован и не повреждён.');this.container.append(message);}}
 }
 refresh(){
  const count=this.cards.length, selected=this.options.selection(count), remaining=this.cards.filter((_,i)=>!this.options.removed(i)).length;
  for(let index=0;index<count;index++){
   const card=this.cards[index], removed=this.options.removed(index), checkbox=card.querySelector('input');card.hidden=removed;
   checkbox.checked=selected.has(index);checkbox.disabled=this.options.disabled();card.classList.toggle('is-selected',checkbox.checked);
   card.querySelector('[data-action=rotate]').disabled=this.options.busy();card.querySelector('[data-action=delete]').disabled=this.options.busy()||remaining<=1;
   if(removed){this.visible.delete(index);this.release(card);}else if(this.visible.has(index))this.enqueue(index);
  }
 }

 enqueue(index){if(!this.queue.includes(index))this.queue.push(index);void this.render();}
 async render(){
  if(this.rendering)return;this.rendering=true;
  try{while(this.queue.length){
   const index=this.queue.shift(), card=this.cards[index], doc=this.doc, version=this.version;
   if(!card||!doc||!this.visible.has(index)||this.options.removed(index))continue;
   const angle=this.options.angle(index,this.cards.length),img=card.querySelector('img');if(img.dataset.angle===String(angle))continue;
   const status=card.querySelector('.thumbnail-status');status.textContent=this.options.t('Loading preview…','Загрузка миниатюры…');
   let page,canvas;
   try{
    page=await doc.getPage(index+1);if(version!==this.version)continue;
    const natural=page.getViewport({scale:1,rotation:(page.rotate+angle)%360});const scale=Math.min(210/natural.width,250/natural.height);
    if(!Number.isFinite(scale)||scale<=0)throw Error('size');
    const viewport=page.getViewport({scale,rotation:(page.rotate+angle)%360});canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('blob');
    if(version!==this.version||!this.visible.has(index)||this.cards[index]!==card||this.options.angle(index,this.cards.length)!==angle)continue;
    this.release(card);img.dataset.url=URL.createObjectURL(blob);img.src=img.dataset.url;img.dataset.angle=String(angle);status.textContent='';
   }catch{if(version===this.version)status.textContent=this.options.t('Preview unavailable.','Миниатюра недоступна.');}
   finally{if(canvas){canvas.width=0;canvas.height=0;}try{page?.cleanup();}catch{}}
  }}finally{this.rendering=false;}
 }
}
