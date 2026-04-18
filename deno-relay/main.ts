import {
  createWorkerRegistryState,
  pickWorkerForPersona,
  registerWorker,
  type RunStatus,
  unregisterWorker,
  type WorkerRegistration,
} from "./domain.ts";

type JsonObject = Record<string, unknown>;
type AllowedPersonaScope = "*" | Set<string>;
type MessageRole = "user" | "assistant";

type PersonaRecord = {
  personaId: string;
  displayName: string;
  description: string;
  workerRoutingMode: "round_robin";
  enabled: boolean;
  metadata: JsonObject;
  updatedAt: string;
};

type ConversationRecord = {
  conversationId: string;
  userId: string;
  personaId: string;
  title: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
};

type ConversationStateRecord = {
  conversationId: string;
  personaId: string;
  previousResponseId: string | null;
  lastRunId: string | null;
  updatedAt: string;
};

type MessageRecord = {
  messageId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  personaId: string;
  clientMessageId: string | null;
  createdAt: string;
};

type StoredRun = {
  runId: string;
  conversationId: string;
  personaId: string;
  agentInstanceId: string | null;
  status: RunStatus;
  prompt: string;
  reply?: string;
  error?: string;
  usage?: unknown;
  raw?: unknown;
  model?: string | null;
  responseId?: string | null;
  assistantMessageId?: string | null;
  createdAt: string;
  completedAt?: string;
};

type MessageDedupeRecord = {
  userId: string;
  conversationId: string;
  clientMessageId: string;
  runId: string;
  messageId: string;
  createdAt: string;
};

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
  mode?: string;
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
const AGENT_SHARED_SECRET = Deno.env.get("AGENT_SHARED_SECRET") ?? "";
const AGENT_REQUEST_TIMEOUT_MS = Number(Deno.env.get("AGENT_REQUEST_TIMEOUT_MS") ?? "90000");
const USER_HEADER = "x-user-id";
const PERSONA_CATALOG_JSON = Deno.env.get("PERSONA_CATALOG_JSON") ?? "";
const AGENT_TOKEN_PERSONAS_JSON = Deno.env.get("AGENT_TOKEN_PERSONAS_JSON") ?? "";

const kv = await Deno.openKv();
const workerRegistry = createWorkerRegistryState();
const agentConnectionsBySocket = new Map<WebSocket, AgentConnection>();
const agentConnectionsByInstanceId = new Map<string, AgentConnection>();
const pendingRuns = new Map<string, PendingRun>();
const activeRunByConversation = new Map<string, string>();
const agentTokenPolicies = parseAgentTokenPolicies();

await seedPersonaCatalog();

function nowIso(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type, authorization, x-user-id");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return new Response(JSON.stringify(data), { status, headers });
}

function noContent(): Response {
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type, authorization, x-user-id");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return new Response(null, { status: 204, headers });
}

