#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"missing required env: {name}")
    return value


def request_json(path: str, payload: dict[str, object]) -> dict[str, object]:
    base_url = required_env("DENO_KNOWLEDGE_BASE_URL").rstrip("/")
    secret = required_env("DENO_KNOWLEDGE_SHARED_SECRET")
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        method="POST",
        headers={
          "content-type": "application/json",
          "authorization": f"Bearer {secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"knowledge request failed: {exc.code} {detail}") from exc


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "usage:\n"
            "  persona_knowledge.py search <persona_id> <query> [limit]\n"
            "  persona_knowledge.py upsert <persona_id> <title> <source> <body>\n",
            file=sys.stderr,
        )
        return 1

    command = argv[1]
    if command == "search":
        if len(argv) < 4:
            raise SystemExit("search requires <persona_id> <query> [limit]")
        payload: dict[str, object] = {
            "personaId": argv[2],
            "query": argv[3],
        }
        if len(argv) >= 5:
            payload["limit"] = int(argv[4])
        result = request_json("/v1/knowledge/search", payload)
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0

    if command == "upsert":
        if len(argv) < 6:
            raise SystemExit("upsert requires <persona_id> <title> <source> <body>")
        result = request_json(
            "/v1/knowledge/upsert",
            {
                "personaId": argv[2],
                "title": argv[3],
                "source": argv[4],
                "body": argv[5],
            },
        )
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0

    raise SystemExit(f"unsupported command: {command}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
