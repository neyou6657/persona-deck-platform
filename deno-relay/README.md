# deno-relay

Persona-aware Deno control plane for the multi-persona platform:
- HF Space workers connect outbound over `/agent`
- workers register the persona ids they can serve
- conversations, messages, continuity state, and runs are stored in Deno KV
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

## Environment Variables

- `HOST` default `0.0.0.0`
- `PORT` default `8000`
- `AGENT_SHARED_SECRET` fallback worker token with wildcard persona access
- `AGENT_TOKEN_PERSONAS_JSON` optional token map such as `{"secret-a":["coder"],"secret-b":"*"}`
- `AGENT_REQUEST_TIMEOUT_MS` default `90000`
- `PERSONA_CATALOG_JSON` optional persona seed array

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

## Run

```bash
cd /workspace/deno-relay
deno task test
deno task check
deno task start
```

If you bypass tasks and run `deno run` directly, add `--unstable-kv`, otherwise Deno will throw a tiny bureaucratic tantrum.
