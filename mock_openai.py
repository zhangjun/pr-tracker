#!/usr/bin/env python3
"""Tiny mock OpenAI-compatible server for end-to-end testing of llm_enrich.

Listens on 127.0.0.1:8799 and implements POST /v1/chat/completions.
Logs every request (path, auth header, model, message count) to mock_openai.log
so the client integration can be verified without a real API key.
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = "mock_openai.log"


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw)
        except Exception:
            body = {}

        msgs = body.get("messages", [])
        blob = json.dumps(body).lower()
        if "pong" in blob or "single word" in blob:
            content = "pong"
        else:
            # echo a deterministic JSON object like a real model would
            content = json.dumps({
                "summary": "LLM summary: refactors the KV-cache path to cut decode latency.",
                "category": "perf",
                "focus": "inference",
                "score": 88,
                "tags": ["KV-Cache", "Latency"],
            })

        with open(LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "content_type": self.headers.get("Content-Type"),
                "model": body.get("model"),
                "n_messages": len(msgs),
                "max_tokens": body.get("max_tokens"),
            }) + "\n")

        resp = {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "model": body.get("model", "mock"),
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        out = json.dumps(resp).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8799), H).serve_forever()
