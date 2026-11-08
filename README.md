# FileConvert

Static bilingual (EN/RU) PDF and image tools with a grouped directory and top navigation. Images stay in the browser. No accounts, image uploads, advertising or analytics.

## Development

Requires Node.js 22.13+ and Python 3. The pinned pdf-lib, PDF.js and fflate dependencies are bundled locally; no runtime CDN is used.

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8000. Edit `templates/converter.html`, `app.js`, `pdf-tools.js`, `catalog.js`, `pdf-organizer.js`, `pdf-thumbnails.js`, `workspace-ui.js`, `styles.css`, and the modules in `scripts/`; rebuild after changes. Only `dist/` is served and deployed. Builds without `SITE_URL` intentionally disable search indexing.

```sh
npm run check
# Optional browser integration checks, with Python Playwright and system Chromium installed:
python tests/browser.py
# PDF integration checks additionally require PyMuPDF and Pillow:
python tests/pdf_browser.py
python tests/organizer_browser.py
python tests/merge_visual_browser.py
python tests/mixed_merge_browser.py
python tests/preview_stage_browser.py
python tests/page_actions_zip_browser.py
python tests/workspace_polish_browser.py
python tests/new_conversion_tools_browser.py
python tests/advanced_tools_browser.py
```

Browser checks require the local server, use `/usr/bin/chromium`, and save a screenshot in `work/`.

## Deploy to Netlify

1. Import this GitHub repository in Netlify. `netlify.toml` sets build and publish directory (`dist`).
2. Add the production environment variable `SITE_URL=https://your-domain.tld` (HTTPS origin only). Add `CONTACT_EMAIL` for a private support address; otherwise contact links to public GitHub issues.
3. Add your owned domain in Netlify Domain management. Apply the DNS records Netlify supplies at your registrar. Wait for domain verification and HTTPS certificate provisioning.
4. Choose the primary hostname, redirect the alternative hostname, and rebuild with the matching `SITE_URL`.
5. Check all 22 language versions, HTTPS, canonical links, `/robots.txt`, `/sitemap.xml`, the real contact address, and an unknown URL returning HTTP 404.
6. Register the domain in Google Search Console, verify ownership through DNS, and submit `/sitemap.xml`. Indexing and advertising approval are not guaranteed.

To build elsewhere, provide the same variables and upload only `dist/`. Configure the host to serve directory `index.html`, real 404 responses, HTTPS, and the security headers from `netlify.toml`. Do not enable a blanket SPA fallback.

## Before advertising application

- Identify the actual operator and contact details; finalize About/Privacy with the hosting provider, log retention, recipients and applicable rights. Current privacy text explicitly leaves hosting details pending.
- Add and maintain original useful guides; the functional tools are JPG → PNG, PNG → JPG, JPG → PDF, PDF merge, split, rotation and a visual page organizer.
- Check the selected advertising network's site eligibility and content requirements. More pages alone do not guarantee approval.
- No publisher ID, fake `ads.txt`, ad slots or ad scripts are installed. Add the exact network-provided `ads.txt` only after receiving publisher details.
- For Google advertising in the EEA, UK and Switzerland, choose a Google-certified CMP compatible with the required IAB TCF integration. Configure regional behavior, equally accessible rejection, consent withdrawal, and test that ad/analytics requests are blocked until allowed. A custom decorative cookie banner is not sufficient.
- Update Privacy with the actual vendors and processing before activation. Revise the CSP in `netlify.toml` narrowly for those vendors; current CSP deliberately permits only local resources.

## Roadmap

