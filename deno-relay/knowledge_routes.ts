import type { ControlPlaneStore, JsonObject } from "./postgres.ts";

type KnowledgeRouteOptions = {
  store: ControlPlaneStore;
  sharedSecret: string;
  defaultSearchLimit: number;
};

class KnowledgeRouteError extends Error {
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
      "access-control-allow-headers": "content-type, authorization, x-knowledge-secret",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
    throw new KnowledgeRouteError(400, "invalid_json", "Body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KnowledgeRouteError(400, "invalid_json", "Body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireKnowledgeSecret(req: Request, sharedSecret: string): void {
  if (!sharedSecret.trim()) {
    throw new KnowledgeRouteError(
      503,
      "knowledge_secret_missing",
      "AGENT_TOOL_SHARED_SECRET is not configured",
    );
  }
  const bearer = req.headers.get("authorization")?.startsWith("Bearer ")
    ? req.headers.get("authorization")?.slice("Bearer ".length).trim()
    : null;
  const header = req.headers.get("x-knowledge-secret")?.trim() ?? null;
  const supplied = bearer || header;
  if (supplied !== sharedSecret) {
    throw new KnowledgeRouteError(401, "unauthorized_knowledge", "Knowledge secret is invalid");
  }
}

function routeError(error: unknown): Response {
  if (error instanceof KnowledgeRouteError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "internal_error", message: "Internal server error" }, 500);
}

export async function handleKnowledgeRequest(
  req: Request,
  url: URL,
  options: KnowledgeRouteOptions,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/v1/knowledge")) {
    return null;
  }

  try {
    requireKnowledgeSecret(req, options.sharedSecret);

    if (url.pathname === "/v1/knowledge/search" && req.method === "POST") {
      const body = await readJsonObject(req);
      const personaId = normalizeString(body.personaId);
      if (!personaId) {
        throw new KnowledgeRouteError(400, "persona_id_required", "personaId is required");
      }
      const query = normalizeString(body.query) ?? "";
      const requestedLimit = Number(body.limit ?? options.defaultSearchLimit);
      const limit = Math.max(
        1,
        Math.min(Number.isFinite(requestedLimit) ? requestedLimit : options.defaultSearchLimit, 20),
      );
      return json({
        personaId,
        query,
        docs: await options.store.searchKnowledge(personaId, query, limit),
      });
    }

    if (url.pathname === "/v1/knowledge/upsert" && req.method === "POST") {
      const body = await readJsonObject(req);
      const personaId = normalizeString(body.personaId);
      const title = normalizeString(body.title);
      const bodyText = normalizeString(body.body);
      const source = normalizeString(body.source);
      if (!personaId || !title || !bodyText || !source) {
        throw new KnowledgeRouteError(
          400,
          "invalid_request",
          "personaId, title, body, and source are required",
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

    const docsMatch = url.pathname.match(/^\/v1\/knowledge\/personas\/([^/]+)\/docs$/);
    if (docsMatch && req.method === "GET") {
      const personaId = decodeURIComponent(docsMatch[1]);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 50));
      return json({
        personaId,
        docs: await options.store.listKnowledgeDocs(personaId, limit),
      });
    }

    return json({ error: "not_found", message: "Knowledge route not found" }, 404);
  } catch (error) {
    return routeError(error);
  }
}
