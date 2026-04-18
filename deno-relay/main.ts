import {
  createWorkerRegistryState,
  pickWorkerForPersona,
  registerWorker,
  unregisterWorker,
  type WorkerRegistration,
} from "./domain.ts";
import { handleAdminRequest } from "./admin_routes.ts";
import {
  createPostgresControlPlaneStore,
  type AgentInstanceRecord,
  type ConversationRecord,
  type JsonObject,
  type PersonaSeed,
  type RunStatus,
  type StoredRun,
  StoreError,
} from "./postgres.ts";
import { handleKnowledgeRequest } from "./knowledge_routes.ts";

type AllowedPersonaScope = "*" | Set<string>;

type AgentRegisterMessage = {
  type: "agent_register";
  agentId: string;
  instanceId: string;
  personaIds: string[];
  capabilities?: JsonObject;
  version?: string;
};

type AgentHeartbeatMessage = {
  type: "agent_heartbeat";
};

type AgentResponseMessage = {
  type: "response";
  runId: string;
  conversationId?: string;
  personaId?: string;
  reply: string;
  responseId?: string | null;
  model?: string;
  usage?: unknown;
  raw?: unknown;
};

type AgentErrorMessage = {
  type: "error";
  runId: string;
  conversationId?: string;
  personaId?: string;
  error: string;
};

type AgentMessage =
  | AgentRegisterMessage
  | AgentHeartbeatMessage
  | AgentResponseMessage
  | AgentErrorMessage;

type ClientTarget = {
  personaId?: string;
  agentId?: string;
};

type ClientPromptMessage = {
  type: "prompt";
  prompt: string;
  conversationId?: string;
  sessionId?: string;
  clientMessageId?: string;
  target?: ClientTarget;
  metadata?: JsonObject;
  title?: string;
};

type AgentConnection = {
  connectionId: string;
  socket: WebSocket;
  token: string;
  allowedPersonaIds: AllowedPersonaScope;
  connectedAt: string;
  lastHeartbeatAt: string;
  worker: WorkerRegistration | null;
  version: string | null;
};

type PendingRun = {
  runId: string;
  conversationId: string;
  agentSocket: WebSocket;
  clientSocket: WebSocket | null;
  timeoutId: ReturnType<typeof setTimeout>;
};

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const USER_HEADER = "x-user-id";
const DATABASE_URL = Deno.env.get("DATABASE_URL")?.trim() ?? "";
const PERSONA_CATALOG_JSON = Deno.env.get("PERSONA_CATALOG_JSON") ?? "";
const AGENT_SHARED_SECRET = Deno.env.get("AGENT_SHARED_SECRET")?.trim() ?? "";
const AGENT_TOOL_SHARED_SECRET = Deno.env.get("AGENT_TOOL_SHARED_SECRET")?.trim() ||
  AGENT_SHARED_SECRET;
const parsedTimeoutMs = Number(Deno.env.get("AGENT_REQUEST_TIMEOUT_MS") ?? "90000");
const AGENT_REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
  ? parsedTimeoutMs
  : 90000;
const AGENT_TOKEN_PERSONAS_JSON = Deno.env.get("AGENT_TOKEN_PERSONAS_JSON") ?? "";
const KNOWLEDGE_SEARCH_LIMIT = Math.max(
  1,
  Math.min(Number(Deno.env.get("KNOWLEDGE_SEARCH_LIMIT") ?? "8") || 8, 20),
);
const RELAY_RESTART_ERROR = "Relay restarted before the run completed";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const store = createPostgresControlPlaneStore(DATABASE_URL);
const workerRegistry = createWorkerRegistryState();
const agentConnectionsBySocket = new Map<WebSocket, AgentConnection>();
const agentConnectionsByInstanceId = new Map<string, AgentConnection>();
const pendingRuns = new Map<string, PendingRun>();
const agentTokenPolicies = parseAgentTokenPolicies();

await store.seedPersonas(parsePersonaCatalog());
await store.recoverInterruptedRuns(RELAY_RESTART_ERROR);

