import { assertEquals, assertRejects } from "jsr:@std/assert";

import { createMemoryControlPlaneStore, StoreError } from "./postgres.ts";

Deno.test("listPersonas returns seeded rows from the store", async () => {
  const store = createMemoryControlPlaneStore();
  await store.seedPersonas([
    {
      personaId: "coder",
      displayName: "Code Sensei",
      enabled: true,
    },
  ]);

  const personas = await store.listPersonas();

  assertEquals(personas[0].personaId, "coder");
  assertEquals(personas[0].displayName, "Code Sensei");
  await store.close();
});

Deno.test("createConversation persists under one persona_id", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder", "Refactor parser");

  assertEquals(conversation.personaId, "coder");
  assertEquals(conversation.title, "Refactor parser");
  await store.close();
});

Deno.test("queueRun dedupes the same client message id", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder", "Refactor parser");

  const first = await store.queueRun({
    conversation,
    userId: "u1",
    text: "hello",
    clientMessageId: "msg-1",
    assignedAgentInstanceId: "worker-1",
  });

  const second = await store.queueRun({
    conversation,
    userId: "u1",
    text: "hello",
    clientMessageId: "msg-1",
    assignedAgentInstanceId: "worker-1",
  });

  assertEquals(second.deduped, true);
  assertEquals(second.run.runId, first.run.runId);
  assertEquals(second.userMessageId, first.userMessageId);
  await store.close();
});

Deno.test("claimQueuedRun lets a polling worker take an unassigned queued run", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder");
  const queued = await store.queueRun({
    conversation,
    userId: "u1",
    text: "ship the fix",
    clientMessageId: "m-claim-1",
    assignedAgentInstanceId: null,
  });

  const claimed = await store.claimQueuedRun({
    instanceId: "worker-1",
    agentId: "hf-space-coder-v1",
    personaIds: ["coder"],
  });

  assertEquals(claimed?.run.runId, queued.run.runId);
  assertEquals(claimed?.run.status, "in_progress");
  assertEquals(claimed?.run.agentInstanceId, "worker-1");
  assertEquals(claimed?.previousResponseId, null);
  assertEquals((await store.getRun(queued.run.runId))?.status, "in_progress");
  await store.close();
});

Deno.test("claimQueuedRun skips runs reserved for another worker instance", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder");
  const queued = await store.queueRun({
    conversation,
    userId: "u1",
    text: "only the target worker should get this",
    clientMessageId: "m-claim-2",
    assignedAgentInstanceId: "worker-target",
  });

  const skipped = await store.claimQueuedRun({
    instanceId: "worker-other",
    agentId: "hf-space-coder-v1",
    personaIds: ["coder"],
  });
  const claimed = await store.claimQueuedRun({
    instanceId: "worker-target",
    agentId: "hf-space-coder-v1",
    personaIds: ["coder"],
  });

  assertEquals(skipped, null);
  assertEquals(claimed?.run.runId, queued.run.runId);
  assertEquals(claimed?.run.agentInstanceId, "worker-target");
  await store.close();
});

Deno.test("queueRun rejects a second active run for the same conversation", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder");
  await store.queueRun({
    conversation,
    userId: "u1",
    text: "first",
    clientMessageId: "m-1",
    assignedAgentInstanceId: "worker-1",
  });

  await assertRejects(
    () =>
      store.queueRun({
        conversation,
        userId: "u1",
        text: "second",
        clientMessageId: "m-2",
        assignedAgentInstanceId: "worker-1",
      }),
    StoreError,
    "conversation_busy",
  );
  await store.close();
});

Deno.test("completeRun updates previousResponseId on success", async () => {
  const store = createMemoryControlPlaneStore();
  const conversation = await store.createConversation("u1", "coder");
  const queued = await store.queueRun({
    conversation,
    userId: "u1",
    text: "hello",
    clientMessageId: "m-1",
    assignedAgentInstanceId: "worker-1",
  });

  await store.completeRun({
    runId: queued.run.runId,
    reply: "ok",
    responseId: "resp-123",
  });

  const state = await store.getConversationState(conversation.conversationId);
  assertEquals(state?.previousResponseId, "resp-123");
  await store.close();
});

Deno.test("agent config persists and restart generation increments only on restart", async () => {
  const store = createMemoryControlPlaneStore();

  const saved = await store.upsertAgentConfig({
    agentId: "hf-space-coder-v1",
    runtime: "codex_cli",
    apiKind: "responses",
    workerSecret: "wrk-secret-1",
    spaceRepoId: "rain34572/responses-adapter-gateway",
    model: "gpt-5.4",
    apiBaseUrl: "https://relay.example/v1",
    apiKey: "sk-live-secret",
    systemPrompt: "You are a private coder.",
    temperature: 0.4,
    store: true,
    enabledSkills: ["skill-a", "skill-b"],
  });

  assertEquals(saved.restartGeneration, 0);
  assertEquals(saved.apiKind, "responses");
  assertEquals(saved.workerSecret, "wrk-secret-1");
  assertEquals(saved.spaceRepoId, "rain34572/responses-adapter-gateway");
  assertEquals(saved.enabledSkills, ["skill-a", "skill-b"]);

  const restarted = await store.restartAgentConfig("hf-space-coder-v1");
  assertEquals(restarted.restartGeneration, 1);
  assertEquals(restarted.model, "gpt-5.4");

  const reloaded = await store.getAgentConfig("hf-space-coder-v1");
  assertEquals(reloaded?.restartGeneration, 1);
  assertEquals(reloaded?.apiKind, "responses");
  assertEquals(reloaded?.workerSecret, "wrk-secret-1");
  assertEquals(reloaded?.spaceRepoId, "rain34572/responses-adapter-gateway");
  assertEquals(reloaded?.apiKey, "sk-live-secret");

  await store.close();
});
