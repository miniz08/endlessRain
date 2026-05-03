import type { AnalysisDecision, ScoreSet } from "../providers/types.js";
import { clampScore } from "../utils/validation.js";

export function normalizeScores(input: Partial<Record<keyof ScoreSet, unknown>>): ScoreSet {
  return {
    friendlinessScore: clampScore(input.friendlinessScore, 70),
    rationalityScore: clampScore(input.rationalityScore, 70),
    legalityScore: clampScore(input.legalityScore, 75),
    professionalismScore: clampScore(input.professionalismScore, 65),
  };
}

export function riskLevelFromScores(scores: ScoreSet): "LOW" | "MEDIUM" | "HIGH" | "BLOCK" {
  if (scores.legalityScore >= 80) return "LOW";
  if (scores.legalityScore >= 60) return "MEDIUM";
  if (scores.legalityScore >= 40) return "HIGH";
  return "BLOCK";
}

export function decisionFromScores(scores: ScoreSet): AnalysisDecision {
  if (scores.legalityScore >= 80) return "ALLOW";
  if (scores.legalityScore >= 60) return "LOW_PRIORITY";
  if (scores.legalityScore >= 40) return "REVIEW";
  return "REJECT";
}
