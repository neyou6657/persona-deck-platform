export type WorkerRegistration = {
  agentId: string;
  instanceId: string;
  personaIds: string[];
  capabilities?: Record<string, unknown>;
};

export type WorkerRegistryState = {
  workers: Map<string, WorkerRegistration>;
  personaBuckets: Map<string, string[]>;
  rrCursor: Map<string, number>;
};

export type ConversationState = {
  conversationId: string;
  personaId: string;
  previousResponseId: string | null;
  lastRunId: string | null;
  updatedAt: string;
};

export type RunStatus = "queued" | "in_progress" | "completed" | "failed" | "timed_out";

export type RunRecord = {
  runId: string;
  conversationId: string;
  personaId: string;
  status: RunStatus;
  prompt: string;
  createdAt: string;
  completedAt?: string;
  reply?: string;
  error?: string;
  usage?: unknown;
  assistantMessageId?: string | null;
  responseId?: string | null;
};

export type BeginRunInput = {
  runId: string;
  conversationId: string;
  personaId: string;
  prompt: string;
};

export type CompleteRunInput = {
  runId: string;
  conversationId: string;
  reply: string;
  responseId: string | null;
  assistantMessageId?: string | null;
  usage?: unknown;
};

export type FailRunInput = {
  runId: string;
  conversationId: string;
  error: string;
  status?: Extract<RunStatus, "failed" | "timed_out">;
};

export type InMemoryConversationStore = {
  runs: Map<string, RunRecord>;
  activeRunByConversation: Map<string, string>;
  states: Map<string, ConversationState>;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createWorkerRegistryState(): WorkerRegistryState {
  return {
    workers: new Map(),
    personaBuckets: new Map(),
    rrCursor: new Map(),
  };
}

function dedupeBucket(values: string[]): string[] {
  return [...new Set(values)];
}

export function registerWorker(state: WorkerRegistryState, worker: WorkerRegistration): void {
  unregisterWorker(state, worker.instanceId);
  state.workers.set(worker.instanceId, worker);

  for (const personaId of worker.personaIds) {
    const existing = state.personaBuckets.get(personaId) ?? [];
    state.personaBuckets.set(personaId, dedupeBucket([...existing, worker.instanceId]));
  }
}

export function unregisterWorker(state: WorkerRegistryState, instanceId: string): void {
  const worker = state.workers.get(instanceId);
  if (!worker) {
    return;
  }

  state.workers.delete(instanceId);

  for (const personaId of worker.personaIds) {
    const existing = state.personaBuckets.get(personaId) ?? [];
    const next = existing.filter((value) => value !== instanceId);
    if (next.length) {
      state.personaBuckets.set(personaId, next);
    } else {
      state.personaBuckets.delete(personaId);
      state.rrCursor.delete(personaId);
    }
  }
}

export function pickWorkerForPersona(
  state: WorkerRegistryState,
  personaId: string,
): WorkerRegistration | null {
  const bucket = (state.personaBuckets.get(personaId) ?? []).filter((instanceId) =>
    state.workers.has(instanceId)
  );
  if (!bucket.length) {
    return null;
  }

  const cursor = state.rrCursor.get(personaId) ?? 0;
  const index = cursor % bucket.length;
  state.rrCursor.set(personaId, (cursor + 1) % bucket.length);
  return state.workers.get(bucket[index]) ?? null;
}

export function createInMemoryConversationStore(): InMemoryConversationStore {
  return {
    runs: new Map(),
    activeRunByConversation: new Map(),
    states: new Map(),
  };
}

export async function seedConversationState(
  store: InMemoryConversationStore,
  value: { conversationId: string; personaId: string; previousResponseId?: string | null },
): Promise<void> {
  store.states.set(value.conversationId, {
    conversationId: value.conversationId,
    personaId: value.personaId,
    previousResponseId: value.previousResponseId ?? null,
    lastRunId: null,
    updatedAt: nowIso(),
  });
}

export async function getConversationState(
  store: InMemoryConversationStore,
  conversationId: string,
): Promise<ConversationState | null> {
  return store.states.get(conversationId) ?? null;
}

export async function beginRun(
  store: InMemoryConversationStore,
  input: BeginRunInput,
): Promise<RunRecord> {
  if (store.activeRunByConversation.has(input.conversationId)) {
    throw new Error("conversation_busy");
  }

  const createdAt = nowIso();
  const run: RunRecord = {
    runId: input.runId,
    conversationId: input.conversationId,
    personaId: input.personaId,
    status: "in_progress",
    prompt: input.prompt,
    createdAt,
  };

  store.runs.set(run.runId, run);
  store.activeRunByConversation.set(input.conversationId, input.runId);

  const currentState = store.states.get(input.conversationId);
  store.states.set(input.conversationId, {
    conversationId: input.conversationId,
    personaId: input.personaId,
    previousResponseId: currentState?.previousResponseId ?? null,
    lastRunId: input.runId,
    updatedAt: createdAt,
  });

  return run;
}

export async function completeRun(
  store: InMemoryConversationStore,
  input: CompleteRunInput,
): Promise<RunRecord> {
  const existing = store.runs.get(input.runId);
  if (!existing) {
    throw new Error("run_not_found");
  }

  const completed: RunRecord = {
    ...existing,
    status: "completed",
    reply: input.reply,
    responseId: input.responseId,
    assistantMessageId: input.assistantMessageId ?? null,
    usage: input.usage,
    completedAt: nowIso(),
  };

  store.runs.set(input.runId, completed);
  store.activeRunByConversation.delete(input.conversationId);

  const existingState = store.states.get(input.conversationId);
  if (existingState) {
    store.states.set(input.conversationId, {
      ...existingState,
      previousResponseId: input.responseId,
      lastRunId: input.runId,
      updatedAt: completed.completedAt ?? nowIso(),
    });
  }

  return completed;
}

export async function failRun(
  store: InMemoryConversationStore,
  input: FailRunInput,
): Promise<RunRecord> {
  const existing = store.runs.get(input.runId);
  if (!existing) {
    throw new Error("run_not_found");
  }

  const failed: RunRecord = {
    ...existing,
    status: input.status ?? "failed",
    error: input.error,
    completedAt: nowIso(),
  };

  store.runs.set(input.runId, failed);
  store.activeRunByConversation.delete(input.conversationId);

  const existingState = store.states.get(input.conversationId);
  if (existingState) {
    store.states.set(input.conversationId, {
      ...existingState,
      lastRunId: input.runId,
      updatedAt: failed.completedAt ?? nowIso(),
    });
  }

  return failed;
}