1. **Delivered:** distinct JPG → PNG / PNG → JPG pages, EN/RU URLs, instructions, About, Contact, Privacy, production SEO generation and static hosting configuration.
2. **Delivered:** filterable tool cards, grouped top navigation, JPG → PDF with original/A4 pages, visual PDF merge with page reordering, split/extraction with inclusive page ranges or one file per page, relative clockwise PDF rotation. PDF processing uses locally bundled pdf-lib 1.17.1 (MIT license copied to `/vendor/pdf-lib.LICENSE.md`). Add tools in `scripts/catalog.mjs` to extend the directory and navigation.
3. **Delivered:** visual PDF page organizer (`/organize-pdf/`, `/ru/organize-pdf/`), lazy thumbnails, drag reorder, keyboard/mobile position controls, individual and bulk deletion/rotation, 30-step undo and reset. Links are available from existing PDF tools.
4. **Delivered:** PNG → PDF, PDF → JPG/PNG ZIP export, JPG/PNG/WebP image compression and resizing.
5. **Delivered:** page numbering, text/image watermarks, embedded raster extraction, lossless/raster PDF compression, cropping and four WebP conversion pages.
6. **Separate evaluation:** compression, OCR, Office ↔ PDF, PDF/A, repair, redaction, signatures and forms. Some need backend services, font/rendering infrastructure or careful security validation. Visual overlays must never be described as secure redaction; adding a signature image is not a cryptographic signature.

The screenshot is a long-term tool catalog, not a list of currently supported features. No nonworking PDF buttons are shown.

## Image limits

20 MB input limit; conversion rejects images over 40 million pixels to limit canvas memory. Device limits can be lower. JPG output uses quality 0.92 and the selected background color. JPG → PNG cannot recover lost detail or create transparency. Canvas conversion may discard metadata.

## PDF limits and checks

50 MB input total, 50 files, 500 pages per source and output. JPG input additionally has a 20 MB / 40 MP limit. Processing runs on the browser main thread and can take time on large documents; controls are locked while processing. Split-every-page is the default and produces a ZIP archive containing one PDF per remaining page. Encrypted PDFs are rejected without bypassing encryption. Page copying may omit bookmarks, attachments, interactive forms and document-level data; digital signatures are invalidated by edits. JPG images retain their encoded orientation (EXIF orientation is not applied). Always verify the output and keep originals.

`tests/pdf_browser.py` verifies the actual downloaded PDF files using an independent parser (PyMuPDF), including page text/order, inherited rotations, image embedding and A4 size, plus error handling, catalog filters, navigation, mobile overflow and absence of external browser requests.

## Visual page organizer

Organize accepts one source PDF. Merge accepts 2–50 PDFs or images, with additional files appended on later selections. PNG, JPG/JPEG, WebP, GIF, BMP, AVIF and SVG images are converted to one PDF page each. Other browser-decodable image formats are attempted; HEIC/TIFF support is browser-dependent. Both tools share the same thumbnail-card workspace, with a magnifier preview, clockwise rotate and delete controls on each card. Images have a 20 MB / 40 MP per-file limit. Limits are 50 MB and 500 original pages across all loaded sources (deleted pages do not free that import limit). Page labels retain their original numbers, while position labels show the output order. At least one page must remain. Selection alone does not change the output; delete and rotate actions affect selected pages. Reset restores the original order/rotation across all imported documents and can itself be undone. Only the 30 most recent editing states are kept.

PDF.js 6.5.438 (Apache-2.0) renders thumbnails in a local worker. Worker, fonts, CMaps, WASM decoders and licenses are published under `/vendor/pdfjs/`. Visual merge and the page organizer load PDF.js; split/rotate import it lazily after selecting a PDF. JPG tools and the catalog do not load the PDF.js runtime. The CSP allows same-origin workers and WebAssembly compilation (`wasm-unsafe-eval`), without permitting JavaScript eval or remote scripts. Preview rendering disables PDF.js eval support and does not run document scripts or create interactive PDF annotation links.

Thumbnails render sequentially near the viewport. Offscreen image URLs are released; undo history stores page indices, rotations and selections rather than copies of the source PDF. Download links are invalidated after content changes. In organize mode, selecting a new PDF clears edits to the previous document; in merge mode, successful imports append pages and failed batches preserve prior files and edits; malformed, encrypted and over-limit documents cannot be exported.

`tests/organizer_browser.py` checks real painted previews with production CSP, drag ordering, page/selection edits, undo/reset, independent parsing of saved PDF text and rotations, error recovery, mobile controls, lazy rendering and local asset requests. Modern browsers supporting module workers and the current PDF.js runtime are required. Preview/export fidelity for complex documents can vary; retain the original.

