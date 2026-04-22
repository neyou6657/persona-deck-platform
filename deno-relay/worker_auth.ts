export type AllowedScope = "*" | Set<string>;

export type AgentTokenPolicy = {
  allowedPersonaIds: AllowedScope;
  allowedAgentIds: AllowedScope;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeScope(value: unknown, defaultValue: AllowedScope = "*"): AllowedScope | null {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (value === "*") {
    return "*";
  }
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? new Set([normalized]) : null;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeString(item)).filter((item): item is string =>
      Boolean(item)
    );
    return items.length ? new Set(items) : null;
  }
  return null;
}

function normalizePolicy(value: unknown): AgentTokenPolicy | null {
  if (value === "*") {
    return {
      allowedPersonaIds: "*",
      allowedAgentIds: "*",
    };
  }
  if (Array.isArray(value)) {
    const allowedPersonaIds = normalizeScope(value, "*");
    return allowedPersonaIds
      ? {
        allowedPersonaIds,
        allowedAgentIds: "*",
      }
      : null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const allowedPersonaIds = normalizeScope(
    raw.personaIds ?? raw.personas ?? raw.allowedPersonas,
    "*",
  );
  const allowedAgentIds = normalizeScope(
    raw.agentIds ?? raw.agents ?? raw.allowedAgents ?? raw.agentId,
    "*",
  );
  if (!allowedPersonaIds || !allowedAgentIds) {
    return null;
  }
  return {
    allowedPersonaIds,
    allowedAgentIds,
  };
}

export function parseAgentTokenPolicies(
  sharedSecret: string,
  rawJson: string,
): Map<string, AgentTokenPolicy> {
  const policies = new Map<string, AgentTokenPolicy>();
  if (rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        for (const [token, allowed] of Object.entries(parsed)) {
          const normalizedToken = normalizeString(token);
          const policy = normalizePolicy(allowed);
          if (!normalizedToken || !policy) {
            continue;
          }
          policies.set(normalizedToken, policy);
        }
      }
    } catch {
      // The caller can decide whether to warn about invalid JSON.
    }
  }

  const normalizedSharedSecret = normalizeString(sharedSecret);
  if (normalizedSharedSecret && !policies.has(normalizedSharedSecret)) {
    policies.set(normalizedSharedSecret, {
      allowedPersonaIds: "*",
      allowedAgentIds: "*",
    });
  }
  return policies;
}

export function isScopeAllowed(scope: AllowedScope, value: string): boolean {
  return scope === "*" || scope.has(value);
}

export function areAllAllowed(scope: AllowedScope, values: string[]): boolean {
  return values.every((value) => isScopeAllowed(scope, value));
}

export function bindTokenToAgent(
  bindings: Map<string, string>,
  token: string,
  agentId: string,
): void {
  const currentAgentId = bindings.get(token);
  if (currentAgentId && currentAgentId !== agentId) {
    throw new Error(`token is already bound to ${currentAgentId}`);
  }
  bindings.set(token, agentId);
}
