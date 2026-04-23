import postgres from "npm:postgres";

export type JsonObject = Record<string, unknown>;
export type MessageRole = "user" | "assistant";
export type RunStatus = "queued" | "in_progress" | "completed" | "failed" | "timed_out";

export type PersonaRecord = {
  personaId: string;
  displayName: string;
  description: string;
  workerRoutingMode: "round_robin";
  enabled: boolean;
  metadata: JsonObject;
  updatedAt: string;
};

export type ConversationRecord = {
  conversationId: string;
  userId: string;
  personaId: string;
  title: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
};

export type ConversationStateRecord = {
  conversationId: string;
  personaId: string;
  previousResponseId: string | null;
  lastRunId: string | null;
  updatedAt: string;
};

export type MessageRecord = {
  messageId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  personaId: string;
  clientMessageId: string | null;
  createdAt: string;
};

export type StoredRun = {
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

export type AgentInstanceRecord = {
  instanceId: string;
  agentId: string;
  personaIds: string[];
  capabilities: JsonObject;
  version: string | null;
  status: "online" | "offline";
  connectedAt: string;
  lastHeartbeatAt: string;
  disconnectedAt?: string | null;
  disconnectReason?: string | null;
};

export type AgentConfigRecord = {
  agentId: string;
  runtime: string;
  apiKind: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  systemPrompt: string;
  temperature: number;
  store: boolean;
  enabledSkills: string[];
  restartGeneration: number;
  updatedAt: string;
};

export type KnowledgeDocRecord = {
  docId: string;
  personaId: string;
  title: string;
  body: string;
  source: string;
  metadata: JsonObject;
  updatedAt: string;
};

export type AdminSessionRecord = {
  sessionIdHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export type PersonaSeed = {
  personaId: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
};

export type UpsertPersonaInput = {
  personaId: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
};

export type QueueRunInput = {
  conversation: ConversationRecord;
  userId: string;
  text: string;
  clientMessageId: string;
  assignedAgentInstanceId: string | null;
  requestRaw?: unknown;
};

export type QueueRunResult = {
  deduped: boolean;
  run: StoredRun;
  userMessageId: string;
  previousResponseId: string | null;
};

export type UpsertAgentConfigInput = {
  agentId: string;
  runtime?: string;
  apiKind?: string;
  model?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  store?: boolean;
  enabledSkills?: string[];
};

export type ClaimRunInput = {
  instanceId: string;
  agentId: string;
  personaIds: string[];
};

export type ClaimRunResult = {
  run: StoredRun;
  previousResponseId: string | null;
};

export type CompleteRunInput = {
  runId: string;
  reply: string;
  responseId?: string | null;
  usage?: unknown;
  raw?: unknown;
  model?: string | null;
};

export type KnowledgeDocUpsertInput = {
  docId?: string;
  personaId: string;
  title: string;
  body: string;
  source: string;
  metadata?: JsonObject;
};

export type ControlPlaneStore = {
  close(): Promise<void>;
  seedPersonas(personas: PersonaSeed[]): Promise<void>;
  ensurePersonaRecord(personaId: string): Promise<PersonaRecord>;
  upsertPersona(input: UpsertPersonaInput): Promise<PersonaRecord>;
  getPersona(personaId: string): Promise<PersonaRecord | null>;
  listPersonas(): Promise<PersonaRecord[]>;
  createConversation(
    userId: string,
    personaId: string,
    title?: string,
  ): Promise<ConversationRecord>;
  continueLastConversation(userId: string, personaId: string): Promise<ConversationRecord>;
  listConversations(
    userId: string,
    personaId: string,
    limit: number,
  ): Promise<ConversationRecord[]>;
  getConversationOwned(userId: string, conversationId: string): Promise<ConversationRecord | null>;
  listMessages(conversationId: string): Promise<MessageRecord[]>;
  getConversationState(conversationId: string): Promise<ConversationStateRecord | null>;
  queueRun(input: QueueRunInput): Promise<QueueRunResult>;
  claimQueuedRun(input: ClaimRunInput): Promise<ClaimRunResult | null>;
  markRunInProgress(runId: string): Promise<void>;
  getRun(runId: string): Promise<StoredRun | null>;
  getRunOwned(userId: string, runId: string): Promise<StoredRun | null>;
  completeRun(input: CompleteRunInput): Promise<
    {
      run: StoredRun;
      assistantMessage: MessageRecord;
      conversation: ConversationRecord;
    } | null
  >;
  failRun(
    runId: string,
    error: string,
    status: Extract<RunStatus, "failed" | "timed_out">,
  ): Promise<StoredRun | null>;
  recoverInterruptedRuns(reason: string): Promise<StoredRun[]>;
  saveAgentInstance(record: AgentInstanceRecord): Promise<void>;
  listAgentInstances(): Promise<AgentInstanceRecord[]>;
  upsertAgentConfig(input: UpsertAgentConfigInput): Promise<AgentConfigRecord>;
  getAgentConfig(agentId: string): Promise<AgentConfigRecord | null>;
  listAgentConfigs(): Promise<AgentConfigRecord[]>;
  restartAgentConfig(agentId: string): Promise<AgentConfigRecord>;
  listKnowledgeDocs(personaId: string, limit: number): Promise<KnowledgeDocRecord[]>;
  searchKnowledge(
    personaId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeDocRecord[]>;
  upsertKnowledgeDoc(input: KnowledgeDocUpsertInput): Promise<KnowledgeDocRecord>;
  deleteKnowledgeDoc(personaId: string, docId: string): Promise<boolean>;
  createAdminSession(sessionIdHash: string, expiresAt: string): Promise<AdminSessionRecord>;
  getAdminSession(sessionIdHash: string): Promise<AdminSessionRecord | null>;
  touchAdminSession(sessionIdHash: string, expiresAt: string): Promise<AdminSessionRecord | null>;
  deleteAdminSession(sessionIdHash: string): Promise<void>;
};

class StoreError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

export function createDbClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 5,
    prepare: true,
    ssl: "require",
  });
}

export function createPostgresControlPlaneStore(databaseUrl: string): ControlPlaneStore {
  return new PostgresControlPlaneStore(createDbClient(databaseUrl));
}

export function createMemoryControlPlaneStore(): ControlPlaneStore {
  return new MemoryControlPlaneStore();
}

function nowIso(): string {
  return new Date().toISOString();
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

function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "timed_out";
}

function sortedMessages(messages: MessageRecord[]): MessageRecord[] {
  return [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function sortedConversations(conversations: ConversationRecord[]): ConversationRecord[] {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortedKnowledge(docs: KnowledgeDocRecord[]): KnowledgeDocRecord[] {
  return [...docs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeMetadata(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function normalizeStringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    );
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string =>
          typeof item === "string" && item.trim().length > 0
        );
      }
    } catch {
      // Fall through and treat as a single string value.
    }
    return [value];
  }
  return [];
}

