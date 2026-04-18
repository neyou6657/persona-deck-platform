# deno-relay

Minimal Deno relay server:
- accepts WebSocket prompt messages from clients
- forwards each prompt to a connected Hugging Face Space agent over a private WebSocket channel
- sends a normalized response/error message back over WebSocket

## Endpoints

- `GET /healthz` -> health JSON
- `GET /ws` -> client WebSocket endpoint
- `GET /agent` -> agent WebSocket endpoint (requires shared secret)
- `GET /` -> protocol summary JSON

## Environment Variables

- `HOST` (default: `0.0.0.0`)
- `PORT` (default: `8000`)
- `AGENT_SHARED_SECRET` (required when `MOCK_MODE=false`)
- `AGENT_REQUEST_TIMEOUT_MS` (default: `90000`)
- `MOCK_MODE` (default: `false`)
- `MOCK_REPLY_PREFIX` (default: `Mock relay reply`)

## Protocol

### Client -> relay (`/ws`)

```json
{
  "type": "prompt",
  "prompt": "...",
  "sessionId": "optional",
  "metadata": {}
}
```

### Relay -> agent (`/agent`)

```json
{
  "type": "prompt",
  "requestId": "uuid",
  "prompt": "...",
  "session_id": "optional",
  "metadata": {}
}
```

### Agent -> relay

```json
{
  "type": "response",
  "requestId": "uuid",
  "reply": "...",
  "model": "optional",
  "session_id": "optional",
  "usage": {}
}
```

### Relay -> WS client

Success:

```json
{
  "type": "response",
  "reply": "...",
  "sessionId": "...",
  "model": "optional",
  "raw": {}
}
```

Error:

```json
{
  "type": "error",
  "error": "..."
}
```

When `MOCK_MODE=true`, the relay skips the agent channel and returns a synthetic reply.

## Run

```bash
cd /workspace/deno-relay
deno task start
```