function previewText(text: string, limit = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function defaultPersonaDisplayName(personaId: string): string {
  return personaId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function defaultConversationTitle(prompt: string): string {
  const preview = previewText(prompt, 60);
  return preview || "New chat";
}

function personaKey(personaId: string): Deno.KvKey {
  return ["persona", personaId];
}

function agentInstanceKey(instanceId: string): Deno.KvKey {
  return ["agentInstance", instanceId];
}

function conversationKey(conversationId: string): Deno.KvKey {
  return ["conversation", conversationId];
}

function conversationIndexKey(
  userId: string,
  personaId: string,
  updatedAt: string,
  conversationId: string,
): Deno.KvKey {
  return ["conversationByUserPersonaUpdatedAt", userId, personaId, updatedAt, conversationId];
}

function messageKey(conversationId: string, messageId: string): Deno.KvKey {
  return ["message", conversationId, messageId];
}

function messageIndexKey(conversationId: string, createdAt: string, messageId: string): Deno.KvKey {
  return ["messageByConversationCreatedAt", conversationId, createdAt, messageId];
}

function runKey(runId: string): Deno.KvKey {
  return ["run", runId];
}

function runIndexKey(conversationId: string, createdAt: string, runId: string): Deno.KvKey {
  return ["runByConversationCreatedAt", conversationId, createdAt, runId];
}

function conversationStateKey(conversationId: string): Deno.KvKey {
  return ["conversationState", conversationId];
}

function messageDedupeKey(
  userId: string,
  conversationId: string,
  clientMessageId: string,
): Deno.KvKey {
  return ["messageDedupe", userId, conversationId, clientMessageId];
}

function parseJson(raw: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json", "Body must be a JSON object");
  }
  return value as JsonObject;
}

async function readJsonObject(req: Request): Promise<JsonObject> {
  return parseJson(await req.text());
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
  const parsed = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => item !== null);
  if (!parsed.length || parsed.length !== value.length) {
    throw new ApiError(400, "invalid_request", `${fieldName} must contain only non-empty strings`);
  }
  return [...new Set(parsed)];
}

function parseClientPrompt(raw: string): ClientPromptMessage {
  const value = parseJson(raw);
  if (value.type !== "prompt") {
    throw new ApiError(
      400,
      "invalid_request",
      'Unsupported client message type. Expected "prompt"',
    );
  }

  const prompt = normalizeString(value.prompt);
  if (!prompt) {
    throw new ApiError(400, "invalid_request", "Field prompt must be a non-empty string");
  }

  const conversationId = normalizeString(value.conversationId);
  const sessionId = normalizeString(value.sessionId);
  const clientMessageId = normalizeString(value.clientMessageId);
  const title = normalizeString(value.title);
  const metadata = normalizeJsonObject(value.metadata);

  let target: ClientTarget | undefined;
  if (value.target !== undefined) {
    if (typeof value.target !== "object" || value.target === null || Array.isArray(value.target)) {
      throw new ApiError(400, "invalid_request", "Field target must be an object when provided");
    }
    target = {
      personaId: normalizeString((value.target as JsonObject).personaId) ?? undefined,
      agentId: normalizeString((value.target as JsonObject).agentId) ?? undefined,
      mode: normalizeString((value.target as JsonObject).mode) ?? undefined,
    };
  }

  return {
    type: "prompt",
    prompt,
    conversationId: conversationId ?? undefined,
    sessionId: sessionId ?? undefined,
    clientMessageId: clientMessageId ?? undefined,
    target,
    metadata,
    title: title ?? undefined,
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
    const runId = normalizeString(value.runId) ?? normalizeString(value.requestId);
    const reply = normalizeString(value.reply);
    if (!runId || !reply) {
      throw new ApiError(400, "invalid_request", "Agent response requires runId and reply");
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
    const runId = normalizeString(value.runId) ?? normalizeString(value.requestId);
    const error = normalizeString(value.error);
    if (!runId || !error) {
      throw new ApiError(400, "invalid_request", "Agent error requires runId and error");
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(AGENT_TOKEN_PERSONAS_JSON);
    } catch (error) {
      console.warn("Ignoring invalid AGENT_TOKEN_PERSONAS_JSON", error);
    }
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
          const personaIds = allowed
            .map((item) => normalizeString(item))
            .filter((item): item is string => item !== null);
          if (personaIds.length) {
            policies.set(token, new Set(personaIds));
          }
        }
      }
    }
  }

  if (AGENT_SHARED_SECRET.trim() && !policies.has(AGENT_SHARED_SECRET.trim())) {
    policies.set(AGENT_SHARED_SECRET.trim(), "*");
  }

  return policies;
}