function normalizeAgentInstanceRecord(
  row: Omit<AgentInstanceRecord, "personaIds" | "capabilities"> & {
    personaIds: unknown;
    capabilities: unknown;
  },
): AgentInstanceRecord {
  return {
    ...row,
    personaIds: normalizeStringArrayValue(row.personaIds),
    capabilities: normalizeMetadata(row.capabilities),
  };
}

function defaultApiKindForRuntime(runtime: string): string {
  return runtime.trim().toLowerCase() === "opencode_cli" ? "chat_completions" : "responses";
}

function normalizeAgentApiKind(runtime: string, apiKind: unknown): string {
  const normalized = typeof apiKind === "string" && apiKind.trim() ? apiKind.trim() : "";
  if (runtime.trim().toLowerCase() === "opencode_cli") {
    return normalized === "chat_completions" ? normalized : "chat_completions";
  }
  return "responses";
}

function normalizeAgentConfigRecord(
  row: Omit<AgentConfigRecord, "apiKind" | "enabledSkills"> & {
    apiKind?: unknown;
    enabledSkills: unknown;
  },
): AgentConfigRecord {
  return {
    ...row,
    apiKind: normalizeAgentApiKind(
      row.runtime,
      row.apiKind ?? defaultApiKindForRuntime(row.runtime),
    ),
    enabledSkills: normalizeStringArrayValue(row.enabledSkills),
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function uniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}

class MemoryControlPlaneStore implements ControlPlaneStore {
  private personas = new Map<string, PersonaRecord>();
  private conversations = new Map<string, ConversationRecord>();
  private conversationStates = new Map<string, ConversationStateRecord>();
  private messages = new Map<string, MessageRecord[]>();
  private runs = new Map<string, StoredRun>();
  private activeRuns = new Map<
    string,
    { conversationId: string; runId: string; createdAt: string }
  >();
  private dedupes = new Map<string, { runId: string; messageId: string }>();
  private agentInstances = new Map<string, AgentInstanceRecord>();
  private agentConfigs = new Map<string, AgentConfigRecord>();
  private knowledgeDocs = new Map<string, KnowledgeDocRecord>();
  private adminSessions = new Map<string, AdminSessionRecord>();

  async close(): Promise<void> {
    return;
  }

  async seedPersonas(personas: PersonaSeed[]): Promise<void> {
    for (const persona of personas) {
      const existing = this.personas.get(persona.personaId);
      const updatedAt = nowIso();
      this.personas.set(persona.personaId, {
        personaId: persona.personaId,
        displayName: persona.displayName?.trim() || existing?.displayName ||
          defaultPersonaDisplayName(persona.personaId),
        description: persona.description?.trim() || existing?.description || "",
        workerRoutingMode: "round_robin",
        enabled: persona.enabled ?? existing?.enabled ?? true,
        metadata: persona.metadata ?? existing?.metadata ?? {},
        updatedAt,
      });
    }
  }

  async ensurePersonaRecord(personaId: string): Promise<PersonaRecord> {
    const existing = this.personas.get(personaId);
    if (existing) {
      return existing;
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
    this.personas.set(personaId, record);
    return record;
  }

  async upsertPersona(input: UpsertPersonaInput): Promise<PersonaRecord> {
    const current = await this.ensurePersonaRecord(input.personaId);
    const record: PersonaRecord = {
      personaId: input.personaId,
      displayName: input.displayName?.trim() || current.displayName,
      description: input.description?.trim() ?? current.description,
      workerRoutingMode: "round_robin",
      enabled: input.enabled ?? current.enabled,
      metadata: input.metadata ?? current.metadata,
      updatedAt: nowIso(),
    };
    this.personas.set(record.personaId, record);
    return record;
  }

  async getPersona(personaId: string): Promise<PersonaRecord | null> {
    return this.personas.get(personaId) ?? null;
  }

  async listPersonas(): Promise<PersonaRecord[]> {
    return [...this.personas.values()].sort((left, right) =>
      left.personaId.localeCompare(right.personaId)
    );
  }

  async createConversation(
    userId: string,
    personaId: string,
    title?: string,
  ): Promise<ConversationRecord> {
    await this.ensurePersonaRecord(personaId);
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
    this.conversations.set(conversation.conversationId, conversation);
    this.conversationStates.set(conversation.conversationId, state);
    return conversation;
  }

  async continueLastConversation(userId: string, personaId: string): Promise<ConversationRecord> {
    const existing = sortedConversations(
      [...this.conversations.values()].filter((item) =>
        item.userId === userId && item.personaId === personaId
      ),
    )[0];
    return existing ?? await this.createConversation(userId, personaId);
  }

  async listConversations(
    userId: string,
    personaId: string,
    limit: number,
  ): Promise<ConversationRecord[]> {
    return sortedConversations(
      [...this.conversations.values()].filter((item) =>
        item.userId === userId && item.personaId === personaId
      ),
    ).slice(0, limit);
  }

  async getConversationOwned(
    userId: string,
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return conversation;
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    return sortedMessages(this.messages.get(conversationId) ?? []);
  }

  async getConversationState(conversationId: string): Promise<ConversationStateRecord | null> {
    return this.conversationStates.get(conversationId) ?? null;
  }

  async queueRun(input: QueueRunInput): Promise<QueueRunResult> {
    const dedupeKey =
      `${input.userId}:${input.conversation.conversationId}:${input.clientMessageId}`;
    const dedupe = this.dedupes.get(dedupeKey);
    if (dedupe) {
      const run = this.runs.get(dedupe.runId);
      if (!run) {
        throw new StoreError("run_not_found");
      }
      return {
        deduped: true,
        run,
        userMessageId: dedupe.messageId,
        previousResponseId:
          this.conversationStates.get(input.conversation.conversationId)?.previousResponseId ??
            null,
      };
    }

    if (this.activeRuns.has(input.conversation.conversationId)) {
      throw new StoreError("conversation_busy");
    }

    const createdAt = nowIso();
    const previousState = this.conversationStates.get(input.conversation.conversationId);
    const userMessageId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const message: MessageRecord = {
      messageId: userMessageId,
      conversationId: input.conversation.conversationId,
      role: "user",
      content: input.text,
      personaId: input.conversation.personaId,
      clientMessageId: input.clientMessageId,
      createdAt,
    };
    const run: StoredRun = {
      runId,
      conversationId: input.conversation.conversationId,
      personaId: input.conversation.personaId,
      agentInstanceId: input.assignedAgentInstanceId,
      status: "queued",
      prompt: input.text,
      raw: input.requestRaw,
      createdAt,
    };
    const conversation: ConversationRecord = {
      ...input.conversation,
      title: input.conversation.lastMessagePreview
        ? input.conversation.title
        : defaultConversationTitle(input.text),
      updatedAt: createdAt,
      lastMessagePreview: previewText(input.text),
    };
    const state: ConversationStateRecord = {
      conversationId: input.conversation.conversationId,
      personaId: input.conversation.personaId,
      previousResponseId: previousState?.previousResponseId ?? null,
      lastRunId: runId,
      updatedAt: createdAt,
    };
    this.messages.set(message.conversationId, [
      ...(this.messages.get(message.conversationId) ?? []),
      message,
    ]);
    this.runs.set(runId, run);
    this.conversations.set(conversation.conversationId, conversation);
    this.conversationStates.set(state.conversationId, state);
    this.activeRuns.set(conversation.conversationId, {
      conversationId: conversation.conversationId,
      runId,
      createdAt,
    });
    this.dedupes.set(dedupeKey, { runId, messageId: userMessageId });

    return {
      deduped: false,
      run,
      userMessageId,
      previousResponseId: state.previousResponseId,
    };
  }

  async markRunInProgress(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "queued") {
      return;
    }
    this.runs.set(runId, { ...run, status: "in_progress" });
  }

  async claimQueuedRun(input: ClaimRunInput): Promise<ClaimRunResult | null> {
    if (!input.personaIds.length) {
      return null;
    }
    const candidate = [...this.runs.values()]
      .filter((run) =>
        run.status === "queued" &&
        input.personaIds.includes(run.personaId) &&
        (run.agentInstanceId === null || run.agentInstanceId === input.instanceId)
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!candidate) {
      return null;
    }

    const claimed: StoredRun = {
      ...candidate,
      status: "in_progress",
      agentInstanceId: input.instanceId,
    };
    this.runs.set(candidate.runId, claimed);
    return {
      run: claimed,
      previousResponseId:
        this.conversationStates.get(candidate.conversationId)?.previousResponseId ??
          null,
    };
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async getRunOwned(userId: string, runId: string): Promise<StoredRun | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }
    const conversation = this.conversations.get(run.conversationId);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return run;
  }

  async completeRun(input: CompleteRunInput): Promise<
    {
      run: StoredRun;
      assistantMessage: MessageRecord;
      conversation: ConversationRecord;
    } | null
  > {
    const run = this.runs.get(input.runId);
    if (!run || isTerminalStatus(run.status)) {
      return null;
    }
    const conversation = this.conversations.get(run.conversationId);
    if (!conversation) {
      return null;
    }
    const completedAt = nowIso();
    const assistantMessage: MessageRecord = {
      messageId: crypto.randomUUID(),
      conversationId: run.conversationId,
      role: "assistant",
      content: input.reply,
      personaId: run.personaId,
      clientMessageId: null,
      createdAt: completedAt,
    };
    const completedRun: StoredRun = {
      ...run,
      status: "completed",
      reply: input.reply,
      responseId: input.responseId ?? null,
      assistantMessageId: assistantMessage.messageId,
      usage: input.usage,
      raw: input.raw,
      model: input.model ?? null,
      completedAt,
    };
    const updatedConversation: ConversationRecord = {
      ...conversation,
      updatedAt: completedAt,
      lastMessagePreview: previewText(input.reply),
    };
    const state: ConversationStateRecord = {
      conversationId: run.conversationId,
      personaId: run.personaId,
      previousResponseId: input.responseId ??
        this.conversationStates.get(run.conversationId)?.previousResponseId ?? null,
      lastRunId: run.runId,
      updatedAt: completedAt,
    };
    this.messages.set(assistantMessage.conversationId, [
      ...(this.messages.get(assistantMessage.conversationId) ?? []),
      assistantMessage,
    ]);
    this.runs.set(run.runId, completedRun);
    this.conversations.set(updatedConversation.conversationId, updatedConversation);
    this.conversationStates.set(state.conversationId, state);
    this.activeRuns.delete(run.conversationId);
    return { run: completedRun, assistantMessage, conversation: updatedConversation };
  }

  async failRun(
    runId: string,
    error: string,
    status: Extract<RunStatus, "failed" | "timed_out">,
  ): Promise<StoredRun | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }
    if (isTerminalStatus(run.status)) {
      return run;
    }
    const failedRun: StoredRun = {
      ...run,
      status,
      error,
      completedAt: nowIso(),
    };
    this.runs.set(runId, failedRun);
    const state = this.conversationStates.get(run.conversationId);
    if (state) {
      this.conversationStates.set(run.conversationId, {
        ...state,
        lastRunId: run.runId,
        updatedAt: failedRun.completedAt ?? nowIso(),
      });
    }
    this.activeRuns.delete(run.conversationId);
    return failedRun;
  }

  async recoverInterruptedRuns(reason: string): Promise<StoredRun[]> {
    const interrupted = [...this.runs.values()].filter((run) =>
      run.status === "queued" || run.status === "in_progress"
    );
    const failed: StoredRun[] = [];
    for (const run of interrupted) {
      const item = await this.failRun(run.runId, reason, "timed_out");
      if (item) {
        failed.push(item);
      }
    }
    return failed;
  }

  async saveAgentInstance(record: AgentInstanceRecord): Promise<void> {
    this.agentInstances.set(record.instanceId, record);
  }

  async listAgentInstances(): Promise<AgentInstanceRecord[]> {
    return [...this.agentInstances.values()].sort((left, right) =>
      right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt)
    );
  }

  async upsertAgentConfig(input: UpsertAgentConfigInput): Promise<AgentConfigRecord> {
    const current = this.agentConfigs.get(input.agentId);
    const runtime = input.runtime?.trim() || current?.runtime || "codex_cli";
    const record: AgentConfigRecord = {
      agentId: input.agentId,
      runtime,
      apiKind: normalizeAgentApiKind(
        runtime,
        input.apiKind ?? current?.apiKind ?? defaultApiKindForRuntime(runtime),
      ),
      model: input.model?.trim() || current?.model || "gpt-5.3-codex",
      apiBaseUrl: input.apiBaseUrl !== undefined
        ? input.apiBaseUrl.trim()
        : current?.apiBaseUrl ?? "",
      apiKey: input.apiKey?.trim() ?? current?.apiKey ?? "",
      systemPrompt: input.systemPrompt?.trim() ?? current?.systemPrompt ?? "",
      temperature: typeof input.temperature === "number"
        ? input.temperature
        : current?.temperature ?? 0.2,
      store: typeof input.store === "boolean" ? input.store : current?.store ?? true,
      enabledSkills: input.enabledSkills ?? current?.enabledSkills ?? [],
      restartGeneration: current?.restartGeneration ?? 0,
      updatedAt: nowIso(),
    };
    this.agentConfigs.set(record.agentId, record);
    return record;
  }

  async getAgentConfig(agentId: string): Promise<AgentConfigRecord | null> {
    return this.agentConfigs.get(agentId) ?? null;
  }

  async listAgentConfigs(): Promise<AgentConfigRecord[]> {
    return [...this.agentConfigs.values()].sort((left, right) =>
      left.agentId.localeCompare(right.agentId)
    );
  }

  async restartAgentConfig(agentId: string): Promise<AgentConfigRecord> {
    const current = this.agentConfigs.get(agentId);
    if (!current) {
      throw new StoreError("agent_config_not_found");
    }
    const record: AgentConfigRecord = {
      ...current,
      restartGeneration: current.restartGeneration + 1,
      updatedAt: nowIso(),
    };
    this.agentConfigs.set(agentId, record);
    return record;
  }

  async listKnowledgeDocs(personaId: string, limit: number): Promise<KnowledgeDocRecord[]> {
    return sortedKnowledge(
      [...this.knowledgeDocs.values()].filter((doc) => doc.personaId === personaId),
    ).slice(0, limit);
  }

  async searchKnowledge(
    personaId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeDocRecord[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return this.listKnowledgeDocs(personaId, limit);
    }
    return sortedKnowledge(
      [...this.knowledgeDocs.values()].filter((doc) =>
        doc.personaId === personaId &&
        `${doc.title}\n${doc.body}\n${doc.source}`.toLowerCase().includes(needle)
      ),
    ).slice(0, limit);
  }

  async upsertKnowledgeDoc(input: KnowledgeDocUpsertInput): Promise<KnowledgeDocRecord> {
    await this.ensurePersonaRecord(input.personaId);
    const existing = input.docId ? this.knowledgeDocs.get(input.docId) : undefined;
    const record: KnowledgeDocRecord = {
      docId: input.docId || crypto.randomUUID(),
      personaId: input.personaId,
      title: input.title.trim(),
      body: input.body.trim(),
      source: input.source.trim(),
      metadata: input.metadata ?? existing?.metadata ?? {},
      updatedAt: nowIso(),
    };
    this.knowledgeDocs.set(record.docId, record);
    return record;
  }

  async deleteKnowledgeDoc(personaId: string, docId: string): Promise<boolean> {
    const record = this.knowledgeDocs.get(docId);
    if (!record || record.personaId !== personaId) {
      return false;
    }
    this.knowledgeDocs.delete(docId);
    return true;
  }

  async createAdminSession(sessionIdHash: string, expiresAt: string): Promise<AdminSessionRecord> {
    const record: AdminSessionRecord = {
      sessionIdHash,
      createdAt: nowIso(),
      expiresAt,
      lastSeenAt: nowIso(),
    };
    this.adminSessions.set(sessionIdHash, record);
    return record;
  }

  async getAdminSession(sessionIdHash: string): Promise<AdminSessionRecord | null> {
    return this.adminSessions.get(sessionIdHash) ?? null;
  }

  async touchAdminSession(
    sessionIdHash: string,
    expiresAt: string,
  ): Promise<AdminSessionRecord | null> {
    const existing = this.adminSessions.get(sessionIdHash);
    if (!existing) {
      return null;
    }
    const record: AdminSessionRecord = {
      ...existing,
      expiresAt,
      lastSeenAt: nowIso(),
    };
    this.adminSessions.set(sessionIdHash, record);
    return record;
  }

  async deleteAdminSession(sessionIdHash: string): Promise<void> {
    this.adminSessions.delete(sessionIdHash);
  }
}

