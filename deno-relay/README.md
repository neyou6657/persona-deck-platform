# deno-relay

Persona-aware Deno control plane for the multi-persona platform:

- HF Space workers currently default to HTTP polling via `POST /v1/worker/claim`
- workers register the persona ids they can serve
- PostgreSQL is the system of record for personas, conversations, messages, runs, admin sessions,
  and knowledge docs
- Android or web clients use `/v1/...` APIs plus optional `/ws` real-time requests

## Endpoints

- `GET /healthz`
- `GET /` admin web UI
- `GET /api-docs` JSON route summary
- `GET /ws`
- `GET /agent` legacy/optional worker WebSocket route
- `POST /v1/worker/claim`
- `POST /v1/worker/runs/{runId}/response`
- `POST /v1/worker/runs/{runId}/error`
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
- `SKILLS_REPO_URL` GitHub repo used by the admin UI to build the full skills catalog
- `SKILLS_REPO_REF` git ref for the skills catalog source, default `main`
- `SKILLS_REPO_SUBDIR` subdirectory inside the repo that contains skill folders, default `skills`
- `SKILLS_CACHE_DIR` local cache directory for relay-side catalog refresh
- `SKILLS_CATALOG_TTL_MS` cache TTL for catalog refreshes in admin routes, default `30000`

## Worker Protocol

当前 `hf-space-agent` 的默认链路不是常驻 WebSocket，而是 worker polling：

1. worker 定时 `POST /v1/worker/claim`，请求体里带注册信息：

```json
{
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

2. relay 返回三种结果之一：
   - `204 No Content`：当前没活，也没控制消息，worker 稍后继续轮询。
   - `control`：例如要求 worker 应用新的 runtime/config/enabledSkills。
   - `prompt`：分配一个待执行的 run。

control 响应示例：

```json
{
  "type": "control",
  "action": "restart",
  "agentId": "hf-space-coder-v1",
  "restartGeneration": 2,
  "config": {
    "runtime": "responses",
    "model": "gpt-5.3-codex",
    "enabledSkills": ["persona-knowledge"]
  }
}
```

prompt 响应示例：

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

3. worker 完成后回传：
   - 成功：`POST /v1/worker/runs/{runId}/response`
   - 失败：`POST /v1/worker/runs/{runId}/error`

成功回传示例：

```json
{
  "instanceId": "inst-123",
  "conversationId": "uuid",
  "personaId": "coder",
  "reply": "...",
  "responseId": "resp_456",
  "model": "gpt-5.3-codex",
  "usage": {}
}
```

`GET /agent` WebSocket 路由仍然存在，但当前仓库内的 HF worker 默认走 polling；README 终于不再让它强行出演男一号。

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
2. 点击“保存并重启 Agent”后，relay 会为该 worker 准备新的 `control/restart` 配置；worker
   下一次 `POST /v1/worker/claim` 时会先拿到它，其中包含 `enabledSkills`。
3. 管理台里的 skills 多选项来自 relay 侧配置的 GitHub 仓库，也就是 `SKILLS_REPO_URL` +
   `SKILLS_REPO_SUBDIR` 指向的目录。
4. HF Space worker 收到重启配置后，会执行技能同步（从同一套 `SKILLS_REPO_URL` +
   `SKILLS_REPO_SUBDIR` 拉取）。
5. worker 用下发的 `enabledSkills` 过滤仓库中的技能目录，只保留命中的技能到
   `~/.agent/skills`，并兼容映射到 `${CODEX_HOME}/skills`。

注意：

- 如果 `enabledSkills` 为空数组，表示“禁用全部技能”。
- 如果某个 skill 不在仓库里，worker 会忽略它，不会凭空创造。
- 管理台里的 skills 多选项来自 relay 侧配置的技能仓库，不再依赖 worker 在线上报。
- 当前这个主仓库就自带 [`../skills/`](../skills/) 目录；如果 relay 没配 `SKILLS_REPO_*`，管理台就会像断电一样看不到它。

## 自动探测 + 保存重启自动配置（你想要的状态）

当前已经基本支持这条链路：

- 自动探测来源：relay 和 HF worker 共同配置的 `SKILLS_REPO_URL` + `SKILLS_REPO_SUBDIR`
- 探测时机：管理台读取 agent 列表/详情时会从仓库刷新 catalog；worker 启动、以及收到 relay
  的重启控制后会同步启用项
- 管理台操作：选择 `enabledSkills`（多选）-> 保存并重启
- 自动生效：worker 在重启控制里按你选择的列表同步并过滤技能

建议固定一套约定：

- relay 和每个 HF worker
  上统一配置同一套技能仓库（`SKILLS_REPO_URL`、`SKILLS_REPO_REF`、`SKILLS_REPO_SUBDIR`）。
- 在管理台只维护每个 agent 的 `enabledSkills` 选择，不再手填字符串。
- 每次变更选择后都走“保存并重启 Agent”。

## Run

```bash
cd deno-relay
deno task test
deno task check
deno task start
```

Before production startup, apply
[`sql/001_control_plane_pg.sql`](sql/001_control_plane_pg.sql)
to PostgreSQL. KV has retired; it served, it saluted, it went home.
