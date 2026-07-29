# Goal Execution Playbook

This playbook is deliberately mechanical so an agent can run it without guessing.

## Fixed objective

Deliver a polished 50-70 minute action-platformer vertical slice for Crowntrail Kingdom, playable in modern desktop browsers (Chrome/Edge), while preserving an honest `UNPROVEN` state until all gates W0 through W5 and user final acceptance are satisfied.

The experience contract comprises:

1. Core Crown Rush v2 mechanics (dash, charge, trail, encounter).
2. Handcrafted Goldenwind Forest stages (Stage 1 & 2).
3. Broken Throne boss encounter & ending sequence.
4. Save state persistence via browser storage.

## State meanings

- `PASS`: current, attributable evidence proves the requirement.
- `FAIL`: current evidence contradicts the requirement.
- `UNKNOWN`: evidence is absent, stale, incomplete, indirect, or cannot prove the claim.
- `UNPROVEN`: the overall web slice objective has not passed W5 user final acceptance.

No evidence means `UNKNOWN`. A gate is PASS only when every required child requirement is PASS and the gate has at least one evidence identifier.

## Status procedure

1. Parse `.goal/goal.json`, `gates.json`, `rubric.json`, and `backlog.json`.
2. Confirm exactly one or zero backlog items are `active`.
3. Inspect Git branch, commit SHA, and dirty state.
4. For each gate, verify that referenced evidence exists and belongs to the current commit.
5. Downgrade stale or missing evidence to `UNKNOWN`.
6. Report:
   - overall goal status;
   - first `FAIL` or `UNKNOWN` gate;
   - active item, if any;
   - next eligible item;
   - user acceptance status.

## Next-item procedure

Filter backlog items in this order:

1. Include only items whose status is exactly `ready` and whose dependencies are all `done`.
2. Exclude items whose target gate is already PASS.
3. Prefer a recorded critical defect or crash.
4. Otherwise sort by numeric `priority` ascending, then `id` ascending.
5. Select exactly one item and set it to `active`.

If no item is eligible, report the exact blocker. Do not create speculative work merely to stay busy.

## Work-item lifecycle

For the active item:

1. Re-read its problem evidence, hypothesis, scope, acceptance checks, verification commands, human checks, risks, and dependencies.
2. Capture a baseline before editing.
3. Change only the declared scope. If a materially different solution is required, stop and update the backlog contract before implementation.
4. Run all applicable verification commands as a batch.
5. Self-review each acceptance check. Record `PASS`, `FAIL`, or `UNKNOWN`; never omit one.
6. Ask a separate agent or human to review adversarially when required.
7. Store an evidence manifest using `.goal/schemas/evidence.schema.json`.
8. Move to:
   - `done` only when all required evidence and review conditions pass;
   - `review` when implementation is ready but review is missing;
   - `blocked` when a named external dependency or user decision prevents progress;
   - `ready` when verification fails and more implementation is needed.

## Evidence protocol

Evidence manifests live under `.goal/evidence/runs/<run-id>/manifest.json`. Evidence identifiers must point to stable paths or test report identifiers and must never be fabricated.

Each run records:

- run ID, UTC time, commit SHA or explicit `NO_COMMIT`, and dirty state;
- operating system, runtime and browser versions;
- gate and backlog item IDs;
- every command, exit code, duration, and output/artifact reference;
- screenshot, video, trace, report, or dataset SHA-256 where applicable;
- requirement-by-requirement status and evidence IDs.

## Gate routing

- `W0`: Target & Environment Integrity.
- `W1`: Build, Save & Asset Integrity.
- `W2`: Crown Rush Mechanics & State Correctness.
- `W3`: Handcrafted World, Exploration & Boss Progression.
- `W4`: Art, UI, Audio & Accessibility Cohesion.
- `W5`: Full Browser Flow & User Final Acceptance.

## Mechanical command loop

Run these commands from the repository root. Replace task, evidence, record, and reason values with the current work item:

```powershell
npm run goal:validate
npm run goal:status
npm run goal:next
npm run goal -- start --task W2-CROWN-RUSH-V2
npm run goal -- submit --task W2-CROWN-RUSH-V2 --evidence .goal/evidence/runs/<run-id>/manifest.json --implementer-session <session-id>
npm run goal -- review --task W2-CROWN-RUSH-V2 --type self --record .goal/evidence/reviews/<self-review>.json
npm run goal -- complete --task W2-CROWN-RUSH-V2
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
