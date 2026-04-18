# Deno Relay + HF Space Agent

This workspace now contains a two-part scaffold:

- [`deno-relay`](/workspace/deno-relay): a Deno WebSocket relay that accepts client prompts and forwards them to a Hugging Face Space API.
- [`hf-space-agent`](/workspace/hf-space-agent): a Docker-ready Hugging Face Space app that shows an intro page at `/` and exposes `POST /api/agent`.

## Request Flow

1. Client opens a WebSocket connection to the Deno relay at `/ws`.
2. Client sends:

```json
{
  "type": "prompt",
  "prompt": "Write a short project summary",
  "sessionId": "demo-session",
  "metadata": {
    "source": "browser"
  }
}
```

3. The Deno relay converts that into an HTTP request to the Hugging Face Space:

```json
{
  "prompt": "Write a short project summary",
  "session_id": "demo-session",
  "metadata": {
    "source": "browser"
  }
}
```

4. The Hugging Face Space returns:

```json
{
  "reply": "Your generated answer",
  "model": "optional-model-name",
  "session_id": "demo-session",
  "usage": {}
}
```

5. The Deno relay sends the normalized response back over WebSocket.

## Directories

- [`deno-relay/README.md`](/workspace/deno-relay/README.md): relay endpoints, environment variables, and protocol.
- [`hf-space-agent/README.md`](/workspace/hf-space-agent/README.md): Docker Space setup, environment variables, and local run instructions.

## Deployment Shape

- Deploy the contents of [`hf-space-agent`](/workspace/hf-space-agent) to a Hugging Face Space configured with `sdk: docker`.
- Deploy the contents of [`deno-relay`](/workspace/deno-relay) to your Deno target and set `HF_ENDPOINT` to the Space API URL, for example:

```bash
HF_ENDPOINT=https://your-space-name.hf.space/api/agent
```

That gives you the split you asked for:

- Hugging Face root path shows a static intro page.
- Deno owns the public WebSocket prompt entrypoint.
- Deno forwards prompts to the agent app running behind the Hugging Face Space.
