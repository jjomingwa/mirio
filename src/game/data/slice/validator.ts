import type { AuthoredSliceStage } from "./types";

export interface ValidationIssue {
  code: string;
  message: string;
}

export function validateAuthoredStage(
  stage: AuthoredSliceStage,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!stage.id) {
    issues.push({
      code: "STAGE_ID_MISSING",
      message: "Stage must have an ID.",
    });
  }

  if (!stage.sections || stage.sections.length === 0) {
    issues.push({
      code: "SECTIONS_EMPTY",
      message: `${stage.id} has no sections.`,
    });
    return issues;
  }

  const hasSetup = stage.sections.some((s) => s.purpose === "setup");
  const hasPayoff = stage.sections.some((s) => s.purpose === "payoff");

  if (!hasSetup) {
    issues.push({
      code: "MISSING_SETUP_BEAT",
      message: `${stage.id} must have at least one setup beat.`,
    });
  }

  if (!hasPayoff) {
    issues.push({
      code: "MISSING_PAYOFF_BEAT",
      message: `${stage.id} must have at least one payoff beat.`,
    });
  }

  const seenSectionIds = new Set<string>();
  const seenTargetIds = new Set<string>();

  for (const section of stage.sections) {
    if (seenSectionIds.has(section.id)) {
      issues.push({
        code: "DUPLICATE_SECTION_ID",
        message: `Duplicate section ID ${section.id} in ${stage.id}.`,
      });
    }
    seenSectionIds.add(section.id);

    for (const target of section.rushTargets) {
      if (seenTargetIds.has(target.id)) {
        issues.push({
          code: "DUPLICATE_TARGET_ID",
          message: `Duplicate rush target ID ${target.id} in ${stage.id}.`,
        });
      }
      seenTargetIds.add(target.id);
    }
  }

  return issues;
}

export function validateStageSequence(
  stages: AuthoredSliceStage[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stageMap = new Map<string, AuthoredSliceStage>();

  for (const stage of stages) {
    issues.push(...validateAuthoredStage(stage));
    stageMap.set(stage.id, stage);
  }

  // Graph reachability check
  for (const stage of stages) {
    const target = stage.exit.targetStageId;
    if (target !== "boss-throne" && !stageMap.has(target)) {
      issues.push({
        code: "UNREACHABLE_NEXT_STAGE",
        message: `${stage.id} exits to unknown stage ${target}.`,
      });
    }
  }

  return issues;
}
