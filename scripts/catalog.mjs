export const groups = {
 all: ['All tools', 'Все инструменты'],
 organize: ['Organize PDF', 'Организовать PDF'],
 convert: ['Convert to PDF', 'Конвертировать в PDF'],
 frompdf: ['Convert from PDF','Преобразовать из PDF'],
 edit: ['Edit PDF', 'Редактировать PDF'],
 images: ['Images', 'Изображения'],
};
export const tools = [
 {slug:'pdf-to-jpg',group:'frompdf',icon:'JPG',name:['PDF to JPG','PDF в JPG'],description:['Save PDF pages as JPG images in one ZIP archive.','Сохраните страницы PDF как JPG-изображения в одном ZIP-архиве.']},
 {slug:'pdf-to-png',group:'frompdf',icon:'PNG',name:['PDF to PNG','PDF в PNG'],description:['Render PDF pages as PNG images at a chosen resolution and download a ZIP.','Преобразуйте страницы PDF в PNG с выбором разрешения и скачайте ZIP.']},
 {slug:'png-to-pdf',group:'convert',icon:'▧',name:['PNG to PDF','PNG в PDF'],description:['Arrange PNG images into a PDF with original or A4 pages.','Соберите PNG в PDF с исходным размером страниц или A4.']},
 {slug:'compress-image',group:'images',icon:'↘',name:['Compress images','Сжать изображения'],description:['Optimize JPG, PNG and WebP images and compare file sizes.','Оптимизируйте JPG, PNG и WebP и сравните размер файлов.']},
 {slug:'resize-image',group:'images',icon:'↔',name:['Resize images','Изменить размер изображений'],description:['Resize JPG, PNG and WebP by dimensions, preserving proportions if needed.','Изменяйте размеры JPG, PNG и WebP с сохранением пропорций или точно по заданию.']},
 {slug:'organize-pdf', group:'organize', icon:'▦', name:['Organize PDF pages','Организовать страницы PDF'], description:['Preview, reorder, delete and rotate pages in one visual workspace.','Просматривайте, переставляйте, удаляйте и поворачивайте страницы в одном окне.']},
 {slug:'merge-pdf', group:'organize', icon:'⇲', name:['Merge PDF','Объединить PDF'], description:['Combine PDFs and images into one document; arrange, rotate and remove pages.','Объединяйте PDF и изображения: меняйте порядок, поворачивайте и удаляйте страницы.']},
 {slug:'split-pdf', group:'organize', icon:'⇱', name:['Split PDF','Разделить PDF'], description:['Extract a page range or save every page as a separate PDF.','Извлеките нужные страницы или сохраните каждую в отдельный PDF.']},
 {slug:'jpg-to-pdf', group:'convert', icon:'▧', name:['JPG to PDF','JPG в PDF'], description:['Turn JPG images into a PDF. Arrange images and choose the page size.','Соберите JPG-изображения в PDF. Настройте порядок и размер страниц.']},
 {slug:'rotate-pdf', group:'edit', icon:'↻', name:['Rotate PDF','Повернуть PDF'], description:['Rotate all pages or selected pages by 90, 180 or 270 degrees.','Поверните все или выбранные страницы на 90, 180 или 270 градусов.']},
 {slug:'jpg-to-png', group:'images', icon:'PNG', name:['JPG to PNG','JPG в PNG'], description:['Convert JPG images to PNG without further compression loss.','Преобразуйте JPG в PNG без дополнительных потерь при сжатии.']},
 {slug:'png-to-jpg', group:'images', icon:'JPG', name:['PNG to JPG','PNG в JPG'], description:['Convert PNG to JPG and choose a background for transparent areas.','Преобразуйте PNG в JPG и выберите фон для прозрачных областей.']},
];
export function toolNavigation(ru, prefix) {
 const i=Number(ru);
 return `<nav class="tool-navigation" aria-label="${ru?'Инструменты':'Tools'}"><a href="${prefix}#tools">${groups.all[i]}</a>${Object.entries(groups).filter(([g])=>g!=='all').map(([group,label])=>`<details class="nav-group"><summary>${label[i]}</summary><div class="nav-menu">${tools.filter(t=>t.group===group).map(t=>`<a href="${prefix}${t.slug}/">${t.name[i]}</a>`).join('')}</div></details>`).join('')}</nav>`;
}
export function catalog(ru,prefix) {
 const i=Number(ru);
 return `<main class="catalog"><section class="hero"><span class="eyebrow">${ru?'БЕСПЛАТНО · В БРАУЗЕРЕ · БЕЗ РЕГИСТРАЦИИ':'FREE · IN YOUR BROWSER · NO SIGN-UP'}</span><h1>${ru?'Инструменты для PDF и изображений':'PDF and image tools, made simple'}</h1><p class="subtitle">${ru?'Объединяйте, разделяйте и поворачивайте PDF, создавайте документы из изображений, экспортируйте страницы и оптимизируйте фотографии. Ваши файлы остаются на устройстве.':'Merge, split and rotate PDFs, create documents from images, export pages, and optimize photos. Your files stay on your device.'}</p></section><section id="tools" aria-label="${groups.all[i]}"><div class="category-filters" role="group" aria-label="${ru?'Категории':'Categories'}">${Object.entries(groups).map(([g,label])=>`<button type="button" data-filter="${g}" aria-pressed="${g==='all'}">${label[i]}</button>`).join('')}</div><div class="tool-grid">${tools.map(t=>`<a class="tool-card ${t.group}" href="${prefix}${t.slug}/" data-category="${t.group}"><span class="tool-icon" aria-hidden="true">${t.icon}</span><h2>${t.name[i]}</h2><p>${t.description[i]}</p><span class="card-action">${ru?'Открыть инструмент':'Open tool'} <span aria-hidden="true">→</span></span></a>`).join('')}</div><p id="catalog-status" class="sr-only" role="status" aria-live="polite"></p></section><section class="catalog-note"><h2>${ru?'Простая работа с файлами':'A simpler way to work with files'}</h2><p>${ru?'Выберите инструмент, добавьте файлы и сохраните результат. Все инструменты работают локально в браузере, без отправки ваших документов на сервер. Для каждой операции есть инструкция и описание ограничений.':'Choose a tool, add files and save the result. All tools process files locally in your browser without uploading documents to a server. Each tool includes instructions and explains its limits.'}</p></section></main>`;
}
