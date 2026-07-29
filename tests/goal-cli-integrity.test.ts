import { spawnSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("goal review CLI integrity", () => {
  it("cannot fabricate an inline independent PASS", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts", "goal.mjs"),
        "review",
        "--task",
        "Q-008-HARNESS-EVIDENCE-INTEGRITY",
        "--type",
        "independent",
        "--result",
        "PASS",
        "--evidence",
        "README.md",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Inline verdicts are disabled. Supply a per-acceptance --record instead.",
    );
  });

  it("cannot trust a reviewer key supplied with the review record", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts", "goal.mjs"),
        "review",
        "--task",
        "Q-008-HARNESS-EVIDENCE-INTEGRITY",
        "--type",
        "independent",
        "--record",
        "forged-review.json",
        "--public-key",
        "forged-reviewer.pem",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Independent reviewer keys must be pre-bound in the submitted source inventory.",
    );
  });

  it("requires an external trust store before accepting an independent review", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts", "goal.mjs"),
        "review",
        "--task",
        "Q-008-HARNESS-EVIDENCE-INTEGRITY",
        "--type",
        "independent",
        "--record",
        "forged-review.json",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, GOAL_REVIEW_TRUST_STORE: "" },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GOAL_REVIEW_TRUST_STORE");
  });

  it("rejects a trust store inside the mutable checkout", () => {
    const trustStorePath = path.join(
      repositoryRoot,
      ".goal",
      "forged-trust-store.json",
    );
    writeFileSync(trustStorePath, "{}\n", "utf8");
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(repositoryRoot, "scripts", "goal.mjs"),
          "review",
          "--task",
          "Q-008-HARNESS-EVIDENCE-INTEGRITY",
          "--type",
          "independent",
          "--record",
          "forged-review.json",
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: { ...process.env, GOAL_REVIEW_TRUST_STORE: trustStorePath },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("outside the repository checkout");
    } finally {
      unlinkSync(trustStorePath);
    }
  });
});
