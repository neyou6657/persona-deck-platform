import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

import { buildApiDocsPayload, renderAdminPage } from "./admin_ui.ts";

const textDecoder = new TextDecoder();

function extractInlineModuleScript(body: string): string {
  const startMarker = '<script type="module">';
  const start = body.indexOf(startMarker);
  const end = body.indexOf("</script>", start);
  if (start < 0 || end < 0) {
    throw new Error("inline admin module script is missing");
  }
  return body.slice(start + startMarker.length, end);
}

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
  assertStringIncludes(body, "API 格式");
  assertStringIncludes(body, '<select id="agentRuntimeInput"');
  assertStringIncludes(body, '<select id="agentApiKindInput"');
  assertStringIncludes(body, '<select id="agentSkillsInput"');
  assertStringIncludes(body, "按住 Ctrl / Cmd 可多选");
  assertStringIncludes(body, "不选表示禁用全部");
  assertEquals(body.includes("当前还没有上报可用 skills"), false);
  assertEquals(body.includes("每行一个 skill slug"), false);
  assertStringIncludes(body, "Worker Secret");
  assertStringIncludes(body, "HF Space Repo");
  assertStringIncludes(body, "手动同步到 HF Space 环境变量");
  assertEquals(body.includes("会回写到 HF Space"), false);
  assertStringIncludes(body, "知识库");
});

Deno.test("renderAdminPage emits parsable inline admin script", async () => {
  const response = renderAdminPage();
  const body = textDecoder.decode(await response.arrayBuffer());
  const script = extractInlineModuleScript(body);

  new Function(script);
});

Deno.test("buildApiDocsPayload keeps public API summary available outside root", () => {
  const payload = buildApiDocsPayload();

  assertEquals(payload.name, "deno-relay-control-plane");
  assertEquals(payload.docs, "/api-docs");
  assertEquals(payload.adminUi, "/");
  assertEquals(payload.sockets.client, "/ws");
  assertEquals(payload.sockets.agent, "/agent");
});
