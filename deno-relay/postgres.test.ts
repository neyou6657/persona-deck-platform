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
