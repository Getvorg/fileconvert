import {zipSync} from '/vendor/fflate.mjs';
const root=document.querySelector('[data-image-lab]');
const mode=root.dataset.imageLab,resize=mode==='resize',crop=mode==='crop',convert=mode==='convert',suffix=resize?'resized':crop?'cropped':convert?'converted':'compressed',t=(en,r)=>FileI18n.t(en,r),get=id=>document.getElementById(id);
const input=get('lab-files'),cards=get('lab-cards'),run=get('lab-run'),results=get('lab-results'),feedback=get('lab-feedback');
const panel=FileWorkspace.savePanel({root,button:run,results,name:resize?'resized.zip':'compressed.zip'}),edits=FileWorkspace.history();
let records=[],busy=false,downloadURL=null,previousSettings={},dragSerial=0;
const optionIds=['lab-width','lab-height','lab-fit','lab-upscale','lab-format','lab-quality','lab-background','crop-ratio'];
const settings=()=>Object.fromEntries(optionIds.filter(id=>get(id)).map(id=>[id,get(id).type==='checkbox'?get(id).checked:get(id).value]));
const snapshot=()=>({files:records.map(r=>r.file),records:records.map(({file,width,height,turn,key,crop})=>({file,width,height,turn,key,crop:{...crop}})),settings:settings()});
const undo=FileWorkspace.undoRow(get('lab-actions'),()=>{if(busy||!edits.length)return;const state=edits.pop();records.forEach(r=>URL.revokeObjectURL(r.url));records=state.records.map(r=>({...r,url:URL.createObjectURL(r.file)}));Object.entries(state.settings).forEach(([id,value])=>{if(get(id).type==='checkbox')get(id).checked=value;else get(id).value=value;});invalidate();render();});
function remember(old){const state=snapshot();if(old)state.settings={...old};edits.push(state);}
function extension(mime){return mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'png';}
function mimeFor(record){return get('lab-format').value==='original'?(['image/jpeg','image/png','image/webp'].includes(record.file.type)?record.file.type:(/\.webp$/i.test(record.file.name)?'image/webp':/\.png$/i.test(record.file.name)?'image/png':'image/jpeg')):get('lab-format').value;}
function suggested(){if(records.length===1)return records[0].file.name.replace(/\.[^.]+$/,'')+('-'+suffix+'.')+extension(mimeFor(records[0]));return suffix+'.zip';}
function invalidate(){FileWorkspace.closePreview();if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;results.replaceChildren();panel.invalidate();panel.setDefault(suggested());feedback.textContent='';previousSettings=settings();}
function render(){
 get('lab-background').closest('.pdf-settings').hidden=get('lab-format').value!=='image/jpeg';
 get('lab-quality').closest('.pdf-settings').hidden=get('lab-format').value==='image/png'||(get('lab-format').value==='original'&&records.length>0&&records.every(r=>mimeFor(r)==='image/png'));
 get('lab-drop').hidden=records.length>0;get('lab-actions').hidden=!records.length;get('lab-add').disabled=busy;input.disabled=busy;run.disabled=busy||!records.length;undo.update(edits.length,busy);panel.setDefault(suggested());
 root.querySelectorAll('.lab-options input,.lab-options select').forEach(c=>c.disabled=busy);cards.replaceChildren();
 records.forEach((record,index)=>{
  const item=document.createElement('li');item.className='page-card';item.dataset.labKey=record.key;
  const handle=document.createElement('span');handle.className='page-drag';handle.textContent='⠿';handle.draggable=!busy;handle.title=t('Drag to reorder','Перетащите для изменения порядка');
  const frame=document.createElement('div');frame.className='page-thumbnail turn-'+record.turn;const img=document.createElement('img');img.src=record.url;img.alt=record.file.name;img.loading='lazy';img.draggable=false;frame.append(img);
  const label=document.createElement('span');label.className='page-source-name';label.textContent=record.file.name;label.title=record.file.name;
  const meta=document.createElement('span');meta.className='page-position';meta.textContent=`${record.width} × ${record.height} · ${FileWorkspace.formatBytes(record.file.size)}`;
  const actions=document.createElement('div');actions.className='page-overlay';
  for(const [kind,title,action] of [['zoom',t('Preview','Просмотр'),()=>FileWorkspace.openImages(records.map(r=>({url:r.url,title:r.file.name,angle:r.turn})),index)],['rotate',t('Rotate','Повернуть'),()=>{record.turn=(record.turn+90)%360;if(crop){if(get('crop-ratio').value==='free'){const old=record.crop;record.crop={x:1-old.y-old.h,y:old.x,w:old.h,h:old.w};}else record.crop=centerCrop(record,get('crop-ratio').value);}}],['delete',t('Delete','Удалить'),()=>{records.splice(index,1);URL.revokeObjectURL(record.url);}]] ){
   const button=FileWorkspace.action(kind,`${title}: ${record.file.name}`,()=>{if(busy)return;if(kind==='zoom'){action();return;}remember();action();invalidate();render();});button.disabled=busy;actions.append(button);
  }
  const move=document.createElement('div');move.className='card-move-controls';
  for(const [kind,offset] of [['previous',-1],['next',1]]){const button=FileWorkspace.action(kind,t('Move image','Переместить изображение'),()=>{if(busy)return;remember();records.splice(index+offset,0,...records.splice(index,1));invalidate();render();});button.disabled=busy||index+offset<0||index+offset>=records.length;move.append(button);}
  item.append(handle,frame,actions,label,meta,move);cards.append(item);if(crop)mountCrop(record,frame,item);
 });
}
async function addFiles(files){
 if(busy||!files.length)return;const batch=Array.from(files);
 if((convert&&batch.some(file=>sourceMime(file)!==root.dataset.inputMime))||records.length+batch.length>50||batch.some(f=>!f.size||f.size>20*1024*1024||!(/\.(jpe?g|png|webp)$/i.test(f.name)||['image/jpeg','image/png','image/webp'].includes(f.type)))||records.reduce((n,r)=>n+r.file.size,0)+batch.reduce((n,f)=>n+f.size,0)>50*1024*1024){feedback.textContent=convert?t(`Choose ${root.dataset.inputMime.split('/')[1].toUpperCase()} images: up to 20 MB each and 50 MB total.`,`Выберите ${root.dataset.inputMime.split('/')[1].toUpperCase()}: до 20 МБ каждое и 50 МБ суммарно.`):t('Use JPG, PNG or WebP: 20 MB each, 50 MB total, up to 50 files.','Выберите JPG, PNG или WebP: до 20 МБ каждое, 50 МБ суммарно, до 50 файлов.');return;}
 busy=true;render();const pending=[];
 try{
  for(const file of batch){const url=URL.createObjectURL(file);const record={file,url,turn:0,key:++dragSerial,width:0,height:0,crop:{x:0,y:0,w:1,h:1}};pending.push(record);const img=new Image();img.src=url;await img.decode();record.width=img.naturalWidth;record.height=img.naturalHeight;if(crop)record.crop=centerCrop(record,get('crop-ratio').value);if(!record.width||record.width*record.height>40000000)throw Error(t('Image exceeds 40 megapixels.','Изображение превышает 40 мегапикселей.'));}
  remember();records.push(...pending);invalidate();
 }catch(error){pending.forEach(r=>URL.revokeObjectURL(r.url));feedback.textContent=error.message.startsWith('Image exceeds')||error.message.startsWith('Изображение')?error.message:t('Cannot decode image. Previous images are kept.','Не удалось открыть изображение. Ранее добавленные файлы сохранены.');}
 finally{busy=false;render();}
}
input.addEventListener('change',()=>{const files=Array.from(input.files);input.value='';void addFiles(files);});get('lab-add').addEventListener('click',()=>input.click());
const drop=get('lab-drop');drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)input.click();}});for(const name of ['dragenter','dragover','dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.toggle('dragging',name==='dragenter'||name==='dragover');});drop.addEventListener('drop',e=>void addFiles(e.dataTransfer.files));
optionIds.filter(id=>get(id)).forEach(id=>get(id).addEventListener('input',()=>{if(busy)return;remember(previousSettings);if(id==='crop-ratio')records.forEach(record=>record.crop=centerCrop(record,get(id).value));invalidate();render();}));
FileWorkspace.reorder(cards,{selector:'li[data-lab-key]',key:card=>Number(card.dataset.labKey),busy:()=>busy,onMove:(from,to)=>{remember();const a=records.findIndex(r=>r.key===from),b=records.findIndex(r=>r.key===to);records.splice(b,0,...records.splice(a,1));invalidate();render();}});
run.addEventListener('click',async()=>{
 if(busy||!records.length)return;invalidate();busy=true;render();panel.begin();
 try{
  const quality=Number(get('lab-quality').value);if(records.some(r=>mimeFor(r)!=='image/png')&&(!Number.isFinite(quality)||quality<10||quality>100))throw Error(t('Quality must be between 10 and 100.','Качество должно быть от 10 до 100.'));
  const maxW=resize?Number(get('lab-width').value):0,maxH=resize?Number(get('lab-height').value):0;
  if(resize&&(!Number.isInteger(maxW)||!Number.isInteger(maxH)||maxW<1||maxH<1||maxW>16384||maxH>16384))throw Error(t('Use positive dimensions up to 16384 pixels and 40 megapixels.','Укажите положительные размеры до 16384 пикселей и 40 мегапикселей.'));
  const archive=Object.create(null);let total=0,inputTotal=0,done=0,single=null,singleName='';
  for(const record of records){
   const img=new Image();img.src=record.url;await img.decode();const sideways=record.turn%180!==0,originalW=sideways?record.height:record.width,originalH=sideways?record.width:record.height;
   let width=originalW,height=originalH;
   if(resize){if(get('lab-fit').value==='exact'){if(!get('lab-upscale').checked&&(maxW>originalW||maxH>originalH))throw Error(t('Enable enlargement or choose smaller dimensions.','Разрешите увеличение или выберите меньшие размеры.'));width=maxW;height=maxH;}else{const scale=Math.min(maxW/originalW,maxH/originalH,get('lab-upscale').checked?Infinity:1);width=Math.max(1,Math.round(originalW*scale));height=Math.max(1,Math.round(originalH*scale));}}
   let cropX=0,cropY=0;if(crop){cropX=Math.min(originalW-1,Math.round(record.crop.x*originalW));cropY=Math.min(originalH-1,Math.round(record.crop.y*originalH));width=Math.max(1,Math.min(originalW-cropX,Math.round(record.crop.w*originalW)));height=Math.max(1,Math.min(originalH-cropY,Math.round(record.crop.h*originalH)));}
   if(width*height>40000000||width>16384||height>16384)throw Error(t('Output dimensions exceed limits.','Размеры результата превышают ограничения.'));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;let blob;const mime=mimeFor(record);
   try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');if(mime==='image/jpeg'){ctx.fillStyle=get('lab-background').value;ctx.fillRect(0,0,width,height);}if(crop){ctx.translate(-cropX,-cropY);ctx.translate(originalW/2,originalH/2);ctx.rotate(record.turn*Math.PI/180);ctx.drawImage(img,-record.width/2,-record.height/2,record.width,record.height);}else{ctx.translate(width/2,height/2);ctx.rotate(record.turn*Math.PI/180);ctx.drawImage(img,-(sideways?height:width)/2,-(sideways?width:height)/2,sideways?height:width,sideways?width:height);}
    blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,quality/100));if(!blob||blob.type!==mime)throw Error(t('Browser cannot export this format. Choose JPG or PNG.','Браузер не может сохранить этот формат. Выберите JPG или PNG.'));
   }finally{canvas.width=0;canvas.height=0;}
   const originalMime=(['image/jpeg','image/png','image/webp'].includes(record.file.type)?record.file.type:(/\.webp$/i.test(record.file.name)?'image/webp':/\.png$/i.test(record.file.name)?'image/png':'image/jpeg'));
   if(mode==='compress'&&!record.turn&&mime===originalMime&&blob.size>=record.file.size)blob=record.file;
   total+=blob.size;inputTotal+=record.file.size;if(total>200*1024*1024)throw Error(t('Output exceeds 200 MB. Process fewer files.','Результат превышает 200 МБ. Обработайте меньше файлов.'));
   const name=`image-${String(++done).padStart(3,'0')}.${extension(mime)}`;archive[name]=new Uint8Array(await blob.arrayBuffer());single=blob;singleName=record.file.name.replace(/\.[^.]+$/,'')+('-'+suffix+'.')+extension(mime);panel.progress(done,records.length,t(`Images: ${done} / ${records.length}`,`Изображения: ${done} / ${records.length}`));await new Promise(resolve=>setTimeout(resolve,0));
  }
  let blob=single,name=singleName;if(records.length>1){panel.wait(t('Packaging ZIP…','Упаковка ZIP…'));await new Promise(resolve=>setTimeout(resolve,0));blob=new Blob([zipSync(archive,{level:0})],{type:'application/zip'});name=suffix+'.zip';}
  downloadURL=URL.createObjectURL(blob);const link=document.createElement('a');link.href=downloadURL;link.download=panel.outputName(name);link.className='download-button';link.textContent='↓ '+link.download;results.append(link);panel.complete(name,blob.size);
  const percent=((inputTotal-total)/inputTotal*100).toFixed(1);feedback.textContent=`${FileWorkspace.formatBytes(inputTotal)} → ${FileWorkspace.formatBytes(total)}. `+(total<=inputTotal?t(`Image data reduced by ${percent}%.`,`Объём изображений уменьшен на ${percent}%.`):t('Image data is larger; compare before using.','Объём изображений вырос; сравните результат перед использованием.'));link.focus();
 }catch(error){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;results.replaceChildren();panel.fail();feedback.textContent=error.message;}
 finally{busy=false;panel.idle();render();}
});
previousSettings=settings();render();