The page-card magnifier opens a native modal dialog with a larger rendered page, an accessible close button and Escape support. Page ordering controls remain available under each card’s Change position disclosure. On phones, card controls remain visible. `tests/merge_visual_browser.py` verifies multi-file imports/appends, cross-document ordering, individual page rotation/deletion, atomic failed batches, modal focus and independently parsed PDF output.

## Mixed-file merge

`/merge-pdf/` accepts a mixture of PDFs and images, retaining input file order. PDFs remain PDF pages; images are decoded locally, respecting browser EXIF orientation, and embedded as PNG-backed PDF pages. Image aspect ratio and transparency are preserved. Page dimensions use one PDF point per image pixel, scaled down proportionally if a side would exceed 14,400 PDF points. Animations and multi-frame images contribute one still frame; SVG is rasterized. Re-encoding does not recover lost image detail and can increase file size.

No external conversion service or new decoder dependency is used. Formats not decoded by the current browser produce a clear error recommending PNG/JPG. A rejected batch does not partially import or replace previously loaded files. `tests/mixed_merge_browser.py` checks actual PNG/JPEG/WebP/GIF/BMP/AVIF/SVG files under production CSP, mixed output text/colors/dimensions, transparent PNG, EXIF rotation, animated GIF, image-only/drop merging, import limits and atomic failures.

## Upload-to-preview state

All tool pages now replace their large upload prompt with previews after selection. Native file inputs stay visually hidden; accessible upload labels and compact Add/Replace controls open the picker. Merge/organize retain their shared visual page editor. JPG → PDF displays image cards with existing ordering/removal actions. JPG/PNG converters use a full image preview with replace/remove controls. Removing the last file restores the initial upload state.

Split and rotate use `pdf-thumbnails.js`, which renders selected PDFs lazily with PDF.js and releases offscreen blob URLs. Checkbox selection and the page-range input stay synchronized. An empty range means all pages; at least one checkbox remains selected. Split-every-page disables subset selection. Rotate previews include the original page rotation plus the selected output angle, matching the saved PDF. Replacing/removing the PDF destroys the previous preview document; preview failures do not bypass conversion validation.

`tests/preview_stage_browser.py` exercises all tools in both languages: upload/previews occupying the same stage, restoration/replacement, painted thumbnails, visual range selection, rotation/output agreement and mobile overflow.

## Per-card actions and split ZIP

All tool previews expose rotation and removal. JPG/PNG image converters apply the preview rotation to actual saved pixels; JPG → PDF keeps JPEG data and applies per-page PDF rotation. Split/rotate cards expose additional clockwise quarter turns and soft deletion, with Reset page edits restoring them. At least one PDF page must remain. Deleted pages are excluded from exported PDFs and ZIP files. In the rotate tool, card rotations add to the global rotation applied to the selected pages; previews and output use the same sum.

Split defaults to one PDF per remaining page inside a ZIP (`page-001.pdf`, `page-003.pdf`, etc., retaining original page numbers). Range extraction into a single PDF remains available. fflate 0.8.2 is bundled locally under `/vendor/fflate.mjs` with its MIT license. ZIP entries use fixed ASCII names and no directory components. ZIP creation uses store mode (level 0), since PDF streams are already compressed. All per-page PDFs and the final archive are built in browser memory, so large documents can reach device limits.

`tests/page_actions_zip_browser.py` opens the downloaded archive with Python zipfile, checks integrity/entry names, independently parses every page, verifies saved rotations/deletions and image dimensions, and covers reset/last-page behavior, EN/RU and mobile layout.

Document options (page range, bulk rotation, split output mode, JPG page size) now sit inside a closed Advanced settings disclosure. The redundant link to a separate visual editor is removed from tool workspaces. Per-card actions remain the primary controls. Bulk PDF rotation defaults to 0°, so selecting a document alone never rotates it; card quarter turns still add to any explicitly chosen bulk angle.

## Shared cards, undo and save panel

