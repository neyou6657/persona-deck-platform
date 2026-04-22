import subprocess
import tempfile
import unittest
from pathlib import Path

from skills_bootstrap import SkillsBootstrapConfig, sync_skills


class SkillsBootstrapTest(unittest.TestCase):
    def test_sync_skills_copies_repo_subdir_into_codex_home(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            repo_dir = root / "repo"
            codex_home = root / "codex-home"
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
                    cache_dir=cache_dir,
                )
            )

            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["skills_count"], 1)
            self.assertTrue((codex_home / "skills" / "persona-knowledge" / "SKILL.md").exists())

    def test_sync_skills_can_activate_only_selected_skills(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            repo_dir = root / "repo"
            codex_home = root / "codex-home"
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
                    cache_dir=cache_dir,
                ),
                enabled_skills=["beta"],
            )

            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["available_skills"], ["alpha", "beta"])
            self.assertEqual(report["enabled_skills"], ["beta"])
            self.assertFalse((codex_home / "skills" / "alpha").exists())
            self.assertTrue((codex_home / "skills" / "beta" / "SKILL.md").exists())


if __name__ == "__main__":
    unittest.main()
