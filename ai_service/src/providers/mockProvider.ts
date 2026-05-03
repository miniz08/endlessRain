import type { AiProvider, AnalysisResult } from "./types.js";
import { keywordTags } from "../services/tagMapping.js";
import { decisionFromScores, normalizeScores, riskLevelFromScores } from "../services/scorePolicy.js";

const toxicWords = ["傻", "滚", "垃圾", "辱骂", "攻击", "仇恨", "歧视"];
const illegalWords = ["诈骗", "洗钱", "毒品", "赌博", "盗号", "违法", "犯罪"];
const spamWords = ["加微信", "返利", "刷单", "优惠链接", "代充", "推广"];
const professionalWords = ["分析", "数据", "研究", "模型", "方法", "案例", "证据", "结论"];
const friendlyWords = ["谢谢", "请", "建议", "分享", "讨论", "理解", "帮助"];

export const mockProvider: AiProvider = {
  id: "mock",
  model: "deterministic-local-rules",
  async analyze({ content }): Promise<AnalysisResult> {
    const riskHits = countHits(content, [...toxicWords, ...illegalWords, ...spamWords]);
    const illegalHits = countHits(content, illegalWords);
    const spamHits = countHits(content, spamWords);
    const toxicHits = countHits(content, toxicWords);
    const proHits = countHits(content, professionalWords);
    const friendlyHits = countHits(content, friendlyWords);
    const lengthBonus = content.length > 80 ? 8 : content.length > 30 ? 4 : 0;

    const scores = normalizeScores({
      friendlinessScore: 82 + friendlyHits * 4 - toxicHits * 18 - riskHits * 3,
      rationalityScore: 76 + proHits * 4 + lengthBonus - spamHits * 12 - toxicHits * 8,
      legalityScore: 90 - illegalHits * 26 - spamHits * 14 - toxicHits * 8,
      professionalismScore: 64 + proHits * 7 + lengthBonus - spamHits * 8,
    });

    return {
      scores,
      riskLevel: riskLevelFromScores(scores),
      decision: decisionFromScores(scores),
      tags: keywordTags(content),
      reason: buildReason(riskHits, scores.legalityScore),
      suggestion: scores.legalityScore >= 60 ? "内容可进入发布流程。" : "建议拒绝发布或进入人工复核。",
      provider: this.id,
      model: this.model,
      raw: { riskHits, proHits, friendlyHits },
    };
  },
};

function countHits(content: string, words: string[]): number {
  return words.reduce((count, word) => count + (content.includes(word) ? 1 : 0), 0);
}

function buildReason(riskHits: number, legalityScore: number): string {
  if (legalityScore < 40) return "本地规则检测到明显高风险表达。";
  if (riskHits > 0) return "本地规则检测到一定风险词，建议降低展示或复核。";
  return "本地规则未发现明显违规风险，内容表达基本正常。";
}