class PostgresControlPlaneStore implements ControlPlaneStore {
  // postgres.js typings are strict around json/transaction helpers; runtime behavior is fine here.
  // deno-lint-ignore no-explicit-any
  constructor(private readonly sql: any) {}

  async close(): Promise<void> {
    await this.sql.end({ timeout: 1 });
  }

  async seedPersonas(personas: PersonaSeed[]): Promise<void> {
    for (const persona of personas) {
      const current = await this.getPersona(persona.personaId);
      await this.upsertPersona({
        personaId: persona.personaId,
        displayName: persona.displayName?.trim() || current?.displayName ||
          defaultPersonaDisplayName(persona.personaId),
        description: persona.description?.trim() ?? current?.description ?? "",
        enabled: persona.enabled ?? current?.enabled ?? true,
        metadata: persona.metadata ?? current?.metadata ?? {},
      });
    }
  }

  async ensurePersonaRecord(personaId: string): Promise<PersonaRecord> {
    const existing = await this.getPersona(personaId);
    if (existing) {
      return existing;
    }
    return await this.upsertPersona({ personaId });
  }

  async upsertPersona(input: UpsertPersonaInput): Promise<PersonaRecord> {
    const personaId = input.personaId.trim();
    const displayName = input.displayName?.trim() || defaultPersonaDisplayName(personaId);
    const description = input.description?.trim() ?? "";
    const enabled = input.enabled ?? true;
    const metadata = input.metadata ?? {};
    const [row] = await this.sql`
      insert into personas (
        persona_id,
        display_name,
        description,
        enabled,
        metadata,
        updated_at
      ) values (
        ${personaId},
        ${displayName},
        ${description},
        ${enabled},
        ${toJson(metadata)}::jsonb,
        now()
      )
      on conflict (persona_id) do update set
        display_name = excluded.display_name,
        description = excluded.description,
        enabled = excluded.enabled,
        metadata = excluded.metadata,
        updated_at = now()
      returning
        persona_id as "personaId",
        display_name as "displayName",
        description,
        'round_robin'::text as "workerRoutingMode",
        enabled,
        metadata,
        updated_at::text as "updatedAt"
    `;
    return row;
  }

