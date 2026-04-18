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
    passwordHash: "sha256:2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
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
    passwordHash: "sha256:2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
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
