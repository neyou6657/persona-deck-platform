export type ApiDocsPayload = {
  name: string;
  adminUi: string;
  docs: string;
  publicApis: string[];
  sockets: {
    client: string;
    agent: string;
  };
};

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function buildApiDocsPayload(): ApiDocsPayload {
  return {
    name: "deno-relay-control-plane",
    adminUi: "/",
    docs: "/api-docs",
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
  };
}

export function renderAdminPage(): Response {
  return html(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Persona Deck Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f0e8;
        --panel: rgba(255, 250, 244, 0.96);
        --panel-strong: #fffdf9;
        --line: #d6c6af;
        --text: #271f18;
        --muted: #68594b;
        --accent: #cf5f3a;
        --accent-deep: #9f4024;
        --ok: #0d7c49;
        --danger: #a3332b;
        --shadow: 0 18px 48px rgba(63, 33, 12, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(207, 95, 58, 0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(200, 165, 81, 0.18), transparent 24%),
          linear-gradient(180deg, #f7f1e8 0%, #f1e8dd 100%);
      }
      a { color: var(--accent-deep); }
      .shell {
        width: min(1180px, calc(100% - 32px));
        margin: 32px auto 48px;
      }
      .hero {
        display: grid;
        gap: 14px;
        padding: 28px;
        border: 1px solid rgba(159, 64, 36, 0.14);
        border-radius: 28px;
        background: rgba(255, 251, 246, 0.86);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }
      .eyebrow {
        display: inline-flex;
        width: fit-content;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(207, 95, 58, 0.12);
        color: var(--accent-deep);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(30px, 5vw, 52px);
        line-height: 0.94;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .grid {
        display: grid;
        gap: 18px;
        margin-top: 22px;
      }
      @media (min-width: 980px) {
        .grid {
          grid-template-columns: 320px minmax(0, 1fr);
        }
      }
      .panel {
        border: 1px solid rgba(159, 64, 36, 0.12);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }
      .panel-body {
        padding: 22px;
      }
      .section-title {
        margin: 0 0 16px;
        font-size: 18px;
        font-weight: 700;
      }
      .stack {
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
      }
      input, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        font: inherit;
        color: var(--text);
        background: var(--panel-strong);
      }
      textarea {
        min-height: 118px;
        resize: vertical;
      }
      button {
        appearance: none;
        border: none;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--accent), var(--accent-deep));
        cursor: pointer;
      }
      button.secondary {
        color: var(--text);
        background: #efe3d2;
      }
      button.ghost {
        color: var(--accent-deep);
        background: rgba(207, 95, 58, 0.1);
      }
      button.danger {
        background: linear-gradient(135deg, #d15449, var(--danger));
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .between {
        justify-content: space-between;
      }
      .hint {
        font-size: 13px;
        color: var(--muted);
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 14px;
        background: rgba(39, 31, 24, 0.06);
      }
      .status.ok { color: var(--ok); background: rgba(13, 124, 73, 0.12); }
      .status.error { color: var(--danger); background: rgba(163, 51, 43, 0.12); }
      .persona-list, .knowledge-list {
        display: grid;
        gap: 10px;
      }
      .persona-item, .knowledge-item {
        border: 1px solid rgba(159, 64, 36, 0.12);
        border-radius: 18px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.72);
      }
      .persona-item.active {
        border-color: rgba(207, 95, 58, 0.5);
        box-shadow: inset 0 0 0 1px rgba(207, 95, 58, 0.14);
      }
      .persona-meta, .knowledge-meta {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--muted);
      }
      .empty {
        padding: 18px;
        border: 1px dashed rgba(159, 64, 36, 0.22);
        border-radius: 18px;
        color: var(--muted);
        text-align: center;
      }
      .hidden { display: none !important; }
      .login-panel {
        max-width: 480px;
        margin-top: 22px;
      }
      .shell-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(39, 31, 24, 0.06);
        color: var(--muted);
        font-size: 12px;
      }
      .badge.enabled { color: var(--ok); background: rgba(13, 124, 73, 0.12); }
      .badge.disabled { color: var(--danger); background: rgba(163, 51, 43, 0.12); }
      .two-up {
        display: grid;
        gap: 18px;
      }
      @media (min-width: 900px) {
        .two-up {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="eyebrow">Persona Deck Control Plane</span>
        <div class="row between">
          <div class="stack">
            <h1>输入管理密码，别再让首页吐 JSON 了。</h1>
            <p>这里直接接 Deno 上现成的管理接口，登录后可以管理人格、启停状态和知识库文档。</p>
          </div>
          <div class="shell-actions">
            <a class="badge" href="/api-docs" target="_blank" rel="noreferrer">API Docs</a>
            <span class="badge" id="sessionBadge">未登录</span>
          </div>
        </div>
      </section>

      <section id="loginPanel" class="panel login-panel">
        <div class="panel-body stack">
          <h2 class="section-title">管理登录</h2>
          <label>
            管理密码
            <input id="passwordInput" type="password" autocomplete="current-password" placeholder="输入管理密码" />
          </label>
          <div class="row">
            <button id="loginButton" type="button">登录管理台</button>
            <span class="hint">登录后 token 会只保存在当前浏览器。</span>
          </div>
          <div id="status" class="status">等你输入管理密码，后台已经把活准备好了。</div>
        </div>
      </section>

      <section id="appShell" class="grid hidden">
        <aside class="panel">
          <div class="panel-body stack">
            <div class="row between">
              <h2 class="section-title">人格列表</h2>
              <button id="logoutButton" class="secondary" type="button">退出</button>
            </div>
            <div class="row">
              <button id="refreshButton" class="ghost" type="button">刷新</button>
              <button id="newPersonaButton" class="secondary" type="button">新建人格</button>
            </div>
            <div id="personaList" class="persona-list">
              <div class="empty">还没有人格，或者你还没登录成功。</div>
            </div>
          </div>
        </aside>

        <section class="stack">
          <div class="panel">
            <div class="panel-body stack">
              <div class="row between">
                <h2 class="section-title">Agent 控制</h2>
                <span class="hint">这里直接控模型、端点、密钥、激活 skills，然后一键重启。</span>
              </div>
              <div id="agentList" class="persona-list">
                <div class="empty">还没有 agent 配置。等 worker 连上来，或者你先手动建一个。</div>
              </div>
              <div class="two-up">
                <label>
                  Agent ID
                  <input id="agentIdInput" type="text" placeholder="例如 hf-space-coder-v1" />
                </label>
                <label>
                  Runtime
                  <input id="agentRuntimeInput" type="text" placeholder="codex_cli、responses 或 opencode_cli" />
                </label>
              </div>
              <div class="two-up">
                <label>
                  API 格式
                  <input id="agentApiKindInput" type="text" placeholder="responses 或 chat_completions" />
                </label>
              </div>
              <div class="two-up">
                <label>
                  Model
                  <input id="agentModelInput" type="text" placeholder="例如 gpt-5.4" />
                </label>
                <label>
                  Endpoint
                  <input id="agentEndpointInput" type="text" placeholder="https://your-endpoint/v1" />
                </label>
              </div>
              <div class="two-up">
                <label>
                  API Key
                  <input id="agentApiKeyInput" type="password" placeholder="sk-..." />
                </label>
                <label>
                  Temperature
                  <input id="agentTemperatureInput" type="number" min="0" max="2" step="0.1" placeholder="0.2" />
                </label>
              </div>
              <label class="row">
                <input id="agentStoreInput" type="checkbox" checked />
                <span>Store responses</span>
              </label>
              <label>
                System Prompt
                <textarea id="agentSystemPromptInput" placeholder="给 agent 的系统提示词"></textarea>
              </label>
              <label>
                Enabled Skills
                <textarea id="agentSkillsInput" placeholder="每行一个 skill slug，例如&#10;restart&#10;project-audit"></textarea>
              </label>
              <div id="agentAvailableSkills" class="hint">当前还没有上报可用 skills。</div>
              <div id="agentInstancesHint" class="hint">当前还没有观测到这个 agent 的实例。</div>
              <div class="row">
                <button id="saveAgentButton" type="button">保存 Agent 配置</button>
                <button id="restartAgentButton" class="danger" type="button">保存并重启 Agent</button>
                <button id="newAgentButton" class="secondary" type="button">新建 Agent 草稿</button>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-body stack">
              <div class="row between">
                <h2 class="section-title">人格编辑</h2>
                <span class="hint">支持创建新人格，也支持更新已选人格。</span>
              </div>
              <div class="two-up">
                <label>
                  Persona ID
                  <input id="personaIdInput" type="text" placeholder="例如 coder" />
                </label>
                <label>
                  Display Name
                  <input id="displayNameInput" type="text" placeholder="例如 Code Sensei" />
                </label>
              </div>
              <label>
                Description
                <textarea id="descriptionInput" placeholder="这位数字人格是干什么的"></textarea>
              </label>
              <label>
                Metadata JSON
                <textarea id="metadataInput" placeholder='{"style":"direct"}'></textarea>
              </label>
              <label class="row">
                <input id="enabledInput" type="checkbox" checked />
                <span>Enabled</span>
              </label>
              <div class="row">
                <button id="savePersonaButton" type="button">保存人格</button>
                <span class="hint">如果改了 Persona ID，就会按新人格创建；没改就更新当前人格。</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-body stack">
              <div class="row between">
                <h2 class="section-title">知识库</h2>
                <span class="hint" id="knowledgeHint">先选一个人格，再往里面塞知识。</span>
              </div>
              <div id="knowledgeList" class="knowledge-list">
                <div class="empty">选择一个人格后，这里会显示知识文档。</div>
              </div>
              <label>
                Title
                <input id="docTitleInput" type="text" placeholder="例如 项目约束" />
              </label>
              <label>
                Source
                <input id="docSourceInput" type="text" placeholder="例如 admin-ui/manual" />
              </label>
              <label>
                Body
                <textarea id="docBodyInput" placeholder="输入知识正文"></textarea>
              </label>
              <label>
                Metadata JSON
                <textarea id="docMetadataInput" placeholder='{"scope":"ops"}'></textarea>
              </label>
              <div class="row">
                <button id="saveKnowledgeButton" type="button">添加知识</button>
                <span class="hint">这里只做新增/覆盖，删除在文档卡片上点。</span>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>

    <script type="module">
      const state = {
        token: localStorage.getItem("personaDeckAdminToken") || "",
        selectedPersonaId: "",
        personas: [],
        selectedAgentId: "",
        agentConfigs: [],
        agentInstances: [],
      };

      const statusEl = document.getElementById("status");
      const loginPanelEl = document.getElementById("loginPanel");
      const appShellEl = document.getElementById("appShell");
      const sessionBadgeEl = document.getElementById("sessionBadge");
      const passwordInputEl = document.getElementById("passwordInput");
      const loginButtonEl = document.getElementById("loginButton");
      const logoutButtonEl = document.getElementById("logoutButton");
      const refreshButtonEl = document.getElementById("refreshButton");
      const newPersonaButtonEl = document.getElementById("newPersonaButton");
      const personaListEl = document.getElementById("personaList");
      const agentListEl = document.getElementById("agentList");
      const knowledgeListEl = document.getElementById("knowledgeList");
      const knowledgeHintEl = document.getElementById("knowledgeHint");
      const agentIdInputEl = document.getElementById("agentIdInput");
      const agentRuntimeInputEl = document.getElementById("agentRuntimeInput");
      const agentApiKindInputEl = document.getElementById("agentApiKindInput");
      const agentModelInputEl = document.getElementById("agentModelInput");
      const agentEndpointInputEl = document.getElementById("agentEndpointInput");
      const agentApiKeyInputEl = document.getElementById("agentApiKeyInput");
      const agentTemperatureInputEl = document.getElementById("agentTemperatureInput");
      const agentStoreInputEl = document.getElementById("agentStoreInput");
      const agentSystemPromptInputEl = document.getElementById("agentSystemPromptInput");
      const agentSkillsInputEl = document.getElementById("agentSkillsInput");
      const agentAvailableSkillsEl = document.getElementById("agentAvailableSkills");
      const agentInstancesHintEl = document.getElementById("agentInstancesHint");
      const saveAgentButtonEl = document.getElementById("saveAgentButton");
      const restartAgentButtonEl = document.getElementById("restartAgentButton");
      const newAgentButtonEl = document.getElementById("newAgentButton");
      const personaIdInputEl = document.getElementById("personaIdInput");
      const displayNameInputEl = document.getElementById("displayNameInput");
      const descriptionInputEl = document.getElementById("descriptionInput");
      const metadataInputEl = document.getElementById("metadataInput");
      const enabledInputEl = document.getElementById("enabledInput");
      const savePersonaButtonEl = document.getElementById("savePersonaButton");
      const docTitleInputEl = document.getElementById("docTitleInput");
      const docSourceInputEl = document.getElementById("docSourceInput");
      const docBodyInputEl = document.getElementById("docBodyInput");
      const docMetadataInputEl = document.getElementById("docMetadataInput");
      const saveKnowledgeButtonEl = document.getElementById("saveKnowledgeButton");

      function setStatus(message, tone = "") {
        statusEl.textContent = message;
        statusEl.className = tone ? "status " + tone : "status";
      }

      function setLoggedInUi(loggedIn) {
        loginPanelEl.classList.toggle("hidden", loggedIn);
        appShellEl.classList.toggle("hidden", !loggedIn);
        sessionBadgeEl.textContent = loggedIn ? "已登录" : "未登录";
        sessionBadgeEl.className = loggedIn ? "badge enabled" : "badge";
      }

      function parseJsonInput(value, fallback) {
        const trimmed = value.trim();
        if (!trimmed) {
          return fallback;
        }
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("JSON 必须是对象");
        }
        return parsed;
      }

      function normalizeObjectish(value, fallback = {}) {
        if (!value) {
          return fallback;
        }
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            return fallback;
          }
          return fallback;
        }
        if (typeof value === "object" && !Array.isArray(value)) {
          return value;
        }
        return fallback;
      }

      function defaultApiKindForRuntime(runtime) {
        return String(runtime || "").trim().toLowerCase() === "opencode_cli"
          ? "chat_completions"
          : "responses";
      }

      async function api(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (!headers.has("content-type") && options.body) {
          headers.set("content-type", "application/json");
        }
        if (state.token) {
          headers.set("authorization", "Bearer " + state.token);
        }
        const response = await fetch(path, { ...options, headers });
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json() : await response.text();
        if (!response.ok) {
          const errorMessage = typeof payload === "object" && payload && "message" in payload
            ? payload.message
            : response.status + " " + response.statusText;
          throw new Error(String(errorMessage));
        }
        return payload;
      }

      function renderPersonaList(personas) {
        if (!personas.length) {
          personaListEl.innerHTML = '<div class="empty">还没有人格。先建一个，别让面板显得像荒地。</div>';
          return;
        }
        personaListEl.innerHTML = personas.map((persona) => {
          const active = persona.personaId === state.selectedPersonaId ? " active" : "";
          const enabledClass = persona.enabled ? "enabled" : "disabled";
          const enabledLabel = persona.enabled ? "Enabled" : "Disabled";
          const description = persona.description ? persona.description : "没有描述，神秘得很。";
          return '<article class="persona-item' + active + '">' +
            '<div class="row between">' +
              '<strong>' + escapeHtml(persona.displayName || persona.personaId) + '</strong>' +
              '<span class="badge ' + enabledClass + '">' + enabledLabel + '</span>' +
            '</div>' +
            '<span class="persona-meta">' + escapeHtml(persona.personaId) + '</span>' +
            '<p>' + escapeHtml(description) + '</p>' +
            '<div class="row">' +
              '<button type="button" data-persona-select="' + escapeAttribute(persona.personaId) + '">打开</button>' +
            '</div>' +
          '</article>';
        }).join("");
      }

      function buildAgentRows() {
        const rows = new Map();
        state.agentInstances.forEach((instance) => {
          const current = rows.get(instance.agentId) || { agentId: instance.agentId, config: null, instances: [] };
          current.instances.push(instance);
          rows.set(instance.agentId, current);
        });
        state.agentConfigs.forEach((config) => {
          const current = rows.get(config.agentId) || { agentId: config.agentId, config: null, instances: [] };
          current.config = config;
          rows.set(config.agentId, current);
        });
        return Array.from(rows.values()).sort((left, right) => left.agentId.localeCompare(right.agentId));
      }

      function renderAgentList() {
        const rows = buildAgentRows();
        if (!rows.length) {
          agentListEl.innerHTML = '<div class="empty">还没有 agent 配置。等 worker 连上来，或者你先手动建一个。</div>';
          return;
        }
        agentListEl.innerHTML = rows.map((row) => {
          const active = row.agentId === state.selectedAgentId ? " active" : "";
          const onlineCount = row.instances.filter((item) => item.status === "online").length;
          const observedModel = row.instances[0]?.capabilities?.model || row.config?.model || "未配置";
          const enabledSkills = Array.isArray(row.config?.enabledSkills) ? row.config.enabledSkills.length : 0;
          return '<article class="persona-item' + active + '">' +
            '<div class="row between">' +
              '<strong>' + escapeHtml(row.agentId) + '</strong>' +
              '<span class="badge ' + (onlineCount ? "enabled" : "disabled") + '">' +
                (onlineCount ? ('Online x' + onlineCount) : 'Offline') +
              '</span>' +
            '</div>' +
            '<span class="persona-meta">Model: ' + escapeHtml(observedModel) + '</span>' +
            '<p>已配置 skills：' + enabledSkills + ' 个。别让 agent 裸奔。</p>' +
            '<div class="row">' +
              '<button type="button" data-agent-select="' + escapeAttribute(row.agentId) + '">打开</button>' +
            '</div>' +
          '</article>';
        }).join("");
      }

      function renderKnowledgeList(docs) {
        if (!docs.length) {
          knowledgeListEl.innerHTML = '<div class="empty">这个人格还没有知识文档。</div>';
          return;
        }
        knowledgeListEl.innerHTML = docs.map((doc) => {
          const preview = (doc.body || "").replace(/\\s+/g, " ").trim().slice(0, 180) || "空文档，属实离谱。";
          return '<article class="knowledge-item">' +
            '<strong>' + escapeHtml(doc.title) + '</strong>' +
            '<span class="knowledge-meta">' + escapeHtml(doc.source) + '</span>' +
            '<p>' + escapeHtml(preview) + '</p>' +
            '<div class="row">' +
              '<button class="danger" type="button" data-doc-delete="' + escapeAttribute(doc.docId) + '">删除</button>' +
            '</div>' +
          '</article>';
        }).join("");
      }

      function resetPersonaForm() {
        state.selectedPersonaId = "";
        personaIdInputEl.value = "";
        displayNameInputEl.value = "";
        descriptionInputEl.value = "";
        metadataInputEl.value = "{}";
        enabledInputEl.checked = true;
        knowledgeHintEl.textContent = "先保存这个人格，再往里面塞知识。";
        knowledgeListEl.innerHTML = '<div class="empty">新人格还没有知识文档。</div>';
      }

      function resetAgentForm() {
        state.selectedAgentId = "";
        agentIdInputEl.value = "";
        agentRuntimeInputEl.value = "codex_cli";
        agentApiKindInputEl.value = "responses";
        agentModelInputEl.value = "";
        agentEndpointInputEl.value = "";
        agentApiKeyInputEl.value = "";
        agentTemperatureInputEl.value = "0.2";
        agentStoreInputEl.checked = true;
        agentSystemPromptInputEl.value = "";
        agentSkillsInputEl.value = "";
        agentAvailableSkillsEl.textContent = "当前还没有上报可用 skills。";
        agentInstancesHintEl.textContent = "当前还没有观测到这个 agent 的实例。";
      }

      function resetKnowledgeForm() {
        docTitleInputEl.value = "";
        docSourceInputEl.value = "";
        docBodyInputEl.value = "";
        docMetadataInputEl.value = "{}";
      }

      async function loadPersonas(preserveSelection = true) {
        const payload = await api("/v1/admin/personas");
        const personas = Array.isArray(payload.personas) ? payload.personas : [];
        state.personas = personas;
        if (!preserveSelection || !personas.some((item) => item.personaId === state.selectedPersonaId)) {
          state.selectedPersonaId = personas[0]?.personaId || "";
        }
        renderPersonaList(personas);
        if (state.selectedPersonaId) {
          await loadPersonaDetail(state.selectedPersonaId);
        } else {
          resetPersonaForm();
        }
      }

      async function loadAgents(preserveSelection = true) {
        const payload = await api("/v1/admin/agents");
        state.agentConfigs = Array.isArray(payload.agentConfigs) ? payload.agentConfigs : [];
        state.agentInstances = Array.isArray(payload.agentInstances) ? payload.agentInstances : [];
        const rows = buildAgentRows();
        if (!preserveSelection || !rows.some((item) => item.agentId === state.selectedAgentId)) {
          state.selectedAgentId = rows[0]?.agentId || "";
        }
        renderAgentList();
        if (state.selectedAgentId) {
          await loadAgentDetail(state.selectedAgentId);
        } else {
          resetAgentForm();
        }
      }

      async function loadPersonaDetail(personaId) {
        const payload = await api("/v1/admin/personas/" + encodeURIComponent(personaId));
        const persona = payload.persona;
        const knowledge = Array.isArray(payload.knowledge) ? payload.knowledge : [];
        state.selectedPersonaId = persona.personaId;
        personaIdInputEl.value = persona.personaId || "";
        displayNameInputEl.value = persona.displayName || "";
        descriptionInputEl.value = persona.description || "";
        metadataInputEl.value = JSON.stringify(normalizeObjectish(persona.metadata), null, 2);
        enabledInputEl.checked = Boolean(persona.enabled);
        knowledgeHintEl.textContent = "当前人格：" + persona.personaId;
        renderKnowledgeList(knowledge);
        renderPersonaList(state.personas);
      }

      async function loadAgentDetail(agentId) {
        const payload = await api("/v1/admin/agents/" + encodeURIComponent(agentId));
        const config = payload.config;
        const instances = Array.isArray(payload.instances) ? payload.instances : [];
        state.selectedAgentId = config.agentId;
        agentIdInputEl.value = config.agentId || "";
        agentRuntimeInputEl.value = config.runtime || "codex_cli";
        agentApiKindInputEl.value = config.apiKind || defaultApiKindForRuntime(config.runtime);
        agentModelInputEl.value = config.model || "";
        agentEndpointInputEl.value = config.apiBaseUrl || "";
        agentApiKeyInputEl.value = config.apiKey || "";
        agentTemperatureInputEl.value = String(config.temperature ?? 0.2);
        agentStoreInputEl.checked = Boolean(config.store);
        agentSystemPromptInputEl.value = config.systemPrompt || "";
        agentSkillsInputEl.value = Array.isArray(config.enabledSkills) ? config.enabledSkills.join("\\n") : "";
        const availableSkills = Array.from(new Set(instances.flatMap((instance) => Array.isArray(instance.capabilities?.availableSkills)
          ? instance.capabilities.availableSkills
          : [])));
        agentAvailableSkillsEl.textContent = availableSkills.length
          ? ("可用 skills: " + availableSkills.join(", "))
          : "当前 worker 还没上报可用 skills。";
        agentInstancesHintEl.textContent = instances.length
          ? instances.map((item) => item.instanceId + " / " + item.status).join(" ; ")
          : "当前还没有观测到这个 agent 的实例。";
        renderAgentList();
      }

      async function login() {
        const password = passwordInputEl.value.trim();
        if (!password) {
          setStatus("先输入管理密码。", "error");
          return;
        }
        loginButtonEl.disabled = true;
        setStatus("登录中，别眨眼。");
        try {
          const payload = await api("/v1/admin/login", {
            method: "POST",
            body: JSON.stringify({ password }),
          });
          state.token = payload.token;
          localStorage.setItem("personaDeckAdminToken", state.token);
          setLoggedInUi(true);
          setStatus("登录成功，管理台已经接管。", "ok");
          passwordInputEl.value = "";
          resetAgentForm();
          resetKnowledgeForm();
          await Promise.all([loadAgents(false), loadPersonas(false)]);
        } catch (error) {
          setStatus(error.message || "登录失败", "error");
        } finally {
          loginButtonEl.disabled = false;
        }
      }

      async function logout() {
        try {
          if (state.token) {
            await api("/v1/admin/logout", { method: "POST" });
          }
        } catch {
        } finally {
          state.token = "";
          state.selectedPersonaId = "";
          localStorage.removeItem("personaDeckAdminToken");
          setLoggedInUi(false);
          setStatus("已退出。现在首页又是文明世界了。");
          resetAgentForm();
          resetPersonaForm();
          resetKnowledgeForm();
        }
      }

      async function saveAgentConfig() {
        const agentId = agentIdInputEl.value.trim();
        if (!agentId) {
          setStatus("Agent ID 不能为空。", "error");
          return null;
        }
        saveAgentButtonEl.disabled = true;
        restartAgentButtonEl.disabled = true;
        try {
          const payload = {
            agentId,
            runtime: agentRuntimeInputEl.value.trim() || "codex_cli",
            apiKind: agentApiKindInputEl.value.trim() ||
              defaultApiKindForRuntime(agentRuntimeInputEl.value),
            model: agentModelInputEl.value.trim(),
            apiBaseUrl: agentEndpointInputEl.value.trim(),
            apiKey: agentApiKeyInputEl.value,
            temperature: Number(agentTemperatureInputEl.value || "0.2"),
            store: agentStoreInputEl.checked,
            systemPrompt: agentSystemPromptInputEl.value,
            enabledSkills: agentSkillsInputEl.value.split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean),
          };
          const hasPersistedConfig = state.agentConfigs.some((item) => item.agentId === agentId);
          if (state.selectedAgentId && state.selectedAgentId === agentId && hasPersistedConfig) {
            await api("/v1/admin/agents/" + encodeURIComponent(agentId), {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
          } else {
            await api("/v1/admin/agents", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          state.selectedAgentId = agentId;
          setStatus("Agent 配置已保存。", "ok");
          await loadAgents(true);
          return agentId;
        } catch (error) {
          setStatus(error.message || "保存 Agent 配置失败", "error");
          return null;
        } finally {
          saveAgentButtonEl.disabled = false;
          restartAgentButtonEl.disabled = false;
        }
      }

      async function restartAgentConfig() {
        const agentId = await saveAgentConfig();
        if (!agentId) {
          return;
        }
        restartAgentButtonEl.disabled = true;
        try {
          await api("/v1/admin/agents/" + encodeURIComponent(agentId) + "/restart", {
            method: "POST",
          });
          setStatus("Agent 已要求重启。剩下的交给它自己，不用你去 Space 里搬砖。", "ok");
          await loadAgents(true);
        } catch (error) {
          setStatus(error.message || "重启 Agent 失败", "error");
        } finally {
          restartAgentButtonEl.disabled = false;
        }
      }

      async function savePersona() {
        const personaId = personaIdInputEl.value.trim();
        if (!personaId) {
          setStatus("Persona ID 不能为空。", "error");
          return;
        }
        savePersonaButtonEl.disabled = true;
        try {
          const metadata = parseJsonInput(metadataInputEl.value, {});
          const payload = {
            personaId,
            displayName: displayNameInputEl.value.trim(),
            description: descriptionInputEl.value.trim(),
            enabled: enabledInputEl.checked,
            metadata,
          };
          if (state.selectedPersonaId && state.selectedPersonaId === personaId) {
            await api("/v1/admin/personas/" + encodeURIComponent(personaId), {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
            setStatus("人格已更新。", "ok");
          } else {
            await api("/v1/admin/personas", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            setStatus("人格已创建。", "ok");
          }
          state.selectedPersonaId = personaId;
          await loadPersonas(true);
        } catch (error) {
          setStatus(error.message || "保存人格失败", "error");
        } finally {
          savePersonaButtonEl.disabled = false;
        }
      }

      async function saveKnowledge() {
        const personaId = state.selectedPersonaId || personaIdInputEl.value.trim();
        if (!personaId) {
          setStatus("先选或先保存一个人格。", "error");
          return;
        }
        const title = docTitleInputEl.value.trim();
        const source = docSourceInputEl.value.trim();
        const body = docBodyInputEl.value.trim();
        if (!title || !source || !body) {
          setStatus("知识文档需要 title、source、body。", "error");
          return;
        }
        saveKnowledgeButtonEl.disabled = true;
        try {
          const metadata = parseJsonInput(docMetadataInputEl.value, {});
          await api("/v1/admin/personas/" + encodeURIComponent(personaId) + "/knowledge", {
            method: "POST",
            body: JSON.stringify({ title, source, body, metadata }),
          });
          setStatus("知识文档已写入。", "ok");
          resetKnowledgeForm();
          await loadPersonaDetail(personaId);
        } catch (error) {
          setStatus(error.message || "保存知识失败", "error");
        } finally {
          saveKnowledgeButtonEl.disabled = false;
        }
      }

      async function deleteKnowledge(docId) {
        if (!state.selectedPersonaId) {
          return;
        }
        setStatus("删除知识文档中。");
        try {
          await api(
            "/v1/admin/personas/" + encodeURIComponent(state.selectedPersonaId) + "/knowledge/" + encodeURIComponent(docId),
            { method: "DELETE" },
          );
          setStatus("知识文档已删除。", "ok");
          await loadPersonaDetail(state.selectedPersonaId);
        } catch (error) {
          setStatus(error.message || "删除知识失败", "error");
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function escapeAttribute(value) {
        return escapeHtml(value).replaceAll(String.fromCharCode(96), "&#96;");
      }

      document.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const personaId = target.getAttribute("data-persona-select");
        if (personaId) {
          await loadPersonaDetail(personaId);
          return;
        }
        const agentId = target.getAttribute("data-agent-select");
        if (agentId) {
          await loadAgentDetail(agentId);
          return;
        }
        const docId = target.getAttribute("data-doc-delete");
        if (docId) {
          await deleteKnowledge(docId);
        }
      });

      loginButtonEl.addEventListener("click", login);
      logoutButtonEl.addEventListener("click", logout);
      refreshButtonEl.addEventListener("click", async () => {
        try {
          await Promise.all([loadAgents(true), loadPersonas(true)]);
          setStatus("列表已刷新。", "ok");
        } catch (error) {
          setStatus(error.message || "刷新失败", "error");
        }
      });
      newAgentButtonEl.addEventListener("click", () => {
        resetAgentForm();
        renderAgentList();
        setStatus("新 Agent 草稿已就位。", "ok");
      });
      agentRuntimeInputEl.addEventListener("change", () => {
        const nextApiKind = defaultApiKindForRuntime(agentRuntimeInputEl.value);
        const currentApiKind = agentApiKindInputEl.value.trim();
        if (!currentApiKind || currentApiKind === "responses" || currentApiKind === "chat_completions") {
          agentApiKindInputEl.value = nextApiKind;
        }
      });
      saveAgentButtonEl.addEventListener("click", async () => {
        await saveAgentConfig();
      });
      restartAgentButtonEl.addEventListener("click", restartAgentConfig);
      newPersonaButtonEl.addEventListener("click", () => {
        resetPersonaForm();
        renderPersonaList(state.personas);
        setStatus("新人格草稿已就位。", "ok");
      });
      savePersonaButtonEl.addEventListener("click", savePersona);
      saveKnowledgeButtonEl.addEventListener("click", saveKnowledge);
      passwordInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          login();
        }
      });

      async function bootstrap() {
        metadataInputEl.value = "{}";
        docMetadataInputEl.value = "{}";
        if (!state.token) {
          setLoggedInUi(false);
          return;
        }
        try {
          await api("/v1/admin/session");
          setLoggedInUi(true);
          setStatus("已恢复上次会话。", "ok");
          await Promise.all([loadAgents(false), loadPersonas(false)]);
        } catch {
          await logout();
        }
      }

      bootstrap();
    </script>
  </body>
</html>`);
}
