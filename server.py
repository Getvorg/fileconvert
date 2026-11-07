from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    with ThreadingHTTPServer(("127.0.0.1", 8000), SimpleHTTPRequestHandler) as server:
        print("Open http://127.0.0.1:8000 in your browser")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
