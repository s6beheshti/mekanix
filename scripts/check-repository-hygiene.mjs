#!/usr/bin/env node
import { execSync } from "node:child_process";

const forbidden = [
  /^\.env$/,
  /(^|\/)\.env\./,
  /(^|\/)[^/]+\.db$/,
  /(^|\/)backups\//,
  /(^|\/)tool-results\//,
  /(^|\/)upload\//,
  /(^|\/)download\//,
  /\.tar\.gz$/,
];

const files = execSync("git ls-files", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const violations = files.filter((file) => forbidden.some((pattern) => pattern.test(file)));

if (violations.length) {
  console.error("Forbidden tracked artifacts detected:");
  for (const file of violations) console.error(` - ${file}`);
  process.exit(1);
}

console.log("Repository hygiene check passed.");
