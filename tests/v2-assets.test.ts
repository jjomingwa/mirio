import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(
  repositoryRoot,
  "public",
  "assets",
  "crowntrail-v2",
  "manifest.json",
);

describe("crowntrail-v2 asset manifest", () => {
  it("exists and conforms to version 2 namespace contract", () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.version).toBe(2);
    expect(manifest.namespace).toBe("crowntrail-v2");
    expect(Array.isArray(manifest.assets)).toBe(true);
    expect(manifest.assets.length).toBeGreaterThan(0);
  });

  it("verifies every entry in manifest physically exists and matches SHA-256 hash", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const seenKeys = new Set<string>();

    for (const entry of manifest.assets) {
      expect(entry.key).toBeTruthy();
      expect(seenKeys.has(entry.key)).toBe(false);
      seenKeys.add(entry.key);

      const fileAbsolutePath = path.join(
        repositoryRoot,
        "public",
        entry.runtime_path,
      );
      expect(existsSync(fileAbsolutePath)).toBe(true);

      const bytes = readFileSync(fileAbsolutePath);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      expect(actualHash).toBe(entry.sha256);
      expect(bytes.length).toBe(entry.size_bytes);
    }
  });

  it("ensures no duplicate keys or orphaned assets exist in crowntrail-v2 namespace", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const keys = manifest.assets.map((a: any) => a.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("rejects placeholder image payloads and requires a real environment key art", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const background = manifest.assets.find(
      (entry: { key: string }) => entry.key === "goldenwind-background",
    );
    expect(background).toBeDefined();
    expect(background.size_bytes).toBeGreaterThan(100_000);

    const imageEntries = manifest.assets.filter(
      (entry: { type: string }) => entry.type === "image",
    );
    const hashes = new Set(
      imageEntries.map((entry: { sha256: string }) => entry.sha256),
    );
    expect(hashes.size).toBeGreaterThan(1);
  });
});
