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

    def end_headers(self):
        if self.path == "/" or self.path.startswith("/index.html"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

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

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._proxy("PUT")
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Accept, Content-Type, If-None-Match, If-Modified-Since, Cache-Control, Pragma",
        )
        self.send_header("Access-Control-Expose-Headers", "ETag, Last-Modified")

    def _forward_cache_headers(self, resp_headers):
        etag = resp_headers.get("ETag") or resp_headers.get("etag")
        if etag:
            self.send_header("ETag", etag)
        last_modified = resp_headers.get("Last-Modified") or resp_headers.get("last-modified")
        if last_modified:
            self.send_header("Last-Modified", last_modified)

    def _proxy(self, method: str):
        url = BACKEND + self.path
        headers = {"Accept": "application/json"}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        content_type = self.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type
        if_none_match = self.headers.get("If-None-Match")
        if if_none_match:
            headers["If-None-Match"] = if_none_match
        if_modified_since = self.headers.get("If-Modified-Since")
        if if_modified_since:
            headers["If-Modified-Since"] = if_modified_since

        body = None
        if method in ("POST", "PUT", "PATCH"):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                self.send_response(resp.status)
                content_type = resp.headers.get("Content-Type", "application/json")
                if content_type:
                    self.send_header("Content-Type", content_type)
                self._forward_cache_headers(resp.headers)
                self._cors_headers()
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            content_type = e.headers.get("Content-Type", "application/json")
            if content_type:
                self.send_header("Content-Type", content_type)
            self._forward_cache_headers(e.headers)
            self._cors_headers()
            self.end_headers()
            if body:
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
