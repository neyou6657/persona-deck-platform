# Relay Routing And Storage

## Current Problem

The current Deno relay can handle multiple connected workers, but it still behaves like a single-persona switchboard:

- client messages do not specify a target persona
- workers do not register persona identity
- routing is global round-robin instead of persona-aware routing
- conversation state is mostly forwarded through, not persisted

That is not enough for a multi-persona product.

## Phase 1 Objective

Upgrade Deno from a thin relay into a small orchestration layer that can:

- know which workers serve which personas
- store conversation and run state durably
- route prompts to the right persona
- support multiple independent threads per persona

## Deno-Side Data Model

Use Deno KV first. It is enough for Phase 1 and matches the "keep it simple" goal.

Use one canonical execution id:

- `runId` is the canonical id across public API, internal storage, relay routing, and worker protocol
- do not maintain separate `requestId` and `runId` concepts in Phase 1
- if a lower-level transport correlation id is ever needed later, it must be derived from `runId`, not compete with it

### Persona

Key:

- `["persona", personaId]`

Fields:

- `personaId`
- `displayName`
- `description`
- `workerRoutingMode`
- `enabled`
- `metadata`
- `updatedAt`

Purpose:

- source of truth for user-visible digital personas

### AgentInstance

Key:

- `["agentInstance", instanceId]`

Fields:

- `instanceId`
- `agentId`
- `personaIds`
- `capabilities`
- `status`
- `connectedAt`
- `lastHeartbeatAt`

Purpose:

- online registry of connected HF workers

Notes:

- this can also be mirrored in memory for fast routing
- KV copy is useful for observability and future multi-instance relay setups

### Conversation

Key:

- `["conversation", conversationId]`
- `["conversationByUserPersonaUpdatedAt", userId, personaId, updatedAt, conversationId]`

Fields:

- `conversationId`
- `userId`
- `personaId`
- `title`
- `status`
- `createdAt`
- `updatedAt`

Purpose:

- one thread under one persona

Important rule:

- a conversation belongs to exactly one persona in Phase 1
- if the user switches persona, that is a different conversation unless Phase 2 explicitly adds cross-persona threads

### Message

Key:

- `["message", conversationId, messageId]`
- `["messageByConversationCreatedAt", conversationId, createdAt, messageId]`

Fields:

- `messageId`
- `conversationId`
- `role`
- `content`
- `personaId`
- `clientMessageId`
- `createdAt`

Purpose:

- durable chat history for client rendering and audits

### ConversationPersonaState

Key:

- `["conversationState", conversationId]`

Fields:

- `conversationId`
- `personaId`
- `previousResponseId`
- `lastRunId`
- `updatedAt`

Purpose:

- holds model continuity state needed to continue the same thread

This is the critical bridge:

- Android keeps thread identity
- Deno keeps `previousResponseId`
- HF workers can restart without losing the user's thread continuity

### Run

Key:

- `["run", runId]`
- `["runByConversationCreatedAt", conversationId, createdAt, runId]`

Fields:

- `runId`
- `conversationId`
- `personaId`
- `agentInstanceId`
- `status`
- `prompt`
- `reply`
- `error`
- `usage`
- `createdAt`
- `completedAt`

Purpose:

- track execution state and allow client polling or event replay

### Idempotency Record

Key:

- `["messageDedupe", userId, conversationId, clientMessageId]`

Fields:

- `userId`
- `conversationId`
- `clientMessageId`
- `runId`
- `messageId`
- `createdAt`

Purpose:

- prevent mobile retry duplication from creating duplicate messages and corrupting continuity state

## Query Plan

Use explicit indexes instead of relying on full scans.

- `continue-last` uses `["conversationByUserPersonaUpdatedAt", userId, personaId, updatedAt, conversationId]`
- conversation list uses the same index with reverse chronological reads
- message history uses `["messageByConversationCreatedAt", conversationId, createdAt, messageId]`
- run list and debugging use `["runByConversationCreatedAt", conversationId, createdAt, runId]`

This keeps Phase 1 implementable in KV without turning every request into a scavenger hunt.

## Worker Registration Protocol

HF worker connects to `/agent` and must register before it can receive work.

Worker -> Deno:

```json
{
  "type": "agent_register",
  "agentId": "hf-space-coder-v1",
  "instanceId": "uuid",
  "personaIds": ["coder"],
  "capabilities": {
    "stream": true,
    "tools": false
  },
  "version": "2026-04-18"
}
```

Deno -> Worker:

