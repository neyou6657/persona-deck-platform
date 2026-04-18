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
- on startup, optional skills sync pulls a public repo into `~/.codex/skills`.
- there is no public agent API route for outsiders to call directly.

## Relay protocol

After websocket connect, the worker first registers persona identity:

```json
{
  "type": "agent_register",
  "agentId": "hf-space-coder-v1",
  "instanceId": "uuid",
  "personaIds": ["coder"],
  "capabilities": {
    "stream": false,
    "tools": false
  },
  "version": "2026-04-18"
}
```

The Deno relay sends:

```json
{
  "type": "prompt",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "prompt": "your text",
  "sessionId": "optional",
  "continuity": {
    "previousResponseId": "resp_123 or null"
  },
  "metadata": {}
}
```

The agent replies on the same WebSocket:

```json
{
  "type": "response",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "responseId": "resp_456",
  "reply": "agent output",
  "model": "optional",
  "sessionId": "optional",
  "usage": {},
  "raw": {}
}
```

## Environment variables

- `AGENT_ID` (default: `hf-space-agent`)
- `AGENT_INSTANCE_ID` (default: auto-generated UUID at startup)
- `AGENT_PERSONA_IDS` (comma-separated, default: `default`)
- `AGENT_PERSONA_ID` (legacy single-persona fallback if `AGENT_PERSONA_IDS` is not set)
- `AGENT_VERSION` (default: `2026-04-18`)
- `AGENT_PROVIDER` (default: `openai_compatible`)
- `AGENT_RUNTIME` (`responses` or `codex_cli`, default: `codex_cli`)
- `AGENT_MODEL` (default: `gpt-5.3-codex`)
- `AGENT_API_KIND` (kept for compatibility, runtime is Responses-only and forces `responses`)
- `AGENT_API_BASE_URL` (default: `https://api.openai.com/v1`)
- `AGENT_API_URL` (legacy compatibility override; if set, it is converted to `base_url`)
- `AGENT_API_KEY` (default: empty)
- `AGENT_TIMEOUT_SECONDS` (default: `120`)
- `AGENT_PLACEHOLDER_ENABLED` (default: `false`)
- `AGENT_TEMPERATURE` (default: `0.2`)
- `AGENT_STORE` (default: `true`; forwarded to `responses.create(store=...)`)
- `CODEX_BIN` (default: `codex`)
- `CODEX_MODEL_PROVIDER` (default: `relaygw`)
- `CODEX_PROVIDER_NAME` (default: `Relay Gateway`)
- `CODEX_API_BASE_URL` (optional override for codex_cli runtime)
- `CODEX_API_KEY` (optional override for codex_cli runtime)
- `CODEX_MODEL` (optional override for codex_cli runtime)
- `CODEX_TIMEOUT_SECONDS` (default: `120`)
- `CODEX_WORKDIR` (default: `/tmp`)
- `DENO_AGENT_WS_URL` (for example: `wss://your-deno-app.example/agent`)
- `DENO_AGENT_SHARED_SECRET` (must match the Deno relay)
- `DENO_RECONNECT_SECONDS` (default: `5`)
- `RELAY_HINT` (text shown on `/`)
- `SKILLS_REPO_URL` (public repo to sync skills from)
- `SKILLS_REPO_REF` (default: `main`)
- `SKILLS_REPO_SUBDIR` (default: `skills`)
- `SKILLS_SYNC_ON_STARTUP` (default: `true`)
- `SKILLS_CACHE_DIR` (default: `/tmp/hf-space-skills-cache`)
- `CODEX_HOME` (default: `/home/appuser/.codex`)
- `DENO_KNOWLEDGE_BASE_URL` (reserved for persona-knowledge skill usage)
- `DENO_KNOWLEDGE_SHARED_SECRET` (reserved for persona-knowledge skill usage)

If `AGENT_API_KEY` is missing and placeholder mode is enabled, the API still responds with a local placeholder message.

## Runtime modes

- `AGENT_RUNTIME=codex_cli`: invokes installed `codex` CLI and continues conversations with real Codex thread ids via `codex exec resume`.
- `AGENT_RUNTIME=responses`: uses official OpenAI Python SDK async client.

Both modes preserve relay protocol.
`codex_cli` returns the real Codex thread id as `responseId`, so later turns can resume correctly.
`responses` now retries once without `previous_response_id` when an OpenAI-compatible provider rejects that parameter, but that compatibility fallback does not preserve multi-turn continuity by itself.

## Skills bootstrap

If `SKILLS_SYNC_ON_STARTUP=true` and `SKILLS_REPO_URL` is configured:
- startup executes a git sync into cache directory
- copies `SKILLS_REPO_SUBDIR` into `${CODEX_HOME}/skills`
- reports sync status in `/healthz` under `skills_sync`

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
