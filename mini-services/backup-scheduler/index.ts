import { execSync } from "child_process";

const PORT = 3005;
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000;
const BACKUP_SCRIPT = "/home/z/my-project/scripts/backup-db.sh";

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "backup-scheduler", port: PORT });
    }
    if (url.pathname === "/backup-now") {
      try {
        const output = execSync(`bash ${BACKUP_SCRIPT}`, { encoding: "utf-8" });
        return Response.json({ ok: true, output: output.trim() });
      } catch (e: any) {
        return Response.json({ ok: false, error: e.message });
      }
    }
    if (url.pathname === "/backups") {
      try {
        const files = execSync("ls -la /home/z/my-project/backups/", { encoding: "utf-8" });
        return Response.json({ ok: true, output: files });
      } catch (e: any) {
        return Response.json({ ok: false, error: e.message });
      }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`💾 Backup scheduler on port ${PORT} — runs every 24h`);

function runBackup() {
  try {
    const output = execSync(`bash ${BACKUP_SCRIPT}`, { encoding: "utf-8" });
    console.log(`[${new Date().toISOString()}] ${output.trim()}`);
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] Backup failed: ${e.message}`);
  }
}

setInterval(runBackup, BACKUP_INTERVAL);
