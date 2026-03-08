#!/usr/bin/env bun
/**
 * Usage:
 *   bun scripts/bump-version.ts prerelease --preid beta   # 0.1.0-beta.1 → 0.1.0-beta.2
 *   bun scripts/bump-version.ts patch                     # 0.1.0-beta.2 → 0.1.1
 *   bun scripts/bump-version.ts minor                     # 0.1.0 → 0.2.0
 *   bun scripts/bump-version.ts 0.1.0-beta.1              # set exact version
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const bump = args[0];
const preidIndex = args.indexOf("--preid");
const preid = preidIndex !== -1 ? args[preidIndex + 1] : "beta";

if (!bump) {
  console.error(
    "Usage: bun scripts/bump-version.ts <patch|minor|major|prerelease|x.y.z> [--preid <id>]",
  );
  process.exit(1);
}

function parseVersion(v: string) {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/);
  if (!match) throw new Error(`Cannot parse version: ${v}`);
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    preid: match[4] ?? null,
    pre: match[5] !== undefined ? parseInt(match[5]) : null,
  };
}

function nextVersion(current: string, bump: string, preid: string): string {
  // Exact version
  if (/^\d+\.\d+\.\d+/.test(bump) && bump !== "patch" && bump !== "minor" && bump !== "major" && bump !== "prerelease") {
    return bump;
  }

  const v = parseVersion(current);

  switch (bump) {
    case "prerelease":
      if (v.preid === preid && v.pre !== null) {
        return `${v.major}.${v.minor}.${v.patch}-${preid}.${v.pre + 1}`;
      }
      return `${v.major}.${v.minor}.${v.patch}-${preid}.1`;
    case "patch":
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case "minor":
      return `${v.major}.${v.minor + 1}.0`;
    case "major":
      return `${v.major + 1}.0.0`;
    default:
      throw new Error(`Unknown bump type: ${bump}`);
  }
}

const packageFiles = [
  "package.json",
  ...Array.from(new Bun.Glob("apps/*/package.json").scanSync({ cwd: root })),
  ...Array.from(new Bun.Glob("packages/*/package.json").scanSync({ cwd: root })),
];

// Get current version from root or first workspace that has one
let currentVersion: string | null = null;
for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(resolve(root, file), "utf-8"));
  if (pkg.version) {
    currentVersion = pkg.version;
    break;
  }
}

if (!currentVersion) {
  console.error("No version found in any package.json");
  process.exit(1);
}

const newVersion = nextVersion(currentVersion, bump, preid);
console.log(`${currentVersion} → ${newVersion}`);

let updated = 0;
for (const file of packageFiles) {
  const path = resolve(root, file);
  const pkg = JSON.parse(readFileSync(path, "utf-8"));
  if (pkg.version !== undefined) {
    pkg.version = newVersion;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  updated ${file}`);
    updated++;
  }
}

console.log(`\nBumped ${updated} package(s) to ${newVersion}`);
