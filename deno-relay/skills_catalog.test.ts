import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";

import { listSkillsCatalog } from "./skills_catalog.ts";

async function runGit(args: string[], cwd: string): Promise<string> {
  const output = await new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    const stdout = new TextDecoder().decode(output.stdout).trim();
    throw new Error(stderr || stdout || `git ${args.join(" ")} failed`);
  }
  return new TextDecoder().decode(output.stdout).trim();
}

Deno.test("listSkillsCatalog skips when repo URL is missing", async () => {
  const result = await listSkillsCatalog({
    enabled: true,
    repoUrl: "",
    repoRef: "main",
    repoSubdir: "skills",
    cacheDir: "/tmp/persona-deck-skills-cache-missing",
    ttlMs: 0,
  });

  assertEquals(result.status, "skipped");
  assertEquals(result.skills, []);
  assertEquals(result.error, "skills_repo_url_missing");
});

Deno.test("listSkillsCatalog clones repo and returns all skill slugs", async () => {
  const root = await Deno.makeTempDir({ prefix: "skills-catalog-test-" });
  try {
    const repoDir = join(root, "repo");
    const cacheDir = join(root, "cache");

    await Deno.mkdir(join(repoDir, "skills", "alpha"), { recursive: true });
    await Deno.writeTextFile(join(repoDir, "skills", "alpha", "SKILL.md"), "name: alpha\n");
    await Deno.mkdir(join(repoDir, "skills", "beta"), { recursive: true });
    await Deno.writeTextFile(join(repoDir, "skills", "beta", "SKILL.md"), "name: beta\n");

    await runGit(["init"], repoDir);
    await runGit(["add", "."], repoDir);
    await runGit(
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "init",
      ],
      repoDir,
    );
    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);

    const result = await listSkillsCatalog({
      enabled: true,
      repoUrl: repoDir,
      repoRef: branch,
      repoSubdir: "skills",
      cacheDir,
      ttlMs: 0,
    });

    assertEquals(result.status, "ok");
    assertEquals(result.skills, ["alpha", "beta"]);
    assertEquals(result.repoUrl, repoDir);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