`workspace-ui.js` supplies the same SVG preview/rotate/delete actions and tooltips across all tools, image/PDF preview dialogs, reorder handles, history helpers and the result panel. The panel sits beside the workspace above 900px, follows the page while scrolling, and moves below the workspace on smaller screens. Users can set an output filename; names are sanitized and the correct output extension is kept. Renaming an already generated result updates download attributes without regenerating file data. Exact output size is shown after processing, never estimated.

Progress is measured when page/image counts are available (ZIP generation, image-to-PDF pages and copied source pages); reading, encoding and final PDF/ZIP serialization use an indeterminate indicator. No timer simulates progress. ZIP loops yield to the browser between batches. Editing/undo invalidates previous download links and size metadata.

Split/rotate/JPG-to-PDF and image converters now have Undo controls; merge/organize retain their existing Undo. The new history stores at most 30 states and trims older entries when their unique source files exceed 100 MB. File bytes are referenced rather than copied, with image URLs regenerated on restore. This budget excludes the current document and decoded browser/worker memory. Settings, page turns/removals and order are restored. Preview dialogs support close/Escape and restore focus to the triggering control.

Reordering supports native mouse drag, touch-pointer handles, and arrow buttons. PDF source page indices stay stable while visual/output order changes. ZIP entry names retain original page numbers, and entries follow the chosen page order. JPEG pages remain encoded JPEG data; PDF page rotations are applied after embedding. PNG/JPG converters apply rotations to exported pixels.

`tests/workspace_polish_browser.py` checks Undo after deletion and rotation, reorder/Undo, all preview buttons, custom names, exact byte sizes, measured ZIP progress, independently parsed PDF/image/ZIP output, both languages, desktop/mobile layout and real browser touch events. Existing conversion, PDF and preview suites remain part of verification.

## PDF images and image optimization

The catalog now contains 21 tools (50 EN/RU pages including home and information pages). `png-to-pdf` reuses the image/PDF workspace, embeds PNG alpha, supports original/A4 pages, turns, ordering and Undo. Original-size PDF pages preserve image proportions and are scaled down if a side exceeds 14,400 PDF points. PNG dimensions are checked before embedding. `pdf-to-jpg` and `pdf-to-png` render selected pages with the existing local PDF.js worker and package images in one ZIP. Resolution choices are 72/144/216 DPI (144 default); JPG quality is 90%, PNG is lossless, page background white. This renders complete pages rather than extracting embedded images. Exports respect rotations, deletions and ordering; limit 100 selected pages, 40 MP per output image, 200 MB combined image data. Source PDF limits remain 50 MB / 500 pages.

`image-lab.js` powers `compress-image` and `resize-image`, supporting JPG, PNG and WebP, shared card actions, order, Undo, save metadata and real progress. One result downloads directly; batches use ZIP with stable ASCII names. Input limits are 50 images, 20 MB each / 50 MB total and 40 MP per image. Output is limited to 40 MP, 16,384 pixels per side and 200 MB image data per job. No new dependencies or external conversion services were added.

Compression defaults to the source format and quality 80% for JPEG/WebP. PNG stays lossless. If same-format compression without rotation would increase size, the original is retained. Resizing offers aspect-preserving fit or exact dimensions, with enlargement off by default; quality defaults to 92%. PNG/WebP preserve alpha; JPEG uses a chosen background. The workspace reports input/output image bytes and actual reduction or growth, while the save panel reports actual download size (including ZIP overhead). SVG/HEIC/TIFF are not supported by these two image tools; mixed-file merge retains its wider browser-dependent import behavior.

`tests/new_conversion_tools_browser.py` independently inspects PDF/ZIP/image outputs: raster DPI, colors, sizes, page turns/removals, PNG transparency in PDF, A4, noisy-JPEG reduction, alpha-preserving batches, exact/proportional resize, rotated dimensions, WebP, Undo/errors, EN/RU routes, catalog and mobile overflow.

## Additional PDF and image tools

