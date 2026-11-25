// 문구 렌더 도우미. 조사는 패키지 원본 josa.js로만 처리한다(마스터 스펙 8장 3번 — 하드코딩·"은(는)" 병기 금지).
import { render, normalizeItemText } from "./josa.js";

export type Vars = Record<string, string>;

/** 데이터 문구 → 화면 문장. "{애칭}은"처럼 적힌 문항 문구도 받침에 맞춰 바꾼다. */
export function R(text: string, vars: Vars): string {
  return render(normalizeItemText(text), vars);
}

/** 고리 이름: 데이터의 "(안내 문구 함께)" 같은 괄호 메모는 화면에 내지 않는다(report_pretest/build_input.mjs loopName과 같음). */
export function cleanLoopName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

/**
 * 안전 연락처 문구 끝의 작업 메모("— 출시 전 연락처 최신 여부 확인 필요")는 화면에 내지 않는다.
 * 연락처(1366·112) 자체는 그대로. 출시 전 최신 여부 확인은 owner 할 일로 남아 있다.
 */
export function cleanContacts(text: string): string {
  return text.replace(/\s*[—-]\s*출시 전.*$/, "").trim();
}

/** "**굵게**" 표시가 들어 있는 결과 문구를 화면 조각으로 나눈다(마크다운 렌더러 없이). */
export function boldParts(text: string): { b: boolean; t: string }[] {
  const out: { b: boolean; t: string }[] = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((p) => {
    if (!p) return;
    if (p.startsWith("**") && p.endsWith("**")) out.push({ b: true, t: p.slice(2, -2) });
    else out.push({ b: false, t: p });
  });
  return out;
}