function sourceMime(file){return ['image/jpeg','image/png','image/webp'].includes(file.type)?file.type:(/\.webp$/i.test(file.name)?'image/webp':/\.png$/i.test(file.name)?'image/png':'image/jpeg');}
function centerCrop(record,value){const ratio=Number(value);if(!ratio)return {x:0,y:0,w:1,h:1};const w=record.turn%180?record.height:record.width,h=record.turn%180?record.width:record.height;const cw=Math.min(1,ratio*h/w),ch=Math.min(1,w/(ratio*h));return {x:(1-cw)/2,y:(1-ch)/2,w:cw,h:ch};}
function mountCrop(record,frame,item){
 frame.className='page-thumbnail';frame.replaceChildren();const wrap=document.createElement('div');wrap.className='crop-image-wrap';const img=document.createElement('img');img.alt=record.file.name;img.draggable=false;const box=document.createElement('div');box.className='crop-rectangle';wrap.append(img,box);frame.append(wrap);
 // The small preview is oriented before selection; output crops use full-resolution source pixels.
 const preview=new Image();preview.src=record.url;preview.decode().then(()=>{if(!frame.isConnected)return;const side=record.turn%180,w=side?record.height:record.width,h=side?record.width:record.height,scale=Math.min(1,210/w,250/h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(record.turn*Math.PI/180);ctx.drawImage(preview,-record.width*scale/2,-record.height*scale/2,record.width*scale,record.height*scale);img.src=canvas.toDataURL('image/png');canvas.width=0;canvas.height=0;}).catch(()=>{});
 const details=document.createElement('details');details.className='crop-coordinates';const summary=document.createElement('summary');summary.textContent=t('Crop coordinates (%)','Координаты обрезки (%)');details.append(summary);const inputs={};
 for(const [key,title] of [['x','X'],['y','Y'],['w',t('Width','Ширина')],['h',t('Height','Высота')]]){const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='number';input.min=key==='w'||key==='h'?'0.01':'0';input.max='100';input.step='0.1';input.value=(record.crop[key]*100).toFixed(1);input.disabled=busy;input.setAttribute('aria-label',title+' (%)');input.dataset.cropField=key;input.addEventListener('change',()=>{const v=Number(input.value)/100;if(busy||!Number.isFinite(v)||v<0||v>1||((key==='w'||key==='h')&&v<=0)){update();return;}remember();record.crop[key]=v;record.crop.w=Math.max(.0001,Math.min(record.crop.w,1-record.crop.x));record.crop.h=Math.max(.0001,Math.min(record.crop.h,1-record.crop.y));if(record.crop.x>=1)record.crop.x=.9999;if(record.crop.y>=1)record.crop.y=.9999;invalidate();update();});label.append(input);details.append(label);inputs[key]=input;}item.append(details);
 function update(){for(const [key,input]of Object.entries(inputs))input.value=(record.crop[key]*100).toFixed(1);box.style.left=record.crop.x*100+'%';box.style.top=record.crop.y*100+'%';box.style.width=record.crop.w*100+'%';box.style.height=record.crop.h*100+'%';}
 let start=null;const point=e=>{const r=wrap.getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))};};
 wrap.addEventListener('pointerdown',e=>{if(busy||!img.complete||!img.naturalWidth)return;e.preventDefault();e.stopPropagation();remember();invalidate();start=point(e);wrap.setPointerCapture(e.pointerId);});
 wrap.addEventListener('pointermove',e=>{if(!start)return;e.preventDefault();const p=point(e),dx=p.x-start.x,dy=p.y-start.y;let w=Math.abs(dx),h=Math.abs(dy);const ratio=Number(get('crop-ratio').value),ow=record.turn%180?record.height:record.width,oh=record.turn%180?record.width:record.height;if(ratio){const r=ratio*oh/ow;if(w>h*r)h=w/r;else w=h*r;}const scale=Math.min(1,(dx<0?start.x:1-start.x)/(w||1),(dy<0?start.y:1-start.y)/(h||1));w*=scale;h*=scale;if(w>0&&h>0)record.crop={x:dx<0?start.x-w:start.x,y:dy<0?start.y-h:start.y,w,h};update();});
 wrap.addEventListener('pointerup',()=>{start=null;});wrap.addEventListener('pointercancel',()=>{start=null;});update();
}
