#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/secret-validation.sh"

assert_rejected() {
  local value="$1"
  local minimum="$2"
  if is_strong_secret "$value" "$minimum"; then
    echo "❌ Placeholder secret was accepted"
    exit 1
  fi
}

assert_accepted() {
  local value="$1"
  local minimum="$2"
  if ! is_strong_secret "$value" "$minimum"; then
    echo "❌ Generated-looking secret was rejected"
    exit 1
  fi
}

assert_rejected "development-only-not-for-production-change-me" 32
assert_rejected "replace-with-a-long-random-password" 24
assert_rejected "your-secret-value-that-is-long-enough" 24
assert_rejected "password1234567890123456789012" 24
assert_accepted "ci-jwt-9f2b8c4d7e1a6b3c5d0f8a2e4c6b1d9f" 32
assert_accepted "db-8d3c5a7e9f2b4d6c1a0e8f7b5c3d9a1e" 16
assert_accepted "redis-7c2e9a4d1f6b8c3e5a0d9f2b4c7e1a6d" 24

echo "✅ Deployment secret validation tests passed."