  async getPersona(personaId: string): Promise<PersonaRecord | null> {
    const [row] = await this.sql`
      select
        persona_id as "personaId",
        display_name as "displayName",
        description,
        'round_robin'::text as "workerRoutingMode",
        enabled,
        metadata,
        updated_at::text as "updatedAt"
      from personas
      where persona_id = ${personaId}
      limit 1
    `;
    return row ?? null;
  }

  async listPersonas(): Promise<PersonaRecord[]> {
    return await this.sql`
      select
        persona_id as "personaId",
        display_name as "displayName",
        description,
        'round_robin'::text as "workerRoutingMode",
        enabled,
        metadata,
        updated_at::text as "updatedAt"
      from personas
      order by persona_id asc
    `;
  }

  async createConversation(
    userId: string,
    personaId: string,
    title?: string,
  ): Promise<ConversationRecord> {
    await this.ensurePersonaRecord(personaId);
    const conversationId = crypto.randomUUID();
    const trimmedTitle = title?.trim() || "New chat";
    const [conversation] = await this.sql.begin(async (tx: any) => {
      const createdRows = await tx`
        insert into conversations (
          conversation_id,
          user_id,
          persona_id,
          title,
          status,
          created_at,
          updated_at,
          last_message_preview
        ) values (
          ${conversationId}::uuid,
          ${userId},
          ${personaId},
          ${trimmedTitle},
          'active',
          now(),
          now(),
          null
        )
        returning
          conversation_id as "conversationId",
          user_id as "userId",
          persona_id as "personaId",
          title,
          status,
          created_at::text as "createdAt",
          updated_at::text as "updatedAt",
          last_message_preview as "lastMessagePreview"
      `;
      await tx`
        insert into conversation_states (
          conversation_id,
          persona_id,
          previous_response_id,
          last_run_id,
          updated_at
        ) values (
          ${conversationId}::uuid,
          ${personaId},
          null,
          null,
          now()
        )
      `;
      return createdRows;
    });
    return conversation;
  }

