# Client Conversations And Flows

## Product Objective

The Android client must support three simple mental models:

1. "Talk to this persona again."
2. "Start a fresh topic with this same persona."
3. "Switch to another persona and do something unrelated there."

The backend model must preserve those expectations exactly.

## Core Conversation Rule

In Phase 1:

- one conversation belongs to one persona
- one persona can have many conversations
- one user can have many personas and many conversations

This is the cleanest mapping for the UI and the easiest way to avoid cross-persona context leaks.

## Backend Objects Mapped To User Actions

### Continue Last Conversation

User intent:

- "Open my latest thread with persona A and continue it"

Backend behavior:

- find the most recent `conversation` for `userId + personaId`
- append a new user `message`
- load `conversationState.previousResponseId`
- route to worker for that persona
- after reply, persist assistant `message` and update `previousResponseId`

### New Conversation Under Same Persona

User intent:

- "Same persona, different task, clean slate"

Backend behavior:

- create a new `conversation`
- create empty `conversationState`
- first message under that thread has no `previousResponseId`

Result:

- previous thread remains intact
- new thread does not inherit prior model continuity state

### Switch To Another Persona

User intent:

- "Now I want the other digital person"

Backend behavior:

- client selects a different `personaId`
- user may either continue the latest thread for that persona or create a new one
- routing and continuity state are completely separate from the first persona

Result:

- persona A and persona B remain isolated at both UI and backend levels

## Ownership Rule

Every conversation API is scoped by authenticated user ownership.

- client can only read or write conversations it owns
- client can only poll runs that belong to its conversations
- cross-user conversation ids must never leak data through permissive lookup behavior

## Minimal Client API Surface

### Persona Discovery

`GET /v1/personas`

Returns:

- `personaId`
- display name
- description
- online availability

Purpose:

- populate persona switcher

### Conversation List

`GET /v1/conversations?personaId=...`

Returns:

- list of conversations for that persona
- title
- last message preview
- updated time

Purpose:

- lets user resume a prior thread instead of guessing

### Continue Last Conversation

`POST /v1/conversations/continue-last`

Payload:

```json
{
  "personaId": "coder"
}
```

Behavior:

- return latest conversation for this persona if one exists
- otherwise create a new conversation and return it

This gives the Android client a very cheap "continue previous chat" button.

### New Conversation

`POST /v1/conversations`

Payload:

```json
{
  "personaId": "coder",
  "title": "optional"
}
```

Behavior:

- always create a new thread

### Message Send

`POST /v1/conversations/{conversationId}/messages`

Payload:

```json
{
  "clientMessageId": "uuid",
  "text": "Help me rewrite this code"
}
```

Behavior:

- require authenticated ownership of `conversationId`
- reject if another run for this conversation is already active with `conversation_busy`
- dedupe by `(userId, conversationId, clientMessageId)`
- persist user message
- create run
- route to correct persona worker
- return `202 Accepted` with:

```json
{
  "runId": "uuid",
  "conversationId": "uuid",
  "userMessageId": "uuid",
  "status": "queued"
}
```

- persist assistant reply when run completes

### Message Read

`GET /v1/conversations/{conversationId}/messages`

Purpose:

- render the full thread when the user opens a conversation

### Run Events

Phase 1:

- polling is acceptable through `GET /v1/runs/{runId}`

`GET /v1/runs/{runId}` must return terminal and non-terminal state explicitly:

```json
{
  "runId": "uuid",
  "conversationId": "uuid",
  "status": "queued | in_progress | completed | failed | timed_out",
  "assistantMessageId": "nullable",
  "error": "nullable"
}
```

Phase 2:

- add SSE or WebSocket events for:
  - started
  - delta
  - completed
  - error

## Validation Of Required User Flows

### Flow A: User sends a message and receives a reply

Expected:

- works under selected persona
- reply is visible in client
- thread is persisted

Design status:

- satisfied by `conversation + message + run`

### Flow B: User continues another round because the answer is not good enough

Expected:

- assistant still remembers the current thread
- second turn belongs to the same thread

Design status:

- satisfied by storing `previousResponseId` per conversation
- also requires the wire contract to carry prior continuity into the worker and return the next `responseId`

### Flow C: User finishes that matter and opens a new matter under the same persona

Expected:

- clean conversation
- no bleed from earlier thread

Design status:

- satisfied by creating a new `conversation` and empty continuity state

### Flow D: User switches to another persona and works there

Expected:

- other persona has its own history
- previous persona's state stays untouched

Design status:

- satisfied by one-conversation-one-persona rule and persona-based routing

## What Can Break These Flows

These are explicit anti-goals:

- using `sessionId` alone as the durable conversation key
- sharing one continuity state across multiple conversations of the same persona
- letting a conversation change persona in place during Phase 1
- storing conversation memory in HF Space instead of backend storage
- allowing multiple simultaneous active runs on the same conversation in Phase 1
- treating `clientMessageId` as optional decoration instead of a dedupe key

Any of those would make the user's mental model drift away from actual behavior.

## Recommended Client UX Shape

Persona home screen:

- persona switcher
- "continue last chat"
- "new chat"
- recent conversation list

Inside a conversation:

- message list
- send box
- later, run status or streaming output

This is intentionally boring. Boring is good here. If the thread model is boring, the backend stays sane.

## Phase Split

### Phase 1

- persona switcher
- per-persona conversation list
- continue last
- new chat
- send/receive final replies
- polling by `runId`
- minimal dedupe via `clientMessageId`
- single-flight per conversation

### Phase 2

- streaming text
- typing/status indicators
- retry / edit / resend
- cross-device sync polish
- multi-persona orchestration in one view
