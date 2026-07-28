#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS_ROOT = path.join(ROOT, "public", "assets");
const CONTRACT_PATH = path.join(ROOT, ".goal", "assets.json");
const INVENTORY_PATH = path.join(ROOT, ".goal", "asset-inventory.json");
const CHECK_ONLY = process.argv.includes("--check");

function walk(directory) {
  return readdirSync(directory)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((name) => {
      const absolutePath = path.join(directory, name);
      return statSync(absolutePath).isDirectory()
        ? walk(absolutePath)
        : [absolutePath];
    });
}

function normalize(relativePath) {
  return relativePath.replaceAll(path.sep, "/");
}

function matches(pattern, relativePath) {
  return pattern.endsWith("/**")
    ? relativePath.startsWith(pattern.slice(0, -3))
    : relativePath === pattern;
}

function sha256(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

if (!existsSync(CONTRACT_PATH)) {
  console.error("FAIL missing .goal/assets.json");
  process.exit(1);
}

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const entries = walk(ASSETS_ROOT).map((absolutePath) => {
  const relativePath = normalize(path.relative(ROOT, absolutePath));
  const owners = (contract.packages ?? [])
    .filter((assetPackage) =>
      [
        ...(assetPackage.runtime_paths ?? []),
        ...(assetPackage.local_license_files ?? []),
        ...(assetPackage.supplemental_files ?? []),
      ].some((pattern) => matches(pattern, relativePath)),
    )
    .map((assetPackage) => assetPackage.id);

  return {
    path: relativePath,
    bytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
    package_ids: owners,
  };
});

const unmapped = entries.filter((entry) => entry.package_ids.length === 0);
const multiplyMapped = entries.filter((entry) => entry.package_ids.length > 1);
const inventory = {
  schema_version: 1,
  generated_at_utc: new Date().toISOString(),
  contract: ".goal/assets.json",
  file_count: entries.length,
  total_bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
  unmapped_paths: unmapped.map((entry) => entry.path),
  multiply_mapped_paths: multiplyMapped.map((entry) => entry.path),
  entries,
};

if (CHECK_ONLY) {
  if (!existsSync(INVENTORY_PATH)) {
    console.error(
      "FAIL missing .goal/asset-inventory.json; run npm run inventory:assets",
    );
    process.exit(1);
  }
  const recorded = JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
  const same =
    JSON.stringify(recorded.entries) === JSON.stringify(inventory.entries);
  console.log(`${same ? "PASS" : "FAIL"} asset hashes ${entries.length} files`);
  console.log(
    `${unmapped.length ? "FAIL" : "PASS"} unmapped ${unmapped.length}`,
  );
  console.log(
    `${multiplyMapped.length ? "FAIL" : "PASS"} multiply-mapped ${multiplyMapped.length}`,
  );
  if (!same || unmapped.length || multiplyMapped.length) process.exitCode = 1;
} else {
  writeFileSync(
    INVENTORY_PATH,
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
  console.log(`WROTE ${normalize(path.relative(ROOT, INVENTORY_PATH))}`);
  console.log(`FILES ${entries.length} BYTES ${inventory.total_bytes}`);
  console.log(
    `UNMAPPED ${unmapped.length} MULTIPLY_MAPPED ${multiplyMapped.length}`,
  );
  if (unmapped.length || multiplyMapped.length) process.exitCode = 1;
}
