'use strict';
const translations = {
  en: {rotateImage:'↻ Rotate 90°',changeFile:'Replace image',headerHint:'Free PDF & image tools',eyebrow:'FREE · PRIVATE · FAST',title:'Convert JPG & PNG online',subtitle:'Quick image conversion right in your browser. Your files never leave your device.',converterTitle:'Image converter',converterDescription:'Choose a direction, add an image, and convert.',privacyBadge:'🔒 No file uploads',dropTitle:'Drag & drop an image here',dropOr:'or click to browse files',dropHintJpg:'JPG / JPEG · Maximum 20 MB',dropHintPng:'PNG · Maximum 20 MB',backgroundLabel:'Background for transparent areas',backgroundHint:'JPG does not support transparency. Transparent pixels will use this color.',convertJpg:'Convert to PNG',convertPng:'Convert to JPG',download:'↓ Download converted image',feature1Title:'Instant conversion',feature1Text:'No waiting for a server.',feature2Title:'Private by design',feature2Text:'Images stay on your device.',feature3Title:'Simple and free',feature3Text:'No account or payment required.',faqTitle:'Frequently asked questions',q1:'Will my image be uploaded?',a1:"No. Conversion happens locally in your browser. We don't receive your image.",q2:'Can JPG have a transparent background?',a2:'No. JPG does not support transparency. Choose a background color when converting PNG to JPG.',q3:'Will image quality change?',a3:'PNG is lossless. JPG uses lossy compression, so PNG to JPG may reduce quality slightly.',footer:'Made for simple, private image conversion.',ready:'File ready to download!',errorType:'Please choose a file in the correct format.',errorSize:'The image must be 20 MB or smaller.',errorOpen:'Could not open this image. It may be damaged or unsupported.',errorConvert:'Conversion failed. Try a different image.',working:'Converting…',modalTitle:'Conversion complete!',modalDescription:'Your image is ready to download.',modalDownload:'↓ Download file',modalDone:'Close'},
  ru: {rotateImage:'↻ Повернуть на 90°',changeFile:'Заменить изображение',headerHint:'Инструменты PDF и изображений',eyebrow:'БЕСПЛАТНО · БЕЗОПАСНО · БЫСТРО',title:'Конвертация JPG и PNG онлайн',subtitle:'Быстро конвертируйте изображения в браузере. Файлы не покидают ваше устройство.',converterTitle:'Конвертер изображений',converterDescription:'Выберите направление, добавьте изображение и конвертируйте.',privacyBadge:'🔒 Без загрузки на сервер',dropTitle:'Перетащите изображение сюда',dropOr:'или нажмите, чтобы выбрать файл',dropHintJpg:'JPG / JPEG · До 20 МБ',dropHintPng:'PNG · До 20 МБ',backgroundLabel:'Фон для прозрачных областей',backgroundHint:'JPG не поддерживает прозрачность. Прозрачные пиксели получат выбранный цвет.',convertJpg:'Конвертировать в PNG',convertPng:'Конвертировать в JPG',download:'↓ Скачать изображение',feature1Title:'Мгновенная конвертация',feature1Text:'Не нужно ждать ответа сервера.',feature2Title:'Конфиденциально',feature2Text:'Изображения остаются на устройстве.',feature3Title:'Просто и бесплатно',feature3Text:'Без регистрации и оплаты.',faqTitle:'Частые вопросы',q1:'Мой файл будет загружен на сервер?',a1:'Нет. Конвертация выполняется в браузере, изображение никуда не отправляется.',q2:'Может ли JPG иметь прозрачный фон?',a2:'Нет. JPG не поддерживает прозрачность. При конвертации PNG в JPG выберите цвет фона.',q3:'Изменится ли качество изображения?',a3:'PNG использует сжатие без потерь. JPG — с потерями, поэтому качество может немного снизиться.',footer:'Простая и конфиденциальная конвертация.',ready:'Файл готов к скачиванию!',errorType:'Пожалуйста, выберите файл нужного формата.',errorSize:'Размер изображения не должен превышать 20 МБ.',errorOpen:'Не удалось открыть изображение. Возможно, файл повреждён или не поддерживается.',errorConvert:'Ошибка конвертации. Попробуйте другой файл.',working:'Конвертация…',modalTitle:'Конвертация завершена!',modalDescription:'Изображение готово к скачиванию.',modalDownload:'↓ Скачать файл',modalDone:'Закрыть'}
};
const MAX_SIZE = 20 * 1024 * 1024;
let mode = 'jpg-png';
let lang = document.body.dataset.language || 'en';
let selectionVersion = 0;
let currentFile = null;
let workSession=null;
let imageRotation = 0;
let previewUrl = null;
let downloadUrl = null;
let previousFocus = null;
function closeModal() {
  if (el('successModal').hidden) return;
  el('successModal').hidden = true;
  document.body.classList.remove('modal-open');
  if (previousFocus && previousFocus.isConnected) previousFocus.focus();
}
function openModal() {
  previousFocus = document.activeElement;
  el('modalFileName').textContent = el('download').download;
  el('modalDownload').href = downloadUrl;
  el('modalDownload').download = el('download').download;
  el('successModal').hidden = false;
  document.body.classList.add('modal-open');
  el('modalDownload').focus();
}
const el = id => document.getElementById(id);
const t = key => FileI18n.t(translations.en[key],translations.ru[key]);
const savePanel=FileWorkspace.savePanel({root:document.querySelector('.converter'),button:el('convert'),results:el('download'),name:document.body.dataset.mode==='png-jpg'?'image.jpg':'image.png'});
const edits=FileWorkspace.history();
const undo=FileWorkspace.undoRow(el('file'),()=>{
 const state=edits.pop();if(!state)return;
 el('background').value=state.background;el('backgroundValue').textContent=state.background.toUpperCase();lastBackground=state.background;
 selectFile(state.files[0],{restore:true,rotation:state.rotation});undo.update(edits.length);
});
let lastBackground=el('background').value;
function remember(background=lastBackground){edits.push({files:currentFile?[currentFile]:[],rotation:imageRotation,background});undo.update(edits.length);}
FileWorkspace.decorate(el('rotateImage'),'rotate',FileI18n.t('Rotate 90°','Повернуть на 90°'));el('rotateImage').removeAttribute('data-i18n');
FileWorkspace.decorate(el('remove'),'delete',FileI18n.t('Delete image','Удалить изображение'));
const zoomImage=FileWorkspace.action('zoom',FileI18n.t('Preview image','Просмотр изображения'),()=>{if(previewUrl)void FileWorkspace.openImage(previewUrl,currentFile.name,imageRotation);});zoomImage.id='zoomImage';
const imageActions=document.createElement('div');imageActions.className='page-overlay';imageActions.append(zoomImage,el('rotateImage'),el('remove'));el('fileDetails').append(imageActions);el('fileDetails').classList.add('page-card');

