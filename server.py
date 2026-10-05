"""Local static server + API proxy for the Game Vault Internal Dashboard.

Serves public/ on http://localhost:8080 and proxies /api/* to the .NET backend.
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
# Loopback only by default: the proxy reaches the internal API without auth, so it must not be
# reachable from the LAN unless explicitly requested (e.g. HOST=0.0.0.0).
HOST = os.environ.get("HOST", "127.0.0.1")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

NO_CACHE_PATHS = ("/index.html", "/js/", "/css/")
FORWARDED_REQUEST_HEADERS = ("Authorization", "Content-Type", "If-None-Match", "If-Modified-Since")
FORWARDED_RESPONSE_HEADERS = ("ETag", "Last-Modified")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        if self.path == "/" or self.path.startswith(NO_CACHE_PATHS):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def _is_api(self) -> bool:
        return self.path.startswith("/api/")

    def do_GET(self):
        if self._is_api():
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        self._proxy_or_404("POST")

    def do_PUT(self):
        self._proxy_or_404("PUT")

    def do_OPTIONS(self):
        if not self._is_api():
            self.send_error(404)
            return
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _proxy_or_404(self, method: str):
        if self._is_api():
            self._proxy(method)
        else:
            self.send_error(404)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Accept, Content-Type, If-None-Match, If-Modified-Since, Cache-Control, Pragma",
        )
        self.send_header("Access-Control-Expose-Headers", "ETag, Last-Modified")

    def _send_backend_response(self, status: int, resp_headers, body: bytes):
        self.send_response(status)
        content_type = resp_headers.get("Content-Type", "application/json")
        if content_type:
            self.send_header("Content-Type", content_type)
        for name in FORWARDED_RESPONSE_HEADERS:
            value = resp_headers.get(name)
            if value:
                self.send_header(name, value)
        self._cors_headers()
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _proxy(self, method: str):
        headers = {"Accept": "application/json"}
        for name in FORWARDED_REQUEST_HEADERS:
            value = self.headers.get(name)
            if value:
                headers[name] = value

        body = None
        if method in ("POST", "PUT"):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else None

        req = urllib.request.Request(BACKEND + self.path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self._send_backend_response(resp.status, resp.headers, resp.read())
        except urllib.error.HTTPError as e:
            self._send_backend_response(e.code, e.headers, e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(f'{{"success":false,"message":"Proxy error: {e}"}}'.encode())


if __name__ == "__main__":
    try:
        httpd = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print(f"ERROR: Port {PORT} is already in use.")
        print("Stop the other server first (Ctrl+C on python -m http.server), then run:")
        print("  python server.py")
        print("  or double-click start.bat")
        raise SystemExit(1) from e

    print(f"Internal Dashboard: http://localhost:{PORT}")
    print(f"API proxy:          http://localhost:{PORT}/api/* -> {BACKEND}/api/*")
    httpd.serve_forever()