  async continueLastConversation(userId: string, personaId: string): Promise<ConversationRecord> {
    await this.ensurePersonaRecord(personaId);
    const [conversation] = await this.sql`
      select
        conversation_id as "conversationId",
        user_id as "userId",
        persona_id as "personaId",
        title,
        status,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt",
        last_message_preview as "lastMessagePreview"
      from conversations
      where user_id = ${userId}
        and persona_id = ${personaId}
      order by updated_at desc
      limit 1
    `;
    return conversation ?? await this.createConversation(userId, personaId);
  }

  async listConversations(
    userId: string,
    personaId: string,
    limit: number,
  ): Promise<ConversationRecord[]> {
    return await this.sql`
      select
        conversation_id as "conversationId",
        user_id as "userId",
        persona_id as "personaId",
        title,
        status,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt",
        last_message_preview as "lastMessagePreview"
      from conversations
      where user_id = ${userId}
        and persona_id = ${personaId}
      order by updated_at desc
      limit ${limit}
    `;
  }

  async getConversationOwned(
    userId: string,
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    const [row] = await this.sql`
      select
        conversation_id as "conversationId",
        user_id as "userId",
        persona_id as "personaId",
        title,
        status,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt",
        last_message_preview as "lastMessagePreview"
      from conversations
      where conversation_id = ${conversationId}::uuid
        and user_id = ${userId}
      limit 1
    `;
    return row ?? null;
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    return await this.sql`
      select
        message_id as "messageId",
        conversation_id as "conversationId",
        role,
        content,
        persona_id as "personaId",
        client_message_id as "clientMessageId",
        created_at::text as "createdAt"
      from messages
      where conversation_id = ${conversationId}::uuid
      order by created_at asc
    `;
  }

  async getConversationState(conversationId: string): Promise<ConversationStateRecord | null> {
    const [row] = await this.sql`
      select
        conversation_id as "conversationId",
        persona_id as "personaId",
        previous_response_id as "previousResponseId",
        last_run_id::text as "lastRunId",
        updated_at::text as "updatedAt"
      from conversation_states
      where conversation_id = ${conversationId}::uuid
      limit 1
    `;
    return row ?? null;
  }

  async queueRun(input: QueueRunInput): Promise<QueueRunResult> {
    try {
      return await this.sql.begin(async (tx: any) => {
        const [dedupe] = await tx`
          select
            run_id::text as "runId",
            message_id::text as "messageId"
          from message_dedupes
          where user_id = ${input.userId}
            and conversation_id = ${input.conversation.conversationId}::uuid
            and client_message_id = ${input.clientMessageId}
          limit 1
        `;
        if (dedupe) {
          const [run] = await tx`
            select
              run_id::text as "runId",
              conversation_id::text as "conversationId",
              persona_id as "personaId",
              agent_instance_id as "agentInstanceId",
              status,
              prompt,
              reply,
              error,
              usage,
              raw,
              model,
              response_id as "responseId",
              assistant_message_id::text as "assistantMessageId",
              created_at::text as "createdAt",
              completed_at::text as "completedAt"
            from runs
            where run_id = ${dedupe.runId}::uuid
            limit 1
          `;
          if (!run) {
            throw new StoreError("run_not_found");
          }
          const [state] = await tx`
            select
              conversation_id as "conversationId",
              persona_id as "personaId",
              previous_response_id as "previousResponseId",
              last_run_id::text as "lastRunId",
              updated_at::text as "updatedAt"
            from conversation_states
            where conversation_id = ${input.conversation.conversationId}::uuid
            limit 1
          `;
          return {
            deduped: true,
            run,
            userMessageId: dedupe.messageId,
            previousResponseId: state?.previousResponseId ?? null,
          };
        }

        const [active] = await tx`
          select run_id::text as "runId"
          from conversation_active_runs
          where conversation_id = ${input.conversation.conversationId}::uuid
          limit 1
        `;
        if (active) {
          throw new StoreError("conversation_busy");
        }

        const runId = crypto.randomUUID();
        const userMessageId = crypto.randomUUID();
        const title = input.conversation.lastMessagePreview
          ? input.conversation.title
          : defaultConversationTitle(input.text);

        const [state] = await tx`
          select
            conversation_id as "conversationId",
            persona_id as "personaId",
            previous_response_id as "previousResponseId",
            last_run_id::text as "lastRunId",
            updated_at::text as "updatedAt"
          from conversation_states
          where conversation_id = ${input.conversation.conversationId}::uuid
          limit 1
        `;

        await tx`
          insert into messages (
            message_id,
            conversation_id,
            persona_id,
            role,
            content,
            client_message_id,
            created_at
          ) values (
            ${userMessageId}::uuid,
            ${input.conversation.conversationId}::uuid,
            ${input.conversation.personaId},
            'user',
            ${input.text},
            ${input.clientMessageId},
            now()
          )
        `;

        const [run] = await tx`
          insert into runs (
            run_id,
            conversation_id,
            persona_id,
            agent_instance_id,
            status,
            prompt,
            raw,
            created_at
          ) values (
            ${runId}::uuid,
            ${input.conversation.conversationId}::uuid,
            ${input.conversation.personaId},
            ${input.assignedAgentInstanceId},
            'queued',
            ${input.text},
            ${toJson(input.requestRaw)}::jsonb,
            now()
          )
          returning
            run_id::text as "runId",
            conversation_id::text as "conversationId",
            persona_id as "personaId",
            agent_instance_id as "agentInstanceId",
            status,
            prompt,
            reply,
            error,
            usage,
            raw,
            model,
            response_id as "responseId",
            assistant_message_id::text as "assistantMessageId",
            created_at::text as "createdAt",
            completed_at::text as "completedAt"
        `;

        await tx`
          insert into conversation_active_runs (
            conversation_id,
            run_id,
            created_at
          ) values (
            ${input.conversation.conversationId}::uuid,
            ${runId}::uuid,
            now()
          )
        `;

        await tx`
          update conversations
          set
            title = ${title},
            updated_at = now(),
            last_message_preview = ${previewText(input.text)}
          where conversation_id = ${input.conversation.conversationId}::uuid
        `;

        await tx`
          update conversation_states
          set
            last_run_id = ${runId}::uuid,
            updated_at = now()
          where conversation_id = ${input.conversation.conversationId}::uuid
        `;

        await tx`
          insert into message_dedupes (
            user_id,
            conversation_id,
            client_message_id,
            run_id,
            message_id,
            created_at
          ) values (
            ${input.userId},
            ${input.conversation.conversationId}::uuid,
            ${input.clientMessageId},
            ${runId}::uuid,
            ${userMessageId}::uuid,
            now()
          )
        `;

        return {
          deduped: false,
          run,
          userMessageId,
          previousResponseId: state?.previousResponseId ?? null,
        };
      });
    } catch (error) {
      if (error instanceof StoreError) {
        throw error;
      }
      if (uniqueViolation(error)) {
        const [dedupe] = await this.sql`
          select
            run_id::text as "runId",
            message_id::text as "messageId"
          from message_dedupes
          where user_id = ${input.userId}
            and conversation_id = ${input.conversation.conversationId}::uuid
            and client_message_id = ${input.clientMessageId}
          limit 1
        `;
        if (dedupe) {
          const run = await this.getRun(dedupe.runId);
          if (!run) {
            throw new StoreError("run_not_found");
          }
          const state = await this.getConversationState(input.conversation.conversationId);
          return {
            deduped: true,
            run,
            userMessageId: dedupe.messageId,
            previousResponseId: state?.previousResponseId ?? null,
          };
        }
        throw new StoreError("conversation_busy");
      }
      throw error;
    }
  }

