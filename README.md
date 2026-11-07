# FileConvert — starter

Free bilingual EN/RU JPG → PNG and PNG → JPG converter. Images are processed **locally in the browser** via the Canvas API; files are never uploaded. Python is used only to serve the site locally.

## Run on Windows

1. Install Python 3.14 (already installed is fine).
2. Open the project folder in VS Code.
3. Open Terminal → New Terminal and run:

   ```powershell
   python server.py
   ```

4. Open <http://127.0.0.1:8000>.
5. Stop the server with Ctrl+C.

No `pip install` or external dependencies necessary.

## How it's organized

- `index.html` — layout and content.
- `styles.css` — visual design and responsive layout.
- `app.js` — converter, error handling and EN/RU translations.
- `server.py` — optional local server using Python standard library.

## Notes

- Maximum selected file size: 20 MB (browser RAM may limit very large dimensions).
- PNG → JPG: transparency is flattened onto a user-selected background; JPEG output uses quality `0.92`.
- JPG → PNG: the converted file may be **larger**; it won't restore detail lost in the original JPG.
- This starter has **no ads**, analytics, cookies, user accounts, or backend uploads. Before monetization, add legal pages, original helpful content, proper SEO, HTTPS and consider applicable privacy/cookie rules.
- Supported browsers: modern Chrome, Firefox, Edge and Safari with the Canvas API.

## New in this version

- White/coral-red color scheme.
- Conversion success popup with download button; close via button, outside click or Escape.
- PNG to JPG: the background color setting fills transparent areas; default white.
