import {
  type AdminAuthConfig,
  AdminAuthError,
  createAdminAuthConfigFromEnv,
  issueAdminSession,
  requireAdminSession,
  revokeAdminSession,
  verifyAdminPassword,
} from "./admin_auth.ts";
import type { AgentConfigRecord, ControlPlaneStore, JsonObject } from "./postgres.ts";
import { listSkillsCatalog, type SkillsCatalog } from "./skills_catalog.ts";

type AdminRouteOptions = {
  store: ControlPlaneStore;
  config?: AdminAuthConfig;
  restartAgentConfig?: (agentId: string) => Promise<AgentConfigRecord>;
  listSkillsCatalog?: () => Promise<SkillsCatalog>;
};

class AdminRouteError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
  });
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeJsonObject(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    ).map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function defaultApiKindForRuntime(runtime: string): string {
  return runtime.trim().toLowerCase() === "opencode_cli" ? "chat_completions" : "responses";
}

async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(await req.text());
  } catch {
    throw new AdminRouteError(400, "invalid_json", "Body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AdminRouteError(400, "invalid_json", "Body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function authConfig(options: AdminRouteOptions): AdminAuthConfig {
  return options.config ?? createAdminAuthConfigFromEnv();
}

const parsedOnlineTtlMs = Number(Deno.env.get("AGENT_ONLINE_TTL_MS") ?? "120000");
const AGENT_ONLINE_TTL_MS = Number.isFinite(parsedOnlineTtlMs) && parsedOnlineTtlMs > 0
  ? parsedOnlineTtlMs
  : 120000;

function parseTimestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAgentInstances(
  records: Awaited<ReturnType<ControlPlaneStore["listAgentInstances"]>>,
) {
  return records.map((record) => ({
    ...record,
    status: record.status === "online" &&
        Date.now() - parseTimestampMs(record.lastHeartbeatAt) <= AGENT_ONLINE_TTL_MS
      ? "online"
      : "offline",
  }));
}

function routeError(error: unknown): Response {
  if (error instanceof AdminRouteError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof AdminAuthError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "internal_error", message: "Internal server error" }, 500);
}

async function resolveSkillsCatalog(options: AdminRouteOptions): Promise<SkillsCatalog> {
  if (options.listSkillsCatalog) {
    return await options.listSkillsCatalog();
  }
  return await listSkillsCatalog();
}

export async function handleAdminRequest(
  req: Request,
  url: URL,
  options: AdminRouteOptions,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/v1/admin")) {
    return null;
  }

  const config = authConfig(options);

  try {
    if (url.pathname === "/v1/admin/login" && req.method === "POST") {
      const body = await readJsonObject(req);
      const password = normalizeString(body.password);
      if (!password) {
        throw new AdminRouteError(400, "password_required", "password is required");
      }
      const ok = await verifyAdminPassword(password, config);
      if (!ok) {
        throw new AdminRouteError(401, "invalid_password", "Admin password is invalid");
      }
      const { token, session } = await issueAdminSession(options.store, config);
      return json({
        token,
        expiresAt: session.expiresAt,
      }, 201);
    }

    if (url.pathname === "/v1/admin/logout" && req.method === "POST") {
      await revokeAdminSession(req, options.store, config);
      return json({ ok: true });
    }

    const admin = await requireAdminSession(req, options.store, config);

    if (url.pathname === "/v1/admin/session" && req.method === "GET") {
      return json({
        ok: true,
        expiresAt: admin.session.expiresAt,
        lastSeenAt: admin.session.lastSeenAt,
      });
    }

    if (url.pathname === "/v1/admin/personas" && req.method === "GET") {
      const agentInstances = normalizeAgentInstances(await options.store.listAgentInstances());
      return json({
        personas: await options.store.listPersonas(),
        agentInstances,
      });
    }

    if (url.pathname === "/v1/admin/agents" && req.method === "GET") {
      const agentInstances = normalizeAgentInstances(await options.store.listAgentInstances());
      const skillsCatalog = await resolveSkillsCatalog(options);
      return json({
        agentConfigs: await options.store.listAgentConfigs(),
        agentInstances,
        skillsCatalog,
      });
    }

    if (url.pathname === "/v1/admin/agents" && req.method === "POST") {
      const body = await readJsonObject(req);
      const agentId = normalizeString(body.agentId);
      if (!agentId) {
        throw new AdminRouteError(400, "agent_id_required", "agentId is required");
      }
      const configRecord = await options.store.upsertAgentConfig({
        agentId,
        runtime: normalizeString(body.runtime) ?? undefined,
        apiKind: normalizeString(body.apiKind) ?? undefined,
        workerSecret: typeof body.workerSecret === "string" ? body.workerSecret : undefined,
        spaceRepoId: typeof body.spaceRepoId === "string" ? body.spaceRepoId : undefined,
        model: normalizeString(body.model) ?? undefined,
        apiBaseUrl: typeof body.apiBaseUrl === "string" ? body.apiBaseUrl : undefined,
        apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
        temperature: normalizeNumber(body.temperature) ?? undefined,
        store: typeof body.store === "boolean" ? body.store : undefined,
        enabledSkills: normalizeStringArray(body.enabledSkills),
      });
      return json(configRecord, 201);
    }

    const agentMatch = url.pathname.match(/^\/v1\/admin\/agents\/([^/]+)$/);
    if (agentMatch && (req.method === "GET" || req.method === "PATCH")) {
      const agentId = decodeURIComponent(agentMatch[1]);
      if (req.method === "GET") {
        const agentInstances = normalizeAgentInstances(await options.store.listAgentInstances())
          .filter((item) => item.agentId === agentId);
        const skillsCatalog = await resolveSkillsCatalog(options);
        const storedConfig = await options.store.getAgentConfig(agentId);
        if (!storedConfig && !agentInstances.length) {
          throw new AdminRouteError(404, "agent_config_not_found", "Agent config not found");
        }
        const runtime = normalizeString(agentInstances[0]?.capabilities?.runtime) ?? "codex_cli";
        const configRecord = storedConfig ?? {
          agentId,
          runtime,
          apiKind: normalizeString(agentInstances[0]?.capabilities?.apiKind) ??
            defaultApiKindForRuntime(runtime),
          workerSecret: "",
          spaceRepoId: "",
          model: normalizeString(agentInstances[0]?.capabilities?.model) ?? "",
          apiBaseUrl: normalizeString(agentInstances[0]?.capabilities?.apiBaseUrl) ?? "",
          apiKey: "",
          systemPrompt: "",
          temperature: normalizeNumber(agentInstances[0]?.capabilities?.temperature) ?? 0.2,
          store: typeof agentInstances[0]?.capabilities?.store === "boolean"
            ? agentInstances[0].capabilities.store
            : true,
          enabledSkills: normalizeStringArray(agentInstances[0]?.capabilities?.enabledSkills),
          restartGeneration:
            normalizeNumber(agentInstances[0]?.capabilities?.observedRestartGeneration) ?? 0,
          updatedAt: new Date().toISOString(),
        };
        return json({
          config: configRecord,
          instances: agentInstances,
          skillsCatalog,
        });
      }

      const current = await options.store.getAgentConfig(agentId);
      if (!current) {
        throw new AdminRouteError(404, "agent_config_not_found", "Agent config not found");
      }
      const body = await readJsonObject(req);
      return json(
        await options.store.upsertAgentConfig({
          agentId,
          runtime: normalizeString(body.runtime) ?? current.runtime,
          apiKind: normalizeString(body.apiKind) ?? current.apiKind,
          workerSecret: typeof body.workerSecret === "string"
            ? body.workerSecret
            : current.workerSecret,
          spaceRepoId: typeof body.spaceRepoId === "string"
            ? body.spaceRepoId
            : current.spaceRepoId,
          model: normalizeString(body.model) ?? current.model,
          apiBaseUrl: typeof body.apiBaseUrl === "string" ? body.apiBaseUrl : current.apiBaseUrl,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : current.apiKey,
          systemPrompt: typeof body.systemPrompt === "string"
            ? body.systemPrompt
            : current.systemPrompt,
          temperature: normalizeNumber(body.temperature) ?? current.temperature,
          store: typeof body.store === "boolean" ? body.store : current.store,
          enabledSkills: Object.hasOwn(body, "enabledSkills")
            ? normalizeStringArray(body.enabledSkills)
            : current.enabledSkills,
        }),
      );
    }

    const agentRestartMatch = url.pathname.match(/^\/v1\/admin\/agents\/([^/]+)\/restart$/);
    if (agentRestartMatch && req.method === "POST") {
      const agentId = decodeURIComponent(agentRestartMatch[1]);
      const current = await options.store.getAgentConfig(agentId);
      if (!current) {
        throw new AdminRouteError(404, "agent_config_not_found", "Agent config not found");
      }
      return json(
        options.restartAgentConfig
          ? await options.restartAgentConfig(agentId)
          : await options.store.restartAgentConfig(agentId),
      );
    }

    if (url.pathname === "/v1/admin/personas" && req.method === "POST") {
      const body = await readJsonObject(req);
      const personaId = normalizeString(body.personaId);
      if (!personaId) {
        throw new AdminRouteError(400, "persona_id_required", "personaId is required");
      }
      const persona = await options.store.upsertPersona({
        personaId,
        displayName: normalizeString(body.displayName) ?? undefined,
        description: normalizeString(body.description) ?? undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        metadata: normalizeJsonObject(body.metadata),
      });
      return json(persona, 201);
    }

    const personaMatch = url.pathname.match(/^\/v1\/admin\/personas\/([^/]+)$/);
    if (personaMatch && (req.method === "GET" || req.method === "PATCH")) {
      const personaId = decodeURIComponent(personaMatch[1]);
      if (req.method === "GET") {
        const persona = await options.store.getPersona(personaId);
        if (!persona) {
          throw new AdminRouteError(404, "persona_not_found", "Persona not found");
        }
        return json({
          persona,
          knowledge: await options.store.listKnowledgeDocs(personaId, 50),
        });
      }

      const body = await readJsonObject(req);
      const current = await options.store.getPersona(personaId);
      if (!current) {
        throw new AdminRouteError(404, "persona_not_found", "Persona not found");
      }
      const persona = await options.store.upsertPersona({
        personaId,
        displayName: normalizeString(body.displayName) ?? current.displayName,
        description: normalizeString(body.description) ?? current.description,
        enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
        metadata: Object.keys(normalizeJsonObject(body.metadata)).length
          ? normalizeJsonObject(body.metadata)
          : current.metadata,
      });
      return json(persona);
    }

    const knowledgeListMatch = url.pathname.match(/^\/v1\/admin\/personas\/([^/]+)\/knowledge$/);
    if (knowledgeListMatch && (req.method === "GET" || req.method === "POST")) {
      const personaId = decodeURIComponent(knowledgeListMatch[1]);
      if (req.method === "GET") {
        const limit = Math.max(
          1,
          Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 100),
        );
        return json({
          personaId,
          docs: await options.store.listKnowledgeDocs(personaId, limit),
        });
      }

      const body = await readJsonObject(req);
      const title = normalizeString(body.title);
      const bodyText = normalizeString(body.body);
      const source = normalizeString(body.source);
      if (!title || !bodyText || !source) {
        throw new AdminRouteError(
          400,
          "invalid_request",
          "title, body, and source are required",
        );
      }
      const doc = await options.store.upsertKnowledgeDoc({
        docId: normalizeString(body.docId) ?? undefined,
        personaId,
        title,
        body: bodyText,
        source,
        metadata: normalizeJsonObject(body.metadata),
      });
      return json(doc, 201);
    }

    const knowledgeDeleteMatch = url.pathname.match(
      /^\/v1\/admin\/personas\/([^/]+)\/knowledge\/([^/]+)$/,
    );
    if (knowledgeDeleteMatch && req.method === "DELETE") {
      const personaId = decodeURIComponent(knowledgeDeleteMatch[1]);
      const docId = decodeURIComponent(knowledgeDeleteMatch[2]);
      const deleted = await options.store.deleteKnowledgeDoc(personaId, docId);
      if (!deleted) {
        throw new AdminRouteError(404, "knowledge_doc_not_found", "Knowledge document not found");
      }
      return json({ ok: true });
    }

    return json({ error: "not_found", message: "Admin route not found" }, 404);
  } catch (error) {
    return routeError(error);
  }
}
