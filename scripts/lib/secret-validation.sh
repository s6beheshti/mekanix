#!/usr/bin/env bash
# Shared validation for production/staging deployment secrets.

is_placeholder_secret() {
  local value="${1,,}"
  case "$value" in
    replace-with*|replace_with*|replace\ with*|change-me*|change_me*|change\ me*|development-only*|dev-only*|your-secret*|your-password*|your-jwt*|your-db*|your-redis*|password|password-*|password_*|secret|secret-*|secret_*|example|example-*|example_*|test|test-*|test_*|demo|demo-*|admin|admin-*|qwerty*)
      return 0
      ;;
  esac
  return 1
}

is_strong_secret() {
  local value="$1"
  local minimum_length="$2"
  [[ "${#value}" -ge "$minimum_length" ]] && ! is_placeholder_secret "$value"
}
