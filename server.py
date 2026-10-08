#!/usr/bin/env python3
"""Serves the invitation and stores RSVPs for the hosts page."""

import json
import os
import secrets
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(ROOT, "data", "rsvps.json")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "garden2027")
TOKENS = set()
LOCK = threading.Lock()


def load_replies():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, list) else []


def save_replies(replies):
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    temporary = DATA_PATH + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(replies, handle, ensure_ascii=False, indent=2)
    os.replace(temporary, DATA_PATH)


def clean_text(value, limit):
    text = " ".join(str(value or "").split())
    return text[:limit]


class InvitationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/admin/guests":
            self.handle_guests()
            return
        if path == "/admin":
            self.path = "/admin.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/rsvp":
            self.handle_rsvp()
        elif path == "/api/admin/login":
            self.handle_login()
        else:
            self.send_error(404)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length < 1 or length > 8000:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return False
        return header[7:].strip() in TOKENS

    def handle_login(self):
        body = self.read_json()
        if not body or body.get("password") != PASSWORD:
            self.send_json(401, {"message": "That password is not right."})
            return
        token = secrets.token_urlsafe(24)
        TOKENS.add(token)
        self.send_json(200, {"token": token})

    def handle_guests(self):
        if not self.authorized():
            self.send_json(401, {"message": "Please sign in."})
            return
        with LOCK:
            replies = load_replies()
        coming = [item for item in replies if item.get("attending") == "yes"]
        declined = [item for item in replies if item.get("attending") == "no"]
        self.send_json(200, {
            "coming": coming,
            "declined": declined,
            "totalComing": sum(int(item.get("guests") or 0) for item in coming),
            "partiesComing": len(coming),
            "partiesDeclined": len(declined),
        })

    def handle_rsvp(self):
        body = self.read_json()
        if not isinstance(body, dict):
            self.send_json(400, {"message": "Please send a reply."})
            return
        name = clean_text(body.get("name"), 80)
        attending = body.get("attending")
        note = clean_text(body.get("note"), 400)
        if attending not in ("yes", "no") or len(name) < 2:
            self.send_json(400, {"message": "Please include your name and whether you can come."})
            return
        if attending == "yes":
            try:
                guests = int(body.get("guests"))
            except (TypeError, ValueError):
                guests = 0
            if guests < 1 or guests > 8:
                self.send_json(400, {"message": "Please choose how many guests will come."})
                return
        else:
            guests = 0
        record = {"name": name, "attending": attending, "guests": guests, "note": note}
        key = name.casefold()
        with LOCK:
            replies = load_replies()
            updated = False
            for index, item in enumerate(replies):
                if str(item.get("name", "")).casefold() == key:
                    replies[index] = record
                    updated = True
                    break
            if not updated:
                replies.append(record)
            save_replies(replies)
        self.send_json(200, record)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), InvitationHandler)
    print("Invitation running at http://127.0.0.1:%s" % port)
    print("Hosts page at http://127.0.0.1:%s/admin" % port)
    server.serve_forever()
