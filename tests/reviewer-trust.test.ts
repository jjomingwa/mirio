import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reviewerTrustModulePath = "../scripts/lib/reviewer-trust.mjs";
const { loadExternalTrustStore } = await import(reviewerTrustModulePath);

describe("external reviewer trust store", () => {
  it("loads a key from a trust store outside the checkout", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crowntrail-root-"));
    const trustDir = mkdtempSync(path.join(tmpdir(), "crowntrail-trust-"));
    mkdirSync(path.join(root, ".goal"));
    const { publicKey } = generateKeyPairSync("ed25519");
    const trustPath = path.join(trustDir, "reviewer-trust.json");
    writeFileSync(
      trustPath,
      JSON.stringify({
        version: 1,
        keys: {
          "independent-reviewer": publicKey.export({
            type: "spki",
            format: "pem",
          }),
        },
      }),
      "utf8",
    );

    const trust = loadExternalTrustStore({ root, configuredPath: trustPath });

    expect(trust.path).toBe(path.resolve(trustPath));
    expect(trust.trustedKeys.has("independent-reviewer")).toBe(true);
  });

  it("rejects a trust store inside the checkout", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crowntrail-root-"));
    const trustPath = path.join(root, "reviewer-trust.json");
    writeFileSync(trustPath, JSON.stringify({ version: 1, keys: {} }), "utf8");

    expect(() =>
      loadExternalTrustStore({ root, configuredPath: trustPath }),
    ).toThrow("outside the repository checkout");
  });
});
