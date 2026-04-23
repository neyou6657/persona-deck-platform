import subprocess
import tempfile
import unittest
from pathlib import Path

from skills_bootstrap import SkillsBootstrapConfig, sync_skills


class SkillsBootstrapTest(unittest.TestCase):
    def test_sync_skills_materializes_repo_subdir_into_agent_skills_home(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            repo_dir = root / "repo"
            codex_home = root / "codex-home"
            agent_home = root / "agent-home"
            cache_dir = root / "cache"

            repo_dir.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "init"], cwd=repo_dir, check=True, capture_output=True, text=True)
            (repo_dir / "skills" / "persona-knowledge").mkdir(parents=True, exist_ok=True)
            (repo_dir / "skills" / "persona-knowledge" / "SKILL.md").write_text(
                "name: persona-knowledge\n",
                encoding="utf-8",
            )
            subprocess.run(["git", "add", "."], cwd=repo_dir, check=True, capture_output=True, text=True)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "user.name=Test",
                    "-c",
                    "user.email=test@example.com",
                    "commit",
                    "-m",
                    "init",
                ],
                cwd=repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            branch = (
                subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=repo_dir,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                .stdout.strip()
            )

            report = sync_skills(
                SkillsBootstrapConfig(
                    enabled=True,
                    repo_url=str(repo_dir),
                    repo_ref=branch,
                    repo_subdir="skills",
                    codex_home=codex_home,
                    agent_skills_dir=agent_home / "skills",
                    cache_dir=cache_dir,
                )
            )

            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["skills_count"], 1)
            self.assertTrue((agent_home / "skills" / "persona-knowledge" / "SKILL.md").exists())
            self.assertTrue((codex_home / "skills").exists())
            self.assertTrue((codex_home / "skills").is_symlink())
            self.assertEqual((codex_home / "skills").resolve(), (agent_home / "skills").resolve())

    def test_sync_skills_can_activate_only_selected_skills(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            repo_dir = root / "repo"
            codex_home = root / "codex-home"
            agent_home = root / "agent-home"
            cache_dir = root / "cache"

            repo_dir.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "init"], cwd=repo_dir, check=True, capture_output=True, text=True)
            (repo_dir / "skills" / "alpha").mkdir(parents=True, exist_ok=True)
            (repo_dir / "skills" / "alpha" / "SKILL.md").write_text("name: alpha\n", encoding="utf-8")
            (repo_dir / "skills" / "beta").mkdir(parents=True, exist_ok=True)
            (repo_dir / "skills" / "beta" / "SKILL.md").write_text("name: beta\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo_dir, check=True, capture_output=True, text=True)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "user.name=Test",
                    "-c",
                    "user.email=test@example.com",
                    "commit",
                    "-m",
                    "init",
                ],
                cwd=repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            branch = (
                subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=repo_dir,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                .stdout.strip()
            )

            report = sync_skills(
                SkillsBootstrapConfig(
                    enabled=True,
                    repo_url=str(repo_dir),
                    repo_ref=branch,
                    repo_subdir="skills",
                    codex_home=codex_home,
                    agent_skills_dir=agent_home / "skills",
                    cache_dir=cache_dir,
                ),
                enabled_skills=["beta"],
            )

            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["available_skills"], ["alpha", "beta"])
            self.assertEqual(report["enabled_skills"], ["beta"])
            self.assertFalse((agent_home / "skills" / "alpha").exists())
            self.assertTrue((agent_home / "skills" / "beta" / "SKILL.md").exists())


if __name__ == "__main__":
    unittest.main()
