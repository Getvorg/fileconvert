import {languages,dictionaries,localePrefix,localizeHtml} from './localization.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {tools, toolNavigation, catalog} from './catalog.mjs';
import {pdfPage} from './pdf-page.mjs';
import {organizePage} from './organize-page.mjs';
import {imageLabPage} from './image-lab-page.mjs';
const origin = process.env.SITE_URL?.replace(/\/$/, '') || '';
if (origin && (!/^https:\/\//.test(origin) || new URL(origin).pathname !== '/')) throw Error('SITE_URL must be an HTTPS origin without a path');
const email = process.env.CONTACT_EMAIL || '';
if (email && !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(email)) throw Error('Invalid CONTACT_EMAIL');
const app = fs.readFileSync('app.js','utf8');
const translations = vm.runInNewContext(app.slice(app.indexOf('const translations ='),app.indexOf('const MAX_SIZE')) + '; translations');
const template = fs.readFileSync('templates/converter.html','utf8');
fs.rmSync('dist',{recursive:true,force:true}); fs.mkdirSync('dist');
for (const file of ['favicon.ico','favicon.png','favicon.svg','apple-touch-icon.png']) fs.copyFileSync(`assets/${file}`,`dist/${file}`);
for (const file of ['app.js','styles.css','catalog.js','pdf-tools.js','pdf-organizer.js','pdf-thumbnails.js','workspace-ui.js','image-lab.js','pdf-extras.js','live-stamp.js','i18n.js']) fs.copyFileSync(file,`dist/${file}`);
fs.mkdirSync('dist/vendor');
fs.copyFileSync('node_modules/fflate/esm/browser.js','dist/vendor/fflate.mjs');
fs.copyFileSync('node_modules/fflate/LICENSE','dist/vendor/fflate.LICENSE');
fs.copyFileSync('node_modules/pdf-lib/dist/pdf-lib.min.js', 'dist/vendor/pdf-lib.min.js');
fs.copyFileSync('node_modules/pdf-lib/LICENSE.md', 'dist/vendor/pdf-lib.LICENSE.md');
fs.mkdirSync('dist/vendor/pdfjs');
for (const name of ['pdf', 'pdf.worker', 'pdf.renderer']) fs.copyFileSync(`node_modules/pdfjs-dist/build/${name}.min.mjs`, `dist/vendor/pdfjs/${name}.mjs`);
for (const directory of ['cmaps','standard_fonts','wasm','iccs']) fs.cpSync('node_modules/pdfjs-dist/'+directory, 'dist/vendor/pdfjs/'+directory, {recursive:true});
fs.copyFileSync('node_modules/pdfjs-dist/LICENSE', 'dist/vendor/pdfjs/LICENSE');
const licenses = ['pdf-lib/LICENSE.md','@pdf-lib/standard-fonts/LICENSE.md','@pdf-lib/upng/LICENSE','pako/LICENSE','tslib/LICENSE.txt'];
fs.writeFileSync('dist/vendor/THIRD_PARTY_LICENSES.txt', licenses.map(file => `${file}\n${fs.readFileSync('node_modules/'+file,'utf8')}`).join('\n\n'));
fs.mkdirSync('dist/locales');
for(const [code,messages] of Object.entries(dictionaries))fs.writeFileSync(`dist/locales/${code}.js`,`window.FileLocale=${JSON.stringify(messages).replaceAll('<','\\u003c')};`);
const paths = [];
const escape = s => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
for (const lang of Object.keys(languages)) {
 const ru = lang === 'ru', prefix = localePrefix(lang);
 const labels = ru ? ['О проекте','Контакты','Конфиденциальность'] : ['About','Contact','Privacy Policy'];
 const footerNav = `<nav aria-label="${ru?'Информация':'Information'}">${['about','contact','privacy'].map((p,i)=>`<a href="${prefix}${p}/">${labels[i]}</a>`).join('')}</nav>`;
 const nav = toolNavigation(ru,prefix);
 function write(slug,title,description,body,mode='') {
  const path = prefix + (slug ? slug+'/' : ''); paths.push(path);
  const localizedPath=code=>localePrefix(code)+(slug?slug+'/':'');
  const seo = origin ? `<link rel="canonical" href="${origin}${path}">${Object.keys(languages).map(code=>`<link rel="alternate" hreflang="${code}" href="${origin}${localizedPath(code)}">`).join('')}<link rel="alternate" hreflang="x-default" href="${origin}${localizedPath('en')}"><meta property="og:url" content="${origin}${path}">` : '<meta name="robots" content="noindex,follow">';
  const language = `<details class="language-picker"><summary lang="${lang}">${languages[lang]}</summary><nav aria-label="Language">${Object.entries(languages).map(([code,label])=>`<a href="${localizedPath(code)}" lang="${code}" hreflang="${code}"${code===lang?' aria-current="page"':''}>${label}</a>`).join('')}</nav></details><input type="hidden" id="language" value="${lang}">`;
  let html = body.replace(/<html lang="en">/,`<html lang="${lang}">`).replace(/<title>.*?<\/title>/,`<title>${title}</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(description)}">${seo}<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta name="color-scheme" content="light">`).replace('href="styles.css"','href="/styles.css"').replace('src="app.js"','src="/app.js"').replace('<script src="/workspace-ui.js"',`${dictionaries[lang]?`<script src="/locales/${lang}.js" defer></script>`:''}<script src="/i18n.js" defer></script><script src="/workspace-ui.js"`).replace('</head>','<script src="/catalog.js" defer></script></head>').replace('<body>',`<body data-language="${lang}" data-mode="${mode}" data-page-title="${escape(title)}">`).replace(/<div class="language-control">.*?<\/div>/,language).replace('href="/" class="brand"',`href="${prefix}" class="brand"`).replace('</header>',`</header>${nav}`).replace(/<footer>.*?<\/footer>/s,`<footer>© ${new Date().getFullYear()} FileConvert${footerNav}</footer>`);
  if(mode) {
   html=html.replace(/data-i18n="title"/,'').replace(/<h1[^>]*>.*?<\/h1>/,`<h1>${title.replace(' | FileConvert','')}</h1>`);
   html=html.replace(/<button class="mode-tab[^>]*data-mode="(.*?)"[^>]*>(.*?)<\/button>/g,(_,m,text)=>`<a class="mode-tab${m===mode?' active':''}" href="${prefix}${m==='jpg-png'?'jpg-to-png':'png-to-jpg'}/">${text}</a>`);
  }
  html=html.replace(/(<[a-z0-9]+[^>]*data-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/g,(_,a,k,b,c)=>a+(translations[ru?'ru':'en'][k]||b)+c);
  html=localizeHtml(html,lang);
  const dir = 'dist'+path; fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(dir+'index.html',html);
 }
 for(const slug of ['jpg-to-png','png-to-jpg']) {
  const png=slug==='png-to-jpg', mode=png?'png-jpg':'jpg-png';
  const title=slug ? `${png?'PNG → JPG':'JPG → PNG'} ${ru?'онлайн бесплатно':'Free Online Converter'} | FileConvert` : ru?'Конвертер JPG и PNG онлайн | FileConvert':'Free JPG & PNG Image Converter | FileConvert';
  const desc=ru?'Конвертируйте изображения до 20 МБ прямо в браузере. Без регистрации и отправки файлов на сервер.':'Convert images up to 20 MB in your browser. No registration or image uploads. Choose a background for transparent PNG images.';
  const guide=ru?`<h2>Как ${png?'конвертировать PNG в JPG':'конвертировать JPG в PNG'}</h2><ol><li>Выберите изображение ${png?'PNG':'JPG или JPEG'} размером до 20 МБ.</li><li>${png?'Выберите цвет фона для прозрачных участков.':'Проверьте имя и предпросмотр изображения.'}</li><li>Нажмите кнопку конвертации и скачайте результат.</li></ol><h2>Что происходит с качеством?</h2><p>${png?'JPG использует сжатие с потерями (качество 92%). Прозрачность заменяется выбранным цветом. Для логотипов и текста PNG часто подходит лучше.':'PNG сохраняет декодированные пиксели без дополнительных потерь, но не восстанавливает детали, утраченные при сжатии JPG. Файл может стать больше; фон не станет прозрачным.'}</p>`:`<h2>How to ${png?'convert PNG to JPG':'convert JPG to PNG'}</h2><ol><li>Select a ${png?'PNG':'JPG or JPEG'} image up to 20 MB.</li><li>${png?'Choose a background color for transparent pixels.':'Check the filename and image preview.'}</li><li>Press Convert and download the result.</li></ol><h2>What happens to image quality?</h2><p>${png?'JPG uses lossy compression at 92% quality. Transparent areas become the selected solid color. PNG is often better for logos and text.':'PNG preserves decoded pixels without further compression loss. It cannot recover detail already lost in the JPG. The file can become larger and its background will not become transparent.'}</p>`;
  const limits=ru?'Работает в современных Chrome, Firefox, Edge и Safari. Лимит конвертации — 40 мегапикселей; доступная память устройства может ограничить его ещё сильнее. Метаданные исходного файла могут не сохраниться. При ошибке попробуйте изображение меньшего разрешения.':'Works in modern Chrome, Firefox, Edge and Safari. Conversion is limited to 40 megapixels; device memory can impose lower limits. Original metadata may not be retained. If conversion fails, try an image with smaller dimensions.';
  write(slug,title,desc,template.replace('<section class="faq">',`<section class="content-guide">${guide}<h2>${ru?'Ограничения':'Limits and troubleshooting'}</h2><p>${limits}</p></section><section class="faq">`),mode);
 }
 function pageShell(main, scripts='') {
  return template.replace(/<main>[\s\S]*?<\/main>/,main).replace(/  <div id="successModal"[\s\S]*?<footer>/,'  <footer>').replace('  <script src="app.js" defer></script>',`  ${scripts}`);
 }
 write('',ru?'Инструменты PDF и изображений онлайн | FileConvert':'Free PDF and Image Tools Online | FileConvert',ru?'Объединение, разделение и поворот PDF, JPG в PDF и конвертация, сжатие и изменение размеров изображений. Бесплатно в браузере.':'Merge, split and rotate PDFs, convert JPG to PDF and convert, compress and resize images. Free tools that process files in your browser.',pageShell(catalog(ru,prefix)));
 for(const tool of tools.filter(t=>!['jpg-to-png','png-to-jpg','organize-pdf','merge-pdf','compress-image','resize-image','crop-image','webp-to-jpg','webp-to-png','jpg-to-webp','png-to-webp'].includes(t.slug))) {
  write(tool.slug,`${tool.name[Number(ru)]} ${ru?'онлайн бесплатно':'Online Free'} | FileConvert`,tool.description[Number(ru)],pageShell(pdfPage(tool,ru),'<script src="/vendor/pdf-lib.min.js" defer></script><script src="/pdf-tools.js" type="module"></script>'));
 }
 for(const tool of tools.filter(t=>['compress-image','resize-image','crop-image','webp-to-jpg','webp-to-png','jpg-to-webp','png-to-webp'].includes(t.slug))){write(tool.slug,`${tool.name[Number(ru)]} ${ru?'онлайн бесплатно':'Online Free'} | FileConvert`,tool.description[Number(ru)],pageShell(imageLabPage(tool,ru),'<script src="/image-lab.js" type="module"></script>'));}
 for (const slug of ['organize-pdf','merge-pdf']) {
 const organizer = tools.find(tool=>tool.slug===slug);
 write(organizer.slug,`${organizer.name[Number(ru)]} ${ru?'онлайн бесплатно':'Online Free'} | FileConvert`,organizer.description[Number(ru)],pageShell(organizePage(ru,slug==='merge-pdf'),'<script src="/vendor/pdf-lib.min.js" defer></script><script src="/pdf-organizer.js" type="module"></script>'));
 }
 const content={
 about:ru?'<h1>О FileConvert</h1><p>FileConvert — бесплатный инструмент для работы с PDF и изображениями в браузере. Регистрация не требуется.</p><h2>Как это работает</h2><p>Файлы открываются и обрабатываются локально в вашем браузере. Мы не получаем содержимое выбранных файлов.</p><h2>Доступные инструменты</h2><p>Доступны JPG → PNG, PNG → JPG, JPG/PNG → PDF, PDF → JPG/PNG, сжатие и изменение размеров изображений, объединение, разделение и поворот PDF, визуальное удаление и перестановка страниц, нумерация, водяные знаки, сжатие PDF, обрезка и конвертация WebP. Все инструменты работают в браузере.</p>':'<h1>About FileConvert</h1><p>FileConvert is a free browser tool for working with PDFs and images without an account.</p><h2>How it works</h2><p>Your browser opens and processes files locally on your device. We do not receive selected file contents.</p><h2>Available tools</h2><p>JPG → PNG, PNG → JPG, JPG/PNG → PDF, PDF → JPG/PNG, image compression and resizing, PDF merge, split, rotation, visual page organization, numbering, watermarks, PDF compression, cropping and WebP conversions are available. All tools work in your browser.</p>',
 contact:`<h1>${labels[1]}</h1><p>${ru?'Сообщите об ошибке или предложите улучшение. Укажите браузер, устройство и шаги воспроизведения. Не отправляйте личные документы и конфиденциальные изображения.':'Report a bug or suggest an improvement. Include your browser, device and steps to reproduce. Do not send personal documents or confidential images.'}</p>${email?`<p><a href="mailto:${email}">${email}</a></p>`:`<p><a href="https://github.com/Getvorg/fileconvert/issues">${ru?'Создать публичное обращение на GitHub':'Open a public issue on GitHub'}</a></p><p>${ru?'Обращения видны всем; для отправки нужен аккаунт GitHub.':'Issues are public and require a GitHub account to submit.'}</p>`}`,
 privacy:ru?'<h1>Политика конфиденциальности</h1><p>Обновлено: 7 ноября 2026 года.</p><h2>Ваши файлы</h2><p>Конвертация выполняется на устройстве. Изображения и PDF не отправляются на сервер. Временные данные находятся в памяти вкладки; скачанные файлы остаются у вас.</p><h2>Данные посещения</h2><p>Хостинг может обрабатывать IP-адрес, адрес страницы, сведения о браузере и время запроса в технических журналах. Конкретный провайдер и сроки хранения будут указаны после выбора хостинга.</p><h2>Cookies и реклама</h2><p>В текущей версии нет рекламы, аналитики и рекламных cookies. Выбор языка определяется адресом страницы. Перед подключением рекламы политика будет обновлена, а для регионов, где это требуется, будет настроено согласие до загрузки рекламных технологий.</p><h2>Обращения</h2><p>Используйте страницу контактов для вопросов и запросов о данных. Публичные обращения GitHub обрабатываются также по правилам GitHub.</p>':'<h1>Privacy Policy</h1><p>Updated: November 7, 2026.</p><h2>Your files</h2><p>Conversion takes place on your device. Images and PDFs are not uploaded. Temporary image data stays in tab memory; downloaded files remain on your device.</p><h2>Visit data</h2><p>The hosting provider may process IP addresses, requested URLs, browser details and request times in operational logs. The provider and retention details will be added after hosting is selected.</p><h2>Cookies and advertising</h2><p>This version has no ads, analytics or advertising cookies. Language is determined by the page URL. Before advertising is enabled, this policy will be updated and consent will be configured before loading advertising technologies where required.</p><h2>Contact and requests</h2><p>Use the contact page for privacy questions and data requests. Public GitHub issues are also subject to GitHub’s privacy practices.</p>'
 };
 for(const [slug,contentHtml] of Object.entries(content)) {
 const shell=template.replace(/<main>[\s\S]*?<\/main>/,`<main class="legal">${contentHtml}</main>`).replace(/  <div id="successModal"[\s\S]*?<footer>/,'  <footer>').replace('  <script src="app.js" defer></script>','');
 write(slug,`${labels[['about','contact','privacy'].indexOf(slug)]} | FileConvert`,ru?'Информация о сервисе FileConvert.':'Information about the FileConvert service.',shell);
 }
}
fs.writeFileSync('dist/robots.txt',origin?`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
if(origin) fs.writeFileSync('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${escape(origin+p)}</loc></url>`).join('')}</urlset>`);
fs.writeFileSync('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found | FileConvert</title><h1>Page not found / Страница не найдена</h1><a href="/">FileConvert home</a></html>');
console.log(`Built ${paths.length} pages. ${origin ? 'Production SEO enabled for '+origin : 'Preview: indexing disabled. Set SITE_URL for production.'}`);
