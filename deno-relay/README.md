# deno-relay

Persona-aware Deno control plane for the multi-persona platform:

- HF Space workers connect outbound over `/agent`
- workers register the persona ids they can serve
- PostgreSQL is the system of record for personas, conversations, messages, runs, admin sessions,
  and knowledge docs
- Android or web clients use `/v1/...` APIs plus optional `/ws` real-time requests

## Endpoints

- `GET /healthz`
- `GET /` admin web UI
- `GET /api-docs` JSON route summary
- `GET /ws`
- `GET /agent`
- `GET /v1/personas`
- `GET /v1/conversations?personaId=...`
- `POST /v1/conversations`
- `POST /v1/conversations/continue-last`
- `GET /v1/conversations/{conversationId}/messages`
- `POST /v1/conversations/{conversationId}/messages`
- `GET /v1/runs/{runId}`
- `POST /v1/admin/login`
- `GET /v1/admin/session`
- `GET /v1/admin/personas`
- `POST /v1/knowledge/search`
- `POST /v1/knowledge/upsert`

## Environment Variables

- `HOST` default `0.0.0.0`
- `PORT` default `8000`
- `DATABASE_URL` required PostgreSQL connection string
- `PGVECTOR_EMBED_DIM` reserved for embedding/vector width coordination
- `AGENT_SHARED_SECRET` fallback worker token with wildcard persona access
- `AGENT_TOOL_SHARED_SECRET` shared secret for knowledge search and writeback routes
- `AGENT_TOKEN_PERSONAS_JSON` optional token map such as `{"secret-a":["coder"],"secret-b":"*"}`
- `AGENT_REQUEST_TIMEOUT_MS` default `90000`
- `PERSONA_CATALOG_JSON` optional persona seed array
- `ADMIN_PASSWORD_HASH` preferred format `pbkdf2_sha256:<iterations>:<salt>:<hex>`; legacy
  `sha256:<hex>` still works for migration only
- `ADMIN_SESSION_SECRET` pepper used to hash admin bearer tokens before persistence
- `ADMIN_SESSION_TTL_HOURS` admin session lifetime, default `24`
- `KNOWLEDGE_SEARCH_LIMIT` default skill search limit
- `KNOWLEDGE_WRITEBACK_MODE` advisory knob for worker/skill behavior, current default is `explicit`

## Worker Protocol

Worker registration:

```json
{
  "type": "agent_register",
  "agentId": "hf-space-coder-v1",
  "instanceId": "inst-123",
  "personaIds": ["coder"],
  "capabilities": {
    "stream": false,
    "tools": false
  },
  "version": "2026-04-18"
}
```

Relay prompt:

```json
{
  "type": "prompt",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "prompt": "Write a release note",
  "sessionId": "optional",
  "continuity": {
    "previousResponseId": "resp_123"
  },
  "metadata": {
    "clientMessageId": "uuid"
  }
}
```

Worker response:

```json
{
  "type": "response",
  "runId": "uuid",
  "conversationId": "uuid",
  "personaId": "coder",
  "reply": "...",
  "responseId": "resp_456",
  "model": "gpt-5.3-codex",
  "usage": {}
}
```

## Client Flow

1. `POST /v1/conversations` or `POST /v1/conversations/continue-last`
2. `POST /v1/conversations/{conversationId}/messages`
3. poll `GET /v1/runs/{runId}`
4. read thread via `GET /v1/conversations/{conversationId}/messages`

Temporary auth uses the `x-user-id` header. Glamorous? No. Effective? Absolutely.

Admin auth is separate. `POST /v1/admin/login` returns a bearer token; all later admin calls use
`Authorization: Bearer <token>`.

Knowledge routes are private to agents/tools. Call them with
`Authorization: Bearer <AGENT_TOOL_SHARED_SECRET>` or `x-knowledge-secret`.

## HF Space Secret Sync

Relay 不会自动回写 HF Space 的环境变量。新增或更新 `workerSecret` 后，请在对应 Space 手动同步：

- `DENO_AGENT_SHARED_SECRET=<workerSecret>`
- `DENO_KNOWLEDGE_SHARED_SECRET=<workerSecret>`

保存 Space 变量并重启 Space 后，新的 worker secret 才会生效。

## Enabled Skills 工作方式

`enabledSkills` 是 relay 控制面下发给 worker 的“技能白名单”配置，生效路径如下：

1. 你在管理台保存 Agent 配置（包含 `enabledSkills`）。
2. 点击“保存并重启 Agent”后，relay 会给该 worker 下发 `control/restart` 消息，消息里包含 `enabledSkills`。
3. HF Space worker 收到重启配置后，会执行技能同步（从 `SKILLS_REPO_URL` + `SKILLS_REPO_SUBDIR` 拉取）。
4. worker 用下发的 `enabledSkills` 过滤仓库中的技能目录，只保留命中的技能到 `${CODEX_HOME}/skills`。

注意：

- 如果 `enabledSkills` 为空数组，表示“这次不强制启用任何技能”。
- 如果某个 skill 不在仓库里，worker 会忽略它，不会凭空创造。
- 可探测技能列表来自 worker 上报的 `capabilities.availableSkills`，管理台会基于这个列表显示多选项。

## 自动探测 + 保存重启自动配置（你想要的状态）

当前已经基本支持这条链路：

- 自动探测来源：HF worker 配置的 `SKILLS_REPO_URL` + `SKILLS_REPO_SUBDIR`
- 探测时机：worker 启动、以及收到 relay 的重启控制后
- 管理台操作：选择 `enabledSkills`（多选）-> 保存并重启
- 自动生效：worker 在重启控制里按你选择的列表同步并过滤技能

建议固定一套约定：

- 在每个 HF worker 上统一配置技能仓库（`SKILLS_REPO_URL`、`SKILLS_REPO_REF`、`SKILLS_REPO_SUBDIR`）。
- 在管理台只维护每个 agent 的 `enabledSkills` 选择，不再手填字符串。
- 每次变更选择后都走“保存并重启 Agent”。

## Run

```bash
cd /workspace/deno-relay
deno task test
deno task check
deno task start
```

Before production startup, apply
[`sql/001_control_plane_pg.sql`](/workspace/.worktrees/rollout-meta/deno-relay/sql/001_control_plane_pg.sql)
to PostgreSQL. KV has retired; it served, it saluted, it went home.
