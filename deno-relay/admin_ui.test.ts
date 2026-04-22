import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

import { buildApiDocsPayload, renderAdminPage } from "./admin_ui.ts";

const textDecoder = new TextDecoder();

Deno.test("renderAdminPage returns login-first admin console html", async () => {
  const response = renderAdminPage();
  const body = textDecoder.decode(await response.arrayBuffer());

  assertEquals(response.status, 200);
  assertStringIncludes(response.headers.get("content-type") ?? "", "text/html");
  assertStringIncludes(body, 'type="password"');
  assertStringIncludes(body, "管理密码");
  assertStringIncludes(body, "/v1/admin/login");
  assertStringIncludes(body, "/v1/admin/personas");
  assertStringIncludes(body, "/v1/admin/agents");
  assertStringIncludes(body, "Agent 控制");
  assertStringIncludes(body, "知识库");
});

Deno.test("buildApiDocsPayload keeps public API summary available outside root", () => {
  const payload = buildApiDocsPayload();

  assertEquals(payload.name, "deno-relay-control-plane");
  assertEquals(payload.docs, "/api-docs");
  assertEquals(payload.adminUi, "/");
  assertEquals(payload.sockets.client, "/ws");
  assertEquals(payload.sockets.agent, "/agent");
});