function extractAgentToken(req: Request): string | null {
  const url = new URL(req.url);
  const queryToken = normalizeString(url.searchParams.get("token"));
  if (queryToken) {
    return queryToken;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return normalizeString(authHeader.slice("Bearer ".length));
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

function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "timed_out";
}

async function seedPersonaCatalog(): Promise<void> {
  if (!PERSONA_CATALOG_JSON.trim()) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(PERSONA_CATALOG_JSON);
  } catch (error) {
    console.warn("Ignoring invalid PERSONA_CATALOG_JSON", error);
    return;
  }

  if (!Array.isArray(parsed)) {
    console.warn("Ignoring PERSONA_CATALOG_JSON because it is not an array");
    return;
  }

  for (const item of parsed) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const personaId = normalizeString((item as JsonObject).personaId);
    if (!personaId) {
      continue;
    }
    const existing = await kv.get<PersonaRecord>(personaKey(personaId));
    const updatedAt = nowIso();
    const value: PersonaRecord = {
      personaId,
      displayName: normalizeString((item as JsonObject).displayName) ??
        existing.value?.displayName ?? defaultPersonaDisplayName(personaId),
      description: normalizeString((item as JsonObject).description) ??
        existing.value?.description ?? "",
      workerRoutingMode: "round_robin",
      enabled: (item as JsonObject).enabled === false ? false : existing.value?.enabled ?? true,
      metadata: normalizeJsonObject((item as JsonObject).metadata),
      updatedAt,
    };
    await kv.set(personaKey(personaId), value);
  }
}

async function ensurePersonaRecord(personaId: string): Promise<PersonaRecord> {
  const existing = await kv.get<PersonaRecord>(personaKey(personaId));
  if (existing.value) {
    return existing.value;
  }

  const record: PersonaRecord = {
    personaId,
    displayName: defaultPersonaDisplayName(personaId),
    description: "",
    workerRoutingMode: "round_robin",
    enabled: true,
    metadata: {},
    updatedAt: nowIso(),
  };
  await kv.set(personaKey(personaId), record);
  return record;
}

async function saveConversation(
  conversation: ConversationRecord,
  previousUpdatedAt?: string,
): Promise<void> {
  const atomic = kv
    .atomic()
    .set(conversationKey(conversation.conversationId), conversation)
    .set(
      conversationIndexKey(
        conversation.userId,
        conversation.personaId,
        conversation.updatedAt,
        conversation.conversationId,
      ),
      conversation,
    );
  if (previousUpdatedAt && previousUpdatedAt !== conversation.updatedAt) {
    atomic.delete(
      conversationIndexKey(
        conversation.userId,
        conversation.personaId,
        previousUpdatedAt,
        conversation.conversationId,
      ),
    );
  }
  await atomic.commit();
}

async function saveMessage(message: MessageRecord): Promise<void> {
  await kv
    .atomic()
    .set(messageKey(message.conversationId, message.messageId), message)
    .set(messageIndexKey(message.conversationId, message.createdAt, message.messageId), message)
    .commit();
}

async function saveRun(run: StoredRun): Promise<void> {
  await kv
    .atomic()
    .set(runKey(run.runId), run)
    .set(runIndexKey(run.conversationId, run.createdAt, run.runId), run)
    .commit();
}

async function saveConversationState(state: ConversationStateRecord): Promise<void> {
  await kv.set(conversationStateKey(state.conversationId), state);
}

async function getConversationOwned(
  userId: string,
  conversationId: string,
): Promise<ConversationRecord> {
  const entry = await kv.get<ConversationRecord>(conversationKey(conversationId));
  if (!entry.value || entry.value.userId !== userId) {
    throw new ApiError(404, "conversation_not_found", "Conversation not found");
  }
  return entry.value;
}

async function getConversationStateRecord(
  conversationId: string,
): Promise<ConversationStateRecord | null> {
  const entry = await kv.get<ConversationStateRecord>(conversationStateKey(conversationId));
  return entry.value ?? null;
}