  async markRunInProgress(runId: string): Promise<void> {
    await this.sql`
      update runs
      set status = 'in_progress'
      where run_id = ${runId}::uuid
        and status = 'queued'
    `;
  }

  async claimQueuedRun(input: ClaimRunInput): Promise<ClaimRunResult | null> {
    if (!input.personaIds.length) {
      return null;
    }
    return await this.sql.begin(async (tx: any) => {
      const [run] = await tx`
        select
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
        from runs
        where status = 'queued'
          and persona_id in ${tx(input.personaIds)}
          and (agent_instance_id is null or agent_instance_id = ${input.instanceId})
        order by created_at asc
        for update skip locked
        limit 1
      `;
      if (!run) {
        return null;
      }

      const [state] = await tx`
        select
          previous_response_id as "previousResponseId"
        from conversation_states
        where conversation_id = ${run.conversationId}::uuid
        limit 1
      `;

      const [claimed] = await tx`
        update runs
        set
          status = 'in_progress',
          agent_instance_id = ${input.instanceId}
        where run_id = ${run.runId}::uuid
          and status = 'queued'
        returning
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
      `;
      if (!claimed) {
        return null;
      }

      return {
        run: claimed,
        previousResponseId: state?.previousResponseId ?? null,
      };
    });
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    const [row] = await this.sql`
      select
        run_id::text as "runId",
        conversation_id::text as "conversationId",
        persona_id as "personaId",
        agent_instance_id as "agentInstanceId",
        status,
        prompt,
        reply,
        error,
        usage,
        raw,
        model,
        response_id as "responseId",
        assistant_message_id::text as "assistantMessageId",
        created_at::text as "createdAt",
        completed_at::text as "completedAt"
      from runs
      where run_id = ${runId}::uuid
      limit 1
    `;
    return row ?? null;
  }

  async getRunOwned(userId: string, runId: string): Promise<StoredRun | null> {
    const [row] = await this.sql`
      select
        r.run_id::text as "runId",
        r.conversation_id::text as "conversationId",
        r.persona_id as "personaId",
        r.agent_instance_id as "agentInstanceId",
        r.status,
        r.prompt,
        r.reply,
        r.error,
        r.usage,
        r.raw,
        r.model,
        r.response_id as "responseId",
        r.assistant_message_id::text as "assistantMessageId",
        r.created_at::text as "createdAt",
        r.completed_at::text as "completedAt"
      from runs r
      join conversations c on c.conversation_id = r.conversation_id
      where r.run_id = ${runId}::uuid
        and c.user_id = ${userId}
      limit 1
    `;
    return row ?? null;
  }

  async completeRun(input: CompleteRunInput): Promise<
    {
      run: StoredRun;
      assistantMessage: MessageRecord;
      conversation: ConversationRecord;
    } | null
  > {
    return await this.sql.begin(async (tx: any) => {
      const [run] = await tx`
        select
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
        from runs
        where run_id = ${input.runId}::uuid
        for update
        limit 1
      `;
      if (!run || isTerminalStatus(run.status)) {
        return null;
      }

      const [conversation] = await tx`
        select
          conversation_id::text as "conversationId",
          user_id as "userId",
          persona_id as "personaId",
          title,
          status,
          created_at::text as "createdAt",
          updated_at::text as "updatedAt",
          last_message_preview as "lastMessagePreview"
        from conversations
        where conversation_id = ${run.conversationId}::uuid
        limit 1
      `;
      if (!conversation) {
        return null;
      }

      const [state] = await tx`
        select
          conversation_id as "conversationId",
          persona_id as "personaId",
          previous_response_id as "previousResponseId",
          last_run_id::text as "lastRunId",
          updated_at::text as "updatedAt"
        from conversation_states
        where conversation_id = ${run.conversationId}::uuid
        limit 1
      `;

      const assistantMessageId = crypto.randomUUID();
      const [updatedRun] = await tx`
        update runs
        set
          status = 'completed',
          reply = ${input.reply},
          response_id = ${input.responseId ?? null},
          assistant_message_id = ${assistantMessageId}::uuid,
          usage = ${toJson(input.usage)}::jsonb,
          raw = ${toJson(input.raw)}::jsonb,
          model = ${input.model ?? null},
          completed_at = now()
        where run_id = ${input.runId}::uuid
          and status in ('queued', 'in_progress')
        returning
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
      `;
      if (!updatedRun) {
        return null;
      }

      const [assistantMessage] = await tx`
        insert into messages (
          message_id,
          conversation_id,
          persona_id,
          role,
          content,
          client_message_id,
          created_at
        ) values (
          ${assistantMessageId}::uuid,
          ${run.conversationId}::uuid,
          ${run.personaId},
          'assistant',
          ${input.reply},
          null,
          now()
        )
        returning
          message_id::text as "messageId",
          conversation_id::text as "conversationId",
          role,
          content,
          persona_id as "personaId",
          client_message_id as "clientMessageId",
          created_at::text as "createdAt"
      `;

      const [updatedConversation] = await tx`
        update conversations
        set
          updated_at = now(),
          last_message_preview = ${previewText(input.reply)}
        where conversation_id = ${run.conversationId}::uuid
        returning
          conversation_id::text as "conversationId",
          user_id as "userId",
          persona_id as "personaId",
          title,
          status,
          created_at::text as "createdAt",
          updated_at::text as "updatedAt",
          last_message_preview as "lastMessagePreview"
      `;

      await tx`
        update conversation_states
        set
          previous_response_id = ${input.responseId ?? state?.previousResponseId ?? null},
          last_run_id = ${run.runId}::uuid,
          updated_at = now()
        where conversation_id = ${run.conversationId}::uuid
      `;

      await tx`
        delete from conversation_active_runs
        where conversation_id = ${run.conversationId}::uuid
      `;

      return {
        run: updatedRun,
        assistantMessage,
        conversation: updatedConversation,
      };
    });
  }

