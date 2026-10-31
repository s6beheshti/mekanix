import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3005);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT ?? "/app/scripts/backup-db.sh";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/backups";
const BACKUP_ADMIN_TOKEN = process.env.BACKUP_ADMIN_TOKEN ?? "";

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
if (!Number.isSafeInteger(BACKUP_INTERVAL_MS) || BACKUP_INTERVAL_MS < 60_000) {
  throw new Error("BACKUP_INTERVAL_MS must be an integer of at least 60000");
}

let lastBackupAt: string | null = null;
let lastBackupOk: boolean | null = null;
let lastBackupError: string | null = null;
let backupInProgress = false;

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

async function sendBackupFailureAlert(message: string, timestamp: string) {
  const webhook = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const target = new URL(webhook);
    if (target.protocol !== "https:") throw new Error("Backup alert webhook must use HTTPS");
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "mekanix-backup-scheduler",
        status: "failed",
        timestamp,
        text: message,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Alert webhook returned HTTP ${response.status}`);
  } catch (error) {
    console.error("Backup failure alert could not be delivered:", error);
  }
}

async function runBackup(reason: "startup" | "scheduled" | "manual") {
  if (backupInProgress) throw new Error("A backup is already in progress");
  if (!existsSync(BACKUP_SCRIPT)) throw new Error(`Backup script not found: ${BACKUP_SCRIPT}`);
  backupInProgress = true;
  try {
    const { stdout } = await execFileAsync("bash", [BACKUP_SCRIPT], {
      encoding: "utf8",
      timeout: 30 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: "/app",
      env: process.env,
    });
    const output = typeof stdout === "string" ? stdout : stdout.toString("utf8");
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
    void sendBackupFailureAlert(lastBackupError, lastBackupAt);
    throw error;
  } finally {
    backupInProgress = false;
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
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
        backupInProgress,
        lastBackupError,
      }, { status: lastBackupOk === false ? 503 : 200 });
    }

    if ((url.pathname === "/backup-now" || url.pathname === "/backups") && !isAuthorized(req)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/backup-now" && req.method === "POST") {
      if (backupInProgress) return Response.json({ ok: false, error: "A backup is already in progress" }, { status: 409 });
      try {
        return Response.json({ ok: true, output: await runBackup("manual") });
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

console.log(`💾 Backup scheduler listening on port ${server.port}; interval=${BACKUP_INTERVAL_MS}ms`);

void runBackup("startup").catch(() => undefined);
setInterval(() => {
  if (backupInProgress) {
    console.warn("Skipping scheduled backup because another backup is still running");
    return;
  }
  void runBackup("scheduled").catch(() => undefined);
}, BACKUP_INTERVAL_MS);
