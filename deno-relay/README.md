# deno-relay

Persona-aware Deno control plane for the multi-persona platform:
- HF Space workers connect outbound over `/agent`
- workers register the persona ids they can serve
- PostgreSQL is the system of record for personas, conversations, messages, runs, admin sessions, and knowledge docs
- Android or web clients use `/v1/...` APIs plus optional `/ws` real-time requests

## Endpoints

- `GET /healthz`
- `GET /`
- `GET /ws`
- `GET /agent`
- `GET /v1/personas`
- `GET /v1/conversations?personaId=...`
- `POST /v1/conversations`
- `POST /v1/conversations/continue-last`
- `GET /v1/conversations/{conversationId}/messages`
- `POST /v1/conversations/{conversationId}/messages`
- `GET /v1/runs/{runId}`
- `POST /v1/admin/login`
- `GET /v1/admin/session`
- `GET /v1/admin/personas`
- `POST /v1/knowledge/search`
- `POST /v1/knowledge/upsert`

## Environment Variables

- `HOST` default `0.0.0.0`
- `PORT` default `8000`
- `DATABASE_URL` required PostgreSQL connection string
- `PGVECTOR_EMBED_DIM` reserved for embedding/vector width coordination
- `AGENT_SHARED_SECRET` fallback worker token with wildcard persona access
- `AGENT_TOOL_SHARED_SECRET` shared secret for knowledge search and writeback routes
- `AGENT_TOKEN_PERSONAS_JSON` optional token map such as `{"secret-a":["coder"],"secret-b":"*"}`
- `AGENT_REQUEST_TIMEOUT_MS` default `90000`
- `PERSONA_CATALOG_JSON` optional persona seed array
- `ADMIN_PASSWORD_HASH` preferred format `pbkdf2_sha256:<iterations>:<salt>:<hex>`; legacy `sha256:<hex>` still works for migration only
- `ADMIN_SESSION_SECRET` pepper used to hash admin bearer tokens before persistence
- `ADMIN_SESSION_TTL_HOURS` admin session lifetime, default `24`
- `KNOWLEDGE_SEARCH_LIMIT` default skill search limit
- `KNOWLEDGE_WRITEBACK_MODE` advisory knob for worker/skill behavior, current default is `explicit`

## Worker Protocol

Worker registration:

```json
{
  "type": "agent_register",
  "agentId": "hf-space-coder-v1",
  "instanceId": "inst-123",
  "personaIds": ["coder"],
  "capabilities": {
    "stream": false,
    "tools": false
  },
  "version": "2026-04-18"
}
```

Relay prompt:

```json
{
  "type": "prompt",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "prompt": "Write a release note",
  "sessionId": "optional",
  "continuity": {
    "previousResponseId": "resp_123"
  },
  "metadata": {
    "clientMessageId": "uuid"
  }
}
```

Worker response:

```json
{
  "type": "response",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "reply": "...",
  "responseId": "resp_456",
  "model": "gpt-5.3-codex",
  "usage": {}
}
```

## Client Flow

1. `POST /v1/conversations` or `POST /v1/conversations/continue-last`
2. `POST /v1/conversations/{conversationId}/messages`
3. poll `GET /v1/runs/{runId}`
4. read thread via `GET /v1/conversations/{conversationId}/messages`

Temporary auth uses the `x-user-id` header. Glamorous? No. Effective? Absolutely.

Admin auth is separate. `POST /v1/admin/login` returns a bearer token; all later admin calls use `Authorization: Bearer <token>`.

Knowledge routes are private to agents/tools. Call them with `Authorization: Bearer <AGENT_TOOL_SHARED_SECRET>` or `x-knowledge-secret`.

## Run

```bash
cd /workspace/deno-relay
deno task test
deno task check
deno task start
```

Before production startup, apply [`sql/001_control_plane_pg.sql`](/workspace/.worktrees/rollout-deno-pg/deno-relay/sql/001_control_plane_pg.sql) to PostgreSQL. KV has retired; it served, it saluted, it went home.
