from __future__ import annotations


def resolve_startup_enabled_skills(enabled_skills: list[str]) -> list[str] | None:
    return list(enabled_skills) if enabled_skills else None