- `number-pdf`: selectable pages, starting number, font size/color and page position. Numbers follow the current output-page order. Stamps are mapped into visible page coordinates, including existing page rotation and CropBox offsets.
- `watermark-pdf`: text or PNG/JPG mark, position, opacity and angle. Text is rasterized at 2x size to support Unicode/Cyrillic without a font download; existing PDF text remains searchable. Watermarks are overlays, not secure redaction. Image marks are limited to 20 MB / 40 MP. History retains image-mark Files within the shared history budget.
- `extract-images`: used embedded raster image objects are decoded at their pixel dimensions into PNG and packaged in ZIP. It does not export page screenshots or preserve compressed JPEG byte streams. Repeated object/rotation pairs are deduplicated. Vector artwork and standalone stencil masks are excluded; complex transparency may differ. Inline images and packed inline groups are handled. Card turns apply to extracted image pixels. Extraction uses its own PDF.js document so preview cleanup cannot remove in-flight image objects. Limit: 500 images / 40 MP each / 200 MB output image data.
- `compress-pdf`: default lossless structural rewriting retains text and vectors, and retains the original bytes if an unedited file would grow. Without page edits it rewrites the original document (including document-level structures) rather than copying pages. Raster mode explicitly opts into JPEG page images, destroying searchable text/forms/vector detail; DPI/quality are configurable, up to 100 pages and 40 MP/page. Both modes show actual before/after sizes and do not guarantee reduction. Compression includes every retained page; remove unwanted pages using the cards.
- `crop-image`: mouse/touch rectangle selection, free/1:1/4:3/16:9 presets, percentage coordinate inputs for keyboard use, shared turns/removal/Undo and batch ZIP. Free crops rotate with the image; fixed-ratio presets recenter after a quarter turn to preserve the requested ratio.
- `webp-to-jpg`, `webp-to-png`, `jpg-to-webp`, `png-to-webp`: dedicated pages with source-format validation and fixed target formats. PNG/WebP preserve alpha; JPEG uses a chosen background. JPEG/WebP encoding is lossy at the selected quality.

`pdf-extras.js` implements the new PDF operations; `scripts/pdf-extra-page.mjs` supplies their controls and instructions. No new external service, font download or dependency is used. General PDF editing compatibility limits still apply: edited copies can lose document-level structures and existing digital signatures are invalidated. Inspect outputs and retain originals.

`tests/advanced_tools_browser.py` independently checks number positions on rotated pages, Cyrillic and image watermark payloads, embedded-image resolution/colors, lossless text preservation, raster text removal, four conversion formats/alpha, crop presets/coordinates/drag/Undo, bilingual routes and mobile overflow.

## Live results, page insertion and batch stamping

Numbering and watermark tools render the actual generated PDF in thumbnails and the shared viewer before download. Choose a position preset or set custom X/Y percentages. There is no drag handle over the page preview. Export reuses an exact matching preview result; settings or page changes invalidate it. Generation is debounced, stale jobs are discarded, and preview failures are reported without retaining a stale result.

Both tools accept multiple PDFs (50 files / 50 MB combined / 500 source pages), share stamp settings, and keep page order, deletion and rotation independently for each document. The document selector switches previews; removal supports Undo. A batch downloads as ZIP, and numbering restarts at the chosen starting number for each document. Batch output is capped at 200 MB and no partial archive is offered on failure.

Merge and Organize PDF expose duplicate, blank A4 page and insert-file actions beside each page card. Insert accepts PDFs and supported browser-decodable images at the chosen position; the toolbar can also append files or blank pages. Copies have independent rotations. Active output is limited to 500 pages, including copies and blanks; Undo restores insertion and page edits.

The shared PDF/image viewer offers previous/next pages, arrow-key navigation, zoom, fit and fullscreen (with an expanded-dialog fallback). Rendered previews remain limited to 40 MP. Edited PDF compatibility limits described above still apply.

`tests/editor_workflow_browser.py` verifies insertion order, independent duplicate rotations, blank pages, Undo, viewer navigation/zoom/fullscreen, actual preview pixels and coordinate-based stamp positions in exported PDFs, independent batch edits, numbering restart, watermark ZIP, EN/RU and mobile under production CSP.


## Languages