async function getRunOwned(userId: string, runId: string): Promise<StoredRun> {
  const entry = await kv.get<StoredRun>(runKey(runId));
  if (!entry.value) {
    throw new ApiError(404, "run_not_found", "Run not found");
  }
  const conversation = await kv.get<ConversationRecord>(
    conversationKey(entry.value.conversationId),
  );
  if (!conversation.value || conversation.value.userId !== userId) {
    throw new ApiError(404, "run_not_found", "Run not found");
  }
  return entry.value;
}

async function createConversation(
  userId: string,
  personaId: string,
  title?: string,
): Promise<ConversationRecord> {
  await ensurePersonaRecord(personaId);
  const createdAt = nowIso();
  const conversation: ConversationRecord = {
    conversationId: crypto.randomUUID(),
    userId,
    personaId,
    title: title?.trim() || "New chat",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    lastMessagePreview: null,
  };

  const state: ConversationStateRecord = {
    conversationId: conversation.conversationId,
    personaId,
    previousResponseId: null,
    lastRunId: null,
    updatedAt: createdAt,
  };

  await kv
    .atomic()
    .set(conversationKey(conversation.conversationId), conversation)
    .set(
      conversationIndexKey(userId, personaId, conversation.updatedAt, conversation.conversationId),
      conversation,
    )
    .set(conversationStateKey(conversation.conversationId), state)
    .commit();

  return conversation;
}

async function continueLastConversation(
  userId: string,
  personaId: string,
): Promise<ConversationRecord> {
  await ensurePersonaRecord(personaId);
  const iterator = kv.list<ConversationRecord>(
    { prefix: ["conversationByUserPersonaUpdatedAt", userId, personaId] },
    { limit: 1, reverse: true },
  );

  for await (const entry of iterator) {
    if (entry.value) {
      return entry.value;
    }
  }

  return createConversation(userId, personaId);
}

async function listConversations(
  userId: string,
  personaId: string,
  limit: number,
): Promise<ConversationRecord[]> {
  const values: ConversationRecord[] = [];
  const iterator = kv.list<ConversationRecord>(
    { prefix: ["conversationByUserPersonaUpdatedAt", userId, personaId] },
    { limit, reverse: true },
  );
  for await (const entry of iterator) {
    values.push(entry.value);
  }
  return values;
}

async function listMessages(conversationId: string): Promise<MessageRecord[]> {
  const values: MessageRecord[] = [];
  const iterator = kv.list<MessageRecord>({
    prefix: ["messageByConversationCreatedAt", conversationId],
  });
  for await (const entry of iterator) {
    values.push(entry.value);
  }
  return values;
}

async function listPersonas(): Promise<
  Array<PersonaRecord & { online: boolean; connectedWorkers: number }>
