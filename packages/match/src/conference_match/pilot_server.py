"""HTTP boundary for the participant pilot; organiser and participant tokens stay separate."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import ValidationError

from conference_match.pilot import Pilot, ProfileInput
from conference_match.runs import run_lock

ASSETS = Path(__file__).with_name("web") / "pilot"


def make_pilot_server(
    pilot: Pilot, host: str = "127.0.0.1", port: int = 8767, public_url: str | None = None
) -> ThreadingHTTPServer:
    if host not in ("127.0.0.1", "localhost") and public_url is None:
        raise ValueError("Supply --public-url when listening beyond localhost")
    if public_url:
        parsed = urlsplit(public_url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Public URL must be an HTTP(S) origin without a path or credentials")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            pass

        def send(self, status: int, value: object, mime: str = "application/json") -> None:
            body = value if isinstance(value, bytes) else json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", mime + "; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            )
            self.end_headers()
            self.wfile.write(body)

        def trusted(self) -> bool:
            origins = {
                f"http://127.0.0.1:{server.server_port}",
                f"http://localhost:{server.server_port}",
            }
            if public_url:
                origins.add(public_url.rstrip("/"))
            allowed_hosts = {urlsplit(origin).netloc for origin in origins}
            return self.headers.get("Host") in allowed_hosts and self.headers.get(
                "Origin"
            ) in origins | {None}

        def key(self) -> str:
            value = self.headers.get("Authorization", "")
            return value.removeprefix("Bearer ") if value.startswith("Bearer ") else ""

        def organiser(self) -> None:
            if not pilot.is_organiser(self.key()):
                raise PermissionError("Use your private organiser link")

        def failure(self, exc: Exception) -> None:
            if isinstance(exc, PermissionError):
                self.send(403, {"error": str(exc)})
            elif isinstance(exc, ValidationError):
                self.send(400, {"error": "Check your name, offers, needs and sharing consent"})
            elif isinstance(exc, OSError):
                self.send(500, {"error": "Could not read or save event data"})
            else:
                self.send(400, {"error": str(exc)})

        def do_GET(self) -> None:
            if not self.trusted():
                self.send(403, {"error": "Invalid origin"})
                return
            assets = {
                "/": ("participant.html", "text/html"),
                "/organiser": ("organiser.html", "text/html"),
                "/participant.js": ("participant.js", "text/javascript"),
                "/organiser.js": ("organiser.js", "text/javascript"),
                "/common.js": ("common.js", "text/javascript"),
                "/style.css": ("style.css", "text/css"),
            }
            try:
                if self.path in assets:
                    name, mime = assets[self.path]
                    self.send(200, (ASSETS / name).read_bytes(), mime)
                elif self.path == "/api/event":
                    self.send(200, pilot.info())
                elif self.path == "/api/me":
                    self.send(200, pilot.participant_view(self.key()))
                elif self.path == "/api/organiser":
                    self.organiser()
                    self.send(200, pilot.organiser_view())
                else:
                    self.send(404, {"error": "Not found"})
            except (ValueError, OSError) as exc:
                self.failure(exc)

        def do_POST(self) -> None:
            if not self.trusted() or self.headers.get("Content-Type") != "application/json":
                self.send(403, {"error": "Same-origin JSON requests only"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 100_000:
                    raise ValueError("Request must be between 1 byte and 100 kB")
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError("Expected a JSON object")
                if self.path == "/api/join":
                    key = pilot.join(ProfileInput.model_validate(body.get("profile")))
                    self.send(201, {"key": key})
                    return
                revision = body.get("revision")
                if type(revision) is not int:
                    raise ValueError("A revision number is required")
                if self.path == "/api/me":
                    pilot.edit(
                        self.key(),
                        ProfileInput.model_validate(body.get("profile")),
                        revision,
                    )
                elif self.path in ("/api/start", "/api/release", "/api/reopen", "/api/remove"):
                    self.organiser()
                    if self.path == "/api/start":
                        pilot.start(revision)
                    elif self.path == "/api/release":
                        pilot.release(revision)
                    elif self.path == "/api/reopen":
                        pilot.reopen(revision)
                    else:
                        identifier = body.get("id")
                        if not isinstance(identifier, str):
                            raise ValueError("Participant ID is required")
                        pilot.remove(identifier, revision)
                else:
                    self.send(404, {"error": "Not found"})
                    return
                self.send(200, {"ok": True})
            except (ValueError, OSError) as exc:
                self.failure(exc)

    server = ThreadingHTTPServer((host, port), Handler)
    return server


def serve_pilot(
    directory: Path,
    description: str | None,
    model: str,
    host: str,
    port: int,
    public_url: str | None,
) -> None:
    with run_lock(directory):
        pilot = Pilot(directory, description, model)
        with make_pilot_server(pilot, host, port, public_url) as server:
            origin = (
                public_url.rstrip("/") if public_url else f"http://127.0.0.1:{server.server_port}"
            )
            print(f"Participant link: {origin}/", flush=True)
            print(f"Private organiser link: {origin}/organiser#{pilot.organiser_key}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                if pilot.worker:
                    print("Waiting for the current scoring run to finish…", flush=True)
                    pilot.worker.join()
