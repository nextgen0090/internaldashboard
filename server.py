"""Local static server + API proxy for DB Visual Report.

Serves index.html on http://localhost:8080 and proxies /api/* to the .NET backend.
Avoids browser CORS when the page and API run on different ports.

Usage:
  python server.py
"""

from __future__ import annotations

import http.server
import os
import urllib.error
import urllib.request

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:5036").rstrip("/")
PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy("POST")
            return
        self.send_error(404)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self._cors_headers()
            self.end_headers()
            return
        self.send_error(404)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type")

    def _proxy(self, method: str):
        url = BACKEND + self.path
        headers = {"Accept": "application/json"}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        content_type = self.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type

        body = None
        if method == "POST":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self._cors_headers()
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            msg = f'{{"success":false,"message":"Proxy error: {e}"}}'.encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(msg)


if __name__ == "__main__":
    try:
        httpd = http.server.ThreadingHTTPServer(("", PORT), Handler)
    except OSError as e:
        print(f"ERROR: Port {PORT} is already in use.")
        print("Stop the other server first (Ctrl+C on python -m http.server), then run:")
        print("  python server.py")
        print("  or double-click start.bat")
        raise SystemExit(1) from e

    print(f"DB Visual Report: http://localhost:{PORT}")
    print(f"API proxy:        http://localhost:{PORT}/api/* -> {BACKEND}/api/*")
    httpd.serve_forever()
