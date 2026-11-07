from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial

if __name__ == "__main__":
    root = Path(__file__).resolve().parent / "dist"
    if not root.exists():
        raise SystemExit("Run npm run build first")
    with ThreadingHTTPServer(("127.0.0.1", 8000), partial(SimpleHTTPRequestHandler, directory=str(root))) as server:
        print("Open http://127.0.0.1:8000 in your browser")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
