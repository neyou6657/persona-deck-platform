# Multi-Persona Agent Workspace

This repository is the main public app repo for a multi-persona agent platform:

- [`deno-relay`](/workspace/deno-relay): Deno control plane for auth, persona routing, sessions, runs, and agent-facing knowledge APIs
- [`hf-space-agent`](/workspace/hf-space-agent): Hugging Face outbound worker that connects to Deno and bootstraps public Codex skills at startup
- [`android-client`](/workspace/android-client): Android client that talks to Deno, syncs personas, and handles persona chat UX

## Runtime Shape

The production split is intentionally boring and therefore survivable:

1. Android talks to Deno.
2. Deno owns durable state and the knowledge gateway.
3. Hugging Face workers connect outbound to Deno and do execution only.
4. Public Codex skills are published in a separate public GitHub repo and pulled into `~/.codex/skills` during HF startup.

## Public Repo Split

- Main public repo: Deno relay + HF worker + Android app + GitHub Actions
- Skills public repo: Codex skills only, published separately so HF startup can pull a small archive into `~/.codex/skills`
- Runtime secrets: stay in Deno Deploy, Hugging Face Space secrets, or GitHub Actions secrets; they do not belong in git unless your hobby is self-sabotage

## Docs

- Specs: [`docs/superpowers/specs/2026-04-18-multi-persona-platform/`](/workspace/docs/superpowers/specs/2026-04-18-multi-persona-platform)
- Plans: [`docs/superpowers/plans/`](/workspace/docs/superpowers/plans)

## Package Notes

- [`deno-relay/README.md`](/workspace/deno-relay/README.md) will track PostgreSQL, admin auth, and knowledge routing
- [`hf-space-agent/README.md`](/workspace/hf-space-agent/README.md) tracks worker runtime, startup sync, and relay wiring
- [`android-client/`](/workspace/android-client) is being reshaped into a server-backed client rather than a fake local demo