function nowIso(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "content-type, authorization, x-user-id, x-knowledge-secret",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
  });
}

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "content-type, authorization, x-user-id, x-knowledge-secret",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
  });
}

function previewText(text: string, limit = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function parsePersonaCatalog(): PersonaSeed[] {
  if (!PERSONA_CATALOG_JSON.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(PERSONA_CATALOG_JSON);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item): PersonaSeed[] => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return [];
      }
      const personaId = normalizeString((item as JsonObject).personaId);
      if (!personaId) {
        return [];
      }
      return [{
        personaId,
        displayName: normalizeString((item as JsonObject).displayName) ?? undefined,
        description: normalizeString((item as JsonObject).description) ?? undefined,
        enabled: typeof (item as JsonObject).enabled === "boolean"
          ? Boolean((item as JsonObject).enabled)
          : undefined,
        metadata: normalizeJsonObject((item as JsonObject).metadata),
      }];
    });
  } catch (error) {
    console.warn("Ignoring invalid PERSONA_CATALOG_JSON", error);
    return [];
  }
}

function parseJson(raw: string): JsonObject {
  try {
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ApiError(400, "invalid_json", "Body must be a JSON object");
    }
    return value as JsonObject;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "invalid_json", "Body must be valid JSON");
  }
}

async function readJsonObject(req: Request): Promise<JsonObject> {
  return parseJson(await req.text());
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

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string array`);
  }
  const parsed = value.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item));
  if (parsed.length !== value.length) {
    throw new ApiError(400, "invalid_request", `${fieldName} must contain only non-empty strings`);
  }
  return [...new Set(parsed)];
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("socket_not_open");
  }
  socket.send(JSON.stringify(payload));
}

function sendWsError(
  socket: WebSocket,
  error: string,
  runId?: string,
  conversationId?: string,
): void {
  try {
    sendJson(socket, {
      type: "error",
      error,
      runId: runId ?? null,
      conversationId: conversationId ?? null,
    });
  } catch {
    // Ignore writes to dead sockets.
  }
}

function getRequiredUserId(req: Request): string {
  const userId = req.headers.get(USER_HEADER)?.trim();
  if (!userId) {
    throw new ApiError(401, "missing_user_id", `Missing ${USER_HEADER} header`);
  }
  return userId;
}

function getOptionalWsUserId(req: Request): string | null {
  const fromHeader = req.headers.get(USER_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }
  const fromQuery = new URL(req.url).searchParams.get("userId")?.trim();
  return fromQuery || null;
}

function parseClientPrompt(raw: string): ClientPromptMessage {
  const value = parseJson(raw);
  const prompt = normalizeString(value.prompt);
  if (value.type !== "prompt" || !prompt) {
    throw new ApiError(400, "invalid_request", 'Client message must be {"type":"prompt","prompt":"..."}');
  }
  let target: ClientTarget | undefined;
  if (value.target !== undefined) {
    if (typeof value.target !== "object" || value.target === null || Array.isArray(value.target)) {
      throw new ApiError(400, "invalid_request", "target must be an object when provided");
    }
    const rawTarget = value.target as JsonObject;
    target = {
      personaId: normalizeString(rawTarget.personaId) ?? undefined,
      agentId: normalizeString(rawTarget.agentId) ?? undefined,
    };
  }
  return {
    type: "prompt",
    prompt,
    conversationId: normalizeString(value.conversationId) ?? undefined,
    sessionId: normalizeString(value.sessionId) ?? undefined,
    clientMessageId: normalizeString(value.clientMessageId) ?? undefined,
    target,
    metadata: normalizeJsonObject(value.metadata),
    title: normalizeString(value.title) ?? undefined,
  };
}

function parseAgentMessage(raw: string): AgentMessage {
  const value = parseJson(raw);
  const type = normalizeString(value.type);
  if (type === "agent_register") {
    return {
      type,
      agentId: normalizeString(value.agentId) ?? "",
      instanceId: normalizeString(value.instanceId) ?? "",
      personaIds: parseStringArray(value.personaIds, "personaIds"),
      capabilities: normalizeJsonObject(value.capabilities),
      version: normalizeString(value.version) ?? undefined,
    };
  }
  if (type === "agent_heartbeat") {
    return { type };
  }
  if (type === "response") {
    const runId = normalizeString(value.runId);
    const reply = normalizeString(value.reply);
    if (!runId || !reply) {
      throw new ApiError(400, "invalid_request", "response requires runId and reply");
    }
    return {
      type,
      runId,
      conversationId: normalizeString(value.conversationId) ?? undefined,
      personaId: normalizeString(value.personaId) ?? undefined,
      reply,
      responseId: normalizeString(value.responseId),
      model: normalizeString(value.model) ?? undefined,
      usage: value.usage,
      raw: value.raw,
    };
  }
  if (type === "error") {
    const runId = normalizeString(value.runId);
    const error = normalizeString(value.error);
    if (!runId || !error) {
      throw new ApiError(400, "invalid_request", "error requires runId and error");
    }
    return {
      type,
      runId,
      conversationId: normalizeString(value.conversationId) ?? undefined,
      personaId: normalizeString(value.personaId) ?? undefined,
      error,
    };
  }
  throw new ApiError(400, "invalid_request", "Unsupported agent message type");
}

function parseAgentTokenPolicies(): Map<string, AllowedPersonaScope> {
  const policies = new Map<string, AllowedPersonaScope>();
  if (AGENT_TOKEN_PERSONAS_JSON.trim()) {
    try {
      const parsed = JSON.parse(AGENT_TOKEN_PERSONAS_JSON);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        for (const [token, allowed] of Object.entries(parsed)) {
          if (!token.trim()) {
            continue;
          }
          if (allowed === "*") {
            policies.set(token, "*");
            continue;
          }
          if (Array.isArray(allowed)) {
            const personaIds = allowed.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item));
            if (personaIds.length) {
              policies.set(token, new Set(personaIds));
            }
          }
        }
      }
    } catch (error) {
      console.warn("Ignoring invalid AGENT_TOKEN_PERSONAS_JSON", error);
    }
  }

  if (AGENT_SHARED_SECRET && !policies.has(AGENT_SHARED_SECRET)) {
    policies.set(AGENT_SHARED_SECRET, "*");
  }
  return policies;
}

function extractAgentToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim() || null;
  }
  return null;
}

function authorizeAgent(req: Request): { token: string; allowedPersonaIds: AllowedPersonaScope } {
  const token = extractAgentToken(req);
  if (!token) {
    throw new ApiError(401, "unauthorized_worker", "Missing worker token");
  }
  const allowedPersonaIds = agentTokenPolicies.get(token);
  if (!allowedPersonaIds) {
    throw new ApiError(401, "unauthorized_worker", "Worker token is not authorized");
  }
  return { token, allowedPersonaIds };
}

function isPersonaAllowed(scope: AllowedPersonaScope, personaId: string): boolean {
  return scope === "*" || scope.has(personaId);
}

function arePersonasAllowed(scope: AllowedPersonaScope, personaIds: string[]): boolean {
  return personaIds.every((personaId) => isPersonaAllowed(scope, personaId));
}

function buildAgentInstanceRecord(connection: AgentConnection): AgentInstanceRecord | null {
  if (!connection.worker) {
    return null;
  }
  return {
    instanceId: connection.worker.instanceId,
    agentId: connection.worker.agentId,
    personaIds: connection.worker.personaIds,
    capabilities: connection.worker.capabilities ?? {},
    version: connection.version,
    status: "online",
    connectedAt: connection.connectedAt,
    lastHeartbeatAt: connection.lastHeartbeatAt,
  };
}

function mapStoreError(error: unknown): never {
  if (error instanceof StoreError) {
    if (error.code === "conversation_busy") {
      throw new ApiError(409, "conversation_busy", "A run is already active for this conversation");
    }
    if (error.code === "run_not_found") {
      throw new ApiError(404, "run_not_found", "Run not found");
    }
  }
  throw error;
}

async function listPersonas(): Promise<Array<JsonObject>> {
  const personas = await store.listPersonas();
  return personas.map((persona) => ({
    ...persona,
    online: (workerRegistry.personaBuckets.get(persona.personaId) ?? []).length > 0,
    connectedWorkers: (workerRegistry.personaBuckets.get(persona.personaId) ?? []).length,
  }));
}

function pickLiveWorkerConnection(personaId: string, agentId?: string): AgentConnection | null {
  if (agentId) {
    for (const instanceId of workerRegistry.personaBuckets.get(personaId) ?? []) {
      const connection = agentConnectionsByInstanceId.get(instanceId);
      if (
        connection?.worker &&
        connection.worker.agentId === agentId &&
        connection.socket.readyState === WebSocket.OPEN
      ) {
        return connection;
      }
    }
    return null;
  }

  const maxAttempts = (workerRegistry.personaBuckets.get(personaId) ?? []).length;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const worker = pickWorkerForPersona(workerRegistry, personaId);
    if (!worker) {
      return null;
    }
    const connection = agentConnectionsByInstanceId.get(worker.instanceId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      return connection;
    }
    unregisterWorker(workerRegistry, worker.instanceId);
    agentConnectionsByInstanceId.delete(worker.instanceId);
  }
  return null;
}

function createPendingRun(
  runId: string,
  conversationId: string,
  agentSocket: WebSocket,
  clientSocket: WebSocket | null,
): PendingRun {
  const timeoutId = setTimeout(() => {
    void failRunAndNotify(runId, "Agent request timed out", "timed_out");
  }, AGENT_REQUEST_TIMEOUT_MS);
  const pending: PendingRun = {
    runId,
    conversationId,
    agentSocket,
    clientSocket,
    timeoutId,
  };
  pendingRuns.set(runId, pending);
  return pending;
}

function takePendingRun(runId: string): PendingRun | null {
  const pending = pendingRuns.get(runId);
  if (!pending) {
    return null;
  }
  clearTimeout(pending.timeoutId);
  pendingRuns.delete(runId);
  return pending;
}

function detachClientSocket(socket: WebSocket): void {
  for (const pending of pendingRuns.values()) {
    if (pending.clientSocket === socket) {
      pending.clientSocket = null;
    }
  }
}

async function getConversationOwned(userId: string, conversationId: string): Promise<ConversationRecord> {
  const conversation = await store.getConversationOwned(userId, conversationId);
  if (!conversation) {
    throw new ApiError(404, "conversation_not_found", "Conversation not found");
  }
  return conversation;
}

async function getRunOwned(userId: string, runId: string): Promise<StoredRun> {
  const run = await store.getRunOwned(userId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run not found");
  }
  return run;
}

async function failRunAndNotify(
  runId: string,
  error: string,
  status: Extract<RunStatus, "failed" | "timed_out"> = "failed",
  knownRun?: StoredRun,
): Promise<void> {
  const pending = takePendingRun(runId);
  const run = knownRun ?? await store.getRun(runId);
  if (!run || (run.status !== "queued" && run.status !== "in_progress")) {
    return;
  }
  await store.failRun(runId, error, status);
  if (pending?.clientSocket) {
    sendWsError(pending.clientSocket, error, run.runId, run.conversationId);
  }
}

async function completeRunAndNotify(
  message: AgentResponseMessage,
  knownRun?: StoredRun,
): Promise<void> {
  const pending = takePendingRun(message.runId);
  const run = knownRun ?? await store.getRun(message.runId);
  if (!run || (run.status !== "queued" && run.status !== "in_progress")) {
    return;
  }
  const completed = await store.completeRun({
    runId: message.runId,
    reply: message.reply,
    responseId: message.responseId ?? null,
    usage: message.usage,
    raw: message.raw,
    model: message.model ?? null,
  });
  if (!completed) {
    return;
  }
  if (pending?.clientSocket) {
    sendJson(pending.clientSocket, {
      type: "response",
      runId: completed.run.runId,
      conversationId: completed.run.conversationId,
      personaId: completed.run.personaId,
      assistantMessageId: completed.assistantMessage.messageId,
      responseId: completed.run.responseId ?? null,
      reply: completed.assistantMessage.content,
      model: completed.run.model ?? null,
      usage: completed.run.usage ?? null,
      status: completed.run.status,
      raw: completed.run.raw ?? null,
    });
  }
}

function assertWorkerOwnsRun(connection: AgentConnection, run: StoredRun): void {
  if (!connection.worker) {
    throw new ApiError(400, "worker_not_registered", "Worker must register before sending run updates");
  }
  if (!run.agentInstanceId || run.agentInstanceId !== connection.worker.instanceId) {
    throw new ApiError(409, "run_not_owned_by_worker", "Run is assigned to a different worker");
  }
}

async function queueConversationRun(input: {
  conversation: ConversationRecord;
  userId: string;
  text: string;
  clientMessageId: string;
  metadata: JsonObject;
  sessionId?: string;
  agentId?: string;
  clientSocket?: WebSocket | null;
}): Promise<{ runId: string; conversationId: string; userMessageId: string; status: RunStatus }> {
  const workerConnection = pickLiveWorkerConnection(input.conversation.personaId, input.agentId);
  if (!workerConnection?.worker) {
    throw new ApiError(503, "persona_unavailable", "No worker is available for this persona");
  }

  let queued;
  try {
    queued = await store.queueRun({
      conversation: input.conversation,
      userId: input.userId,
      text: input.text,
      clientMessageId: input.clientMessageId,
      assignedAgentInstanceId: workerConnection.worker.instanceId,
    });
  } catch (error) {
    mapStoreError(error);
  }

  if (queued.deduped) {
    return {
      runId: queued.run.runId,
      conversationId: queued.run.conversationId,
      userMessageId: queued.userMessageId,
      status: queued.run.status,
    };
  }

  try {
    createPendingRun(
      queued.run.runId,
      queued.run.conversationId,
      workerConnection.socket,
      input.clientSocket ?? null,
    );
    sendJson(workerConnection.socket, {
      type: "prompt",
      runId: queued.run.runId,
      conversationId: queued.run.conversationId,
      personaId: queued.run.personaId,
      prompt: input.text,
      sessionId: input.sessionId ?? queued.run.conversationId,
      continuity: {
        previousResponseId: queued.previousResponseId,
      },
      metadata: {
        ...input.metadata,
        clientMessageId: input.clientMessageId,
      },
    });
    await store.markRunInProgress(queued.run.runId);
  } catch {
    await failRunAndNotify(queued.run.runId, "Failed to dispatch run to worker");
    throw new ApiError(503, "persona_unavailable", "Failed to dispatch run to worker");
  }

  return {
    runId: queued.run.runId,
    conversationId: queued.run.conversationId,
    userMessageId: queued.userMessageId,
    status: "queued",
  };
}

async function registerAgentConnection(
  connection: AgentConnection,
  message: AgentRegisterMessage,
): Promise<void> {
  if (!message.agentId || !message.instanceId) {
    throw new ApiError(400, "invalid_request", "agent_register requires agentId and instanceId");
  }
  if (!arePersonasAllowed(connection.allowedPersonaIds, message.personaIds)) {
    throw new ApiError(403, "forbidden_persona_registration", "Worker tried to register forbidden persona");
  }

  if (connection.worker?.instanceId && connection.worker.instanceId !== message.instanceId) {
    unregisterWorker(workerRegistry, connection.worker.instanceId);
    agentConnectionsByInstanceId.delete(connection.worker.instanceId);
  }

  const superseded = agentConnectionsByInstanceId.get(message.instanceId);
  if (superseded && superseded !== connection) {
    if (superseded.worker) {
      unregisterWorker(workerRegistry, superseded.worker.instanceId);
    }
    agentConnectionsByInstanceId.delete(message.instanceId);
    superseded.worker = null;
    try {
      superseded.socket.close(1012, "superseded");
    } catch {
      // Ignore close failures on a dying socket.
    }
  }

  const worker: WorkerRegistration = {
    agentId: message.agentId,
    instanceId: message.instanceId,
    personaIds: message.personaIds,
    capabilities: message.capabilities ?? {},
  };
  connection.worker = worker;
  connection.version = message.version ?? null;
  connection.lastHeartbeatAt = nowIso();

  registerWorker(workerRegistry, worker);
  agentConnectionsByInstanceId.set(worker.instanceId, connection);
  await Promise.all([
    ...worker.personaIds.map((personaId) => store.ensurePersonaRecord(personaId)),
    store.saveAgentInstance(buildAgentInstanceRecord(connection)!),
  ]);
}

async function markAgentHeartbeat(connection: AgentConnection): Promise<void> {
  connection.lastHeartbeatAt = nowIso();
  const record = buildAgentInstanceRecord(connection);
  if (record) {
    await store.saveAgentInstance(record);
  }
}

async function unregisterAgentConnection(socket: WebSocket, reason: string): Promise<void> {
  const connection = agentConnectionsBySocket.get(socket);
  if (!connection) {
    return;
  }
  agentConnectionsBySocket.delete(socket);

  if (connection.worker) {
    unregisterWorker(workerRegistry, connection.worker.instanceId);
    agentConnectionsByInstanceId.delete(connection.worker.instanceId);
    await store.saveAgentInstance({
      instanceId: connection.worker.instanceId,
      agentId: connection.worker.agentId,
      personaIds: connection.worker.personaIds,
      capabilities: connection.worker.capabilities ?? {},
      version: connection.version,
      status: "offline",
      connectedAt: connection.connectedAt,
      lastHeartbeatAt: connection.lastHeartbeatAt,
      disconnectedAt: nowIso(),
      disconnectReason: reason,
    });
  }

  const affectedRuns = [...pendingRuns.values()].filter((pending) => pending.agentSocket === socket);
  for (const pending of affectedRuns) {
    await failRunAndNotify(pending.runId, "Agent disconnected");
  }
}

async function handleAgentSocket(req: Request): Promise<Response> {
  const auth = authorizeAgent(req);
  const { socket, response } = Deno.upgradeWebSocket(req);
  const connection: AgentConnection = {
    connectionId: crypto.randomUUID(),
    socket,
    token: auth.token,
    allowedPersonaIds: auth.allowedPersonaIds,
    connectedAt: nowIso(),
    lastHeartbeatAt: nowIso(),
    worker: null,
    version: null,
  };
  agentConnectionsBySocket.set(socket, connection);

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    void (async () => {
      try {
        const message = parseAgentMessage(event.data);
        if (message.type === "agent_register") {
          await registerAgentConnection(connection, message);
          sendJson(socket, {
            type: "agent_registered",
            connectionId: connection.connectionId,
            heartbeatSec: 20,
          });
          return;
        }

        if (message.type === "agent_heartbeat") {
          await markAgentHeartbeat(connection);
          sendJson(socket, { type: "agent_heartbeat_ack", connectionId: connection.connectionId });
          return;
        }

        if (!connection.worker) {
          throw new ApiError(400, "worker_not_registered", "Worker must register before sending updates");
        }

        await markAgentHeartbeat(connection);
        const run = await store.getRun(message.runId);
        if (!run) {
          throw new ApiError(404, "run_not_found", "Run not found");
        }
        assertWorkerOwnsRun(connection, run);
        if (message.type === "response") {
          await completeRunAndNotify(message, run);
          return;
        }
        await failRunAndNotify(message.runId, message.error, "failed", run);
      } catch (error) {
        const apiError = error instanceof ApiError
          ? error
          : new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Unhandled agent error");
        try {
          sendJson(socket, { type: "error", error: apiError.code, message: apiError.message });
        } catch {
          // Ignore secondary write failures.
        }
        if (apiError.code === "invalid_request" || apiError.code === "worker_not_registered") {
          try {
            socket.close(1011, apiError.message.slice(0, 120));
          } catch {
            // Ignore close failures.
          }
        }
      }
    })();
  };

  socket.onclose = () => {
    void unregisterAgentConnection(socket, "closed");
  };
  socket.onerror = () => {
    void unregisterAgentConnection(socket, "error");
  };

  return response;
}

async function handleClientWsPrompt(
  socket: WebSocket,
  userId: string,
  payload: ClientPromptMessage,
): Promise<void> {
  const conversation = payload.conversationId
    ? await getConversationOwned(userId, payload.conversationId)
    : await store.createConversation(
      userId,
      payload.target?.personaId ?? (() => {
        throw new ApiError(400, "persona_id_required", "target.personaId is required when conversationId is absent");
      })(),
      payload.title,
    );

  const accepted = await queueConversationRun({
    conversation,
    userId,
    text: payload.prompt,
    clientMessageId: payload.clientMessageId ?? crypto.randomUUID(),
    metadata: payload.metadata ?? {},
    sessionId: payload.sessionId,
    agentId: payload.target?.agentId,
    clientSocket: socket,
  });

  sendJson(socket, {
    type: "accepted",
    runId: accepted.runId,
    conversationId: accepted.conversationId,
    userMessageId: accepted.userMessageId,
    status: accepted.status,
  });
}

function handleClientSocket(req: Request): Response {
  const userId = getOptionalWsUserId(req);
  if (!userId) {
    return json({ error: "missing_user_id", message: `Provide ${USER_HEADER} header or ?userId=` }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onmessage = (event) => {
    if (typeof event.data !== "string") {
      sendWsError(socket, "Only text frames are supported");
      return;
    }
    void (async () => {
      try {
        const payload = parseClientPrompt(event.data);
        await handleClientWsPrompt(socket, userId, payload);
      } catch (error) {
        const apiError = error instanceof ApiError
          ? error
          : new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Unhandled client error");
        sendWsError(socket, apiError.message);
      }
    })();
  };
  socket.onclose = () => detachClientSocket(socket);
  socket.onerror = () => detachClientSocket(socket);
  return response;
}

async function handleCreateConversation(req: Request): Promise<Response> {
  const userId = getRequiredUserId(req);
  const body = await readJsonObject(req);
  const personaId = normalizeString(body.personaId);
  if (!personaId) {
    throw new ApiError(400, "persona_id_required", "personaId is required");
  }
  const title = normalizeString(body.title) ?? undefined;
  const conversation = await store.createConversation(userId, personaId, title);
  return json(conversation, 201);
}

async function handleContinueLastConversation(req: Request): Promise<Response> {
  const userId = getRequiredUserId(req);
  const body = await readJsonObject(req);
  const personaId = normalizeString(body.personaId);
  if (!personaId) {
    throw new ApiError(400, "persona_id_required", "personaId is required");
  }
  return json(await store.continueLastConversation(userId, personaId));
}

async function handleListConversations(req: Request): Promise<Response> {
  const userId = getRequiredUserId(req);
  const url = new URL(req.url);
  const personaId = normalizeString(url.searchParams.get("personaId"));
  if (!personaId) {
    throw new ApiError(400, "persona_id_required", "personaId query parameter is required");
  }
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100));
  return json(await store.listConversations(userId, personaId, limit));
}

async function handleConversationMessages(req: Request, conversationId: string): Promise<Response> {
  const userId = getRequiredUserId(req);
  const conversation = await getConversationOwned(userId, conversationId);
  if (req.method === "GET") {
    return json({
      conversation,
      messages: await store.listMessages(conversationId),
    });
  }

  const body = await readJsonObject(req);
  const text = normalizeString(body.text);
  if (!text) {
    throw new ApiError(400, "invalid_request", "text must be a non-empty string");
  }

  const accepted = await queueConversationRun({
    conversation,
    userId,
    text,
    clientMessageId: normalizeString(body.clientMessageId) ?? crypto.randomUUID(),
    metadata: normalizeJsonObject(body.metadata),
    sessionId: normalizeString(body.sessionId) ?? undefined,
    agentId: normalizeString(body.agentId) ?? undefined,
    clientSocket: null,
  });
  return json(accepted, 202);
}

async function handleRunLookup(req: Request, runId: string): Promise<Response> {
  const userId = getRequiredUserId(req);
  const run = await getRunOwned(userId, runId);
  return json({
    runId: run.runId,
    conversationId: run.conversationId,
    personaId: run.personaId,
    status: run.status,
    assistantMessageId: run.assistantMessageId ?? null,
    responseId: run.responseId ?? null,
    error: run.error ?? null,
    model: run.model ?? null,
    usage: run.usage ?? null,
  });
}

function routeApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "internal_error", message: "Internal server error" }, 500);
}

Deno.serve({ hostname: HOST, port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return noContent();
  }

  const url = new URL(req.url);

  const adminResponse = await handleAdminRequest(req, url, { store });
  if (adminResponse) {
    return adminResponse;
  }

  const knowledgeResponse = await handleKnowledgeRequest(req, url, {
    store,
    sharedSecret: AGENT_TOOL_SHARED_SECRET,
    defaultSearchLimit: KNOWLEDGE_SEARCH_LIMIT,
  });
  if (knowledgeResponse) {
    return knowledgeResponse;
  }

  try {
    if (url.pathname === "/healthz" && req.method === "GET") {
      return json({
        ok: true,
        agentConnections: agentConnectionsBySocket.size,
        registeredAgents: agentConnectionsByInstanceId.size,
        pendingRuns: pendingRuns.size,
        personasOnline: [...workerRegistry.personaBuckets.entries()].filter(([, bucket]) => bucket.length).map(([personaId]) => personaId),
        adminConfigured: Boolean(
          Deno.env.get("ADMIN_PASSWORD_HASH")?.trim() && Deno.env.get("ADMIN_SESSION_SECRET")?.trim(),
        ),
        knowledgeConfigured: Boolean(AGENT_TOOL_SHARED_SECRET),
      });
    }

    if (url.pathname === "/agent" && req.method === "GET") {
      return await handleAgentSocket(req);
    }

    if (url.pathname === "/ws" && req.method === "GET") {
      return handleClientSocket(req);
    }

    if (url.pathname === "/v1/personas" && req.method === "GET") {
      return json(await listPersonas());
    }

    if (url.pathname === "/v1/conversations" && req.method === "GET") {
      return await handleListConversations(req);
    }

    if (url.pathname === "/v1/conversations" && req.method === "POST") {
      return await handleCreateConversation(req);
    }

    if (url.pathname === "/v1/conversations/continue-last" && req.method === "POST") {
      return await handleContinueLastConversation(req);
    }

    const conversationMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
    if (conversationMatch && (req.method === "GET" || req.method === "POST")) {
      return await handleConversationMessages(req, decodeURIComponent(conversationMatch[1]));
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (runMatch && req.method === "GET") {
      return await handleRunLookup(req, decodeURIComponent(runMatch[1]));
    }

    if (url.pathname === "/" && req.method === "GET") {
      return json({
        name: "deno-relay-control-plane",
        publicApis: [
          "GET /v1/personas",
          "GET /v1/conversations?personaId=...",
          "POST /v1/conversations",
          "POST /v1/conversations/continue-last",
          "GET /v1/conversations/{conversationId}/messages",
          "POST /v1/conversations/{conversationId}/messages",
          "GET /v1/runs/{runId}",
          "POST /v1/admin/login",
          "POST /v1/knowledge/search",
          "POST /v1/knowledge/upsert",
        ],
        sockets: {
          client: "/ws",
          agent: "/agent",
        },
      });
    }

    return json({ error: "not_found", message: "Route not found" }, 404);
  } catch (error) {
    return routeApiError(error);
  }
});

console.log(
  JSON.stringify({
    event: "relay_startup",
    host: HOST,
    port: PORT,
    deploy: {
      appSlug: Deno.env.get("DENO_DEPLOY_APP_SLUG") ?? null,
      orgSlug: Deno.env.get("DENO_DEPLOY_ORG_SLUG") ?? null,
      revisionId: Deno.env.get("DENO_DEPLOY_REVISION_ID") ?? null,
    },
  }),
);
