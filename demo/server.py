"""Локальный сервер для визуальной демонстрации. Не выдаёт действующие токены."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class DemoHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/open-order":
            self.send_error(404)
            return
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    directory = Path(__file__).resolve().parent
    server = ThreadingHTTPServer(("127.0.0.1", 8766), partial(DemoHandler, directory=str(directory)))
    print("Демо: http://127.0.0.1:8766/desktop.html", flush=True)
    server.serve_forever()
