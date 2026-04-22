import { assertEquals, assertThrows } from "jsr:@std/assert";

import {
  areAllAllowed,
  bindTokenToAgent,
  isScopeAllowed,
  parseAgentTokenPolicies,
} from "./worker_auth.ts";

Deno.test("parseAgentTokenPolicies keeps legacy persona array format compatible", () => {
  const policies = parseAgentTokenPolicies(
    "",
    JSON.stringify({
      "token-a": ["coder", "reviewer"],
    }),
  );

  const policy = policies.get("token-a");
  assertEquals(Boolean(policy), true);
  assertEquals(areAllAllowed(policy!.allowedPersonaIds, ["coder"]), true);
  assertEquals(areAllAllowed(policy!.allowedPersonaIds, ["ops"]), false);
  assertEquals(isScopeAllowed(policy!.allowedAgentIds, "hf-space-coder-v1"), true);
});

Deno.test("parseAgentTokenPolicies supports binding a token to explicit agent ids", () => {
  const policies = parseAgentTokenPolicies(
    "shared-secret",
    JSON.stringify({
      "token-a": {
        personaIds: ["coder"],
        agentIds: ["hf-space-coder-v1"],
      },
    }),
  );

  const scopedPolicy = policies.get("token-a");
  const sharedPolicy = policies.get("shared-secret");
  assertEquals(Boolean(scopedPolicy), true);
  assertEquals(Boolean(sharedPolicy), true);
  assertEquals(isScopeAllowed(scopedPolicy!.allowedAgentIds, "hf-space-coder-v1"), true);
  assertEquals(isScopeAllowed(scopedPolicy!.allowedAgentIds, "hf-space-reviewer-v1"), false);
  assertEquals(isScopeAllowed(sharedPolicy!.allowedAgentIds, "anything"), true);
});

Deno.test("bindTokenToAgent rejects rebinding one token to a different agent", () => {
  const bindings = new Map<string, string>();

  bindTokenToAgent(bindings, "token-a", "hf-space-coder-v1");
  bindTokenToAgent(bindings, "token-a", "hf-space-coder-v1");
  assertEquals(bindings.get("token-a"), "hf-space-coder-v1");
  assertThrows(
    () => bindTokenToAgent(bindings, "token-a", "hf-space-reviewer-v1"),
    Error,
    "token is already bound",
  );
});
