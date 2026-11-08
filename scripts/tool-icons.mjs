const page='<path d="M10 5h17l7 7v27H10zM27 5v8h7"/>';
const photo='<rect x="5" y="8" width="24" height="29" rx="3"/><circle cx="12" cy="16" r="2"/><path d="m6 30 7-7 5 5 4-4 6 7"/>';
const conversion=(from,to)=>`${from==='PDF'?page:photo}<path d="M26 30h14m-5-5 5 5-5 5"/><rect x="20" y="2" width="25" height="15" rx="4" fill="currentColor" stroke="none"/><text x="32.5" y="12.5" text-anchor="middle" fill="white" stroke="none" font-size="8.5" font-weight="750" font-family="system-ui,sans-serif">${to}</text>`;
const paths={
 'merge-pdf':'<path d="M4 5h12v15H4zM28 5h12v15H28zM22 25v7m-8-8 8 8 8-8M13 35h18v8H13M10 20v5h24v-5"/>',
 'split-pdf':'<path d="M14 3h16v15H14zM22 18v8M8 26h28M8 26v6m28-6v6M3 33h11v11H3zM30 33h11v11H30z"/>',
 'organize-pdf':'<rect x="3" y="4" width="15" height="19" rx="2"/><rect x="26" y="4" width="15" height="19" rx="2"/><rect x="3" y="28" width="15" height="16" rx="2"/><path d="M28 36h12m-4-4 4 4-4 4M8 10h5M8 16h5M31 10h5M31 16h5"/>',
 'compress-pdf':`${page}<path d="m3 17 6 6-6 6m38-12-6 6 6 6M16 20h12m-12 6h12m-12 6h7"/>`,
 'compress-image':`${photo}<path d="m32 25 6 6 6-6m-6-8v14M12 3h10"/>`,
 'resize-image':'<rect x="9" y="9" width="26" height="26" rx="3"/><path d="M3 14V3h11M3 3l12 12m26 15v11H30m11 0L29 29"/>',
 'crop-image':'<path d="M12 3v29h29M3 12h29v29m-14-22 6 6m1-6-6 6"/>',
 'rotate-pdf':`${page}<path d="M37 24a10 10 0 1 1-7 17m7-17v9h-9"/>`,
 'number-pdf':`${page}<path d="M21 18h7m-7 8h7m-7 8h7"/><text x="14" y="20" fill="currentColor" stroke="none" font-size="8" font-family="system-ui,sans-serif">1</text><text x="14" y="28" fill="currentColor" stroke="none" font-size="8" font-family="system-ui,sans-serif">2</text><text x="14" y="36" fill="currentColor" stroke="none" font-size="8" font-family="system-ui,sans-serif">3</text>`,
 'watermark-pdf':'<path d="M9 32h26v8H9zM5 43h34M17 27v-7c-5-7-3-14 5-14s10 7 5 14v7M13 27h18v5H13"/>',
 'extract-images':`${page}<rect x="20" y="23" width="21" height="18" rx="2"/><path d="m21 36 6-6 5 4 4-3 4 5"/><circle cx="34" cy="28" r="1.5"/>`,
};
export function toolIcon(slug){const pair=slug.match(/^(jpg|png|webp|pdf)-to-(jpg|png|webp|pdf)$/);const content=pair?conversion(pair[1].toUpperCase(),pair[2]==='webp'?'WebP':pair[2].toUpperCase()):paths[slug]||page;return `<svg class="catalog-icon" viewBox="0 0 46 48" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;}
