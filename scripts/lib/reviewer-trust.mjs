import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import path from "node:path";

function isOutside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

export function loadExternalTrustStore({ root, configuredPath }) {
  const configured = String(configuredPath ?? "").trim();
  if (!configured) {
    throw new Error(
      "GOAL_REVIEW_TRUST_STORE must point to an external trust store.",
    );
  }

  const candidate = path.resolve(configured);
  if (!existsSync(candidate)) {
    throw new Error(`GOAL_REVIEW_TRUST_STORE does not exist: ${candidate}`);
  }

  const canonicalRoot = realpathSync(root);
  const canonicalStore = realpathSync(candidate);
  if (!isOutside(canonicalRoot, canonicalStore)) {
    throw new Error(
      "GOAL_REVIEW_TRUST_STORE must stay outside the repository checkout.",
    );
  }

  let document;
  try {
    document = JSON.parse(readFileSync(canonicalStore, "utf8"));
  } catch (error) {
    throw new Error(
      `GOAL_REVIEW_TRUST_STORE is invalid JSON: ${error.message}`,
      { cause: error },
    );
  }
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    document.version !== 1 ||
    !document.keys ||
    typeof document.keys !== "object" ||
    Array.isArray(document.keys)
  ) {
    throw new Error(
      "GOAL_REVIEW_TRUST_STORE must be { version: 1, keys: { <key-id>: <PEM> } }.",
    );
  }

  const trustedKeys = new Map();
  for (const [keyId, pem] of Object.entries(document.keys)) {
    if (!/^[A-Za-z0-9._-]+$/.test(keyId) || typeof pem !== "string") {
      throw new Error("GOAL_REVIEW_TRUST_STORE contains an invalid key entry.");
    }
    try {
      trustedKeys.set(keyId, createPublicKey(pem));
    } catch (error) {
      throw new Error(
        `GOAL_REVIEW_TRUST_STORE key ${keyId} is invalid: ${error.message}`,
        { cause: error },
      );
    }
  }
  if (trustedKeys.size === 0) {
    throw new Error("GOAL_REVIEW_TRUST_STORE must contain at least one key.");
  }

  return { path: canonicalStore, trustedKeys };
}