English (`/`), Russian (`/ru/`), Ukrainian (`/uk/`), German (`/de/`), Italian (`/it/`), Spanish (`/es/`), Polish (`/pl/`), Brazilian Portuguese (`/pt-BR/`), French (`/fr/`), Japanese (`/ja/`), Korean (`/ko/`), Indonesian (`/id/`), Turkish (`/tr/`), Vietnamese (`/vi/`), Dutch (`/nl/`), Arabic (`/ar/`), Simplified Chinese (`/zh-Hans/`), Czech (`/cs/`), Romanian (`/ro/`), Hungarian (`/hu/`), Greek (`/el/`) and Thai (`/th/`) cover all 21 tools and the home/About/Contact/Privacy pages: 638 static pages in total. The native-name language menu links to the same tool in every language and works without JavaScript. Internal navigation stays within the chosen language. Production builds generate canonical URLs, 22 reciprocal `hreflang` links and `x-default`, and include all routes in the sitemap. Preview builds keep indexing disabled.

`locales/*.json` contain checked-in UI, instruction, metadata and message translations. `scripts/localization.mjs` translates generated English HTML at build time; `i18n.js` uses the matching local dictionary for dynamic controls, statuses and accessible labels. Numbered placeholders preserve page numbers and filenames; document contents, uploaded filenames and user-entered watermarks are not translated. EN/RU retain their existing bilingual source strings. No translation API is used during builds or visits, and no new cookie or third-party script is introduced.

After changing English labels or instructions, update all twenty dictionaries. Run `npm run build`, `python tests/localization_build.py` and `python tests/localization_browser.py`. The build test checks every localized route, coverage of runtime messages, placeholder consistency, local navigation and SEO links. The browser test runs actual PDF/image exports and checks translated cards, save panels, status messages, language switching and mobile layout under production CSP. `tests/editor_workflow_browser.py` also verifies coordinate-based live stamping after removal of mouse placement.

Arabic pages declare `dir="rtl"` and mirror navigation/workspace layout. Document thumbnails, page ordering and viewer navigation keep their original geometry; PDF/image output is never mirrored by interface direction. Language menus scroll when all 22 options do not fit the viewport.


## Tool search content and guides

`scripts/seo-content.mjs` defines distinct titles/descriptions, worked examples, troubleshooting and related links for all 21 tools. Three five-section guides cover merging PDFs/photos, separate-page ZIP export versus range extraction, and compression versus pixel resizing. The guides index and articles are generated in every language, bringing the site to 638 pages (29 per language); navigation, tool advice and articles link to each other within the selected language. New pages use the existing canonical/hreflang/sitemap generation. Content describes actual limits and trade-offs and makes no ranking, quality recovery or exact compression-size promises.

Run `python tests/seo_content.py` after building to check unique metadata, advice, guide sections, reciprocal links and existing route targets. `tests/localization_build.py` verifies full static/dynamic translation coverage. `python tests/seo_content_browser.py` follows the guides/tool links in all 22 languages, independently checks downloaded split ZIPs, and exercises mobile article layouts under production CSP. Search ranking and the snippets Google displays remain Google’s decisions.


## Navigation and workspace UX

The header contains grouped PDF and Images menus, Guides and the native-language picker in one desktop row. A keyboard-accessible mobile menu replaces the desktop navigation on smaller screens. Catalog card sizes, padding and descriptions are unchanged; local SVG icons replace placeholder letters, the redundant card CTA is removed, and the first eight tools follow a curated task order. The existing pill appearance remains, with distinct page operations, PDF conversions, numbering/watermarks, compression, image editing and image-format groups.

Split output mode is above the thumbnails. PDF stamp coordinates appear only for custom placement; image/text-specific fields remain conditional. Relevant options sit next to previews on desktop and below on mobile. Single-document stamping hides redundant batch controls. Merge has one add-files button. On phones a fixed primary action mirrors the processing/download action, including its disabled state, without requiring a long scroll through pages.

`pdf-page-actions.js` supplies duplicate, blank A4 and PDF/image insertion for split, rotate, page numbering, watermarks and PDF-to-image tools. It builds an independent source File only after all inputs pass validation; source-file snapshots restore edits with Undo. Original indices stay stable and added pages are inserted in the visual/output order. PDF size/page limits, image 20 MB/40 MP limits and the combined 50 MB input budget still apply. Editing source pages can invalidate signatures and omit document-level structures, as described in the tool guidance. Compression and embedded-image extraction do not expose these additional actions.

