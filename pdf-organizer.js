import * as pdfjs from '/vendor/pdfjs/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
const ru = document.documentElement.lang === 'ru';
const t = (en, r) => ru ? r : en;
const get = id => document.getElementById(id);
const input = get('editor-file'), feedback = get('editor-feedback');
const workspace = get('editor-workspace'), grid = get('editor-pages');
const save = get('editor-save'), result = get('editor-result');
const mergeMode = document.querySelector('[data-editor-mode]').dataset.editorMode === 'merge';
let sources = [], sourceName = '';
let zoomRender = null, zoomRevision = 0, zoomFocus = null;
let pages = [], history = [], busy = false, revision = 0, downloadUrl = null;
let renderQueue = [], rendering = false, dragId = null;
const cards = new Map();
const visible = new Set();
const outputName = () => mergeMode ? 'merged.pdf' : sourceName.replace(/\.pdf$/i, '') + '-organized.pdf';
function clearDownload() {
 if (downloadUrl) URL.revokeObjectURL(downloadUrl);
 downloadUrl = null; result.replaceChildren();
}
function announce(text) { feedback.textContent = text; }
function snapshot() { return pages.map(page => ({...page})); }
function remember() {
 history.push(snapshot());
 if (history.length > 30) history.shift();
 clearDownload();
}
function controls() {
 const selected = pages.filter(page => page.selected).length;
 get('editor-count').textContent = t(`${pages.length} pages · ${selected} selected`, `${pages.length} стр. · выбрано: ${selected}`);
 get('editor-select-all').disabled = busy || !pages.length || selected === pages.length;
 get('editor-select-none').disabled = busy || !selected;
 get('editor-rotate-selected').disabled = busy || !selected;
 get('editor-delete-selected').disabled = busy || !selected || selected === pages.length;
 get('editor-undo').disabled = busy || !history.length;
 get('editor-reset').disabled = busy || !history.length;
 save.disabled = busy || !pages.length || (mergeMode && sources.length < 2);
 input.disabled = busy;
 for (const [id, card] of cards) {
  const index = pages.findIndex(page => page.id === id), page = pages[index];
  if (!page) continue;
  card.classList.toggle('is-selected', page.selected);
  card.querySelector('input[type=checkbox]').checked = page.selected;
  card.querySelector('.page-position').textContent = t(`Position ${index + 1} of ${pages.length}`, `Позиция ${index + 1} из ${pages.length}`);
  const position = card.querySelector('input[type=number]');
  position.value = index + 1; position.max = pages.length;
  card.querySelectorAll('button,input').forEach(control => { control.disabled = busy; });
  card.querySelector('[data-action=previous]').disabled = busy || index === 0;
  card.querySelector('[data-action=next]').disabled = busy || index === pages.length - 1;
  card.querySelector('[data-action=delete]').disabled = busy || pages.length === 1;
  card.querySelector('.page-drag').draggable = !busy;
 }
 workspace.setAttribute('aria-busy', String(busy));
}
function releaseImage(card) {
 const img = card.querySelector('img');
 if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
 img.removeAttribute('src'); delete img.dataset.url; delete img.dataset.turn;
}
function status(card, text) { card.querySelector('.thumbnail-status').textContent = text; }
function enqueue(id) {
 if (!renderQueue.includes(id)) renderQueue.push(id);
 void renderThumbnails();
}
const observer = new IntersectionObserver(entries => {
 for (const entry of entries) {
  const id = Number(entry.target.dataset.pageId);
  if (entry.isIntersecting) { visible.add(id); enqueue(id); }
  else { visible.delete(id); releaseImage(entry.target); }
 }
}, {rootMargin: '350px'});
async function renderThumbnails() {
 if (rendering) return;
 rendering = true;
 try {
  while (renderQueue.length) {
   const id = renderQueue.shift(), page = pages.find(page => page.id === id), card = cards.get(id);
   if (!page || !card || !visible.has(id)) continue;
   const source = sources.find(source => source.id === page.sourceId);
   if (!source) continue;
   const img = card.querySelector('img');
   if (img.dataset.turn === String(page.turn)) continue;
   const version = revision, turn = page.turn, doc = source.preview;
   status(card, t('Loading preview…', 'Загрузка миниатюры…'));
   let pdfPage, canvas;
   try {
    pdfPage = await doc.getPage(page.index + 1);
    if (version !== revision) continue;
    const initial = pdfPage.getViewport({scale: 1, rotation: (pdfPage.rotate + turn) % 360});
    const scale = Math.min(210 / initial.width, 260 / initial.height);
    if (!Number.isFinite(scale) || scale <= 0) throw Error('Invalid page size');
    const viewport = pdfPage.getViewport({scale, rotation: (pdfPage.rotate + turn) % 360});
    canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
    await pdfPage.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('No preview');
    if (version !== revision || !visible.has(id) || cards.get(id) !== card || !pages.some(page => page.id === id && page.turn === turn)) continue;
    releaseImage(card);
    img.dataset.url = URL.createObjectURL(blob); img.src = img.dataset.url; img.dataset.turn = String(turn);
    status(card, '');
   } catch {
    if (version === revision && cards.get(id) === card) status(card, t('Preview unavailable. Check original page.', 'Миниатюра недоступна. Проверьте оригинал.'));
   } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    try { pdfPage?.cleanup(); } catch { /* Document may have been replaced. */ }
   }
  }
 } finally { rendering = false; }
}
function button(action, text, label, id) {
 const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.dataset.action = action;
 node.setAttribute('aria-label', `${label} ${id + 1}`);
 node.title = label.replace(/: (page|страница)$/, '');
 if(action==='zoom') {
  node.textContent='';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');svg.append(path);node.append(svg);
 }
 node.addEventListener('click', () => act(action, id));
 return node;
}
function createCard(page) {
 const id = page.id, card = document.createElement('li'); card.className = 'page-card'; card.dataset.pageId = id;
 const top = document.createElement('div'); top.className = 'page-card-top';
 const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox';
 checkbox.setAttribute('aria-label', t(`Select page ${id + 1}`, `Выбрать страницу ${id + 1}`));
 checkbox.addEventListener('change', () => { if (busy) return; const current = pages.find(page => page.id === id); current.selected = checkbox.checked; controls(); });
 label.append(checkbox, document.createTextNode(t(`Page ${page.index + 1}`, `Страница ${page.index + 1}`)));
 const handle = document.createElement('span'); handle.className = 'page-drag'; handle.textContent = '⠿'; handle.draggable = true;
 handle.title = t('Drag to reorder', 'Перетащите для изменения порядка'); handle.setAttribute('aria-hidden', 'true');
 handle.addEventListener('dragstart', event => {
  if (busy) { event.preventDefault(); return; }
  dragId = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(id)); card.classList.add('is-dragging');
 });
 handle.addEventListener('dragend', clearDrag);
 top.append(label, handle);
 const frame = document.createElement('div'); frame.className = 'page-thumbnail';
 const img = document.createElement('img'); img.alt = t(`Preview of original page ${id + 1}`, `Миниатюра исходной страницы ${id + 1}`);
 const state = document.createElement('span'); state.className = 'thumbnail-status'; frame.append(img, state);
 const positionText = document.createElement('span'); positionText.className = 'page-position';
 const overlay = document.createElement('div'); overlay.className = 'page-overlay';
 overlay.append(button('zoom', '⌕', t('Preview: page', 'Просмотр: страница'), id), button('rotate', '↻', t('Rotate: page', 'Повернуть: страница'), id), button('delete', '×', t('Delete: page', 'Удалить: страница'), id));
 const actions = document.createElement('div'); actions.className = 'page-actions';
 actions.append(button('previous', '←', t('Move earlier: page', 'Переместить раньше: страница'), id), button('next', '→', t('Move later: page', 'Переместить позже: страница'), id));
 const moveLabel = document.createElement('label'); moveLabel.className = 'page-move-label'; moveLabel.textContent = t('Move to position', 'На позицию');
 const move = document.createElement('input'); move.type = 'number'; move.min = '1'; move.step = '1';
 move.setAttribute('aria-label', t(`Position for page ${id + 1}`, `Позиция страницы ${id + 1}`));
 move.addEventListener('change', () => {
  const target = Number(move.value);
  if (!Number.isInteger(target) || target < 1 || target > pages.length) { announce(t(`Enter a position between 1 and ${pages.length}.`, `Введите позицию от 1 до ${pages.length}.`)); controls(); return; }
  movePage(id, target - 1, 'input[type=number]');
 });
 moveLabel.append(move);
 const filename = document.createElement('span'); filename.className = 'page-source-name'; filename.textContent = sources.find(source => source.id === page.sourceId).name; filename.title = filename.textContent;
 const orderControls = document.createElement('details'); orderControls.className = 'page-order-controls';
 const summary = document.createElement('summary'); summary.textContent = t('Change position', 'Изменить позицию');
 orderControls.append(summary, actions, moveLabel);
 card.append(top, overlay, frame, filename, positionText, orderControls);
 card.addEventListener('dragover', event => { if (dragId !== null && dragId !== id && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('is-drop-target'); } });
 card.addEventListener('dragleave', event => { if (!card.contains(event.relatedTarget)) card.classList.remove('is-drop-target'); });
 card.addEventListener('drop', event => {
  if (dragId === null || busy) return;
  event.preventDefault(); event.stopPropagation();
  const from = dragId, target = pages.findIndex(page => page.id === id); clearDrag(); movePage(from, target, '[data-action=rotate]');
 });
 cards.set(id, card); observer.observe(card); return card;
}
function clearDrag() { dragId = null; cards.forEach(card => card.classList.remove('is-dragging', 'is-drop-target')); }
function render() {
 for (const [id, card] of cards) {
  if (!pages.some(page => page.id === id)) { observer.unobserve(card); releaseImage(card); card.remove(); cards.delete(id); visible.delete(id); }
 }
 pages.forEach(page => {
  let card = cards.get(page.id);
  if (!card) card = createCard(page);
  grid.append(card);
  if (visible.has(page.id)) enqueue(page.id);
 });
 controls();
}
function focusPage(id, selector = '[data-action=rotate]') {
 const card = cards.get(id); if (!card) return;
 const preferred = card.querySelector(selector);
 const disclosure = preferred?.closest('details'); if(disclosure) disclosure.open=true;
 (preferred && !preferred.disabled ? preferred : card.querySelector('button:not(:disabled),input:not(:disabled)'))?.focus();
}
function movePage(id, target, selector = '[data-action=previous]') {
 if (busy) return;
 const from = pages.findIndex(page => page.id === id);
 if (from < 0 || target < 0 || target >= pages.length || from === target) return;
 remember(); const [page] = pages.splice(from, 1); pages.splice(target, 0, page); render(); focusPage(id, selector);
 announce(t(`Page ${id + 1} moved to position ${target + 1}.`, `Страница ${id + 1} перемещена на позицию ${target + 1}.`));
}
function act(action, id) {
 if (busy) return;
 const index = pages.findIndex(page => page.id === id);
 if (index < 0) return;
 if (action === 'previous' || action === 'next') { movePage(id, index + (action === 'previous' ? -1 : 1), `[data-action=${action}]`); return; }
 if (action === 'zoom') { void openZoom(id); return; }
 if (action === 'delete' && pages.length === 1) return;
 remember();
 if (action === 'rotate') { pages[index].turn = (pages[index].turn + 90) % 360; releaseImage(cards.get(id)); }
 else if (action === 'delete') pages.splice(index, 1);
 render();
 focusPage(action === 'delete' ? pages[Math.min(index, pages.length - 1)].id : id);
 announce(action === 'rotate' ? t(`Page ${id + 1} rotated 90° clockwise.`, `Страница ${id + 1} повёрнута на 90° по часовой стрелке.`) : t(`Page ${id + 1} removed. Undo is available.`, `Страница ${id + 1} удалена. Можно отменить действие.`));
}
async function disposePreview() {
 closeZoom();
 observer.disconnect(); cards.forEach(releaseImage); cards.clear(); visible.clear(); renderQueue = []; grid.replaceChildren();
 const previous = sources; sources = [];
 await Promise.all(previous.map(async source => { try { await source.task.destroy(); } catch {} }));
}
function originalPages() {
 return sources.flatMap(source => Array.from({length:source.count}, (_,index)=>({id:source.start+index, sourceId:source.id, index, turn:0, selected:false})));
}
const imageExtension = /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico|tiff?|heic|heif)$/i;
const pdfCandidate = file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
const imageCandidate = file => file.type.startsWith('image/') || imageExtension.test(file.name);
async function imageAsPdf(file, bytes) {
 if(file.size > 20*1024*1024) throw Error('image-size');
 const extension=file.name.split('.').pop().toLowerCase();
 const mime={svg:'image/svg+xml',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',avif:'image/avif',ico:'image/x-icon',tif:'image/tiff',tiff:'image/tiff',heic:'image/heic',heif:'image/heif'}[extension];
 const blob=new Blob([bytes],{type:file.type.startsWith('image/')?file.type:(mime||'application/octet-stream')});
 let image=null, url=null, canvas=null;
 try {
  try { image=await createImageBitmap(blob); }
  catch { url=URL.createObjectURL(blob); image=new Image(); image.src=url; await image.decode(); }
  const width=image.naturalWidth||image.width, height=image.naturalHeight||image.height;
  if(!width||!height) throw Error('image-format');
  if(width*height > 40000000) throw Error('image-pixels');
  canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context) throw Error('image-format');
  // Decode EXIF orientation and freeze animated formats into a single page.
  context.drawImage(image,0,0);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png) throw Error('image-format');
  const doc=await window.PDFLib.PDFDocument.create();
  const embedded=await doc.embedPng(await png.arrayBuffer());
  // Keep each page within the PDF page-size limit, preserving the aspect ratio.
  const scale=Math.min(1,14400/width,14400/height);
  const page=doc.addPage([width*scale,height*scale]);page.drawImage(embedded,{x:0,y:0,width:width*scale,height:height*scale});
  return {doc, bytes:await doc.save()};
 } catch(error) {
  if(['image-size','image-pixels'].includes(error.message))throw error;
  throw Error('image-format');
 } finally {
  image?.close?.();if(url)URL.revokeObjectURL(url);if(canvas){canvas.width=0;canvas.height=0;}
 }
}
async function loadFiles(incoming) {
 const files = Array.from(incoming);
 if (busy || !files.length) return;
 if ((!mergeMode && files.length !== 1) || files.length + (mergeMode ? sources.length : 0) > 50 || files.some(file=>!file.size || !(pdfCandidate(file) || (mergeMode && imageCandidate(file)))) || files.reduce((n,f)=>n+f.size,0)+(mergeMode?sources.reduce((n,s)=>n+s.size,0):0)>50*1024*1024) {
  announce(t('Choose PDFs or images up to 50 MB total, maximum 50 files. Organize accepts one PDF. Current edits have been kept.', 'Выберите PDF или изображения до 50 МБ суммарно, максимум 50 файлов. Организация принимает один PDF. Текущие изменения сохранены.')); return;
 }
 busy = true; controls(); closeZoom();
 const version = ++revision, pending = [];
 if (!mergeMode) { clearDownload(); pages=[]; history=[]; workspace.hidden=true; await disposePreview(); }
 announce(t('Opening PDF pages…', 'Открытие страниц PDF…'));
 try {
  let total = sources.reduce((n,s)=>n+s.count,0);
  for (const file of files) {
   let bytes = new Uint8Array(await file.arrayBuffer()), doc;
   if(mergeMode && !pdfCandidate(file) && imageCandidate(file)) {
    const converted=await imageAsPdf(file,bytes);doc=converted.doc;bytes=converted.bytes;
   } else {doc=await window.PDFLib.PDFDocument.load(bytes);}
   const count = doc.getPageCount();
   if (!count || total + count > 500) throw Error('page-limit');
   const task = pdfjs.getDocument({data:bytes, isEvalSupported:false, useSystemFonts:true, cMapUrl:'/vendor/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/vendor/pdfjs/standard_fonts/', wasmUrl:'/vendor/pdfjs/wasm/'});
   const record = {id: sources.length+pending.length, doc, task, name:file.name, size:file.size, count, start:total, preview:null}; pending.push(record);
   record.preview = await task.promise;
   total += count;
  }
  if (version !== revision) return;
  if (mergeMode && sources.length) remember();
  const added = pending.flatMap(source=>Array.from({length:source.count},(_,index)=>({id:source.start+index, sourceId:source.id, index, turn:0, selected:false})));
  sources.push(...pending); pages.push(...added); clearDownload(); sourceName=sources[0].name;
  get('editor-filename').textContent = mergeMode ? t(`${sources.length} files`, `Файлов: ${sources.length}`) : sourceName;
  workspace.hidden=false; render();
  cards.get(added[0]?.id)?.scrollIntoView({block:'start'});
  announce(mergeMode && sources.length<2 ? t('Add another PDF or image to merge. You can already edit its pages.', 'Добавьте ещё один PDF или изображение для объединения. Страницы уже можно редактировать.') : t('Pages are ready. Rotate, remove or drag them into the order you want.', 'Страницы готовы. Поворачивайте, удаляйте и перетаскивайте их в нужном порядке.'));
 } catch(error) {
  await Promise.all(pending.map(async source=>{try{await source.task.destroy();}catch{}}));
  if (!mergeMode) { pages=[]; workspace.hidden=true; }
  const imageErrors={
   'image-size':t('Each image must be 20 MB or smaller.', 'Каждое изображение должно быть не больше 20 МБ.'),
   'image-pixels':t('Image exceeds the 40 megapixel limit.', 'Изображение превышает лимит 40 мегапикселей.'),
   'image-format':t('Cannot open image: it is damaged or this browser does not support its format. Convert it to PNG or JPG and try again. Previously loaded files have been kept.', 'Не удалось открыть изображение: файл повреждён или браузер не поддерживает его формат. Преобразуйте его в PNG или JPG и повторите. Ранее добавленные файлы сохранены.')
  };
  announce(imageErrors[error.message] || (error.message==='page-limit' ? t('Limit: 1–500 pages across all loaded PDFs.', 'Лимит: 1–500 страниц во всех загруженных PDF.') : t('Cannot open PDF. It may be encrypted, damaged or unsupported. Previously loaded files have been kept.', 'Не удалось открыть PDF. Он может быть зашифрован, повреждён или не поддерживаться. Ранее добавленные файлы сохранены.')));
 } finally { busy=false; controls(); render(); }
}
input.addEventListener('change', () => { const files=Array.from(input.files); input.value=''; void loadFiles(files); });
const drop=get('editor-dropzone');
for(const type of ['dragenter','dragover']) drop.addEventListener(type,event=>{event.preventDefault();if(!busy && event.dataTransfer.types.includes('Files')) drop.classList.add('dragging');});
for(const type of ['dragleave','drop']) drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('dragging');});
drop.addEventListener('drop',event=>void loadFiles(event.dataTransfer.files));
get('editor-select-all').addEventListener('click', () => { if (!busy) { pages.forEach(page => { page.selected = true; }); controls(); } });
get('editor-select-none').addEventListener('click', () => { if (!busy) { pages.forEach(page => { page.selected = false; }); controls(); } });
get('editor-rotate-selected').addEventListener('click', () => {
 if (busy || !pages.some(page => page.selected)) return;
 remember(); pages.filter(page => page.selected).forEach(page => { page.turn = (page.turn + 90) % 360; releaseImage(cards.get(page.id)); }); render();
 announce(t('Selected pages rotated 90° clockwise.', 'Выбранные страницы повёрнуты на 90° по часовой стрелке.'));
});
get('editor-delete-selected').addEventListener('click', () => {
 if (busy || !pages.some(page => page.selected) || pages.every(page => page.selected)) return;
 remember(); pages = pages.filter(page => !page.selected); render();
 announce(t('Selected pages removed. Undo is available.', 'Выбранные страницы удалены. Можно отменить действие.'));
});
get('editor-undo').addEventListener('click', () => {
 if (busy || !history.length) return;
 pages = history.pop(); clearDownload(); cards.forEach(releaseImage); render(); announce(t('Last edit undone.', 'Последнее изменение отменено.'));
});
get('editor-reset').addEventListener('click', () => {
 if (busy || !sources.length || !history.length) return;
 remember(); pages = originalPages(); cards.forEach(releaseImage); render();
 announce(t('Original page order and rotations restored.', 'Исходный порядок и поворот страниц восстановлены.'));
});
save.addEventListener('click', async () => {
 if (busy || !sources.length || !pages.length || (mergeMode && sources.length < 2)) return;
 busy = true; clearDownload(); controls(); save.textContent = t('Saving…', 'Сохранение…'); announce(t('Creating your PDF…', 'Создание PDF…'));
 try {
  await new Promise(resolve => setTimeout(resolve, 0));
  const output = await window.PDFLib.PDFDocument.create();
  const copiedById = new Map();
  for (const source of sources) {
   const chosen = pages.filter(page=>page.sourceId===source.id);
   if (!chosen.length) continue;
   const copied = await output.copyPages(source.doc,chosen.map(page=>page.index));
   copied.forEach((page,index)=>copiedById.set(chosen[index].id,page));
  }
  pages.forEach(entry=>{const page=copiedById.get(entry.id);page.setRotation(window.PDFLib.degrees((page.getRotation().angle+entry.turn)%360));output.addPage(page);});
  const bytes = await output.save();
  downloadUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const link = document.createElement('a'); link.href = downloadUrl; link.download = outputName(); link.className = 'download-button'; link.textContent = `↓ ${outputName()}`;
  result.append(link); link.focus(); announce(t('Ready. Download and check your PDF.', 'Готово. Скачайте и проверьте PDF.'));
 } catch { clearDownload(); announce(t('Could not save this PDF. Try a smaller or simpler document.', 'Не удалось сохранить PDF. Попробуйте документ меньшего размера или сложности.')); }
 finally { busy = false; save.textContent = mergeMode ? t('Merge PDF', 'Объединить PDF') : t('Save PDF', 'Сохранить PDF'); controls(); }
});
// Blob links are cleared when the document changes or the tab is closed.
window.addEventListener('pagehide', () => { clearDownload(); });

