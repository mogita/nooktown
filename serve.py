"""Dev server that makes browsers revalidate every file, so a reload never mixes old and new modules.

Usage: python3 serve.py [host] [port]
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


host = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5173
handler = functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))
print(f'Serving http://{host}:{port}')
ThreadingHTTPServer((host, port), handler).serve_forever()
