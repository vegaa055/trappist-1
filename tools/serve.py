"""Static dev server that tells browsers not to cache.

It also accepts one upload — PUT /og/cover.png from localhost — so that
/?cover can save the share card it renders.

`python -m http.server` sends no cache headers, so browsers cache ES modules
heuristically and can keep serving an old module after it changes on disk.

    python tools/serve.py [port]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# The one file the page may write: the share card rendered by /?cover.
WRITABLE = {'/og/cover.png': os.path.join(ROOT, 'og', 'cover.png')}
MAX_UPLOAD = 8 * 1024 * 1024
PNG_SIGNATURE = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_PUT(self):
        target = WRITABLE.get(self.path)
        local = self.client_address[0] in ('127.0.0.1', '::1', '::ffff:127.0.0.1')
        length = int(self.headers.get('Content-Length') or 0)
        if not target or not local or not 0 < length <= MAX_UPLOAD:
            self.send_error(403)
            return
        data = self.rfile.read(length)
        if not data.startswith(PNG_SIGNATURE):
            self.send_error(415)
            return
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'Serving {ROOT} on http://localhost:{port} (no-cache)')
        httpd.serve_forever()
