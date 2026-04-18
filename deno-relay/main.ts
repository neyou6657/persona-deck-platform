type JsonObject = Record<string, unknown>;

type ClientPromptMessage = {
  type: "prompt";
  prompt: string;
  sessionId?: string;
  metadata?: JsonObject;
};

type AgentPromptMessage = {
  type: "prompt";
  requestId: string;
  prompt: string;
  sessionId?: string;
  metadata?: JsonObject;
};

type AgentResponseMessage = {
  type: "response";
  requestId: string;
  reply: string;
  sessionId?: string;
  model?: string;
  usage?: unknown;
  raw?: unknown;
};

type AgentErrorMessage = {
  type: "error";
  requestId: string;
  error: string;
};

type PendingRequest = {
  clientSocket: WebSocket;
  agentSocket: WebSocket;
  clientSessionId?: string;
  timeoutId: ReturnType<typeof setTimeout>;
};

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const MOCK_MODE = (Deno.env.get("MOCK_MODE") ?? "false").toLowerCase() === "true";
const MOCK_REPLY_PREFIX = Deno.env.get("MOCK_REPLY_PREFIX") ?? "Mock relay reply";
const AGENT_SHARED_SECRET = Deno.env.get("AGENT_SHARED_SECRET") ?? "";
const AGENT_REQUEST_TIMEOUT_MS = Number(Deno.env.get("AGENT_REQUEST_TIMEOUT_MS") ?? "90000");

const connectedAgents = new Set<WebSocket>();
const pendingRequests = new Map<string, PendingRequest>();
let agentRoundRobinIndex = 0;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

function sendClientError(socket: WebSocket, error: string, requestId?: string) {
  sendJson(socket, { type: "error", error, requestId: requestId ?? null });
}

function parseJson(raw: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Message must be a JSON object");
  }
  return value as JsonObject;
}

function parseClientPrompt(raw: string): ClientPromptMessage {
  const value = parseJson(raw);
  if (value.type !== "prompt") {
    throw new Error('Unsupported client message type. Expected "prompt"');
  }
  if (typeof value.prompt !== "string" || !value.prompt.trim()) {
    throw new Error("Field prompt must be a non-empty string");
  }
  if (value.sessionId !== undefined && typeof value.sessionId !== "string") {
    throw new Error("Field sessionId must be a string when provided");
  }
  if (
    value.metadata !== undefined &&
    (typeof value.metadata !== "object" || value.metadata === null || Array.isArray(value.metadata))
  ) {
    throw new Error("Field metadata must be an object when provided");
  }
  return {
    type: "prompt",
    prompt: value.prompt,
    sessionId: value.sessionId as string | undefined,
    metadata: value.metadata as JsonObject | undefined,
  };
}

function parseAgentResponse(raw: string): AgentResponseMessage | AgentErrorMessage {
  const value = parseJson(raw);
  if (value.type === "response") {
    if (typeof value.requestId !== "string" || !value.requestId) {
      throw new Error("Agent response is missing requestId");
    }
    if (typeof value.reply !== "string") {
      throw new Error("Agent response is missing reply");
    }
    return {
      type: "response",
      requestId: value.requestId,
      reply: value.reply,
      sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
      model: typeof value.model === "string" ? value.model : undefined,
      usage: value.usage,
      raw: value.raw,
    };
  }
  if (value.type === "error") {
    if (typeof value.requestId !== "string" || !value.requestId) {
      throw new Error("Agent error is missing requestId");
    }
    if (typeof value.error !== "string" || !value.error) {
      throw new Error("Agent error is missing error");
    }
    return {
      type: "error",
      requestId: value.requestId,
      error: value.error,
    };
  }
  throw new Error('Unsupported agent message type. Expected "response" or "error"');
}

function isAuthorizedAgent(req: Request): boolean {
  if (!AGENT_SHARED_SECRET) {
    return false;
  }
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  return queryToken === AGENT_SHARED_SECRET || bearer === AGENT_SHARED_SECRET;
}

function pickAgent(): WebSocket | null {
  const agents = [...connectedAgents].filter((socket) => socket.readyState === WebSocket.OPEN);
  if (!agents.length) {
    return null;
  }
  const socket = agents[agentRoundRobinIndex % agents.length];
  agentRoundRobinIndex = (agentRoundRobinIndex + 1) % agents.length;
  return socket;
}

function clearPendingRequest(requestId: string): PendingRequest | undefined {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return undefined;
  }
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(requestId);
  return pending;
}

function failRequestsForAgent(agentSocket: WebSocket, reason: string) {
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (pending.agentSocket !== agentSocket) {
      continue;
    }
    clearPendingRequest(requestId);
    sendClientError(pending.clientSocket, reason, requestId);
  }
}

function failRequestsForClient(clientSocket: WebSocket) {
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (pending.clientSocket !== clientSocket) {
      continue;
    }
    clearPendingRequest(requestId);
  }
}