```json
{
  "type": "agent_registered",
  "connectionId": "uuid",
  "heartbeatSec": 20
}
```

Required runtime behavior:

- worker must heartbeat
- unregistered worker receives no jobs
- disconnected worker is removed from routing pool

## Worker Authentication

Phase 1 minimum worker auth:

- worker connects with bearer token or signed query token
- Deno validates the token before accepting registration
- token resolves to an allowlist of permitted `personaIds`
- `agent_register.personaIds` must be a subset of that allowlist
- invalid token returns `unauthorized_worker`
- valid token but forbidden persona returns `forbidden_persona_registration`

## Client Prompt Protocol

Client -> Deno should become:

```json
{
  "type": "prompt",
  "conversationId": "optional",
  "sessionId": "legacy optional",
  "prompt": "Write a release note",
  "target": {
    "personaId": "coder",
    "agentId": "optional",
    "mode": "strict"
  },
  "metadata": {}
}
```

Routing rules:

- if `conversationId` exists, Deno derives `personaId` from the stored conversation and ignores conflicting client values
- if `conversationId` is absent, `target.personaId` is required in the Phase 1 public API
- `sessionId` remains tolerated for compatibility but is not the durable conversation identifier

## Relay -> Worker Prompt

Deno -> Worker:

```json
{
  "type": "prompt",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "prompt": "Write a release note",
  "sessionId": "legacy optional",
  "continuity": {
    "previousResponseId": "nullable"
  },
  "metadata": {}
}
```

Worker -> Deno:

```json
{
  "type": "response",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "reply": "...",
  "responseId": "resp_123",
  "model": "gpt-5.3-codex",
  "usage": {},
  "raw": {}
}
```

Error:

```json
{
  "type": "error",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "error": "..."
}
```

Continuity update rule:

- Deno reads `conversationState.previousResponseId` before dispatch
- Deno sends it to worker as `continuity.previousResponseId`
- on success, worker returns `responseId`
- Deno updates `conversationState.previousResponseId = responseId`
- on worker error or timeout, Deno does not advance continuity state

## Concurrency Rule

Phase 1 uses single-flight per conversation.

- only one active run may exist per `conversationId`
- if a second send arrives while a run is in progress, return `conversation_busy`
- this prevents out-of-order continuity writes and keeps thread state deterministic

## Routing Policy

Phase 1 routing policy:

- route by `personaId`
- within a persona pool, use round-robin across healthy registered instances
- if no instance exists for that persona, return `no_agent_for_persona`

## Run State Machine

Phase 1 run states:

- `queued`
- `in_progress`
- `completed`
- `failed`
- `timed_out`

Lifecycle:

- create run as `queued`
- when dispatched to worker, move to `in_progress`
- on successful reply persistence, move to `completed`
- on worker error, move to `failed`
- on timeout or orphaned disconnect, move to `timed_out`

Required sweeper behavior:

- if a worker disconnects while owning in-flight runs, mark those runs `timed_out` unless retry is explicitly introduced later
- do not silently leave orphan runs hanging forever

Phase 2 routing policy:

- load-aware routing
- weighted routing
- sticky routing by conversation
- retries and failover

## State Ownership Rules

Persist in Deno-side storage:

- persona catalog
- conversation list
- message history
- previous response ids
- run status

Do not rely on HF Space for:

- conversation history
- previous response ids
- thread index
- worker identity source of truth

## Event Model

Current system only sends final `response` or `error`.

To support better clients later, reserve these event types:

- `run_started`
- `response_delta`
- `tool_status`
- `run_completed`
- `run_error`

Phase 1 may still return final response only. The protocol should be designed so streaming can be added without rewriting message formats.

## Phase Split

## Canonical Phase 1 API

- `GET /v1/personas`
- `GET /v1/conversations?personaId=...`
- `POST /v1/conversations`
- `POST /v1/conversations/continue-last`
- `GET /v1/conversations/{conversationId}/messages`
- `POST /v1/conversations/{conversationId}/messages`
- `GET /v1/runs/{runId}`

### Phase 1

- worker registration
- worker auth and persona allowlist enforcement
- persona-aware routing
- Deno KV persistence for personas, conversations, messages, runs, continuity state, and dedupe records
- single-flight per conversation
- minimal idempotency keyed by `userId + conversationId + clientMessageId`
- canonical `/v1/...` API surface

### Phase 2

- stream events
- cancel run
- retries and idempotency
- sticky routing
- admin persona management APIs
- stronger per-persona auth and rate limits
