---
title: HF Space Codex Agent
emoji: "🧠"
colorFrom: blue
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# hf-space-agent

Docker-ready Hugging Face Space app:
- `GET /` returns a simple intro HTML page.
- on startup, the agent opens an outbound WebSocket connection to the Deno relay.
- there is no public agent API route for outsiders to call directly.

## Relay protocol

The Deno relay sends:

```json
{
  "type": "prompt",
  "requestId": "uuid",
  "prompt": "your text",
  "sessionId": "optional",
  "metadata": {}
}
```

The agent replies on the same WebSocket:

```json
{
  "type": "response",
  "requestId": "uuid",
  "reply": "agent output",
  "model": "optional",
  "sessionId": "optional",
  "usage": {},
  "raw": {}
}
```

## Environment variables

- `AGENT_PROVIDER` (default: `openai_compatible`)
- `AGENT_MODEL` (default: `gpt-5.3-codex`)
- `AGENT_API_KIND` (kept for compatibility, runtime is Responses-only and forces `responses`)
- `AGENT_API_BASE_URL` (default: `https://api.openai.com/v1`)
- `AGENT_API_URL` (legacy compatibility override; if set, it is converted to `base_url`)
- `AGENT_API_KEY` (default: empty)
- `AGENT_TIMEOUT_SECONDS` (default: `120`)
- `AGENT_PLACEHOLDER_ENABLED` (default: `false`)
- `AGENT_TEMPERATURE` (default: `0.2`)
- `AGENT_STORE` (default: `true`; forwarded to `responses.create(store=...)`)
- `DENO_AGENT_WS_URL` (for example: `wss://your-deno-app.example/agent`)
- `DENO_AGENT_SHARED_SECRET` (must match the Deno relay)
- `DENO_RECONNECT_SECONDS` (default: `5`)
- `RELAY_HINT` (text shown on `/`)

If `AGENT_API_KEY` is missing and placeholder mode is enabled, the API still responds with a local placeholder message.

## Model calling layer

This project now uses the official OpenAI Python SDK async client:

- `from openai import AsyncOpenAI`
- `await client.responses.create(...)`

No hand-rolled direct HTTP calls to `/responses` or `/chat/completions` are used.

Session continuity is mapped from relay `sessionId` to Responses `previous_response_id` in-memory within the running worker process.
Relay `metadata` is kept at the relay boundary and is not forwarded upstream by default, because some OpenAI-compatible gateways reject the `metadata` parameter on `responses.create(...)`.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 7860
```

## Docker

```bash
docker build -t hf-space-agent .
docker run --rm -p 7860:7860 -e AGENT_API_KEY=your_key hf-space-agent
```

## Hugging Face Space (Docker SDK)

1. Create a Space with SDK set to `Docker`.
2. Push this folder content to the Space repo.
3. Configure secrets and variables:
   - secret: `AGENT_API_KEY`
   - secret: `DENO_AGENT_SHARED_SECRET`
   - variable: `DENO_AGENT_WS_URL`
   - variable: `AGENT_MODEL`
   - variable: `AGENT_API_BASE_URL`
   - variable: `AGENT_API_KIND`
   - variable: `AGENT_STORE`