function setLanguage(next) {
  lang = next;
  document.documentElement.lang = lang; el('language').value = lang;
  savePanel.setDefault(currentFile?currentFile.name.replace(/\.[^.]+$/,'')+(mode==='jpg-png'?'.png':'.jpg'):(mode==='jpg-png'?'image.png':'image.jpg'));
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  el('dropHelp').textContent = t(mode === 'jpg-png' ? 'dropHintJpg' : 'dropHintPng');
  el('convert').textContent = t(mode === 'jpg-png' ? 'convertJpg' : 'convertPng');
  document.title = document.body.dataset.pageTitle || (lang === 'ru' ? 'FileConvert — конвертер JPG и PNG' : 'FileConvert — JPG & PNG Converter');
  if (downloadUrl) el('feedback').textContent = t('ready');
}
function clearOutput() {
  closeModal();savePanel.invalidate();savePanel.idle();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null; el('download').hidden = true; el('download').removeAttribute('href');
  el('feedback').textContent = '';
}
function clearFile({forget=true}={}) {
  selectionVersion++; imageRotation=0;el('imagePreviewFrame').className='image-preview-frame turn-0';currentFile = null; el('file').value = '';
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null; el('preview').removeAttribute('src');
  el('fileDetails').hidden = true; el('dropzone').hidden = false; el('convert').disabled = true; clearOutput();if(forget)workSession?.changed();
}
function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode-tab').forEach(btn => { const active = btn.dataset.mode === mode; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', String(active)); });
  el('file').accept = mode === 'jpg-png' ? 'image/jpeg,.jpg,.jpeg' : 'image/png,.png';
  el('pngOptions').hidden = mode !== 'png-jpg';
  clearFile(); setLanguage(lang);
}
function selectFile(file,{restore=false,rotation=0,onReady=()=>{}}={}) {
  if(!restore&&file)remember();
  clearFile({forget:false});
  if (!file) {workSession?.changed();onReady();return;}
  const valid = mode === 'jpg-png' ? file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name) : file.type === 'image/png' || /\.png$/i.test(file.name);
  if (!valid) { el('feedback').textContent = t('errorType'); onReady(Error());return; }
  if (file.size > MAX_SIZE) { el('feedback').textContent = t('errorSize'); onReady(Error());return; }
  const version = selectionVersion;
  const selectedUrl = URL.createObjectURL(file);
  previewUrl = selectedUrl;
  const img = new Image();
  img.onload = () => { if (version !== selectionVersion) return; currentFile = file;imageRotation=rotation;el('imagePreviewFrame').className='image-preview-frame turn-'+rotation;savePanel.setDefault(file.name.replace(/\.[^.]+$/,'')+(mode==='jpg-png'?'.png':'.jpg')); el('preview').src = previewUrl; el('fileName').textContent = file.name; el('fileSize').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB'; el('fileDetails').hidden = false; el('dropzone').hidden = true; el('convert').disabled = false;workSession?.changed();onReady(); };
  img.onerror = () => { if (version !== selectionVersion) return; clearFile({forget:false}); el('feedback').textContent = t('errorOpen');onReady(Error()); };
  img.src = selectedUrl;
}
function convert() {
  if (!currentFile || !previewUrl) return;
  clearOutput(); const file = currentFile; const src = previewUrl; const selectedMode = mode;const selectedVersion=selectionVersion;const rotation=imageRotation;
  savePanel.begin(FileI18n.t('Reading image…','Чтение изображения…'));
  el('convert').disabled = true; el('convert').textContent = t('working');
  const image = new Image();
  image.onload = () => {
    if(selectedVersion!==selectionVersion)return;
    try {
      savePanel.wait(FileI18n.t('Rotating and converting…','Поворот и конвертация…'));
      const canvas = document.createElement('canvas');
      canvas.width = rotation%180 ? image.naturalHeight : image.naturalWidth; canvas.height = rotation%180 ? image.naturalWidth : image.naturalHeight;
      if (!canvas.width || !canvas.height || canvas.width * canvas.height > 40000000) throw Error('Empty image');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Canvas unavailable');
      if (selectedMode === 'png-jpg') { ctx.fillStyle = el('background').value; ctx.fillRect(0,0,canvas.width,canvas.height); }
      ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
      const mime = selectedMode === 'jpg-png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(blob => {
        if (mode !== selectedMode || currentFile !== file || selectedVersion!==selectionVersion) return;
        el('convert').disabled = false; el('convert').textContent = t(selectedMode === 'jpg-png' ? 'convertJpg' : 'convertPng');
        if (!blob) {savePanel.fail(); el('feedback').textContent = t('errorConvert'); return; }
        downloadUrl = URL.createObjectURL(blob);
        const ext = selectedMode === 'jpg-png' ? 'png' : 'jpg';
        el('download').href = downloadUrl;
        el('download').download = savePanel.outputName(file.name.replace(/\.[^.]+$/, '') + '.' + ext);
        el('download').hidden = false;
        el('feedback').textContent = t('ready');
        savePanel.complete(file.name.replace(/\.[^.]+$/, '')+'.'+ext,blob.size);savePanel.setOutput(blob,{name:file.name.replace(/\.[^.]+$/, '')+'.'+ext,originals:[{file,angle:rotation}]});openModal();
      }, mime, selectedMode === 'png-jpg' ? 0.92 : undefined);
    } catch (e) {
      if(selectedVersion!==selectionVersion)return;
      el('convert').disabled = false; el('convert').textContent = t(selectedMode === 'jpg-png' ? 'convertJpg' : 'convertPng');
      el('feedback').textContent = t('errorConvert');
      savePanel.fail();console.error(e);
    }
  };
  image.onerror = () => { if(selectedVersion!==selectionVersion)return;savePanel.fail(); el('convert').disabled = false; el('convert').textContent = t(selectedMode === 'jpg-png' ? 'convertJpg' : 'convertPng'); el('feedback').textContent = t('errorOpen'); };
  image.src = src;
}
document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
el('language').addEventListener('change', event => setLanguage(event.target.value));
el('dropzone').addEventListener('click', () => el('file').click());
el('dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el('file').click(); } });
el('file').addEventListener('change', event => selectFile(event.target.files[0]));
for (const eventName of ['dragenter','dragover']) el('dropzone').addEventListener(eventName, event => {event.preventDefault();el('dropzone').classList.add('dragging');});
for (const eventName of ['dragleave','drop']) el('dropzone').addEventListener(eventName, event => {event.preventDefault();el('dropzone').classList.remove('dragging');});
el('dropzone').addEventListener('drop', event => selectFile(event.dataTransfer.files[0]));
el('rotateImage').addEventListener('click',()=>{if(!currentFile)return;remember();imageRotation=(imageRotation+90)%360;selectionVersion++;clearOutput();el('imagePreviewFrame').className='image-preview-frame turn-'+imageRotation;el('convert').disabled=false;el('convert').textContent=t(mode==='jpg-png'?'convertJpg':'convertPng');workSession?.changed();});
el('changeFile').addEventListener('click',()=>el('file').click());
el('remove').addEventListener('click',()=>{remember();clearFile();el('dropzone').focus();});
el('convert').addEventListener('click', convert);
el('background').addEventListener('input', event => { remember();selectionVersion++;el('convert').disabled=!currentFile;el('convert').textContent=t(mode==='jpg-png'?'convertJpg':'convertPng');lastBackground=event.target.value;el('backgroundValue').textContent = event.target.value.toUpperCase();clearOutput(); });
el('modalClose').addEventListener('click', closeModal);
el('modalDone').addEventListener('click', closeModal);
el('successModal').addEventListener('click', event => { if (event.target === el('successModal')) closeModal(); });
document.addEventListener('keydown', event => {
  if (el('successModal').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
  if (event.key === 'Tab') {
    const controls = [el('modalClose'), el('modalDownload'), resultPreview, el('modalDone')];
    const i = controls.indexOf(document.activeElement);
    if (event.shiftKey && i <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!event.shiftKey && i === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
  }
});
if (el('year')) el('year').textContent = new Date().getFullYear();
setMode(document.body.dataset.mode === 'png-jpg' ? 'png-jpg' : 'jpg-png');

const resultPreview=document.createElement('button');resultPreview.type='button';resultPreview.textContent=FileI18n.t('Preview result','Просмотреть результат');resultPreview.addEventListener('click',()=>{closeModal();void savePanel.previewResult();});el('modalDone').before(resultPreview);
function restoreImage(file,rotation=0){return new Promise((resolve,reject)=>selectFile(file,{restore:true,rotation,onReady:error=>error?reject(error):resolve()}));}
workSession=FileWorkflow.workspace({root:document.querySelector('.converter'),capture:()=>({files:currentFile?[currentFile]:[],rotation:imageRotation,background:el('background').value}),busy:()=>!!currentFile&&el('convert').disabled,restore:async state=>{el('background').value=state.background;lastBackground=state.background;el('backgroundValue').textContent=state.background.toUpperCase();edits.clear();await restoreImage(state.files[0],state.rotation);},receive:file=>restoreImage(file)});
