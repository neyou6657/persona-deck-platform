import { assertEquals } from "jsr:@std/assert";

import { prepareAgentConfigForRestart } from "./agent_restart.ts";
import { createMemoryControlPlaneStore } from "./postgres.ts";

Deno.test("prepareAgentConfigForRestart restarts HF Space agents without requiring HF token env", async () => {
  Deno.env.delete("HF_TOKEN");
  Deno.env.delete("HUGGINGFACEHUB_API_TOKEN");

  const store = createMemoryControlPlaneStore();
  await store.upsertAgentConfig({
    agentId: "hf-space-coder-v1",
    spaceRepoId: "rain34572/responses-adapter-gateway",
    workerSecret: "wrk_secret_1",
  });

  const restarted = await prepareAgentConfigForRestart(store, "hf-space-coder-v1");
  assertEquals(restarted.restartGeneration, 1);

  await store.close();
});
