import type { AdminSessionRecord, ControlPlaneStore } from "./postgres.ts";

export type AdminAuthConfig = {
  enabled: boolean;
  passwordHash: string;
  sessionSecret: string;
  sessionTtlHours: number;
};

export class AdminAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createAdminAuthConfigFromEnv(): AdminAuthConfig {
  const passwordHash = Deno.env.get("ADMIN_PASSWORD_HASH")?.trim() ?? "";
  const sessionSecret = Deno.env.get("ADMIN_SESSION_SECRET")?.trim() ?? "";
  const sessionTtlHours = Math.max(1, Number(Deno.env.get("ADMIN_SESSION_TTL_HOURS") ?? "24") || 24);
  return {
    enabled: Boolean(passwordHash && sessionSecret),
    passwordHash,
    sessionSecret,
    sessionTtlHours,
  };
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = textBytes(left);
  const rightBytes = textBytes(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = Uint8Array.from(textBytes(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function expiryIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function requireAuthEnabled(config: AdminAuthConfig): void {
  if (!config.enabled) {
    throw new AdminAuthError(
      503,
      "admin_auth_disabled",
      "ADMIN_PASSWORD_HASH or ADMIN_SESSION_SECRET is not configured",
    );
  }
}

export async function hashAdminSessionToken(
  token: string,
  config: AdminAuthConfig,
): Promise<string> {
  return await sha256Hex(`${config.sessionSecret}:${token}`);
}

export async function verifyAdminPassword(
  password: string,
  config: AdminAuthConfig,
): Promise<boolean> {
  requireAuthEnabled(config);
  const normalized = config.passwordHash.startsWith("sha256:")
    ? config.passwordHash.slice("sha256:".length)
    : config.passwordHash;
  const candidate = await sha256Hex(password);
  return timingSafeEqual(candidate, normalized);
}

export async function issueAdminSession(
  store: ControlPlaneStore,
  config: AdminAuthConfig,
): Promise<{ token: string; session: AdminSessionRecord }> {
  requireAuthEnabled(config);
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const sessionIdHash = await hashAdminSessionToken(token, config);
  const session = await store.createAdminSession(sessionIdHash, expiryIso(config.sessionTtlHours));
  return { token, session };
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null;
  }
  return null;
}

export async function requireAdminSession(
  req: Request,
  store: ControlPlaneStore,
  config: AdminAuthConfig,
): Promise<{ token: string; tokenHash: string; session: AdminSessionRecord }> {
  requireAuthEnabled(config);
  const token = extractBearerToken(req);
  if (!token) {
    throw new AdminAuthError(401, "missing_admin_token", "Missing admin bearer token");
  }
  const tokenHash = await hashAdminSessionToken(token, config);
  const session = await store.getAdminSession(tokenHash);
  if (!session) {
    throw new AdminAuthError(401, "invalid_admin_session", "Admin session not found");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await store.deleteAdminSession(tokenHash);
    throw new AdminAuthError(401, "expired_admin_session", "Admin session expired");
  }
  const touched = await store.touchAdminSession(tokenHash, expiryIso(config.sessionTtlHours));
  return {
    token,
    tokenHash,
    session: touched ?? session,
  };
}

export async function revokeAdminSession(
  req: Request,
  store: ControlPlaneStore,
  config: AdminAuthConfig,
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    return;
  }
  const tokenHash = await hashAdminSessionToken(token, config);
  await store.deleteAdminSession(tokenHash);
}