function handleMockPrompt(socket: WebSocket, payload: ClientPromptMessage) {
  const preview = payload.prompt.replace(/\s+/g, " ").trim();
  sendJson(socket, {
    type: "response",
    reply: `${MOCK_REPLY_PREFIX}: ${preview}`,
    sessionId: payload.sessionId ?? "",
    model: "deno-relay:mock",
    raw: {
      usage: {
        input_chars: payload.prompt.length,
        mock: true,
      },
    },
  });
}

function handleClientSocket(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (event) => {
    try {
      if (typeof event.data !== "string") {
        sendClientError(socket, "Only text frames are supported");
        return;
      }

      const payload = parseClientPrompt(event.data);
      if (MOCK_MODE) {
        handleMockPrompt(socket, payload);
        return;
      }

      const agentSocket = pickAgent();
      if (!agentSocket) {
        sendClientError(socket, "No agent is currently connected");
        return;
      }

      const requestId = crypto.randomUUID();
      const timeoutId = setTimeout(() => {
        const pending = clearPendingRequest(requestId);
        if (!pending) {
          return;
        }
        sendClientError(pending.clientSocket, "Agent request timed out", requestId);
      }, AGENT_REQUEST_TIMEOUT_MS);

      pendingRequests.set(requestId, {
        clientSocket: socket,
        agentSocket,
        clientSessionId: payload.sessionId,
        timeoutId,
      });

      const agentPayload: AgentPromptMessage = {
        type: "prompt",
        requestId,
        prompt: payload.prompt,
        sessionId: payload.sessionId,
        metadata: payload.metadata ?? {},
      };
      sendJson(agentSocket, agentPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unhandled client error";
      sendClientError(socket, message);
    }
  };

  socket.onclose = () => {
    failRequestsForClient(socket);
  };

  socket.onerror = () => {
    try {
      sendClientError(socket, "Client WebSocket connection error");
    } catch {
      // Ignore errors on a dead socket.
    }
  };

  return response;
}

function handleAgentSocket(req: Request): Response {
  if (!isAuthorizedAgent(req)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  connectedAgents.add(socket);
  sendJson(socket, {
    type: "agent_ready",
    connectedAgents: connectedAgents.size,
  });

  socket.onmessage = (event) => {
    try {
      if (typeof event.data !== "string") {
        return;
      }
      const message = parseAgentResponse(event.data);
      const pending = clearPendingRequest(message.requestId);
      if (!pending) {
        return;
      }

      if (message.type === "error") {
        sendClientError(pending.clientSocket, message.error, message.requestId);
        return;
      }

      sendJson(pending.clientSocket, {
        type: "response",
        reply: message.reply,
        sessionId: message.sessionId ?? pending.clientSessionId ?? "",
        model: message.model,
        requestId: message.requestId,
        raw: {
          usage: message.usage,
          response: message.raw ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unhandled agent error";
      failRequestsForAgent(socket, `Agent protocol error: ${message}`);
      try {
        socket.close(1011, message.slice(0, 120));
      } catch {
        // Ignore close errors.
      }
    }
  };

  socket.onclose = () => {
    connectedAgents.delete(socket);
    failRequestsForAgent(socket, "Agent disconnected");
  };

  socket.onerror = () => {
    failRequestsForAgent(socket, "Agent connection error");
  };

  return response;
}

Deno.serve({ hostname: HOST, port: PORT }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/healthz" && req.method === "GET") {
    return json({
      ok: true,
      mockMode: MOCK_MODE,
      agentConnections: connectedAgents.size,
      pendingRequests: pendingRequests.size,
    });
  }

  if (url.pathname === "/ws" && req.method === "GET") {
    return handleClientSocket(req);
  }

  if (url.pathname === "/agent" && req.method === "GET") {
    return handleAgentSocket(req);
  }

  if (url.pathname === "/" && req.method === "GET") {
    return json({
      name: "deno-relay",
      ws: "/ws",
      agentWs: "/agent",
      health: "/healthz",
      protocol: {
        clientInbound: {
          type: "prompt",
          prompt: "string",
          sessionId: "optional",
          metadata: {},
        },
        clientOutbound: {
          type: "response|error",
        },
        agentInbound: {
          type: "response|error",
          requestId: "string",
        },
      },
      mockMode: MOCK_MODE,
    });
  }

  return json({ error: "not_found" }, 404);
});

console.log(
  JSON.stringify({
    event: "relay_startup",
    host: HOST,
    port: PORT,
    mockMode: MOCK_MODE,
    deploy: {
      appSlug: Deno.env.get("DENO_DEPLOY_APP_SLUG") ?? null,
      orgSlug: Deno.env.get("DENO_DEPLOY_ORG_SLUG") ?? null,
      revisionId: Deno.env.get("DENO_DEPLOY_REVISION_ID") ?? null,
    },
  }),
);
