const ids=new WeakMap();let nextId=0;const id=value=>{if(!value)return 0;if(!ids.has(value))ids.set(value,++nextId);return ids.get(value);};
export class LiveStampPreview {
 constructor({tool,helper,file,state,status,t}){Object.assign(this,{tool,helper,file,state,status,t});this.serial=0;this.timer=null;this.running=false;this.task=null;this.cache=null;this.sourceFile=null;this.source=null;}
 signature(file,state){return JSON.stringify([id(file),state.order,state.selected,[...state.turns],state.settings,id(state.imageFile)]);}
 request(){clearTimeout(this.timer);const serial=++this.serial;if(!this.file()){this.clear();return;}this.status.textContent=this.t('Updating result preview…','Обновление предпросмотра результата…');this.timer=setTimeout(()=>void this.update(serial),250);}
 clear(){this.serial++;this.cache=null;this.helper.setResultPreview(null);const old=this.task;this.task=null;void old?.destroy().catch(()=>{});this.source=null;this.sourceFile=null;this.status.textContent='';}
 cached(){if(!this.cache||this.sourceFile!==this.file()||!this.source)return null;return this.cache.signature===this.signature(this.file(),this.state(this.source.getPageCount()))?this.cache.result:null;}
 async update(serial){
  if(serial!==this.serial)return;if(this.running){this.timer=setTimeout(()=>void this.update(this.serial),100);return;}const file=this.file();if(!file)return;this.running=true;
  try{
   if(this.sourceFile!==file){this.sourceFile=file;this.source=await PDFLib.PDFDocument.load(await file.arrayBuffer());}if(serial!==this.serial)return;
   const state=this.state(this.source.getPageCount()),signature=this.signature(file,state);if(this.cache?.signature===signature){this.status.textContent=this.t('Preview matches the saved result.','Предпросмотр соответствует результату.');return;}
   const {processExtra}=await import('./pdf-extras.js');const silent={progress(){},wait(){}};
   const result=await processExtra({tool:this.tool,source:this.source,preview:null,chosen:state.selected,order:state.order,turn:index=>state.turns.get(index)||0,panel:silent,t:this.t,file,current:()=>serial===this.serial});
   if(serial!==this.serial)return;const pdfjs=await import('/vendor/pdfjs/pdf.mjs');const task=pdfjs.getDocument({data:result.bytes.slice(),isEvalSupported:false,useSystemFonts:true,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
   let doc;try{doc=await task.promise;}catch(error){await task.destroy();throw error;}if(serial!==this.serial){await task.destroy();return;}
   const old=this.task;this.task=task;this.cache={signature,result};this.helper.setResultPreview(doc,new Map(state.order.map((source,index)=>[source,index])));void old?.destroy().catch(()=>{});
   this.status.textContent=this.t('Preview matches the saved result.','Предпросмотр соответствует результату.');
  }catch(error){if(serial===this.serial){this.cache=null;this.helper.setResultPreview(null);const old=this.task;this.task=null;void old?.destroy().catch(()=>{});this.status.textContent=this.t('Preview unavailable: ','Предпросмотр недоступен: ')+error.message;}}
  finally{this.running=false;if(serial!==this.serial&&this.file()){clearTimeout(this.timer);this.timer=setTimeout(()=>void this.update(this.serial),50);}}
 }
}
