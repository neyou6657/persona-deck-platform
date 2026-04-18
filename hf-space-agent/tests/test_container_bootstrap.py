import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCKERFILE = ROOT / "Dockerfile"
ENTRYPOINT = ROOT / "docker-entrypoint.sh"


class ContainerBootstrapTest(unittest.TestCase):
    def test_dockerfile_runs_as_root_and_uses_entrypoint(self):
        content = DOCKERFILE.read_text(encoding="utf-8")

        self.assertIn("CODEX_HOME=/root/.codex", content)
        self.assertNotIn("USER appuser", content)
        self.assertIn('ENTRYPOINT ["./docker-entrypoint.sh"]', content)

    def test_entrypoint_writes_dns_servers_before_exec(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            resolv_path = pathlib.Path(tmpdir) / "resolv.conf"
            command = [
                "sh",
                str(ENTRYPOINT),
                "python3",
                "-c",
                "print('entrypoint-ok')",
            ]
            completed = subprocess.run(
                command,
                env={
                    **os.environ,
                    "RESOLV_CONF_PATH": str(resolv_path),
                },
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("entrypoint-ok", completed.stdout)
            self.assertEqual(
                resolv_path.read_text(encoding="utf-8"),
                "nameserver 8.8.8.8\nnameserver 1.1.1.1\n",
            )


if __name__ == "__main__":
    unittest.main()
