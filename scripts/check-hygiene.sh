#!/usr/bin/env bash
# MEKANIX — Repository Hygiene Check
# Reject local databases, real environment files, generated directories,
# oversized files, and unsafe Docker build-context environment rules.

set -euo pipefail

echo "🔍 Checking repository hygiene..."
errors=0

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Run this check from inside the Git repository."
  exit 2
fi

mapfile -d '' tracked_files < <(git ls-files -z)

# Database files must never be committed.
db_files=()
for file in "${tracked_files[@]}"; do
  if [[ "$file" =~ .(db|sqlite|sqlite3)$ ]]; then
    db_files+=("$file")
  fi
done
if (("${#db_files[@]}" > 0)); then
  echo "❌ Database files tracked by git:"
  printf '  %s\n' "${db_files[@]}"
  errors=$((errors + 1))
fi

# Only the root .env.example template may be tracked.
env_files=()
for file in "${tracked_files[@]}"; do
  if [[ "$file" =~ (^|/)\.env($|\.) ]] && [[ "$file" != ".env.example" ]]; then
    env_files+=("$file")
  fi
done
if (("${#env_files[@]}" > 0)); then
  echo "❌ Environment files tracked by git:"
  printf '  %s\n' "${env_files[@]}"
  errors=$((errors + 1))
fi

# Generated or local-only directories are not allowed in the repository.
for file in "${tracked_files[@]}"; do
  if [[ "$file" =~ (^|/)(upload|download|tool-results|backups|agent-ctx|\.zscripts)/ ]]; then
    echo "❌ Forbidden generated/local path tracked: $file"
    errors=$((errors + 1))
  fi
done

# Reject files larger than 10 MiB.
for file in "${tracked_files[@]}"; do
  [[ -f "$file" ]] || continue
  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
  if [[ "$size" =~ ^[0-9]+$ ]] && ((size > 10485760)); then
    echo "❌ Large file (>10 MiB): $file ($size bytes)"
    errors=$((errors + 1))
  fi
done

# Docker must ignore real env files while allowing the safe example template.
if [[ ! -f .dockerignore ]] ||
   ! grep -Fxq '.env' .dockerignore ||
   ! grep -Fxq '.env.*' .dockerignore ||
   ! grep -Fxq '!.env.example' .dockerignore; then
  echo "❌ .dockerignore must exclude .env and .env.* while allowing .env.example"
  errors=$((errors + 1))
fi

if ((errors > 0)); then
  echo ""
  echo "❌ $errors hygiene issue(s) found."
  exit 1
fi

echo "✅ Repository hygiene is clean."
