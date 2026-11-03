import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3005);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT ?? "/app/scripts/backup-db.sh";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/backups";
const BACKUP_ADMIN_TOKEN = process.env.BACKUP_ADMIN_TOKEN ?? "";
const GNUPGHOME = process.env.GNUPGHOME ?? "/tmp/gnupg";

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
if (!Number.isSafeInteger(BACKUP_INTERVAL_MS) || BACKUP_INTERVAL_MS < 60_000) {
  throw new Error("BACKUP_INTERVAL_MS must be an integer of at least 60000");
}
if (BACKUP_ADMIN_TOKEN.length < 32 || BACKUP_ADMIN_TOKEN.includes("\n")) {
  throw new Error("BACKUP_ADMIN_TOKEN must be a single-line value of at least 32 characters");
}

// GPG uses its home directory even in batch symmetric mode. In a read-only
// container /tmp is a tmpfs; create the private directory at runtime.
mkdirSync(GNUPGHOME, { recursive: true, mode: 0o700 });
chmodSync(GNUPGHOME, 0o700);

let lastBackupAt: string | null = null;
let lastBackupOk: boolean | null = null;
let backupInProgress = false;

function isAuthorized(req: Request): boolean {
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
      const path = join(BACKUP_DIR, name);
      const stats = statSync(path);
      return { name, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString(), encrypted: name.endsWith(".gpg") };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function sendBackupFailureAlert(timestamp: string) {
  const webhook = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const target = new URL(webhook);
    if (target.protocol !== "https:" || target.username || target.password) {
      throw new Error("Backup alert webhook must be an HTTPS URL without embedded credentials");
    }
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "mekanix-backup-scheduler", status: "failed", timestamp }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Alert webhook returned HTTP ${response.status}`);
  } catch (error) {
    console.error("Backup failure alert could not be delivered:", error);
  }
}

async function runBackup(reason: "startup" | "scheduled" | "manual") {
  if (backupInProgress) throw new Error("A backup is already in progress");
  if (!existsSync(BACKUP_SCRIPT)) throw new Error("Configured backup script is missing");
  backupInProgress = true;
  try {
    const { stdout } = await execFileAsync("bash", [BACKUP_SCRIPT], {
      encoding: "utf8",
      timeout: 30 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: "/app",
      env: { ...process.env, GNUPGHOME },
    });
    const output = typeof stdout === "string" ? stdout : stdout.toString("utf8");
    lastBackupAt = new Date().toISOString();
    lastBackupOk = true;
    console.log(`[${lastBackupAt}] Backup ${reason} succeeded: ${output.trim()}`);
    return output.trim();
  } catch (error) {
    lastBackupAt = new Date().toISOString();
    lastBackupOk = false;
    console.error(`[${lastBackupAt}] Backup ${reason} failed:`, error);
    void sendBackupFailureAlert(lastBackupAt);
    throw new Error("Backup failed; inspect scheduler logs");
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
        ok: lastBackupOk === true,
        service: "backup-scheduler",
        lastBackupAt,
        lastBackupOk,
        backupInProgress,
      }, { status: lastBackupOk === true ? 200 : 503 });
    }

    if (url.pathname === "/backup-now") {
      if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (!isAuthorized(req)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      if (backupInProgress) return Response.json({ ok: false, error: "A backup is already in progress" }, { status: 409 });
      try {
        return Response.json({ ok: true, output: await runBackup("manual") });
      } catch {
        return Response.json({ ok: false, error: "Backup failed; inspect scheduler logs" }, { status: 500 });
      }
    }

    if (url.pathname === "/backups") {
      if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!isAuthorized(req)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      try {
        return Response.json({ ok: true, backups: listBackups() });
      } catch {
        return Response.json({ ok: false, error: "Could not list backups" }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Backup scheduler listening on port ${server.port}; interval=${BACKUP_INTERVAL_MS}ms`);
void runBackup("startup").catch(() => undefined);
setInterval(() => {
  if (backupInProgress) {
    console.warn("Skipping scheduled backup because another backup is still running");
    return;
  }
  void runBackup("scheduled").catch(() => undefined);
}, BACKUP_INTERVAL_MS);
