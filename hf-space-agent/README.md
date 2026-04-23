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
- on startup, the agent starts polling the Deno relay over HTTP via `POST /v1/worker/claim`.
- on startup, optional skills sync pulls the configured repo into `~/.agent/skills` and keeps
  `${CODEX_HOME}/skills` compatible.
- there is no public agent API route for outsiders to call directly.

## Relay protocol

Current default transport is worker polling. On each poll, the worker sends registration context to
the relay:

```json
{
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

Request:

```http
POST /v1/worker/claim
Authorization: Bearer <workerSecret>
Content-Type: application/json
```

The relay can reply with `204 No Content`, a `control` payload, or a `prompt` payload.

Control example:

```json
{
  "type": "control",
  "action": "restart",
  "agentId": "hf-space-coder-v1",
  "restartGeneration": 2,
  "config": {
    "runtime": "responses",
    "model": "gpt-5.3-codex",
    "enabledSkills": ["persona-knowledge"]
  }
}
```

Prompt example:

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

After the worker finishes a run, it reports back with normal HTTP calls:

```http
POST /v1/worker/runs/{runId}/response
POST /v1/worker/runs/{runId}/error
```

Success payload example:

```json
{
  "instanceId": "uuid",
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

`GET /agent` WebSocket support still exists on the relay side, but the current HF worker loop
defaults to polling. The variable name `DENO_AGENT_WS_URL` is legacy baggage; the runtime strips a
trailing `/agent` when building the HTTP base URL.

## Environment variables

- `AGENT_ID` (default: `hf-space-agent`)
- `AGENT_INSTANCE_ID` (default: auto-generated UUID at startup)
- `AGENT_PERSONA_IDS` (comma-separated, default: `default`)
- `AGENT_PERSONA_ID` (legacy single-persona fallback if `AGENT_PERSONA_IDS` is not set)
- `AGENT_VERSION` (default: `2026-04-18`)
- `AGENT_PROVIDER` (default: `openai_compatible`)
- `AGENT_RUNTIME` (`responses`, `codex_cli`, or `opencode_cli`, default: `codex_cli`)
- `AGENT_MODEL` (default: `gpt-5.3-codex`)
- `AGENT_API_KIND` (`responses` for `responses/codex_cli`; `chat_completions` for `opencode_cli`)
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
- `OPENCODE_BIN` (default: `opencode`)
- `OPENCODE_HOME` (default: `~/.opencode-relay`)
- `OPENCODE_WORKDIR` (default: `/tmp`)
- `OPENCODE_PROVIDER_ID` (default: `relaychat`, used when `AGENT_MODEL` has no provider prefix)
- `OPENCODE_PROVIDER_NAME` (default: `Relay Chat`)
- `DENO_AGENT_WS_URL` (legacy variable name; accepts values like `wss://your-deno-app.example/agent`
  or the relay base URL, and the worker derives the HTTP base URL for `/v1/worker/claim`)
- `DENO_AGENT_SHARED_SECRET` (must match the Deno relay)
- `DENO_RECONNECT_SECONDS` (default: `5`; idle/error backoff between polling attempts)
- `RELAY_HINT` (text shown on `/`)
- `SKILLS_REPO_URL` (public repo to sync skills from)
- `SKILLS_REPO_REF` (default: `main`)
- `SKILLS_REPO_SUBDIR` (default: `skills`)
- `SKILLS_SYNC_ON_STARTUP` (default: `true`)
- `SKILLS_CACHE_DIR` (default: `/tmp/hf-space-skills-cache`)
- `AGENT_SKILLS_DIR` (default: `~/.agent/skills`; active skills directory populated from the repo)
- `CODEX_HOME` (default: `/home/appuser/.codex`)
- `DENO_KNOWLEDGE_BASE_URL` (reserved for persona-knowledge skill usage)
- `DENO_KNOWLEDGE_SHARED_SECRET` (reserved for persona-knowledge skill usage)

If `AGENT_API_KEY` is missing and placeholder mode is enabled, the API still responds with a local placeholder message.

## Runtime modes

- `AGENT_RUNTIME=codex_cli`: invokes installed `codex` CLI and continues conversations with real Codex thread ids via `codex exec resume`.
- `AGENT_RUNTIME=responses`: uses official OpenAI Python SDK async client.
- `AGENT_RUNTIME=opencode_cli`: invokes installed `opencode` CLI and talks to OpenAI-compatible endpoints through `chat_completions`.

All runtime modes preserve the same claim/response relay protocol.
`codex_cli` returns the real Codex thread id as `responseId`, so later turns can resume correctly.
`responses` now retries once without `previous_response_id` when an OpenAI-compatible provider rejects that parameter, but that compatibility fallback does not preserve multi-turn continuity by itself.
`opencode_cli` returns the OpenCode session id as `responseId`, so the relay can continue the same session after a control-plane restart.

## Skills bootstrap

If `SKILLS_SYNC_ON_STARTUP=true` and `SKILLS_REPO_URL` is configured:
- startup executes a git sync into cache directory
- materializes the selected skills into `${AGENT_SKILLS_DIR}`
- maintains a compatibility link or copy at `${CODEX_HOME}/skills`
- reports sync status in `/healthz` under `skills_sync`

An empty enabled-skills list now means "disable all skills" instead of "load everything".

One subtle detail: `/healthz.skills_sync` reflects the latest startup sync result. The worker can
later receive a control-plane restart with a new `enabledSkills` selection; the authoritative live
state for that is the worker registration stored by `deno-relay`, not the startup snapshot alone.

For the current repository layout, the correct repo configuration is:

- `SKILLS_REPO_URL=https://github.com/neyou6657/persona-deck-platform`
- `SKILLS_REPO_REF=main`
- `SKILLS_REPO_SUBDIR=skills`

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
   - variable: `DENO_AGENT_WS_URL` (legacy name; usually set to `wss://<relay>/agent`)
   - variable: `AGENT_MODEL`
   - variable: `AGENT_API_BASE_URL`
   - variable: `AGENT_API_KIND`
   - variable: `AGENT_STORE`
