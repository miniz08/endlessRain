export type ScoreSet = {
  friendlinessScore: number;
  rationalityScore: number;
  legalityScore: number;
  professionalismScore: number;
};

export type TagCandidate = {
  name: string;
  category: string;
  confidence: number;
  weight: number;
};

export type AnalysisDecision = "ALLOW" | "LOW_PRIORITY" | "REVIEW" | "REJECT";

export type AnalysisResult = {
  scores: ScoreSet;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "BLOCK";
  decision: AnalysisDecision;
  tags: TagCandidate[];
  reason: string;
  suggestion: string;
  provider: string;
  model: string;
  raw?: unknown;
};

export type AnalyzeInput = {
  content: string;
  taxonomy: string;
};

export interface AiProvider {
  id: string;
  model: string;
  analyze(input: AnalyzeInput): Promise<AnalysisResult>;
}
