---
name: persona-knowledge
description: Use when a Codex agent needs to search or explicitly update a Deno-backed persona knowledge base before or after working on a task
---

# Persona Knowledge

## Overview

Use this skill when the agent should read persona-specific knowledge from Deno before working, or write back a new knowledge note only when the user explicitly asks for it.

## Required Env

- `DENO_KNOWLEDGE_BASE_URL`
- `DENO_KNOWLEDGE_SHARED_SECRET`

## Quick Use

Search before work:

```bash
python3 scripts/persona_knowledge.py search coder "token refresh flow"
```

Write back only on explicit user request:

```bash
python3 scripts/persona_knowledge.py upsert coder "OAuth fix note" manual "Rotate refresh token after each successful exchange."
```

## Rules

- Search first when the task depends on persona memory or project-specific facts.
- Do not write back automatically just because the conversation happened.
- Write back only if the user explicitly asks to update knowledge, save memory, or preserve the result.
- Keep titles short and sources honest.
- Treat the Deno API as the source of truth; do not invent local memory state.

## Output

The helper script prints JSON. Use the returned docs to build the prompt, or keep the returned `docId` if you upserted a note.
