import http.server
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver
import sys

PORT = 8000 if len(sys.argv) < 2 else int(sys.argv[1])

Handler = http.server.SimpleHTTPRequestHandler

Handler.extensions_map={
        '.manifest': 'text/cache-manifest',
	'.html': 'text/html',
        '.png': 'image/png',
	'.jpg': 'image/jpg',
	'.svg':	'image/svg+xml',
	'.css':	'text/css',
	'.js':	'application/javascript',
    '.module.js': 'module',
	'': 'application/octet-stream', # Default
    }

httpd = socketserver.TCPServer(("", PORT), Handler)

print("serving at port", PORT)
httpd.serve_forever()