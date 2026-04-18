# HF Persona Worker Registration And Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `hf-space-agent` so it registers persona identity with Deno, accepts continuity context from Deno, and returns canonical `responseId` values needed for continued conversations.

**Architecture:** Keep FastAPI only as a health/info shell and keep the worker private over outbound WebSocket. Move the worker protocol to explicit registration plus prompt-response handling built around official `AsyncOpenAI` Responses usage.

**Tech Stack:** Python 3.11, FastAPI, websockets, OpenAI Python SDK, `unittest`

---

### Task 1: Define failing worker protocol tests

**Files:**
- Modify: `/workspace/hf-space-agent/tests/test_agent.py`
- Test: `/workspace/hf-space-agent/tests/test_agent.py`

- [ ] **Step 1: Write a failing test for registration payload generation**

```python
async def test_build_registration_message_uses_persona_env(self):
    client = AgentClient.from_env()
    message = client.build_registration_message()
    self.assertEqual(message["type"], "agent_register")
    self.assertEqual(message["personaIds"], ["coder"])
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python3 -m unittest /workspace/hf-space-agent/tests/test_agent.py`
Expected: FAIL because registration helpers do not exist.

- [ ] **Step 3: Add a failing test for continuity passthrough**

```python
async def test_generate_uses_previous_response_id_from_relay_prompt(self):
    result = await client.generate(
        prompt="hello",
        session_id="ignored-legacy",
        metadata={},
        previous_response_id="resp-123",
    )
```

- [ ] **Step 4: Add a failing test for `responseId` on worker reply**

```python
self.assertEqual(result["response_id"], "resp-2")
```

- [ ] **Step 5: Commit red tests**

```bash
git -C /workspace add hf-space-agent/tests/test_agent.py
git -C /workspace commit -m "test: define worker registration and continuity behavior"
```

### Task 2: Implement registration and continuity-aware generation

**Files:**
- Modify: `/workspace/hf-space-agent/agent.py`
- Modify: `/workspace/hf-space-agent/.env.example`
- Modify: `/workspace/hf-space-agent/README.md`
- Test: `/workspace/hf-space-agent/tests/test_agent.py`

- [ ] **Step 1: Add persona registration configuration**

```python
persona_ids = [
    item.strip()
    for item in os.getenv("AGENT_PERSONA_IDS", os.getenv("AGENT_PERSONA_ID", "default")).split(",")
    if item.strip()
]
```

- [ ] **Step 2: Add worker registration message builder**

```python
def build_registration_message(self) -> dict[str, object]:
    return {
        "type": "agent_register",
        "agentId": self.agent_id,
        "instanceId": self.instance_id,
        "personaIds": self.persona_ids,
        "capabilities": {"stream": False, "tools": False},
        "version": self.version,
    }
```

- [ ] **Step 3: Accept continuity from relay prompts and return `response_id`**

```python
response = await self._get_sdk_client().responses.create(
    model=self.model,
    input=prompt,
    previous_response_id=previous_response_id,
    instructions=self.system_prompt,
)

return {
    "reply": reply,
    "response_id": response.id,
}
```

- [ ] **Step 4: Run unit tests**

Run: `python3 -m unittest /workspace/hf-space-agent/tests/test_agent.py`
Expected: PASS

- [ ] **Step 5: Document new env vars**

```env
AGENT_PERSONA_IDS=coder
AGENT_ID=hf-space-coder-v1
```

- [ ] **Step 6: Commit the worker protocol update**

```bash
git -C /workspace add hf-space-agent/agent.py hf-space-agent/.env.example hf-space-agent/README.md hf-space-agent/tests/test_agent.py
git -C /workspace commit -m "feat: add persona registration to hf worker"
```

### Task 3: Wire registration into websocket startup and validate end-to-end protocol

**Files:**
- Modify: `/workspace/hf-space-agent/main.py`
- Modify: `/workspace/hf-space-agent/agent.py`
- Test: `/workspace/hf-space-agent/tests/test_agent.py`

- [ ] **Step 1: Send `agent_register` immediately after websocket connect**

```python
await websocket.send(json.dumps(self.agent_client.build_registration_message()))
```

- [ ] **Step 2: Update prompt handling to read `runId`, `personaId`, and `continuity.previousResponseId`**

```python
previous_response_id = payload.get("continuity", {}).get("previousResponseId")
result = await self.agent_client.generate(
    prompt=prompt.strip(),
    session_id=session_id,
    metadata=metadata,
    previous_response_id=previous_response_id,
)
```

- [ ] **Step 3: Return worker responses using `runId`**

```python
{
    "type": "response",
    "runId": run_id,
    "conversationId": conversation_id,
    "personaId": persona_id,
    "responseId": result["response_id"],
    "reply": result["reply"],
}
```

- [ ] **Step 4: Re-run tests and bytecode compilation**

Run: `python3 -m unittest /workspace/hf-space-agent/tests/test_agent.py && python3 -m py_compile /workspace/hf-space-agent/main.py /workspace/hf-space-agent/agent.py`
Expected: PASS

- [ ] **Step 5: Commit websocket integration**

```bash
git -C /workspace add hf-space-agent/main.py hf-space-agent/agent.py hf-space-agent/tests/test_agent.py
git -C /workspace commit -m "feat: register persona worker with deno relay"
```