function closeZoom() {
 zoomRevision++;
 zoomRender?.cancel(); zoomRender=null;
 const dialog=get('page-preview-dialog');
 const wasOpen=dialog.open; if(wasOpen) dialog.close();
 const canvas=get('page-preview-canvas');canvas.width=0;canvas.height=0;
 if(wasOpen && zoomFocus?.isConnected) zoomFocus.focus();
}
async function openZoom(id) {
 const entry=pages.find(page=>page.id===id);if(!entry)return;
 const source=sources.find(source=>source.id===entry.sourceId);
 const dialog=get('page-preview-dialog'), canvas=get('page-preview-canvas'), message=get('page-preview-status');
 const trigger=document.activeElement;closeZoom();zoomFocus=trigger;
 const version=++zoomRevision;
 get('page-preview-title').textContent=`${source.name} · ${t('Page','Страница')} ${entry.index+1}`;
 dialog.showModal();get('page-preview-close').focus();message.textContent=t('Loading preview…','Загрузка страницы…');
 try {
  const page=await source.preview.getPage(entry.index+1);if(version!==zoomRevision)return;
  const natural=page.getViewport({scale:1,rotation:(page.rotate+entry.turn)%360});
  const scale=Math.min(1200/natural.width,1500/natural.height);
  const viewport=page.getViewport({scale,rotation:(page.rotate+entry.turn)%360});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  zoomRender=page.render({canvasContext:canvas.getContext('2d'),viewport});await zoomRender.promise;
  if(version===zoomRevision)message.textContent='';
 }catch{if(version===zoomRevision)message.textContent=t('Preview unavailable.','Просмотр недоступен.');}
 finally{if(version===zoomRevision)zoomRender=null;}
}
get('page-preview-close').addEventListener('click',closeZoom);
get('page-preview-dialog').addEventListener('cancel',event=>{event.preventDefault();closeZoom();});
get('page-preview-dialog').addEventListener('click',event=>{if(event.target===get('page-preview-dialog'))closeZoom();});
