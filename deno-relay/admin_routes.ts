import {
  createAdminAuthConfigFromEnv,
  issueAdminSession,
  type AdminAuthConfig,
  AdminAuthError,
  requireAdminSession,
  revokeAdminSession,
  verifyAdminPassword,
} from "./admin_auth.ts";
import type { ControlPlaneStore, JsonObject } from "./postgres.ts";

type AdminRouteOptions = {
  store: ControlPlaneStore;
  config?: AdminAuthConfig;
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
      return json({
        personas: await options.store.listPersonas(),
        agentInstances: await options.store.listAgentInstances(),
      });
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
        const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 100));
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
