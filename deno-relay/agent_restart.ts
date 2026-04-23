import type { AgentConfigRecord, ControlPlaneStore } from "./postgres.ts";

export async function prepareAgentConfigForRestart(
  store: ControlPlaneStore,
  agentId: string,
): Promise<AgentConfigRecord> {
  return await store.restartAgentConfig(agentId);
}
