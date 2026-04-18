import { assertEquals } from "jsr:@std/assert";

import { handleKnowledgeRequest } from "./knowledge_routes.ts";
import { createMemoryControlPlaneStore } from "./postgres.ts";

const textDecoder = new TextDecoder();

async function readJson(response: Response) {
  return JSON.parse(textDecoder.decode(await response.arrayBuffer()));
}

Deno.test("knowledge routes can upsert and search persona documents", async () => {
  const store = createMemoryControlPlaneStore();
  const sharedSecret = "knowledge-secret";

  const createResponse = await handleKnowledgeRequest(
    new Request("https://example.test/v1/knowledge/upsert", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sharedSecret}`,
      },
      body: JSON.stringify({
        personaId: "coder",
        title: "Parser notes",
        body: "Remember to isolate tokenization first.",
        source: "manual",
      }),
    }),
    new URL("https://example.test/v1/knowledge/upsert"),
    { store, sharedSecret, defaultSearchLimit: 8 },
  );
  assertEquals(createResponse?.status, 201);

  const searchResponse = await handleKnowledgeRequest(
    new Request("https://example.test/v1/knowledge/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sharedSecret}`,
      },
      body: JSON.stringify({
        personaId: "coder",
        query: "tokenization",
      }),
    }),
    new URL("https://example.test/v1/knowledge/search"),
    { store, sharedSecret, defaultSearchLimit: 8 },
  );

  const payload = await readJson(searchResponse!);
  assertEquals(payload.docs.length, 1);
  assertEquals(payload.docs[0].title, "Parser notes");
  await store.close();
});
