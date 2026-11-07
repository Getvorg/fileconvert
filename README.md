# FileConvert

Static bilingual (EN/RU) image converters. Images stay in the browser. No accounts, image uploads, advertising or analytics.

## Development

Requires Node.js 22+ and Python 3. Build has no npm dependencies.

```sh
npm run build
npm start
```

Open http://127.0.0.1:8000. Edit `templates/converter.html`, `app.js`, `styles.css`, and `scripts/build.mjs`; rebuild after changes. Only `dist/` is served and deployed. Builds without `SITE_URL` intentionally disable search indexing.

```sh
npm run check
# Optional browser integration checks, with Python Playwright and system Chromium installed:
python tests/browser.py
```

Browser checks require the local server, use `/usr/bin/chromium`, and save a screenshot in `work/`.

## Deploy to Netlify

1. Import this GitHub repository in Netlify. `netlify.toml` sets build and publish directory (`dist`).
2. Add the production environment variable `SITE_URL=https://your-domain.tld` (HTTPS origin only). Add `CONTACT_EMAIL` for a private support address; otherwise contact links to public GitHub issues.
3. Add your owned domain in Netlify Domain management. Apply the DNS records Netlify supplies at your registrar. Wait for domain verification and HTTPS certificate provisioning.
4. Choose the primary hostname, redirect the alternative hostname, and rebuild with the matching `SITE_URL`.
5. Check all EN/RU routes, HTTPS, canonical links, `/robots.txt`, `/sitemap.xml`, the real contact address, and an unknown URL returning HTTP 404.
6. Register the domain in Google Search Console, verify ownership through DNS, and submit `/sitemap.xml`. Indexing and advertising approval are not guaranteed.

To build elsewhere, provide the same variables and upload only `dist/`. Configure the host to serve directory `index.html`, real 404 responses, HTTPS, and the security headers from `netlify.toml`. Do not enable a blanket SPA fallback.

## Before advertising application

- Identify the actual operator and contact details; finalize About/Privacy with the hosting provider, log retention, recipients and applicable rights. Current privacy text explicitly leaves hosting details pending.
- Add and maintain original useful guides; the two image converters are the current functional scope.
- Check the selected advertising network's site eligibility and content requirements. More pages alone do not guarantee approval.
- No publisher ID, fake `ads.txt`, ad slots or ad scripts are installed. Add the exact network-provided `ads.txt` only after receiving publisher details.
- For Google advertising in the EEA, UK and Switzerland, choose a Google-certified CMP compatible with the required IAB TCF integration. Configure regional behavior, equally accessible rejection, consent withdrawal, and test that ad/analytics requests are blocked until allowed. A custom decorative cookie banner is not sufficient.
- Update Privacy with the actual vendors and processing before activation. Revise the CSP in `netlify.toml` narrowly for those vendors; current CSP deliberately permits only local resources.

## Roadmap

1. **Delivered:** distinct JPG → PNG / PNG → JPG pages, EN/RU URLs, instructions, About, Contact, Privacy, production SEO generation and static hosting configuration.
2. **Next:** JPG/PNG → PDF; PDF merge, split, rotate, remove and reorder pages. Investigate a maintained browser PDF library, page/memory limits, encrypted-file behavior and actual processing privacy before implementation.
3. **Then:** PDF → images, image extraction, watermarks and page numbers, with browser integration tests.
4. **Separate evaluation:** compression, OCR, Office ↔ PDF, PDF/A, repair, redaction, signatures and forms. Some need backend services, font/rendering infrastructure or careful security validation. Visual overlays must never be described as secure redaction; adding a signature image is not a cryptographic signature.

The screenshot is a long-term tool catalog, not a list of currently supported features. No nonworking PDF buttons are shown.

## Image limits

20 MB input limit; conversion rejects images over 40 million pixels to limit canvas memory. Device limits can be lower. JPG output uses quality 0.92 and the selected background color. JPG → PNG cannot recover lost detail or create transparency. Canvas conversion may discard metadata.