  async failRun(
    runId: string,
    error: string,
    status: Extract<RunStatus, "failed" | "timed_out">,
  ): Promise<StoredRun | null> {
    return await this.sql.begin(async (tx: any) => {
      const [run] = await tx`
        select
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
        from runs
        where run_id = ${runId}::uuid
        for update
        limit 1
      `;
      if (!run) {
        return null;
      }
      if (isTerminalStatus(run.status)) {
        return run;
      }
      const [updated] = await tx`
        update runs
        set
          status = ${status},
          error = ${error},
          completed_at = now()
        where run_id = ${runId}::uuid
          and status in ('queued', 'in_progress')
        returning
          run_id::text as "runId",
          conversation_id::text as "conversationId",
          persona_id as "personaId",
          agent_instance_id as "agentInstanceId",
          status,
          prompt,
          reply,
          error,
          usage,
          raw,
          model,
          response_id as "responseId",
          assistant_message_id::text as "assistantMessageId",
          created_at::text as "createdAt",
          completed_at::text as "completedAt"
      `;
      if (!updated) {
        const [latest] = await tx`
          select
            run_id::text as "runId",
            conversation_id::text as "conversationId",
            persona_id as "personaId",
            agent_instance_id as "agentInstanceId",
            status,
            prompt,
            reply,
            error,
            usage,
            raw,
            model,
            response_id as "responseId",
            assistant_message_id::text as "assistantMessageId",
            created_at::text as "createdAt",
            completed_at::text as "completedAt"
          from runs
          where run_id = ${runId}::uuid
          limit 1
        `;
        return latest ?? null;
      }

      await tx`
        update conversation_states
        set
          last_run_id = ${runId}::uuid,
          updated_at = now()
        where conversation_id = ${run.conversationId}::uuid
      `;

      await tx`
        delete from conversation_active_runs
        where conversation_id = ${run.conversationId}::uuid
      `;

      return updated;
    });
  }

  async recoverInterruptedRuns(reason: string): Promise<StoredRun[]> {
    const runs = await this.sql`
      select run_id::text as "runId"
      from runs
      where status in ('queued', 'in_progress')
    `;
    const updated: StoredRun[] = [];
    for (const run of runs) {
      const failed = await this.failRun(run.runId, reason, "timed_out");
      if (failed) {
        updated.push(failed);
      }
    }
    return updated;
  }

  async saveAgentInstance(record: AgentInstanceRecord): Promise<void> {
    await this.sql`
      insert into agent_instances (
        instance_id,
        agent_id,
        persona_ids,
        capabilities,
        version,
        status,
        connected_at,
        last_heartbeat_at,
        disconnected_at,
        disconnect_reason
      ) values (
        ${record.instanceId},
        ${record.agentId},
        ${toJson(record.personaIds)}::jsonb,
        ${toJson(record.capabilities)}::jsonb,
        ${record.version},
        ${record.status},
        ${record.connectedAt}::timestamptz,
        ${record.lastHeartbeatAt}::timestamptz,
        ${record.disconnectedAt ?? null}::timestamptz,
        ${record.disconnectReason ?? null}
      )
      on conflict (instance_id) do update set
        agent_id = excluded.agent_id,
        persona_ids = excluded.persona_ids,
        capabilities = excluded.capabilities,
        version = excluded.version,
        status = excluded.status,
        connected_at = excluded.connected_at,
        last_heartbeat_at = excluded.last_heartbeat_at,
        disconnected_at = excluded.disconnected_at,
        disconnect_reason = excluded.disconnect_reason
    `;
  }

  async listAgentInstances(): Promise<AgentInstanceRecord[]> {
    const rows = await this.sql`
      select
        instance_id as "instanceId",
        agent_id as "agentId",
        persona_ids as "personaIds",
        capabilities,
        version,
        status,
        connected_at::text as "connectedAt",
        last_heartbeat_at::text as "lastHeartbeatAt",
        disconnected_at::text as "disconnectedAt",
        disconnect_reason as "disconnectReason"
      from agent_instances
      order by last_heartbeat_at desc
    `;
    return rows.map(normalizeAgentInstanceRecord);
  }

  async upsertAgentConfig(input: UpsertAgentConfigInput): Promise<AgentConfigRecord> {
    const current = await this.getAgentConfig(input.agentId);
    const runtime = input.runtime?.trim() || current?.runtime || "codex_cli";
    const apiKind = normalizeAgentApiKind(
      runtime,
      input.apiKind ?? current?.apiKind ?? defaultApiKindForRuntime(runtime),
    );
    const model = input.model?.trim() || current?.model || "gpt-5.3-codex";
    const apiBaseUrl = input.apiBaseUrl !== undefined
      ? input.apiBaseUrl.trim()
      : current?.apiBaseUrl ?? "";
    const apiKey = input.apiKey?.trim() ?? current?.apiKey ?? "";
    const systemPrompt = input.systemPrompt?.trim() ?? current?.systemPrompt ?? "";
    const temperature = typeof input.temperature === "number"
      ? input.temperature
      : current?.temperature ?? 0.2;
    const store = typeof input.store === "boolean" ? input.store : current?.store ?? true;
    const enabledSkills = input.enabledSkills ?? current?.enabledSkills ?? [];
    const restartGeneration = current?.restartGeneration ?? 0;

    const [row] = await this.sql`
      insert into agent_configs (
        agent_id,
        runtime,
        api_kind,
        model,
        api_base_url,
        api_key,
        system_prompt,
        temperature,
        store,
        enabled_skills,
        restart_generation,
        updated_at
      ) values (
        ${input.agentId},
        ${runtime},
        ${apiKind},
        ${model},
        ${apiBaseUrl},
        ${apiKey},
        ${systemPrompt},
        ${temperature},
        ${store},
        ${toJson(enabledSkills)}::jsonb,
        ${restartGeneration},
        now()
      )
      on conflict (agent_id) do update set
        runtime = excluded.runtime,
        api_kind = excluded.api_kind,
        model = excluded.model,
        api_base_url = excluded.api_base_url,
        api_key = excluded.api_key,
        system_prompt = excluded.system_prompt,
        temperature = excluded.temperature,
        store = excluded.store,
        enabled_skills = excluded.enabled_skills,
        updated_at = now()
      returning
        agent_id as "agentId",
        runtime,
        api_kind as "apiKind",
        model,
        api_base_url as "apiBaseUrl",
        api_key as "apiKey",
        system_prompt as "systemPrompt",
        temperature,
        store,
        enabled_skills as "enabledSkills",
        restart_generation as "restartGeneration",
        updated_at::text as "updatedAt"
    `;
    return normalizeAgentConfigRecord(row);
  }

