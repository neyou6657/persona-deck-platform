# 多人格 Agent 工作区（persona-deck-platform）

这是一个多人格 Agent 平台的主仓库，当前由三部分组成：

- [`deno-relay`](deno-relay)：控制平面（鉴权、人格路由、会话/消息/运行记录、知识库、管理台）
- [`hf-space-agent`](hf-space-agent)：运行在 Hugging Face Space 的执行 Worker（主动连回 Deno）
- [`android-client`](android-client)：Android 客户端（同步人格、查看会话、发起对话）

一句话拓扑：`Android/Web -> Deno Relay -> HF Space Worker`。

## 当前运行逻辑（2026-04）

1. 客户端只和 `deno-relay` 通信。
2. `deno-relay` 持久化所有核心状态（PostgreSQL）。
3. HF Space 上的 worker 当前默认通过 `POST /v1/worker/claim` 轮询 relay，领取任务并接收重启控制。
4. 知识库走 `deno-relay` 的私有知识接口，不直接暴露给外部。
5. 管理台里的 skills 列表来自当前仓库的 [`skills/`](skills/) 目录，不再依赖 worker 在线上报。
6. HF worker 只负责把你在管理台勾选的 skills 安装到 `~/.agent/skills`，并兼容映射到 `${CODEX_HOME}/skills`。
7. `workerSecret` 不会由 relay 自动回写到 HF；需要你手动改 HF 环境变量。

## 部署流程（按现在的真实链路）

### 1. 部署并初始化 `deno-relay`

1. 准备 PostgreSQL。
2. 执行建表脚本：[`deno-relay/sql/001_control_plane_pg.sql`](deno-relay/sql/001_control_plane_pg.sql)。
3. 配置 `deno-relay` 环境变量（至少包含）：
   - `DATABASE_URL`
   - `ADMIN_PASSWORD_HASH`
   - `ADMIN_SESSION_SECRET`
   - `AGENT_TOOL_SHARED_SECRET`
   - `SKILLS_REPO_URL=https://github.com/neyou6657/persona-deck-platform`
   - `SKILLS_REPO_REF=main`
   - `SKILLS_REPO_SUBDIR=skills`
4. 启动：

```bash
cd deno-relay
deno task test
deno task check
deno task start
```

说明：完整变量请看 [`deno-relay/.env.example`](deno-relay/.env.example)。

### 2. 在管理台创建人格与 Agent 配置

1. 打开 `https://你的-relay-域名/` 登录管理台。
2. 创建或编辑人格（persona）。
3. 在 Agent 控制里填写：
   - `agentId`
   - `runtime` / `apiKind`
   - `model` / `apiBaseUrl` / `apiKey`
   - `workerSecret`（可在页面生成）
   - `spaceRepoId`（建议填，方便管理）
4. 保存并重启 Agent 配置。

### 3. 部署 HF Space Worker

在 HF Space（Docker SDK）配置至少以下环境变量：

- `DENO_AGENT_WS_URL=wss://你的-relay-域名/agent`（变量名沿用旧名，但当前 worker 会据此推导 HTTP relay base URL，并轮询 `/v1/worker/claim`）
- `DENO_AGENT_SHARED_SECRET=<与管理台 workerSecret 一致>`
- `DENO_KNOWLEDGE_BASE_URL=https://你的-relay-域名`
- `DENO_KNOWLEDGE_SHARED_SECRET=<与管理台 workerSecret 一致或你的知识密钥策略值>`
- `AGENT_ID=<例如 hf-space-coder-v1>`
- `AGENT_PERSONA_IDS=<例如 coder>`
- `AGENT_RUNTIME=<responses|codex_cli|opencode_cli>`
- `AGENT_MODEL=<你的模型名>`
- `AGENT_API_BASE_URL=<你的模型网关地址>`
- `AGENT_API_KEY=<你的密钥>`
- `SKILLS_REPO_URL=https://github.com/neyou6657/persona-deck-platform`
- `SKILLS_REPO_REF=main`
- `SKILLS_REPO_SUBDIR=skills`
- `AGENT_SKILLS_DIR=/root/.agent/skills`

然后重启 Space。

### 4. 手动同步 Secret（重点）

当你在管理台更新了 `workerSecret`，需要手动去 HF Space 更新：

- `DENO_AGENT_SHARED_SECRET`
- `DENO_KNOWLEDGE_SHARED_SECRET`

不手动改的话，worker 会继续拿旧 secret 连，结果就是“我觉得我改了，但它觉得没改”。

### 5. 验证联通

- `GET /healthz` 看服务状态。
- 管理台里确认 skills 多选框能看到仓库里的 skill slug，而不是“等 worker 上报”。
- 管理台里确认对应 persona/agent 显示在线。
- 如果要核对技能是否真启用，优先看 relay 控制面里的 worker 注册状态，不要只盯 `/healthz.skills_sync` 这个启动快照。
- 客户端同步人格后发起对话，确认 run 能完成。

## Skills 真实链路

这部分是现在最容易把人绕进去的地方，直接说人话：

1. GitHub 仓库 [`skills/`](skills/) 目录是“技能全集”的来源。
2. `deno-relay` 读取 `SKILLS_REPO_URL` + `SKILLS_REPO_SUBDIR`，给管理台显示全量 skills 列表。
3. 你在管理台勾选 `enabledSkills` 后点击“保存并重启 Agent”。
4. HF worker 下一次轮询拿到 `control/restart` 后，会从同一个 GitHub 仓库拉取技能，只把勾选的技能装到 `~/.agent/skills`。
5. 如果 `enabledSkills` 为空数组，语义是“禁用全部 skills”，不是“默认全开”。

所以如果你问“仓库下面难道没有 `skills` 目录吗”，答案是：有，而且现在控制台就是按这个目录读的。

## 仓库说明

- `deno-relay` 详细说明：[`deno-relay/README.md`](deno-relay/README.md)
- `hf-space-agent` 详细说明：[`hf-space-agent/README.md`](hf-space-agent/README.md)
- Android 客户端基础：[`android-client/`](android-client)

## 安全提醒

- 不要把任何生产密钥提交到 git。
- 运行期密钥放在 Deno Deploy / Hugging Face Secrets / GitHub Secrets。
- 如果你把密钥传上去了，建议默认按“已泄漏”处理并立刻轮换。
