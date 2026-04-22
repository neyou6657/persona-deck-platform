from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class SkillsBootstrapError(RuntimeError):
    pass


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class SkillsBootstrapConfig:
    enabled: bool
    repo_url: str
    repo_ref: str
    repo_subdir: str
    codex_home: Path
    cache_dir: Path

    @classmethod
    def from_env(cls) -> "SkillsBootstrapConfig":
        codex_home = Path(os.getenv("CODEX_HOME", "/home/appuser/.codex")).expanduser()
        cache_root = Path(
            os.getenv("SKILLS_CACHE_DIR", tempfile.gettempdir() + "/hf-space-skills-cache")
        ).expanduser()
        return cls(
            enabled=_parse_bool(os.getenv("SKILLS_SYNC_ON_STARTUP"), True),
            repo_url=os.getenv("SKILLS_REPO_URL", "").strip(),
            repo_ref=os.getenv("SKILLS_REPO_REF", "main").strip() or "main",
            repo_subdir=os.getenv("SKILLS_REPO_SUBDIR", "skills").strip().strip("/") or "skills",
            codex_home=codex_home,
            cache_dir=cache_root,
        )


def _run_git(args: list[str], cwd: Path | None = None) -> None:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        check=False,
        text=True,
        capture_output=True,
    )
    if completed.returncode != 0:
        raise SkillsBootstrapError(
            f"git {' '.join(args)} failed: {completed.stderr.strip() or completed.stdout.strip()}"
        )


def _count_skills(root: Path) -> int:
    if not root.exists():
        return 0
    count = 0
    for child in root.iterdir():
        if child.is_dir() and (child / "SKILL.md").exists():
            count += 1
    return count

def _list_skill_names(root: Path) -> list[str]:
    if not root.exists():
        return []
    return sorted(
        child.name
        for child in root.iterdir()
        if child.is_dir() and (child / "SKILL.md").exists()
    )


def _materialize_enabled_skills(source_dir: Path, target_dir: Path, enabled_skills: list[str] | None) -> list[str]:
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    available = _list_skill_names(source_dir)
    if enabled_skills is None:
        shutil.copytree(source_dir, target_dir, dirs_exist_ok=True)
        return available

    enabled = [skill for skill in enabled_skills if skill in available]
    for skill in enabled:
        shutil.copytree(source_dir / skill, target_dir / skill, dirs_exist_ok=True)
    return enabled


def sync_skills(
    config: SkillsBootstrapConfig | None = None,
    enabled_skills: list[str] | None = None,
) -> dict[str, Any]:
    cfg = config or SkillsBootstrapConfig.from_env()
    target_dir = cfg.codex_home / "skills"
    report: dict[str, Any] = {
        "enabled": cfg.enabled,
        "repo_url": cfg.repo_url,
        "repo_ref": cfg.repo_ref,
        "repo_subdir": cfg.repo_subdir,
        "target_dir": str(target_dir),
    }

    if not cfg.enabled:
        report["status"] = "skipped"
        report["reason"] = "disabled"
        return report

    if not cfg.repo_url:
        report["status"] = "skipped"
        report["reason"] = "repo_url_missing"
        return report

    cfg.cache_dir.parent.mkdir(parents=True, exist_ok=True)
    cfg.codex_home.mkdir(parents=True, exist_ok=True)

    if (cfg.cache_dir / ".git").exists():
        _run_git(["fetch", "--depth", "1", "origin", cfg.repo_ref], cwd=cfg.cache_dir)
        _run_git(["checkout", "--force", "FETCH_HEAD"], cwd=cfg.cache_dir)
    else:
        if cfg.cache_dir.exists():
            shutil.rmtree(cfg.cache_dir)
        _run_git(["clone", "--depth", "1", "--branch", cfg.repo_ref, cfg.repo_url, str(cfg.cache_dir)])

    source_dir = cfg.cache_dir / cfg.repo_subdir
    if not source_dir.exists() or not source_dir.is_dir():
        raise SkillsBootstrapError(
            f"skills source directory not found: {source_dir} (repo_subdir={cfg.repo_subdir})"
        )

    available_skills = _list_skill_names(source_dir)
    active_skills = _materialize_enabled_skills(source_dir, target_dir, enabled_skills)

    report["status"] = "ok"
    report["skills_count"] = _count_skills(target_dir)
    report["available_skills"] = available_skills
    report["enabled_skills"] = active_skills
    return report
