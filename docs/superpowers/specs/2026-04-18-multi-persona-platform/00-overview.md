# Multi-Persona Platform Overview

## Goal

Build a multi-persona chat platform where:

- Deno is the public control plane and routing layer.
- Each digital persona is backed by one Hugging Face Space worker.
- Android clients can switch personas, continue an existing conversation, or start a new conversation.
- Hugging Face Spaces are treated as ephemeral workers, not as durable state stores.

## Scope

This design covers:

- persona registration and routing
- conversation and message persistence
- worker protocol between Deno and HF Spaces
- client-facing APIs needed for Android
- phase split so implementation can ship in pieces without breaking the model

This design does not yet cover:

- billing
- moderation policy
- media uploads beyond metadata placeholders
- push notifications
- multi-device sync conflict resolution

## Core Decision

Use a control-plane and worker-plane split.

- Control plane: Deno service, public APIs, session state, persona registry, conversation storage, run tracking, client events.
- Worker plane: one or more HF Spaces per persona, connected outbound to Deno over authenticated WebSocket, generating replies only.

The important constraint is simple:

- HF Space can disappear and reconnect at any time.
- User conversations must still continue correctly.

That means durable state must live on the Deno side or an attached persistent store, not inside HF Space memory or disk.

## Main Components

### 1. Deno Control Plane

Responsibilities:

- accept client requests
- authenticate and register persona workers
- route prompts to the correct worker
- persist conversations, messages, runs, and persona-specific conversation state
- expose APIs for persona list, thread list, thread creation, message send, and event updates

### 2. HF Persona Workers

Responsibilities:

- connect outbound to Deno
- register the persona(s) they can serve
- receive prompt jobs
- call the model SDK
- return reply, usage, and error details

Non-responsibilities:

- durable conversation storage
- thread identity source of truth
- persona catalog source of truth

### 3. Android Client

Responsibilities:

- show persona switcher
- show conversation list
- continue the latest conversation for a persona
- create a new conversation for a persona
- send messages and render assistant replies
- later, consume streamed token/status events

## User Experience Guarantees

The platform must support these user flows:

1. User selects persona A and sends a message.
2. The Android client receives that persona's reply.
3. User is not satisfied and continues the same conversation with persona A.
4. Later, user starts a new conversation under persona A.
5. After that, user switches to persona B and starts or continues a different conversation there.
6. Conversation state for persona A and persona B must not bleed into each other.

## Persistence Principles

Persist on the backend:

- personas
- conversations
- messages
- runs/jobs
- per-conversation per-persona model continuity state such as `previous_response_id`

Keep transient:

- live websocket connections
- worker heartbeat timestamps
- pending request timers
- short-lived stream buffers

## Security And Ownership Invariants

These rules are mandatory in Phase 1:

- every conversation belongs to exactly one authenticated user
- every run belongs to exactly one authenticated user through its conversation
- every message write is scoped by authenticated `userId + conversationId`
- every worker connection is authenticated before registration is accepted
- every worker is authorized only for the persona ids bound to its credential

API behavior must be consistent:

- if a conversation or run does not belong to the authenticated user, return one standardized ownership error path
- if a worker tries to register for an unassigned persona, reject registration

## Why This Shape

This design keeps the platform stable even when:

- HF Space restarts
- multiple workers connect for the same persona
- users switch personas frequently
- the client needs both "continue previous thread" and "start fresh thread"

It also gives a clean path toward streaming, retries, Android notifications, and scaling later without rewriting the whole routing model.

## Document Map

- [00-overview.md](/workspace/docs/superpowers/specs/2026-04-18-multi-persona-platform/00-overview.md): system intent and boundaries
- [01-relay-routing-and-storage.md](/workspace/docs/superpowers/specs/2026-04-18-multi-persona-platform/01-relay-routing-and-storage.md): Deno-side routing, registry, persistence, and protocol
- [02-client-conversations-and-flows.md](/workspace/docs/superpowers/specs/2026-04-18-multi-persona-platform/02-client-conversations-and-flows.md): Android-facing APIs, conversation lifecycle, and flow validation points
