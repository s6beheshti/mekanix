#!/usr/bin/env bash
# Offline regression test for encrypted backup/restore. Uses fake PostgreSQL
# client commands so it never connects to or modifies a real database.

set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/backups"

command -v gpg >/dev/null 2>&1 || { echo "gpg is required for this test" >&2; exit 1; }
command -v gzip >/dev/null 2>&1 || { echo "gzip is required for this test" >&2; exit 1; }

cat > "$TMP/bin/pg_dump" <<'PGDUMP'
#!/usr/bin/env bash
printf '%s\n' '-- MEKANIX encrypted-backup regression fixture' 'CREATE TABLE backup_fixture (id integer);' 'INSERT INTO backup_fixture VALUES (42);'
PGDUMP
cat > "$TMP/bin/psql" <<'PSQL'
#!/usr/bin/env bash
case " $* " in
  *"-c"*) printf '1\n' ;;
  *) cat > "$PSQL_RESTORE_CAPTURE" ;;
esac
PSQL
chmod 700 "$TMP/bin/pg_dump" "$TMP/bin/psql"
export PATH="$TMP/bin:$PATH"
export GNUPGHOME="$TMP/gnupg" # Intentionally absent: the scripts must create it safely.
export HOME="$TMP/home"
export BACKUP_DIR="$TMP/backups"
export DATABASE_URL="postgresql://backup-test.invalid/test"
export BACKUP_ENCRYPTION_REQUIRED=true
export BACKUP_ENCRYPTION_PASSPHRASE="test-only-passphrase-with-at-least-32-characters"
export NODE_ENV=production
export RESTORE_CONFIRM=RESTORE
export PSQL_RESTORE_CAPTURE="$TMP/restored.sql"

bash "$ROOT/scripts/backup-db.sh"
BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz.gpg' -print -quit)"
[[ -n "$BACKUP_FILE" && -s "$BACKUP_FILE" ]] || { echo "encrypted backup was not created" >&2; exit 1; }
[[ "$(stat -c '%a' "$BACKUP_FILE")" == "600" ]] || { echo "backup file permissions are not 600" >&2; exit 1; }
[[ "$(stat -c '%a' "$GNUPGHOME")" == "700" ]] || { echo "GNUPGHOME permissions are not 700" >&2; exit 1; }
if find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' | grep -q .; then
  echo "plaintext backup unexpectedly exists" >&2
  exit 1
fi

bash "$ROOT/scripts/restore-db.sh" "$BACKUP_FILE"
grep -q 'MEKANIX encrypted-backup regression fixture' "$PSQL_RESTORE_CAPTURE"
grep -q 'VALUES (42)' "$PSQL_RESTORE_CAPTURE"

: > "$PSQL_RESTORE_CAPTURE"
if BACKUP_ENCRYPTION_PASSPHRASE="incorrect-passphrase-for-negative-test" \
  bash "$ROOT/scripts/restore-db.sh" "$BACKUP_FILE" >/dev/null 2>&1; then
  echo "restore unexpectedly accepted an incorrect passphrase" >&2
  exit 1
fi
[[ ! -s "$PSQL_RESTORE_CAPTURE" ]] || { echo "database client was invoked after failed decryption" >&2; exit 1; }

if BACKUP_ENCRYPTION_PASSPHRASE="" bash "$ROOT/scripts/backup-db.sh" >/dev/null 2>&1; then
  echo "production backup unexpectedly accepted a missing passphrase" >&2
  exit 1
fi

echo "Encrypted backup/restore regression tests passed."
