# Monorepo Bootstrap And Git Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/workspace` into a clean git-backed monorepo root for the Deno control plane, Hugging Face worker, and future Android client.

**Architecture:** Keep the current `deno-relay` and `hf-space-agent` directories as first-class packages, add a dedicated Android app directory, and manage all three under one root repository with shared docs and strict ignore rules.

**Tech Stack:** Git, Markdown, shell, Android Gradle project scaffolding, Deno, Python

---

### Task 1: Initialize the repository root and ignore local junk

**Files:**
- Create: `/workspace/.gitignore`
- Modify: `/workspace/README.md`

- [ ] **Step 1: Verify there is no existing root git repository**

Run: `git -C /workspace rev-parse --show-toplevel`
Expected: non-zero exit with `not a git repository`.

- [ ] **Step 2: Create the root ignore file**

```gitignore
.cc-connect/
.deno/
.venv/
node_modules/
.gradle/
generated/
CF-Workers-CheckProxyIP/
.worktrees/
worktrees/
```

- [ ] **Step 3: Update the root README to describe the three-package repo**

```md
# Multi-Persona Platform Workspace

- `deno-relay/`: public control plane and routing layer
- `hf-space-agent/`: persona worker runtime for Hugging Face Spaces
- `android-client/`: Android app for persona switching and chat threads
```

- [ ] **Step 4: Initialize git on `main`**

Run: `git -C /workspace init -b main`
Expected: git repository created with default branch `main`.

- [ ] **Step 5: Verify ignored noise is hidden**

Run: `git -C /workspace status --short`
Expected: only real project files are shown, not `.cc-connect`, `.venv`, `node_modules`, or generated outputs.

- [ ] **Step 6: Commit bootstrap metadata**

```bash
git -C /workspace add .gitignore README.md docs/superpowers/specs docs/superpowers/plans
git -C /workspace commit -m "chore: initialize monorepo workspace"
```

### Task 2: Prepare the top-level package layout for three deliverables

**Files:**
- Create: `/workspace/android-client/README.md`
- Modify: `/workspace/README.md`

- [ ] **Step 1: Create the Android package skeleton**

```md
# android-client

Android app for persona switching, conversation list, continue-last-chat, new chat, and message send/receive.
```

- [ ] **Step 2: Update root README package table**

```md
## Packages

| Package | Purpose |
| --- | --- |
| `deno-relay` | Public API, worker registry, persistence, routing |
| `hf-space-agent` | Outbound worker that serves one or more personas |
| `android-client` | User-facing mobile client |
```

- [ ] **Step 3: Verify the planned package layout**

Run: `find /workspace -maxdepth 2 -type d | sort`
Expected: includes `/workspace/deno-relay`, `/workspace/hf-space-agent`, and `/workspace/android-client`.

- [ ] **Step 4: Commit package layout preparation**

```bash
git -C /workspace add README.md android-client/README.md
git -C /workspace commit -m "chore: add monorepo package layout"
```
