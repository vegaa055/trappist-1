"""Static dev server that tells browsers not to cache.

`python -m http.server` sends no cache headers, so browsers cache ES modules
heuristically and can keep serving an old module after it changes on disk.

    python tools/serve.py [port]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'Serving {ROOT} on http://localhost:{port} (no-cache)')
        httpd.serve_forever()