> {
  const personaMap = new Map<string, PersonaRecord>();

  for await (const entry of kv.list<PersonaRecord>({ prefix: ["persona"] })) {
    personaMap.set(entry.key[1] as string, entry.value);
  }

  for (const personaId of workerRegistry.personaBuckets.keys()) {
    if (!personaMap.has(personaId)) {
      personaMap.set(personaId, await ensurePersonaRecord(personaId));
    }
  }

  return [...personaMap.values()]
    .sort((a, b) => a.personaId.localeCompare(b.personaId))
    .map((persona) => ({
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

async function failRunAndNotify(
  runId: string,
  error: string,
  status: Extract<RunStatus, "failed" | "timed_out"> = "failed",
): Promise<void> {
  const pending = takePendingRun(runId);
  const entry = await kv.get<StoredRun>(runKey(runId));
  const run = entry.value;
  if (!run || isTerminalStatus(run.status)) {
    return;
  }

  const completedAt = nowIso();
  const failedRun: StoredRun = {
    ...run,
    status,
    error,
    completedAt,
  };
  await saveRun(failedRun);
  activeRunByConversation.delete(run.conversationId);

  const existingState = await getConversationStateRecord(run.conversationId);
  if (existingState) {
    await saveConversationState({
      ...existingState,
      lastRunId: run.runId,
      updatedAt: completedAt,
    });
  }

  if (pending?.clientSocket) {
    sendWsError(pending.clientSocket, error, run.runId, run.conversationId);
  }
}

async function completeRunAndNotify(message: AgentResponseMessage): Promise<void> {
  const pending = takePendingRun(message.runId);
  const entry = await kv.get<StoredRun>(runKey(message.runId));
  const run = entry.value;
  if (!run || isTerminalStatus(run.status)) {
    return;
  }

  const conversation = await kv.get<ConversationRecord>(conversationKey(run.conversationId));
  if (!conversation.value) {
    return;
  }

  const completedAt = nowIso();
  const assistantMessageId = crypto.randomUUID();
  const assistantMessage: MessageRecord = {
    messageId: assistantMessageId,
    conversationId: run.conversationId,
    role: "assistant",
    content: message.reply,
    personaId: run.personaId,
    clientMessageId: null,
    createdAt: completedAt,
  };

  const updatedConversation: ConversationRecord = {
    ...conversation.value,
    updatedAt: completedAt,
    lastMessagePreview: previewText(message.reply),
  };

  const existingState = await getConversationStateRecord(run.conversationId);
  const updatedState: ConversationStateRecord = {
    conversationId: run.conversationId,
    personaId: run.personaId,
    previousResponseId: message.responseId ?? existingState?.previousResponseId ?? null,
    lastRunId: run.runId,
    updatedAt: completedAt,
  };

  const completedRun: StoredRun = {
    ...run,
    status: "completed",
    reply: message.reply,
    responseId: message.responseId ?? null,
    assistantMessageId,
    usage: message.usage,
    raw: message.raw,
    model: message.model ?? null,
    completedAt,
  };

  await saveMessage(assistantMessage);
  await saveRun(completedRun);
  await saveConversation(updatedConversation, conversation.value.updatedAt);
  await saveConversationState(updatedState);
  activeRunByConversation.delete(run.conversationId);

  if (pending?.clientSocket) {
    sendJson(pending.clientSocket, {
      type: "response",
      runId: run.runId,
      conversationId: run.conversationId,
      personaId: run.personaId,
      assistantMessageId,
      responseId: completedRun.responseId ?? null,
      reply: message.reply,
      model: completedRun.model ?? null,
      usage: completedRun.usage ?? null,
      status: completedRun.status,
      raw: completedRun.raw ?? null,
    });
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
  const dedupe = await kv.get<MessageDedupeRecord>(
    messageDedupeKey(input.userId, input.conversation.conversationId, input.clientMessageId),
  );
  if (dedupe.value) {
    const existingRun = await kv.get<StoredRun>(runKey(dedupe.value.runId));
    return {
      runId: dedupe.value.runId,
      conversationId: input.conversation.conversationId,
      userMessageId: dedupe.value.messageId,
      status: existingRun.value?.status ?? "queued",
    };
  }

  if (activeRunByConversation.has(input.conversation.conversationId)) {
    throw new ApiError(409, "conversation_busy", "A run is already active for this conversation");
  }

  const workerConnection = pickLiveWorkerConnection(input.conversation.personaId, input.agentId);
  if (!workerConnection?.worker) {
    throw new ApiError(503, "persona_unavailable", "No worker is available for this persona");
  }

  const currentState = await getConversationStateRecord(input.conversation.conversationId);
  const createdAt = nowIso();
  const runId = crypto.randomUUID();
  const userMessageId = crypto.randomUUID();
  const userMessage: MessageRecord = {
    messageId: userMessageId,
    conversationId: input.conversation.conversationId,
    role: "user",
    content: input.text,
    personaId: input.conversation.personaId,
    clientMessageId: input.clientMessageId,
    createdAt,
  };

  const title = input.conversation.lastMessagePreview
    ? input.conversation.title
    : defaultConversationTitle(input.text);

  const updatedConversation: ConversationRecord = {
    ...input.conversation,
    title,
    updatedAt: createdAt,
    lastMessagePreview: previewText(input.text),
  };

  const queuedRun: StoredRun = {
    runId,
    conversationId: input.conversation.conversationId,
    personaId: input.conversation.personaId,
    agentInstanceId: workerConnection.worker.instanceId,
    status: "queued",
    prompt: input.text,
    createdAt,
  };

  const updatedState: ConversationStateRecord = {
    conversationId: input.conversation.conversationId,
    personaId: input.conversation.personaId,
    previousResponseId: currentState?.previousResponseId ?? null,
    lastRunId: runId,
    updatedAt: createdAt,
  };

  const dedupeValue: MessageDedupeRecord = {
    userId: input.userId,
    conversationId: input.conversation.conversationId,
    clientMessageId: input.clientMessageId,
    runId,
    messageId: userMessageId,
    createdAt,
  };

  activeRunByConversation.set(input.conversation.conversationId, runId);

  try {
    await saveMessage(userMessage);
    await saveRun(queuedRun);
    await saveConversation(updatedConversation, input.conversation.updatedAt);
    await saveConversationState(updatedState);
    await kv.set(
      messageDedupeKey(input.userId, input.conversation.conversationId, input.clientMessageId),
      dedupeValue,
    );

    createPendingRun(
      runId,
      input.conversation.conversationId,
      workerConnection.socket,
      input.clientSocket ?? null,
    );

    sendJson(workerConnection.socket, {
      type: "prompt",
      runId,
      conversationId: input.conversation.conversationId,
      personaId: input.conversation.personaId,
      prompt: input.text,
      sessionId: input.sessionId ?? input.conversation.conversationId,
      continuity: {
        previousResponseId: currentState?.previousResponseId ?? null,
      },
      metadata: {
        ...input.metadata,
        clientMessageId: input.clientMessageId,
      },
    });

    const startedRun: StoredRun = {
      ...queuedRun,
      status: "in_progress",
    };
    await saveRun(startedRun);
  } catch (error) {
    activeRunByConversation.delete(input.conversation.conversationId);
    await failRunAndNotify(runId, "Failed to dispatch run to worker");
    throw error instanceof ApiError
      ? error
      : new ApiError(503, "persona_unavailable", "Failed to dispatch run to worker");
  }

  return {
    runId,
    conversationId: input.conversation.conversationId,
    userMessageId,
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
    throw new ApiError(
      403,
      "forbidden_persona_registration",
      "Worker tried to register forbidden persona",
    );
  }

  if (connection.worker?.instanceId && connection.worker.instanceId !== message.instanceId) {
    unregisterWorker(workerRegistry, connection.worker.instanceId);
    agentConnectionsByInstanceId.delete(connection.worker.instanceId);
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
    ...worker.personaIds.map((personaId) => ensurePersonaRecord(personaId)),
    kv.set(agentInstanceKey(worker.instanceId), {
      instanceId: worker.instanceId,
      agentId: worker.agentId,
      personaIds: worker.personaIds,
      capabilities: worker.capabilities ?? {},
      version: message.version ?? null,
      status: "online",
      connectedAt: connection.connectedAt,
      lastHeartbeatAt: connection.lastHeartbeatAt,
    }),
  ]);
}

async function markAgentHeartbeat(connection: AgentConnection): Promise<void> {
  connection.lastHeartbeatAt = nowIso();
  if (!connection.worker) {
    return;
  }
  await kv.set(agentInstanceKey(connection.worker.instanceId), {
    instanceId: connection.worker.instanceId,
    agentId: connection.worker.agentId,
    personaIds: connection.worker.personaIds,
    capabilities: connection.worker.capabilities ?? {},
    version: connection.version,
    status: "online",
    connectedAt: connection.connectedAt,
    lastHeartbeatAt: connection.lastHeartbeatAt,
  });
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
    await kv.set(agentInstanceKey(connection.worker.instanceId), {
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

  const affectedRuns = [...pendingRuns.values()]
    .filter((pending) => pending.agentSocket === socket)
    .map((pending) => pending.runId);
  for (const runId of affectedRuns) {
    await failRunAndNotify(runId, "Agent disconnected");
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
          throw new ApiError(
            400,
            "worker_not_registered",
            "Worker must register before sending run updates",
          );
        }

        await markAgentHeartbeat(connection);
        if (message.type === "response") {
          await completeRunAndNotify(message);
          return;
        }
        await failRunAndNotify(message.runId, message.error);
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError(
          400,
          "invalid_request",
          error instanceof Error ? error.message : "Unhandled agent error",
        );
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
    : await createConversation(
      userId,
      payload.target?.personaId ?? (() => {
        throw new ApiError(
          400,
          "persona_id_required",
          "target.personaId is required when conversationId is absent",
        );
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
    return json(
      { error: "missing_user_id", message: `Provide ${USER_HEADER} header or ?userId=` },
      401,
    );
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
        const apiError = error instanceof ApiError ? error : new ApiError(
          400,
          "invalid_request",
          error instanceof Error ? error.message : "Unhandled client error",
        );
        sendWsError(socket, apiError.message);
      }
    })();
  };

  socket.onclose = () => {
    detachClientSocket(socket);
  };

  socket.onerror = () => {
    detachClientSocket(socket);
  };

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
  const conversation = await createConversation(userId, personaId, title);
  return json(conversation, 201);
}

async function handleContinueLastConversation(req: Request): Promise<Response> {
  const userId = getRequiredUserId(req);
  const body = await readJsonObject(req);
  const personaId = normalizeString(body.personaId);
  if (!personaId) {
    throw new ApiError(400, "persona_id_required", "personaId is required");
  }
  const conversation = await continueLastConversation(userId, personaId);
  return json(conversation);
}

async function handleListConversations(req: Request): Promise<Response> {
  const userId = getRequiredUserId(req);
  const url = new URL(req.url);
  const personaId = normalizeString(url.searchParams.get("personaId"));
  if (!personaId) {
    throw new ApiError(400, "persona_id_required", "personaId query parameter is required");
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100);
  return json(await listConversations(userId, personaId, limit));
}

async function handleConversationMessages(req: Request, conversationId: string): Promise<Response> {
  const userId = getRequiredUserId(req);
  const conversation = await getConversationOwned(userId, conversationId);

  if (req.method === "GET") {
    return json({
      conversation,
      messages: await listMessages(conversationId),
    });
  }

  const body = await readJsonObject(req);
  const text = normalizeString(body.text);
  if (!text) {
    throw new ApiError(400, "invalid_request", "text must be a non-empty string");
  }

  const clientMessageId = normalizeString(body.clientMessageId) ?? crypto.randomUUID();
  const accepted = await queueConversationRun({
    conversation,
    userId,
    text,
    clientMessageId,
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

  try {
    if (url.pathname === "/healthz" && req.method === "GET") {
      return json({
        ok: true,
        agentConnections: agentConnectionsBySocket.size,
        registeredAgents: agentConnectionsByInstanceId.size,
        pendingRuns: pendingRuns.size,
        personasOnline: [...workerRegistry.personaBuckets.entries()].filter(([, bucket]) =>
          bucket.length
        ).map(([personaId]) => personaId),
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
        name: "deno-relay",
        publicApis: [
          "GET /v1/personas",
          "GET /v1/conversations?personaId=...",
          "POST /v1/conversations",
          "POST /v1/conversations/continue-last",
          "GET /v1/conversations/{conversationId}/messages",
          "POST /v1/conversations/{conversationId}/messages",
          "GET /v1/runs/{runId}",
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
