"""Loopback-only operator UI. No model calls or arbitrary filesystem endpoints."""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from pydantic import ValidationError

from conference_match.evaluation import Fixtures
from conference_match.models import Event
from conference_match.review import Judgement, ReviewStore
from conference_match.runs import run_lock

ASSETS = Path(__file__).with_name("web")
MAX_BODY = 2_000_000


def make_server(store: ReviewStore, run: Path | None, port: int = 8765) -> HTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            pass  # Do not log profiles, query strings or review notes.

        def reply(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'"
            )
            self.end_headers()
            self.wfile.write(body)

        def json_reply(self, value: object, status: int = 200) -> None:
            self.reply(status, json.dumps(value).encode(), "application/json; charset=utf-8")

        def trusted(self) -> bool:
            host = self.headers.get("Host")
            allowed = {
                f"127.0.0.1:{server.server_port}",
                f"localhost:{server.server_port}",
            }
            return host in allowed and self.headers.get("Origin") in (None, f"http://{host}")

        def do_GET(self) -> None:
            if not self.trusted():
                self.json_reply({"error": "Local same-origin requests only"}, 403)
                return
            assets = {
                "/": ("index.html", "text/html"),
                "/app.js": ("app.js", "text/javascript"),
                "/style.css": ("style.css", "text/css"),
            }
            try:
                if self.path in assets:
                    name, mime = assets[self.path]
                    self.reply(200, (ASSETS / name).read_bytes(), f"{mime}; charset=utf-8")
                elif self.path == "/api/session":
                    self.json_reply(store.public_session(run is not None))
                elif self.path == "/api/fixtures":
                    self.json_reply(store.fixtures().model_dump(mode="json"))
                elif self.path == "/api/archive":
                    self.json_reply(store.session.model_dump(mode="json"))
                else:
                    self.json_reply({"error": "Not found"}, 404)
            except (ValueError, OSError) as exc:
                self.failure(exc)

        def failure(self, exc: Exception) -> None:
            message = (
                "Invalid data"
                if isinstance(exc, ValidationError)
                else ("Could not read or save local data" if isinstance(exc, OSError) else str(exc))
            )
            self.json_reply({"error": message}, 400)

        def do_POST(self) -> None:
            if not self.trusted() or self.headers.get("Content-Type") != "application/json":
                self.json_reply({"error": "Local JSON requests only"}, 403)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY:
                    raise ValueError("Request must be between 1 byte and 2 MB")
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError("Expected a JSON object")
                if body.get("input_hash") != store.session.input_hash:
                    raise ValueError("The event changed in another tab; reload before saving")
                if body.get("revision") != store.session.revision:
                    raise ValueError("Reviews changed in another tab; reload before saving")
                if self.path == "/api/import":
                    event = Event.model_validate(body.get("event"))
                    fixtures = (
                        Fixtures.model_validate(body["fixtures"]) if body.get("fixtures") else None
                    )
                    store.open(event, fixtures)
                elif self.path == "/api/next-batch":
                    store.next_batch()
                elif self.path == "/api/judgements":
                    store.judge(Judgement.model_validate(body.get("judgement")))
                elif self.path == "/api/allocation":
                    self.json_reply(store.allocation(run, body.get("normalisation", "none")))
                    return
                else:
                    self.json_reply({"error": "Not found"}, 404)
                    return
                self.json_reply({"ok": True})
            except (ValueError, OSError) as exc:
                self.failure(exc)

    server = HTTPServer(("127.0.0.1", port), Handler)
    server.timeout = 1
    return server


def serve(
    event: Event,
    directory: Path,
    run: Path | None,
    fixtures: Fixtures | None,
    port: int,
    expert_report: Path | None = None,
) -> None:
    with run_lock(directory):
        store = ReviewStore(directory, event, fixtures)
        if expert_report:
            store.attach_expert(expert_report)
        with make_server(store, run, port) as server:
            print(f"Operator review: http://127.0.0.1:{server.server_port}", flush=True)
            print(f"Reviews saved in {directory.resolve()}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
