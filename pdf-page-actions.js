// Build a new editable source atomically; the caller keeps the prior File for Undo.
export async function appendPages(file,{kind,index,inputs=[],t,maxBytes=50*1024*1024}){
 const fail=()=>Error(t('Could not add pages. Use supported PDFs or images within the file and page limits. Current edits are kept.','Не удалось добавить страницы. Проверьте формат PDF или изображений и лимиты файлов и страниц. Текущие изменения сохранены.'));
 if(inputs.length>=50||inputs.some(f=>!f.size)||file.size+inputs.reduce((n,f)=>n+f.size,0)>maxBytes)throw fail();
 const source=await PDFLib.PDFDocument.load(await file.arrayBuffer()),count=source.getPageCount();
 if(!count||count>=500)throw fail();
 const output=await PDFLib.PDFDocument.create();for(const page of await output.copyPages(source,source.getPageIndices()))output.addPage(page);
 const added=[];
 const push=page=>{if(output.getPageCount()>=500)throw fail();const node=page.node.clone(),ref=output.context.register(node);output.addPage(PDFLib.PDFPage.of(node,ref,output));added.push(output.getPageCount()-1);};
 if(kind==='duplicate')push((await output.copyPages(source,[index]))[0]);
 else if(kind==='blank'){output.addPage([595.28,841.89]);added.push(count);}
 else for(const incoming of inputs){
  if(incoming.type==='application/pdf'||/\.pdf$/i.test(incoming.name)){
   const doc=await PDFLib.PDFDocument.load(await incoming.arrayBuffer());if(output.getPageCount()+doc.getPageCount()>500)throw fail();for(const page of await output.copyPages(doc,doc.getPageIndices()))push(page);
  }else{
   if(incoming.size>20*1024*1024||output.getPageCount()>=500)throw fail();
   const url=URL.createObjectURL(incoming),image=new Image();let canvas;
   try{image.src=url;await image.decode();const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>40000000)throw fail();canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw fail();const png=await output.embedPng(await blob.arrayBuffer()),scale=Math.min(1,14400/Math.max(w,h));const page=output.addPage([w*scale,h*scale]);page.drawImage(png,{x:0,y:0,width:w*scale,height:h*scale});added.push(output.getPageCount()-1);}finally{URL.revokeObjectURL(url);if(canvas){canvas.width=0;canvas.height=0;}}
  }
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(!added.length)throw fail();const bytes=await output.save();if(bytes.length>maxBytes)throw fail();
 return {file:new File([bytes],file.name,{type:'application/pdf'}),added,count};
}
