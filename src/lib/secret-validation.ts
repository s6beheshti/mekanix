const PLACEHOLDER_PREFIXES = [
  "replace-with",
  "replace_with",
  "replace with",
  "change-me",
  "change_me",
  "change me",
  "development-only",
  "dev-only",
  "your-secret",
  "your-password",
  "your-jwt",
  "your-db",
  "your-redis",
  "password",
  "secret",
  "example",
  "test",
  "demo",
  "admin",
  "qwerty",
];

/** Reject short, obvious placeholder, and trivially repeated secrets. */
export function isStrongSecret(
  value: string | null | undefined,
  minimumLength: number,
): boolean {
  if (
    typeof value !== "string" ||
    !Number.isSafeInteger(minimumLength) ||
    minimumLength < 1 ||
    value.length < minimumLength ||
    value.trim() !== value
  ) {
    return false;
  }

  const normalized = value.toLowerCase();
  const isPlaceholder = PLACEHOLDER_PREFIXES.some(
    (prefix) =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}-`) ||
      normalized.startsWith(`${prefix}_`) ||
      normalized.startsWith(`${prefix} `),
  );

  return !isPlaceholder && !/^(.)\1{7,}$/.test(normalized);
}