`tests/ui_refresh_browser.py` checks actual PDF/ZIP output, independent duplicate rotations, blank pages, mixed insertion, Undo/error recovery, grouped menus/filters, unchanged catalog dimensions, conditional options and mobile downloads in EN/RU/AR, plus narrow headers with long native language names. Existing editor and advanced-tool tests remain regression checks. UI changes can be committed with `[skip netlify]` to keep GitHub updates from automatically publishing; no Netlify API call is part of the local build.


### Local file workflows

`workflow.js` adds result inspection and continuation to compatible tools without uploading files. Generated PDFs open in the page viewer; ZIPs list PDF/image entries for inspection or continuation; image results show original and output with actual pixel dimensions, sizes, shared zoom and linked scrolling. Preview is limited to 50 MB and 40 MP per image. Larger results remain downloadable. Changing source files or settings invalidates the result and its viewer.

Recovery is **off by default**. Enabling the checkbox stores source files, page edits, options and output names in IndexedDB on this device, scoped to the tool and browser tab. It restores editing state, not generated downloads or Undo history. Drafts expire 24 hours after the last saved edit; expired records are cleaned on the next tool visit. Single-use transfers expire after 10 minutes. Records share a 100 MB budget, evicting the oldest records when needed. Browser quota/clearing/private mode may prevent recovery. A visible saved status confirms persistence; “Delete saved copies” clears drafts/transfers and disables recovery across open tabs. Files currently open in memory and downloaded files remain available. The privacy policy describes local persistence.

`tests/file_workflow_browser.py` checks opt-in recovery, generated PDF handoff, edited source mapping including duplicate/blank/inserted pages, numbering options/deletions, image rotations/resizing, PDF/ZIP review, image comparison, deletion and expiry under production CSP. No deployment is performed by these checks.

### Preparing Google Privacy & messaging

Advertising is still disabled. No AdSense loader or advertising slots are generated. The normal build makes no CMP requests and keeps the current no-advertising policy. `CONTACT_EMAIL` remains the support address; keep the existing Netlify environment value. About links to the project repository and explains practical limits; Privacy identifies Netlify and links to its policy without inventing a log-retention period.

To connect **Google's CMP**, first add the actual site in AdSense, create and publish the European regulations message in **Privacy & messaging**, specify the site's privacy-policy URL and configure applicable regions/languages and available choices. Configure relevant US-state messages if applicable. Google controls the displayed message and consent records; this repository does not implement its own consent banner or claim certification for custom code.

After Google supplies the site's message tag, compare it with this integration and set `GOOGLE_CMP_PUBLISHER_ID=pub-XXXXXXXXXXXXXXXX` (16 digits, public publisher ID) in Netlify. Rebuild manually. This enables the Google message loader, the official presence signal, a footer privacy-settings button using `CONSENT_API_READY` / `showRevocationMessage`, and the matching privacy-policy disclosure. Do not enable it with a sample ID. The CSP permits the Google CMP origin and gstatic, without permitting advertising networks or inline scripts. Test the **actual published message** using Google's preview/test tools and a clean browser in the target regions; check browser CSP errors and Google's diagnostics before connecting ads. A stub integration test cannot establish that the real account/message is published or that Google's remote code will require no additional CSP sources.

Do not add AdSense code or claim ads are live until the account/site is approved and the actual CMP has been validated. Advertising code, Google partner disclosures, slots and the network-provided `ads.txt` require a separate change; a CMP publisher ID alone does not activate ads. If the CMP is blocked or unavailable, no ad requests are initiated by this integration. Remove `GOOGLE_CMP_PUBLISHER_ID` and rebuild to disable it.

References: [Google Privacy & messaging API](https://developers.google.com/funding-choices/fc-api-docs), [Netlify privacy](https://www.netlify.com/privacy/). Test with `python tests/advertising_readiness.py` (uses a mocked Google API and rebuilds `dist`; do not run alongside other browser/build checks).
