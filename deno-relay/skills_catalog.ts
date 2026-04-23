import { dirname, join } from "jsr:@std/path";

export type SkillsCatalog = {
  status: "ok" | "skipped" | "failed";
  skills: string[];
  repoUrl: string;
  repoRef: string;
  repoSubdir: string;
  error?: string;
  fetchedAt?: string;
};

type SkillsCatalogConfig = {
  enabled: boolean;
  repoUrl: string;
  repoRef: string;
  repoSubdir: string;
  cacheDir: string;
  ttlMs: number;
};

class SkillsCatalogError extends Error {}

let cachedCatalog:
  | {
    cacheKey: string;
    expiresAt: number;
    result: SkillsCatalog;
  }
  | null = null;

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function createSkillsCatalogConfigFromEnv(): SkillsCatalogConfig {
  const parsedTtl = Number(Deno.env.get("SKILLS_CATALOG_TTL_MS") ?? "30000");
  return {
    enabled: parseBool(Deno.env.get("SKILLS_CATALOG_ENABLED"), true),
    repoUrl: Deno.env.get("SKILLS_REPO_URL")?.trim() ?? "",
    repoRef: Deno.env.get("SKILLS_REPO_REF")?.trim() || "main",
    repoSubdir: Deno.env.get("SKILLS_REPO_SUBDIR")?.trim().replace(/^\/+|\/+$/g, "") || "skills",
    cacheDir: Deno.env.get("SKILLS_CACHE_DIR")?.trim() || "/tmp/persona-deck-skills-cache",
    ttlMs: Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : 30000,
  };
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  let output;
  try {
    output = await new Deno.Command("git", {
      args,
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new SkillsCatalogError("git is not installed in relay runtime");
    }
    throw error;
  }
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    const stdout = new TextDecoder().decode(output.stdout).trim();
    throw new SkillsCatalogError(
      `git ${args.join(" ")} failed: ${stderr || stdout || "unknown error"}`,
    );
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

async function listSkillNames(root: string): Promise<string[]> {
  const skills: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) {
      continue;
    }
    if (await pathExists(join(root, entry.name, "SKILL.md"))) {
      skills.push(entry.name);
    }
  }
  skills.sort((left, right) => left.localeCompare(right));
  return skills;
}

export async function listSkillsCatalog(
  config: SkillsCatalogConfig = createSkillsCatalogConfigFromEnv(),
): Promise<SkillsCatalog> {
  const cacheKey = JSON.stringify([
    config.enabled,
    config.repoUrl,
    config.repoRef,
    config.repoSubdir,
    config.cacheDir,
  ]);
  if (
    cachedCatalog &&
    cachedCatalog.cacheKey === cacheKey &&
    cachedCatalog.expiresAt >= Date.now()
  ) {
    return cachedCatalog.result;
  }

  let result: SkillsCatalog;
  if (!config.enabled) {
    result = {
      status: "skipped",
      skills: [],
      repoUrl: config.repoUrl,
      repoRef: config.repoRef,
      repoSubdir: config.repoSubdir,
      error: "skills_catalog_disabled",
    };
  } else if (!config.repoUrl) {
    result = {
      status: "skipped",
      skills: [],
      repoUrl: config.repoUrl,
      repoRef: config.repoRef,
      repoSubdir: config.repoSubdir,
      error: "skills_repo_url_missing",
    };
  } else {
    try {
      await Deno.mkdir(dirname(config.cacheDir), { recursive: true });
      if (await pathExists(join(config.cacheDir, ".git"))) {
        await runGit(["fetch", "--depth", "1", "origin", config.repoRef], config.cacheDir);
        await runGit(["checkout", "--force", "FETCH_HEAD"], config.cacheDir);
      } else {
        if (await pathExists(config.cacheDir)) {
          await Deno.remove(config.cacheDir, { recursive: true });
        }
        await runGit([
          "clone",
          "--depth",
          "1",
          "--branch",
          config.repoRef,
          config.repoUrl,
          config.cacheDir,
        ]);
      }

      const sourceDir = join(config.cacheDir, config.repoSubdir);
      const sourceInfo = await Deno.stat(sourceDir).catch((error) => {
        if (error instanceof Deno.errors.NotFound) {
          return null;
        }
        throw error;
      });
      if (!sourceInfo?.isDirectory) {
        throw new SkillsCatalogError(
          `skills source directory not found: ${sourceDir} (repoSubdir=${config.repoSubdir})`,
        );
      }

      result = {
        status: "ok",
        skills: await listSkillNames(sourceDir),
        repoUrl: config.repoUrl,
        repoRef: config.repoRef,
        repoSubdir: config.repoSubdir,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      result = {
        status: "failed",
        skills: [],
        repoUrl: config.repoUrl,
        repoRef: config.repoRef,
        repoSubdir: config.repoSubdir,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  cachedCatalog = {
    cacheKey,
    expiresAt: Date.now() + config.ttlMs,
    result,
  };
  return result;
}
