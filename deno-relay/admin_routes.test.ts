import { assertEquals } from "jsr:@std/assert";

import { handleAdminRequest } from "./admin_routes.ts";
import { createMemoryControlPlaneStore } from "./postgres.ts";

const textDecoder = new TextDecoder();

async function readJson(response: Response) {
  return JSON.parse(textDecoder.decode(await response.arrayBuffer()));
}

Deno.test("admin login issues a bearer token and session endpoint accepts it", async () => {
  const store = createMemoryControlPlaneStore();
  const config = {
    enabled: true,
    passwordHash:
      "pbkdf2_sha256:210000:relay-salt:1701a688e9dbb3048375e5dbc12df9a8114d22d50637512dd9c4e5ab498bf4c3",
    sessionSecret: "secret-pepper",
    sessionTtlHours: 24,
  };

  const login = await handleAdminRequest(
    new Request("https://example.test/v1/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }),
    new URL("https://example.test/v1/admin/login"),
    { store, config },
  );

  const payload = await readJson(login!);
  assertEquals(typeof payload.token, "string");

  const session = await handleAdminRequest(
    new Request("https://example.test/v1/admin/session", {
      headers: {
        authorization: `Bearer ${payload.token}`,
      },
    }),
    new URL("https://example.test/v1/admin/session"),
    { store, config },
  );

  assertEquals(session?.status, 200);
  await store.close();
});

Deno.test("admin personas endpoint is protected", async () => {
  const store = createMemoryControlPlaneStore();
  const config = {
    enabled: true,
    passwordHash:
      "pbkdf2_sha256:210000:relay-salt:1701a688e9dbb3048375e5dbc12df9a8114d22d50637512dd9c4e5ab498bf4c3",
    sessionSecret: "secret-pepper",
    sessionTtlHours: 24,
  };

  const response = await handleAdminRequest(
    new Request("https://example.test/v1/admin/personas"),
    new URL("https://example.test/v1/admin/personas"),
    { store, config },
  );

  assertEquals(response?.status, 401);
  await store.close();
});

Deno.test("admin agent config endpoints can save and restart an agent", async () => {
  const store = createMemoryControlPlaneStore();
  const config = {
    enabled: true,
    passwordHash:
      "pbkdf2_sha256:210000:relay-salt:1701a688e9dbb3048375e5dbc12df9a8114d22d50637512dd9c4e5ab498bf4c3",
    sessionSecret: "secret-pepper",
    sessionTtlHours: 24,
  };

  const login = await handleAdminRequest(
    new Request("https://example.test/v1/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }),
    new URL("https://example.test/v1/admin/login"),
    { store, config },
  );
  const auth = await readJson(login!);
  const headers = {
    authorization: `Bearer ${auth.token}`,
    "content-type": "application/json",
  };

  const saved = await handleAdminRequest(
    new Request("https://example.test/v1/admin/agents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentId: "hf-space-coder-v1",
        runtime: "codex_cli",
        apiKind: "responses",
        workerSecret: "wrk-secret-1",
        spaceRepoId: "rain34572/responses-adapter-gateway",
        model: "gpt-5.4",
        apiBaseUrl: "https://relay.example/v1",
        apiKey: "sk-secret",
        systemPrompt: "You are Codex.",
        temperature: 0.25,
        store: true,
        enabledSkills: ["skill-a", "skill-b"],
      }),
    }),
    new URL("https://example.test/v1/admin/agents"),
    { store, config },
  );
  const savedPayload = await readJson(saved!);
  assertEquals(savedPayload.agentId, "hf-space-coder-v1");
  assertEquals(savedPayload.apiKind, "responses");
  assertEquals(savedPayload.workerSecret, "wrk-secret-1");
  assertEquals(savedPayload.spaceRepoId, "rain34572/responses-adapter-gateway");
  assertEquals(savedPayload.restartGeneration, 0);

  const cleared = await handleAdminRequest(
    new Request("https://example.test/v1/admin/agents/hf-space-coder-v1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        apiBaseUrl: "",
        apiKey: "",
      }),
    }),
    new URL("https://example.test/v1/admin/agents/hf-space-coder-v1"),
    { store, config },
  );
  const clearedPayload = await readJson(cleared!);
  assertEquals(clearedPayload.apiBaseUrl, "");
  assertEquals(clearedPayload.apiKey, "");

  const restarted = await handleAdminRequest(
    new Request("https://example.test/v1/admin/agents/hf-space-coder-v1/restart", {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    }),
    new URL("https://example.test/v1/admin/agents/hf-space-coder-v1/restart"),
    { store, config },
  );
  const restartedPayload = await readJson(restarted!);
  assertEquals(restartedPayload.restartGeneration, 1);

  const list = await handleAdminRequest(
    new Request("https://example.test/v1/admin/agents", {
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    }),
    new URL("https://example.test/v1/admin/agents"),
    { store, config },
  );
  const listPayload = await readJson(list!);
  assertEquals(listPayload.agentConfigs.length, 1);
  assertEquals(listPayload.agentConfigs[0].apiKind, "responses");
  assertEquals(listPayload.agentConfigs[0].workerSecret, "wrk-secret-1");
  assertEquals(listPayload.agentConfigs[0].spaceRepoId, "rain34572/responses-adapter-gateway");
  assertEquals(listPayload.agentConfigs[0].enabledSkills, ["skill-a", "skill-b"]);

  await store.close();
});
