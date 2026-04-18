import { assertEquals, assertRejects } from "jsr:@std/assert";

import {
  beginRun,
  completeRun,
  createInMemoryConversationStore,
  createWorkerRegistryState,
  getConversationState,
  pickWorkerForPersona,
  registerWorker,
  seedConversationState,
  unregisterWorker,
} from "./domain.ts";

Deno.test("registerWorker stores persona routing buckets", () => {
  const state = createWorkerRegistryState();
  registerWorker(state, {
    agentId: "hf-space-coder",
    instanceId: "inst-1",
    personaIds: ["coder"],
  });

  assertEquals(pickWorkerForPersona(state, "coder")?.instanceId, "inst-1");
});

Deno.test("pickWorkerForPersona uses round robin per persona", () => {
  const state = createWorkerRegistryState();
  registerWorker(state, {
    agentId: "agent-a",
    instanceId: "inst-a",
    personaIds: ["coder"],
  });
  registerWorker(state, {
    agentId: "agent-b",
    instanceId: "inst-b",
    personaIds: ["coder"],
  });

  assertEquals(pickWorkerForPersona(state, "coder")?.instanceId, "inst-a");
  assertEquals(pickWorkerForPersona(state, "coder")?.instanceId, "inst-b");
  assertEquals(pickWorkerForPersona(state, "coder")?.instanceId, "inst-a");
});

Deno.test("unregisterWorker removes persona routing entries", () => {
  const state = createWorkerRegistryState();
  registerWorker(state, {
    agentId: "hf-space-coder",
    instanceId: "inst-1",
    personaIds: ["coder"],
  });

  unregisterWorker(state, "inst-1");
  assertEquals(pickWorkerForPersona(state, "coder"), null);
});

Deno.test("beginRun rejects a second active run on the same conversation", async () => {
  const store = createInMemoryConversationStore();
  await beginRun(store, {
    runId: "run-1",
    conversationId: "conv-1",
    personaId: "coder",
    prompt: "first",
  });

  await assertRejects(
    () =>
      beginRun(store, {
        runId: "run-2",
        conversationId: "conv-1",
        personaId: "coder",
        prompt: "second",
      }),
    Error,
    "conversation_busy",
  );
});

Deno.test("completeRun updates previousResponseId on success", async () => {
  const store = createInMemoryConversationStore();
  await seedConversationState(store, { conversationId: "conv-1", personaId: "coder" });
  await beginRun(store, {
    runId: "run-1",
    conversationId: "conv-1",
    personaId: "coder",
    prompt: "hello",
  });

  await completeRun(store, {
    runId: "run-1",
    conversationId: "conv-1",
    responseId: "resp-123",
    reply: "ok",
  });

  const state = await getConversationState(store, "conv-1");
  assertEquals(state?.previousResponseId, "resp-123");
});
