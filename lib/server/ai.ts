import "server-only";
import OpenAI from "openai";

// 이 앱에서 AI를 부르는 유일한 곳. 모델·회사를 바꿀 때 여기만 고친다.
// 모델: owner 결정(2026-11-25)으로 쏘웰라·타로와 같은 gpt-5.6-luna(패키지 스펙 기본은 gpt-6-sol). env REL_AI_MODEL로 바꿀 수 있다.
export const REPORT_MODEL = process.env.REL_AI_MODEL || "gpt-5.6-luna";
// 디저트 테스트 마스터 스펙 8.5 운영 설정(25,000 토큰)을 따른다(관계 테스트 마스터 스펙 7장).
const MAX_OUTPUT_TOKENS = 25000;

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type AiUsage = { model: string; input: number; output: number; reasoning: number; ms: number };

/** 시스템 프롬프트 + 사용자 블록 → 글. 잘린 응답(incomplete)·빈 응답은 예외. 응답 문장·입력은 로그에 남기지 않는다(토큰 수만). */
export async function generateReportText(system: string, user: string, timeoutMs: number): Promise<{ text: string; usage: AiUsage }> {
  const t0 = Date.now();
  const res = await new OpenAI({ timeout: timeoutMs, maxRetries: 0 }).responses.create({
    model: REPORT_MODEL,
    instructions: system,
    input: user,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // OpenAI 서버에 응답 기록을 남기지 않는다(쏠 타로 하우스 owner 2026-11-05 결정과 같음).
    store: false,
  });
  const u = res.usage;
  const usage: AiUsage = {
    model: res.model ?? REPORT_MODEL,
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    reasoning: u?.output_tokens_details?.reasoning_tokens ?? 0,
    ms: Date.now() - t0,
  };
  console.info(`[rel-ai] report model=${usage.model} in=${usage.input} out=${usage.output} reasoning=${usage.reasoning} ms=${usage.ms}`);
  if (res.status && res.status !== "completed") throw Object.assign(new Error(`AI 응답이 완료되지 않음(${res.status})`), { usage });
  const text = res.output_text?.trim();
  if (!text) throw Object.assign(new Error("AI가 빈 응답을 반환함"), { usage });
  return { text, usage };
}