  async getAgentConfig(agentId: string): Promise<AgentConfigRecord | null> {
    const [row] = await this.sql`
      select
        agent_id as "agentId",
        runtime,
        api_kind as "apiKind",
        model,
        api_base_url as "apiBaseUrl",
        api_key as "apiKey",
        system_prompt as "systemPrompt",
        temperature,
        store,
        enabled_skills as "enabledSkills",
        restart_generation as "restartGeneration",
        updated_at::text as "updatedAt"
      from agent_configs
      where agent_id = ${agentId}
      limit 1
    `;
    return row ? normalizeAgentConfigRecord(row) : null;
  }

  async listAgentConfigs(): Promise<AgentConfigRecord[]> {
    const rows = await this.sql`
      select
        agent_id as "agentId",
        runtime,
        api_kind as "apiKind",
        model,
        api_base_url as "apiBaseUrl",
        api_key as "apiKey",
        system_prompt as "systemPrompt",
        temperature,
        store,
        enabled_skills as "enabledSkills",
        restart_generation as "restartGeneration",
        updated_at::text as "updatedAt"
      from agent_configs
      order by agent_id asc
    `;
    return rows.map(normalizeAgentConfigRecord);
  }

  async restartAgentConfig(agentId: string): Promise<AgentConfigRecord> {
    const [row] = await this.sql`
      update agent_configs
      set
        restart_generation = restart_generation + 1,
        updated_at = now()
      where agent_id = ${agentId}
      returning
        agent_id as "agentId",
        runtime,
        api_kind as "apiKind",
        model,
        api_base_url as "apiBaseUrl",
        api_key as "apiKey",
        system_prompt as "systemPrompt",
        temperature,
        store,
        enabled_skills as "enabledSkills",
        restart_generation as "restartGeneration",
        updated_at::text as "updatedAt"
    `;
    if (!row) {
      throw new StoreError("agent_config_not_found");
    }
    return normalizeAgentConfigRecord(row);
  }

  async listKnowledgeDocs(personaId: string, limit: number): Promise<KnowledgeDocRecord[]> {
    return await this.sql`
      select
        doc_id::text as "docId",
        persona_id as "personaId",
        title,
        body,
        source,
        metadata,
        updated_at::text as "updatedAt"
      from persona_knowledge_docs
      where persona_id = ${personaId}
      order by updated_at desc
      limit ${limit}
    `;
  }

  async searchKnowledge(
    personaId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeDocRecord[]> {
    const needle = query.trim();
    if (!needle) {
      return await this.listKnowledgeDocs(personaId, limit);
    }
    const pattern = `%${needle}%`;
    return await this.sql`
      select
        doc_id::text as "docId",
        persona_id as "personaId",
        title,
        body,
        source,
        metadata,
        updated_at::text as "updatedAt"
      from persona_knowledge_docs
      where persona_id = ${personaId}
        and (
          title ilike ${pattern}
          or body ilike ${pattern}
          or source ilike ${pattern}
          or to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(source, ''))
            @@ plainto_tsquery('simple', ${needle})
        )
      order by updated_at desc
      limit ${limit}
    `;
  }

  async upsertKnowledgeDoc(input: KnowledgeDocUpsertInput): Promise<KnowledgeDocRecord> {
    await this.ensurePersonaRecord(input.personaId);
    const docId = input.docId || crypto.randomUUID();
    const [row] = await this.sql`
      insert into persona_knowledge_docs (
        doc_id,
        persona_id,
        title,
        body,
        source,
        metadata,
        updated_at
      ) values (
        ${docId}::uuid,
        ${input.personaId},
        ${input.title.trim()},
        ${input.body.trim()},
        ${input.source.trim()},
        ${toJson(input.metadata ?? {})}::jsonb,
        now()
      )
      on conflict (doc_id) do update set
        persona_id = excluded.persona_id,
        title = excluded.title,
        body = excluded.body,
        source = excluded.source,
        metadata = excluded.metadata,
        updated_at = now()
      returning
        doc_id::text as "docId",
        persona_id as "personaId",
        title,
        body,
        source,
        metadata,
        updated_at::text as "updatedAt"
    `;
    return row;
  }

  async deleteKnowledgeDoc(personaId: string, docId: string): Promise<boolean> {
    const rows = await this.sql`
      delete from persona_knowledge_docs
      where doc_id = ${docId}::uuid
        and persona_id = ${personaId}
    `;
    return rows.count > 0;
  }

  async createAdminSession(sessionIdHash: string, expiresAt: string): Promise<AdminSessionRecord> {
    const [row] = await this.sql`
      insert into admin_sessions (
        session_id_hash,
        created_at,
        expires_at,
        last_seen_at
      ) values (
        ${sessionIdHash},
        now(),
        ${expiresAt}::timestamptz,
        now()
      )
      returning
        session_id_hash as "sessionIdHash",
        created_at::text as "createdAt",
        expires_at::text as "expiresAt",
        last_seen_at::text as "lastSeenAt"
    `;
    return row;
  }

  async getAdminSession(sessionIdHash: string): Promise<AdminSessionRecord | null> {
    const [row] = await this.sql`
      select
        session_id_hash as "sessionIdHash",
        created_at::text as "createdAt",
        expires_at::text as "expiresAt",
        last_seen_at::text as "lastSeenAt"
      from admin_sessions
      where session_id_hash = ${sessionIdHash}
      limit 1
    `;
    return row ?? null;
  }

  async touchAdminSession(
    sessionIdHash: string,
    expiresAt: string,
  ): Promise<AdminSessionRecord | null> {
    const [row] = await this.sql`
      update admin_sessions
      set
        expires_at = ${expiresAt}::timestamptz,
        last_seen_at = now()
      where session_id_hash = ${sessionIdHash}
      returning
        session_id_hash as "sessionIdHash",
        created_at::text as "createdAt",
        expires_at::text as "expiresAt",
        last_seen_at::text as "lastSeenAt"
    `;
    return row ?? null;
  }

  async deleteAdminSession(sessionIdHash: string): Promise<void> {
    await this.sql`
      delete from admin_sessions
      where session_id_hash = ${sessionIdHash}
    `;
  }
}

export { StoreError };
