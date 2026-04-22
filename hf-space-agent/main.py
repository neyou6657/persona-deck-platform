from __future__ import annotations

import asyncio
import os
from contextlib import suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from agent import AgentClient, RelayBridge
from skills_bootstrap import SkillsBootstrapError, sync_skills
from startup_config import resolve_startup_enabled_skills


BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="HF Space Codex Agent", version="0.2.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
agent_client = AgentClient.from_env()
relay_bridge = RelayBridge.from_env(agent_client)


@app.on_event("startup")
async def startup_event() -> None:
    try:
        requested_skills = resolve_startup_enabled_skills(agent_client.enabled_skills)
        app.state.skills_sync = sync_skills(enabled_skills=requested_skills)
        agent_client.available_skills = list(app.state.skills_sync.get("available_skills", []))
        fallback_enabled_skills = (
            agent_client.enabled_skills
            if requested_skills is not None
            else list(app.state.skills_sync.get("available_skills", []))
        )
        agent_client.enabled_skills = list(
            app.state.skills_sync.get("enabled_skills", fallback_enabled_skills)
        )
    except SkillsBootstrapError as exc:
        app.state.skills_sync = {"status": "failed", "error": str(exc)}
    app.state.bridge_task = asyncio.create_task(relay_bridge.run_forever())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    task = getattr(app.state, "bridge_task", None)
    if task is None:
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    context = {
        "request": request,
        "provider": agent_client.provider,
        "model": agent_client.model,
        "api_ready": bool(agent_client.api_key),
        "api_kind": agent_client.api_kind,
        "runtime": agent_client.runtime,
        "relay_hint": os.getenv(
            "RELAY_HINT",
            "This Space keeps the agent private. It connects outbound to the Deno relay and only shows this intro page publicly.",
        ),
        "relay_status": relay_bridge.health(),
        "skills_sync": getattr(app.state, "skills_sync", {"status": "unknown"}),
    }
    return templates.TemplateResponse("index.html", context)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "provider": agent_client.provider,
        "model": agent_client.model,
        "api_kind": agent_client.api_kind,
        "runtime": agent_client.runtime,
        "skills_sync": getattr(app.state, "skills_sync", {"status": "unknown"}),
        **relay_bridge.health(),
    }
