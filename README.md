# Multi-Persona Agent Workspace

This repository is the main public app repo for a multi-persona agent platform:

- [`deno-relay`](deno-relay): Deno control plane for auth, persona routing, sessions, runs, knowledge APIs, and admin management
- [`hf-space-agent`](hf-space-agent): Hugging Face outbound worker that connects to Deno and bootstraps public Codex skills at startup
- [`android-client`](android-client): RikkaHub-based Android client that talks to Deno, syncs personas, browses threads, and handles persona chat UX

## Runtime Shape

The production split is intentionally boring and therefore survivable:

1. Android talks to Deno.
2. Deno owns durable state, persona routing, and the knowledge gateway.
3. Hugging Face workers connect outbound to Deno and do execution only.
4. Public Codex skills are published in a separate public GitHub repo and pulled into `~/.codex/skills` during HF startup.

## Public Repo Split

- Main public repo: Deno relay + HF worker + Android app + GitHub Actions
- Skills public repo: Codex skills only, published separately so HF startup can pull a small archive into `~/.codex/skills`
- Runtime secrets: stay in Deno Deploy, Hugging Face Space secrets, or GitHub Actions secrets; they do not belong in git unless your hobby is self-sabotage

## Docs

- Specs: [`docs/superpowers/specs/2026-04-18-multi-persona-platform/`](docs/superpowers/specs/2026-04-18-multi-persona-platform/)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Package Notes

- [`deno-relay/README.md`](deno-relay/README.md) tracks PostgreSQL, admin auth, relay protocol, and deployment notes
- [`hf-space-agent/README.md`](hf-space-agent/README.md) tracks worker runtime, startup sync, relay wiring, and environment variables
- [`android-client/`](android-client) contains the RikkaHub-based client shell for Deno-backed persona sync, thread browsing, and chat
- [`.github/workflows/android-preview.yml`](.github/workflows/android-preview.yml) builds a preview APK plus the larger Android artifact on GitHub Actions
