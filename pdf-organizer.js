import * as pdfjs from '/vendor/pdfjs/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
const ru = document.documentElement.lang === 'ru';
const t = (en, r) => ru ? r : en;
const get = id => document.getElementById(id);
const input = get('editor-file'), feedback = get('editor-feedback');
const workspace = get('editor-workspace'), grid = get('editor-pages');
const save = get('editor-save'), result = get('editor-result');
let source = null, preview = null, loadingTask = null, sourceName = '';
let pages = [], history = [], busy = false, revision = 0, downloadUrl = null;
let renderQueue = [], rendering = false, dragId = null;
const cards = new Map();
const visible = new Set();
const outputName = () => sourceName.replace(/\.pdf$/i, '') + '-organized.pdf';
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
 save.disabled = busy || !pages.length;
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
   if (!page || !card || !visible.has(id) || !preview) continue;
   const img = card.querySelector('img');
   if (img.dataset.turn === String(page.turn)) continue;
   const version = revision, turn = page.turn, doc = preview;
   status(card, t('Loading preview…', 'Загрузка миниатюры…'));
   let pdfPage, canvas;
   try {
    pdfPage = await doc.getPage(id + 1);
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
 node.addEventListener('click', () => act(action, id));
 return node;
}
function createCard(page) {
 const id = page.id, card = document.createElement('li'); card.className = 'page-card'; card.dataset.pageId = id;
 const top = document.createElement('div'); top.className = 'page-card-top';
 const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox';
 checkbox.setAttribute('aria-label', t(`Select page ${id + 1}`, `Выбрать страницу ${id + 1}`));
 checkbox.addEventListener('change', () => { if (busy) return; const current = pages.find(page => page.id === id); current.selected = checkbox.checked; controls(); });
 label.append(checkbox, document.createTextNode(t(`Page ${id + 1}`, `Страница ${id + 1}`)));
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
 const actions = document.createElement('div'); actions.className = 'page-actions';
 actions.append(button('previous', '←', t('Move earlier: page', 'Переместить раньше: страница'), id), button('next', '→', t('Move later: page', 'Переместить позже: страница'), id), button('rotate', '↻', t('Rotate: page', 'Повернуть: страница'), id), button('delete', '×', t('Delete: page', 'Удалить: страница'), id));
 const moveLabel = document.createElement('label'); moveLabel.className = 'page-move-label'; moveLabel.textContent = t('Move to position', 'На позицию');
 const move = document.createElement('input'); move.type = 'number'; move.min = '1'; move.step = '1';
 move.setAttribute('aria-label', t(`Position for page ${id + 1}`, `Позиция страницы ${id + 1}`));
 move.addEventListener('change', () => {
  const target = Number(move.value);
  if (!Number.isInteger(target) || target < 1 || target > pages.length) { announce(t(`Enter a position between 1 and ${pages.length}.`, `Введите позицию от 1 до ${pages.length}.`)); controls(); return; }
  movePage(id, target - 1, 'input[type=number]');
 });
 moveLabel.append(move);
 card.append(top, frame, positionText, actions, moveLabel);
 card.addEventListener('dragover', event => { if (dragId !== null && dragId !== id && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('is-drop-target'); } });
 card.addEventListener('dragleave', event => { if (!card.contains(event.relatedTarget)) card.classList.remove('is-drop-target'); });
 card.addEventListener('drop', event => {
  if (dragId === null || busy) return;
  event.preventDefault(); event.stopPropagation();
  const from = dragId, target = pages.findIndex(page => page.id === id); clearDrag(); movePage(from, target);
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
 if (action === 'delete' && pages.length === 1) return;
 remember();
 if (action === 'rotate') { pages[index].turn = (pages[index].turn + 90) % 360; releaseImage(cards.get(id)); }
 else if (action === 'delete') pages.splice(index, 1);
 render();
 focusPage(action === 'delete' ? pages[Math.min(index, pages.length - 1)].id : id);
 announce(action === 'rotate' ? t(`Page ${id + 1} rotated 90° clockwise.`, `Страница ${id + 1} повёрнута на 90° по часовой стрелке.`) : t(`Page ${id + 1} removed. Undo is available.`, `Страница ${id + 1} удалена. Можно отменить действие.`));
}
async function disposePreview() {
 observer.disconnect(); cards.forEach(releaseImage); cards.clear(); visible.clear(); renderQueue = []; grid.replaceChildren();
 const task = loadingTask; loadingTask = null; preview = null;
 if (task) { try { await task.destroy(); } catch { /* Already destroyed. */ } }
}
async function loadFile(file) {
 if (busy || !file) return;
 if (!file.size || file.size > 50 * 1024 * 1024 || (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) {
  announce(t('Choose a non-empty PDF up to 50 MB. Your current document has been kept.', 'Выберите непустой PDF до 50 МБ. Текущий документ сохранён.')); return;
 }
 const version = ++revision;
 clearDownload(); source = null; pages = []; history = []; workspace.hidden = true;
 announce(t('Opening PDF…', 'Открытие PDF…'));
 await disposePreview();
 if (version !== revision) return;
 try {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (version !== revision) return;
  const document = await window.PDFLib.PDFDocument.load(bytes);
  if (version !== revision) return;
  const count = document.getPageCount();
  if (!count || count > 500) throw Error('page-limit');
  source = document; sourceName = file.name;
  pages = Array.from({length: count}, (_,id) => ({id, turn: 0, selected: false}));
  loadingTask = pdfjs.getDocument({data: bytes, isEvalSupported: false, useSystemFonts: true, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/'});
  // No password prompts or embedded PDF scripting; only page canvases are rendered.
  preview = await loadingTask.promise;
  if (version !== revision) return;
  get('editor-filename').textContent = file.name; workspace.hidden = false; render();
  announce(t('Ready. Reorder, rotate or delete pages, then save your PDF.', 'Готово. Измените порядок, поверните или удалите страницы, затем сохраните PDF.'));
 } catch (error) {
  if (version !== revision) return;
  source = null; pages = []; workspace.hidden = true; await disposePreview();
  announce(error.message === 'page-limit' ? t('Choose a PDF with 1–500 pages.', 'Выберите PDF от 1 до 500 страниц.') : t('Cannot open PDF. It may be encrypted, damaged or unsupported.', 'Не удалось открыть PDF. Он может быть зашифрован, повреждён или не поддерживаться.'));
 }
}
input.addEventListener('change', () => { const file = input.files[0]; input.value = ''; void loadFile(file); });
const drop = get('editor-dropzone');
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); if (!busy && event.dataTransfer.types.includes('Files')) drop.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop', event => {
 if (event.dataTransfer.files.length !== 1) { announce(t('Choose one PDF at a time.', 'Выберите один PDF за раз.')); return; }
 void loadFile(event.dataTransfer.files[0]);
});
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
 if (busy || !source || !history.length) return;
 remember(); pages = Array.from({length: source.getPageCount()}, (_,id) => ({id, turn: 0, selected: false})); cards.forEach(releaseImage); render();
 announce(t('Original page order and rotations restored.', 'Исходный порядок и поворот страниц восстановлены.'));
});
save.addEventListener('click', async () => {
 if (busy || !source || !pages.length) return;
 busy = true; clearDownload(); controls(); save.textContent = t('Saving…', 'Сохранение…'); announce(t('Creating your PDF…', 'Создание PDF…'));
 try {
  await new Promise(resolve => setTimeout(resolve, 0));
  const output = await window.PDFLib.PDFDocument.create();
  const copied = await output.copyPages(source, pages.map(page => page.id));
  copied.forEach((page,index) => { page.setRotation(window.PDFLib.degrees((page.getRotation().angle + pages[index].turn) % 360)); output.addPage(page); });
  const bytes = await output.save();
  downloadUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const link = document.createElement('a'); link.href = downloadUrl; link.download = outputName(); link.className = 'download-button'; link.textContent = `↓ ${outputName()}`;
  result.append(link); link.focus(); announce(t('Ready. Download and check your PDF.', 'Готово. Скачайте и проверьте PDF.'));
 } catch { clearDownload(); announce(t('Could not save this PDF. Try a smaller or simpler document.', 'Не удалось сохранить PDF. Попробуйте документ меньшего размера или сложности.')); }
 finally { busy = false; save.textContent = t('Save PDF', 'Сохранить PDF'); controls(); }
});
// Blob links are cleared when the document changes or the tab is closed.
window.addEventListener('pagehide', () => { clearDownload(); });
