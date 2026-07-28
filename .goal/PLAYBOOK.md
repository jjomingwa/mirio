# Goal Execution Playbook

This playbook is deliberately mechanical so an agent can run it without guessing.

## Fixed objective

Improve Crowntrail Kingdom toward a premium commercial release while preserving an honest
`UNPROVEN` state until external market evidence exists. Steam on Windows is the researched
candidate, not an approved target. The price floor is USD 20.00, the planned test price is
USD 24.99, and the launch discount may not exceed 15%.

The purchase conversion cohort is a locked chain:

1. A unique player completes the demo.
2. The player uses the demo-complete purchase CTA.
3. The CTA produces a tracked Steam UTM visit.
4. A paid purchase attributable to that visit occurs within 72 hours.

The evaluation cohort needs at least 400 eligible unique visits. At the minimum cohort,
at least 220 purchases are required. For larger cohorts the observed conversion rate must
remain at least 0.55. In all cases the two-sided Wilson 95% lower confidence bound must be at
least 0.50.

Use `z = 1.959963984540054` and:

```text
center = (p + z²/(2n)) / (1 + z²/n)
margin = z * sqrt((p(1-p) + z²/(4n))/n) / (1 + z²/n)
lower = center - margin
```

Refunds and retained purchases are audited separately at day 14. They do not change the
pre-registered 72-hour conversion calculation and must never be hidden.

## State meanings

- `PASS`: current, attributable evidence proves the requirement.
- `FAIL`: current evidence contradicts the requirement.
- `UNKNOWN`: evidence is absent, stale, incomplete, indirect, or cannot prove the claim.
- `UNPROVEN`: the overall commercial objective has not passed G6.

No evidence means `UNKNOWN`. A gate is PASS only when every required child requirement is
PASS and the gate has at least one evidence identifier.

## Status procedure

1. Parse `.goal/goal.json`, `gates.json`, `rubric.json`, and `backlog.json`.
2. Confirm exactly one or zero backlog items are `active`.
3. Inspect Git branch, commit SHA, and dirty state.
4. For each gate, verify that referenced evidence exists and belongs to the current commit or
   explicitly documented external cohort.
5. Downgrade stale or missing evidence to `UNKNOWN`.
6. Report:
   - overall goal status;
   - first `FAIL` or `UNKNOWN` gate;
   - active item, if any;
   - next eligible item;
   - decisions or permissions currently required.

G0 remains unresolved while the store, operating system, audience, or attribution contract is
`NEEDS_USER_DECISION` or `UNKNOWN`. Continue eligible platform-independent G1-G4 items. Do
not recruit G5 players or claim G6 without those decisions.

## Next-item procedure

Filter backlog items in this order:

1. Include only items whose status is exactly `ready` and whose dependencies are all `done`.
2. Exclude items whose target gate is already PASS.
3. Prefer a recorded critical IP/legal, data-loss, crash, or unplayable defect.
4. Otherwise sort by numeric `priority` ascending, then `id` ascending.
5. Select exactly one item and set it to `active`.

If no item is eligible, report the exact blocker. Do not create speculative work merely to
stay busy.

## Work-item lifecycle

For the active item:

1. Re-read its problem evidence, hypothesis, scope, acceptance checks, verification commands,
   human checks, risks, and dependencies.
2. Capture a baseline before editing.
3. Change only the declared scope. If a materially different solution is required, stop and
   update the backlog contract before implementation.
4. Run all applicable verification commands as a batch.
5. Self-review each acceptance check. Record `PASS`, `FAIL`, or `UNKNOWN`; never omit one.
6. Ask a separate agent or human to review adversarially.
7. Store an evidence manifest using `.goal/schemas/evidence.schema.json`.
8. Move to:
   - `done` only when all required evidence and review conditions pass;
   - `review` when implementation is ready but independent review is missing;
   - `blocked` when a named external dependency or user decision prevents progress;
   - `ready` when verification fails and more implementation is needed.

## Evidence protocol

Evidence manifests live under `.goal/evidence/runs/<run-id>/manifest.json`. Evidence
identifiers must point to stable paths or external report identifiers and must never be
fabricated.

Each run records:

- run ID, UTC time, commit SHA or explicit `NO_COMMIT`, and dirty state;
- operating system, runtime and browser versions;
- gate and backlog item IDs;
- every command, exit code, duration, and output/artifact reference;
- screenshot, video, trace, report, or dataset SHA-256 where applicable;
- requirement-by-requirement status and evidence IDs;
- self-review and independent-review IDs;
- external cohort definition and provenance for G5/G6.

## Review protocol

The implementer performs self-review but cannot provide the independent verdict.

The independent reviewer must:

1. Receive the goal contract, acceptance checks, diff, and evidence—not just the
   implementer's summary.
2. Try to reproduce failures and find counterexamples.
3. Mark every acceptance check `PASS`, `FAIL`, or `UNKNOWN`.
4. Record blocking and non-blocking findings separately.
5. Refuse PASS when evidence is missing, stale, narrower than the claim, or generated against
   another commit.

Subjective premium quality requires target-player or qualified human review. Automated agents
may organize and compare evidence but must not impersonate buyers.

## Gate routing

- G0: commercial definition and external measurement feasibility.
- G1: reproducible baseline and navigable repository.
- G2: deterministic data, save, build, and unit-level correctness.
- G3: actual browser flow, input, effects, accessibility, and runtime evidence.
- G4: premium vertical slice, campaign-value matrix, IP, and asset licensing.
- G5: blinded playtest with the user-approved target audience.
- G6: pre-registered Steam funnel and separate day-14 audit.

G1-G4 can progress without the audience decision when the work is genuinely
platform-independent. G5 and G6 cannot.

## Mechanical command loop

Run these commands from the repository root. Replace task, evidence, record, and reason values
with the current work item:

```powershell
npm run goal:validate
npm run goal:status
npm run goal:next
npm run goal -- start --task Q-002-CROWN-MAX
npm run goal -- submit --task Q-002-CROWN-MAX --evidence .goal/evidence/runs/<run-id>/manifest.json
npm run goal -- review --task Q-002-CROWN-MAX --type self --result PASS --evidence .goal/evidence/runs/<run-id>/manifest.json --note "<acceptance review>"
npm run goal -- review --task Q-002-CROWN-MAX --type independent --result PASS --evidence .goal/evidence/runs/<run-id>/manifest.json --note "<adversarial review>"
npm run goal -- complete --task Q-002-CROWN-MAX
npm run goal -- block --task Q-002-CROWN-MAX --reason "<external blocker>"
```

Use the verification tier required by the active item:

```powershell
npm run verify:fast
npm run verify:browser
npm run verify:release
npm run format:check
npm run lint
npm test
npm run build
npm run test:e2e
```

Do not run `npm install`, `npm ci`, `npx playwright install`, network research, Steam tooling,
or publishing commands without user approval. A missing Playwright browser is a blocker, not
a test PASS. After the same browser strategy fails twice, do not run it a third time without
user direction.

## Stop conditions

Stop and ask one direct question when a required target or preference is missing, permissions
or authentication fail, network/install/external account access is needed, the same strategy
fails twice, a destructive or out-of-workspace action is next, commercial license evidence is
ambiguous, or a broad search would be needed because the target is unknown.
