import { execFileSync } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3005);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT ?? "/app/scripts/backup-db.sh";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/backups";
const BACKUP_ADMIN_TOKEN = process.env.BACKUP_ADMIN_TOKEN ?? "";

let lastBackupAt: string | null = null;
let lastBackupOk: boolean | null = null;
let lastBackupError: string | null = null;

function isAuthorized(req: Request): boolean {
  if (BACKUP_ADMIN_TOKEN.length < 32) return false;
  const authorization = req.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(BACKUP_ADMIN_TOKEN);
  const providedBuffer = Buffer.from(provided);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => /^mekanix_.*\.sql\.gz(?:\.gpg)?$/.test(name))
    .map((name) => {
      const stats = statSync(join(BACKUP_DIR, name));
      return {
        name,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        encrypted: name.endsWith(".gpg"),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function runBackup(reason: "startup" | "scheduled" | "manual") {
  if (!existsSync(BACKUP_SCRIPT)) throw new Error(`Backup script not found: ${BACKUP_SCRIPT}`);
  try {
    const output = execFileSync("bash", [BACKUP_SCRIPT], {
      encoding: "utf8",
      timeout: 30 * 60 * 1000,
      cwd: "/app",
      env: process.env,
    });
    lastBackupAt = new Date().toISOString();
    lastBackupOk = true;
    lastBackupError = null;
    console.log(`[${lastBackupAt}] Backup ${reason} succeeded: ${output.trim()}`);
    return output.trim();
  } catch (error) {
    lastBackupAt = new Date().toISOString();
    lastBackupOk = false;
    lastBackupError = error instanceof Error ? error.message : String(error);
    console.error(`[${lastBackupAt}] Backup ${reason} failed: ${lastBackupError}`);
    throw error;
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ ok: true, service: "backup-scheduler", port: PORT });
    }

    if (url.pathname === "/ready" && req.method === "GET") {
      return Response.json({
        ok: lastBackupOk !== false,
        service: "backup-scheduler",
        lastBackupAt,
        lastBackupOk,
        lastBackupError,
      }, { status: lastBackupOk === false ? 503 : 200 });
    }

    if ((url.pathname === "/backup-now" || url.pathname === "/backups") && !isAuthorized(req)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/backup-now" && req.method === "POST") {
      try {
        return Response.json({ ok: true, output: runBackup("manual") });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    if (url.pathname === "/backups" && req.method === "GET") {
      try {
        return Response.json({ ok: true, backups: listBackups() });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`💾 Backup scheduler listening on ${server.hostname}:${server.port}; interval=${BACKUP_INTERVAL_MS}ms`);

void runBackup("startup").catch(() => undefined);
setInterval(() => {
  void runBackup("scheduled").catch(() => undefined);
}, BACKUP_INTERVAL_MS);
