# Multi-Persona Platform Workspace

This repository is becoming a three-part monorepo for a multi-persona chat system:

- [`deno-relay`](/workspace/deno-relay): Deno control plane for worker registration, persona routing, conversation state, and client APIs
- [`hf-space-agent`](/workspace/hf-space-agent): Hugging Face Space worker that connects outbound to Deno and serves one or more personas
- [`android-client`](/workspace/android-client): Android app for persona switching, conversation lists, continue-last-chat, new chat, and message send/receive

## Architecture

The intended production shape is:

1. Android client calls the Deno control plane.
2. Deno stores personas, conversations, messages, runs, and continuity state.
3. Persona workers on Hugging Face connect outbound to Deno over authenticated WebSocket.
4. Deno routes each run to the correct persona worker.
5. Worker returns reply plus canonical continuity identifiers so the same conversation can continue later.

## Key Rules

- Hugging Face Spaces are treated as ephemeral workers, not as durable storage.
- Conversation continuity belongs to the backend, not to HF Space memory.
- One conversation belongs to one persona in Phase 1.
- Android Phase 1 uses polling by `runId`, not streaming.

## Docs

- Specs: [`docs/superpowers/specs/2026-04-18-multi-persona-platform/`](/workspace/docs/superpowers/specs/2026-04-18-multi-persona-platform)
- Plans: [`docs/superpowers/plans/`](/workspace/docs/superpowers/plans)

## Package Notes

- [`deno-relay/README.md`](/workspace/deno-relay/README.md) tracks the relay protocol and deployment notes.
- [`hf-space-agent/README.md`](/workspace/hf-space-agent/README.md) tracks worker runtime and environment variables.
- [`android-client/`](/workspace/android-client) contains the RikkaHub-inspired Compose client shell for Deno-backed persona sync, thread browsing, and chat.
- [`.github/workflows/android-preview.yml`](/workspace/.worktrees/rollout-android-rikkahub/.github/workflows/android-preview.yml) builds a preview APK plus a larger build-pack artifact on GitHub Actions.
