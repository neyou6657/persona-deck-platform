# Deno Multi-Persona Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `deno-relay` from a single-pool relay into a persona-aware control plane with worker registration, Deno KV persistence, conversation lifecycle APIs, and run polling.

**Architecture:** Keep `/agent` and `/ws` as the real-time transport edge, but move durable logic into explicit domain helpers: worker registry, conversation store, run store, and API handlers. Use one canonical `runId`, single-flight per conversation, and Phase 1 polling instead of streaming.

**Tech Stack:** Deno, TypeScript, Deno KV, Deno test

---

### Task 1: Introduce failing domain tests for persona routing and conversation state

**Files:**
- Create: `/workspace/deno-relay/domain.test.ts`
- Create: `/workspace/deno-relay/domain.ts`

- [ ] **Step 1: Write a failing test for worker registration by persona**

```ts
Deno.test("registerWorker stores persona routing buckets", async () => {
  const state = createInMemoryRegistry();
  registerWorker(state, {
    agentId: "hf-space-coder",
    instanceId: "inst-1",
    personaIds: ["coder"],
  });
  assertEquals(pickWorkerForPersona(state, "coder")?.instanceId, "inst-1");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /workspace/deno-relay && deno test domain.test.ts`
Expected: FAIL because `domain.ts` and helpers do not exist yet.

- [ ] **Step 3: Add a failing test for conversation single-flight**

```ts
Deno.test("beginRun rejects a second active run on the same conversation", async () => {
  const store = createInMemoryConversationStore();
  await beginRun(store, { runId: "run-1", conversationId: "conv-1", personaId: "coder" });
  await assertRejects(() =>
    beginRun(store, { runId: "run-2", conversationId: "conv-1", personaId: "coder" })
  );
});
```

- [ ] **Step 4: Add a failing test for continuity updates**

```ts
Deno.test("completeRun updates previousResponseId on success", async () => {
  const store = createInMemoryConversationStore();
  await seedConversationState(store, { conversationId: "conv-1", personaId: "coder" });
  await completeRun(store, {
    runId: "run-1",
    conversationId: "conv-1",
    responseId: "resp-123",
    reply: "ok",
  });
  const state = await getConversationState(store, "conv-1");
  assertEquals(state?.previousResponseId, "resp-123");
});
```

- [ ] **Step 5: Commit the red tests**

```bash
git -C /workspace add deno-relay/domain.test.ts deno-relay/domain.ts
git -C /workspace commit -m "test: define multi-persona relay behavior"
```

### Task 2: Implement domain helpers and KV-backed storage

**Files:**
- Modify: `/workspace/deno-relay/domain.ts`
- Modify: `/workspace/deno-relay/deno.json`
- Test: `/workspace/deno-relay/domain.test.ts`

- [ ] **Step 1: Implement worker registry and routing helpers**

```ts
export type WorkerRegistration = {
  agentId: string;
  instanceId: string;
  personaIds: string[];
};

export function registerWorker(state: RegistryState, worker: WorkerRegistration) {
  state.workers.set(worker.instanceId, worker);
  for (const personaId of worker.personaIds) {
    const bucket = state.personaBuckets.get(personaId) ?? [];
    bucket.push(worker.instanceId);
    state.personaBuckets.set(personaId, bucket);
  }
}
```

- [ ] **Step 2: Implement conversation/run state helpers**

```ts
export async function beginRun(store: ConversationStore, run: RunRecord) {
  const existing = store.activeRuns.get(run.conversationId);
  if (existing) throw new Error("conversation_busy");
  store.activeRuns.set(run.conversationId, run.runId);
  await store.runs.set(run.runId, { ...run, status: "in_progress" });
}

export async function completeRun(store: ConversationStore, update: CompleteRunInput) {
  await store.runs.set(update.runId, {
    ...(await store.runs.get(update.runId)),
    status: "completed",
    reply: update.reply,
    responseId: update.responseId,
  });
  await store.states.set(update.conversationId, {
    ...(await store.states.get(update.conversationId)),
    previousResponseId: update.responseId,
  });
  store.activeRuns.delete(update.conversationId);
}
```

- [ ] **Step 3: Run the focused test suite**

Run: `cd /workspace/deno-relay && deno test domain.test.ts`
Expected: PASS

- [ ] **Step 4: Add KV permission/config if needed**

```json
{
  "tasks": {
    "test": "deno test -A"
  }
}
```

- [ ] **Step 5: Commit the domain layer**

```bash
git -C /workspace add deno-relay/domain.ts deno-relay/domain.test.ts deno-relay/deno.json
git -C /workspace commit -m "feat: add multi-persona relay domain layer"
```

### Task 3: Wire persona registration, `/v1` APIs, and run polling into `main.ts`

**Files:**
- Modify: `/workspace/deno-relay/main.ts`
- Modify: `/workspace/deno-relay/README.md`
- Test: `/workspace/deno-relay/domain.test.ts`

- [ ] **Step 1: Extend agent websocket handling for `agent_register`**

```ts
if (payload.type === "agent_register") {
  registerWorker(registry, payload);
  sendJson(socket, { type: "agent_registered", connectionId, heartbeatSec: 20 });
  return;
}
```

- [ ] **Step 2: Add `/v1/personas`, `/v1/conversations`, `/v1/conversations/continue-last`, and `/v1/runs/:id` handlers**

```ts
if (url.pathname === "/v1/personas" && req.method === "GET") {
  return json(await listPersonas(kv, registry));
}
```

- [ ] **Step 3: Replace legacy request forwarding with canonical `runId`**

```ts
const runId = crypto.randomUUID();
await beginRun(store, { runId, conversationId, personaId, status: "queued" });
sendJson(agentSocket, {
  type: "prompt",
  runId,
  conversationId,
  personaId,
  continuity: { previousResponseId },
  prompt,
  metadata,
});
```

- [ ] **Step 4: Run relay tests and a type check**

Run: `cd /workspace/deno-relay && deno test -A && deno check main.ts`
Expected: PASS

- [ ] **Step 5: Update README examples to `/v1/...` and `runId`**

```md
- `GET /v1/personas`
- `POST /v1/conversations`
- `GET /v1/runs/{runId}`
```

- [ ] **Step 6: Commit the control-plane integration**

```bash
git -C /workspace add deno-relay/main.ts deno-relay/README.md deno-relay/deno.json deno-relay/domain.ts deno-relay/domain.test.ts
git -C /workspace commit -m "feat: add persona-aware deno control plane"
```
