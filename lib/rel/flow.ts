// 테스트 장면 순서(마스터 스펙 2장 사용자 흐름). 순수 함수 — 서버와 테스트에서 같이 쓴다.
// 장면마다 자기 주소를 가진다(/test/{세션}/{step}, 쏠 타로 하우스와 같은 원칙).
//
// 응답 저장 형식(answers):
//   intro1·intro2         true (안내를 읽고 [시작])
//   p1-01 ~ p1-20         1부 역량 장면 점수 1~4 (part1_order 순서)
//   c1-comp               확인 화면에서 고른 역량(동점·모두 3.5 이상일 때만)
//   m1-1 ~ m1-4           "역량|방식" — 확정 역량이 바뀌면 이전 표는 저절로 무효가 되도록 역량을 함께 적는다
//   c1-mode               확인 화면에서 고른 방식(동점일 때만)
//   p2-01 ~ p2-10         2부 역량 장면 점수 1~4, '잘 모르겠어요' = null (데이터 part2_competency 순서)
//   c2-comp               {애칭} 역량 확인(동점·모두 3.5 이상·판단 부족)
//   m2-1 ~ m2-4           "역량|방식" 또는 "역량|" (잘 모르겠어요)
//   c2-mode               {애칭} 방식 확인(동점·유효 표 2개 미만)
// 장면 번호(리포트 인용 "N번 장면"): 1부 역량 1~20, 1부 방식 21~24, 2부 역량 25~34, 2부 방식 35~38 — report_pretest/build_input.mjs와 같다.
import * as S from "./scoring.js";

export type AnswerValue = number | string | boolean | null;
export type Answers = Record<string, AnswerValue>;

export type Item = { id: string; 역량: string; 구분?: string; 질문?: string; 장면: string; 결혼?: string | null; 보기: { text: string; score: number }[]; 결혼_보기_override?: Record<string, string>; display_order: number[] };
export type ModeScene = { id: string; 부: string; 역량: string; 장면: string; 결혼?: string | null; 보기: Record<string, string>; 결혼_보기_override?: Record<string, string>; display_order: string[] };
export type TypeRow = { name: string; competency: string; mode: string; family: string; desc: string; contrast: string; 강점: string[]; 약점: string[]; 제안: string[] };
export type RelData = {
  part1_order: string[];
  part1_competency: Item[];
  part2_competency: Item[];
  mode_scenes: ModeScene[];
  types: TypeRow[];
  [k: string]: unknown;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const P1_STEPS = Array.from({ length: 20 }, (_, i) => `p1-${pad(i + 1)}`);
export const P2_STEPS = Array.from({ length: 10 }, (_, i) => `p2-${pad(i + 1)}`);
export const M1_STEPS = ["m1-1", "m1-2", "m1-3", "m1-4"];
export const M2_STEPS = ["m2-1", "m2-2", "m2-3", "m2-4"];
export const TOTAL_SCENES = 38;

const has = (a: Answers, k: string) => Object.prototype.hasOwnProperty.call(a, k);

/** 1부 응답을 scoring.js 형식({문항 ID: 점수})으로 */
export function selfAnswers(a: Answers, D: RelData): Record<string, number> {
  const out: Record<string, number> = {};
  D.part1_order.forEach((id, i) => {
    const v = a[P1_STEPS[i]];
    if (typeof v === "number") out[id] = v;
  });
  return out;
}
export function partnerAnswers(a: Answers, D: RelData): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  D.part2_competency.forEach((it, i) => {
    const v = a[P2_STEPS[i]];
    out[it.id] = typeof v === "number" ? v : null;
  });
  return out;
}

const modeVote = (v: AnswerValue, comp: string): { ok: boolean; mode: string | null } => {
  if (typeof v !== "string") return { ok: false, mode: null };
  const [c, m] = v.split("|");
  if (c !== comp) return { ok: false, mode: null };
  return { ok: true, mode: m || null };
};

export type Derived = {
  self?: ReturnType<typeof S.scoreSelf>;
  myComp?: string;
  myModeR?: ReturnType<typeof S.pickMode>;
  myMode?: string;
  partner?: ReturnType<typeof S.scorePartner>;
  pComp?: string;
  pModeR?: ReturnType<typeof S.pickMode>;
  pMode?: string;
};

/** 지금까지의 응답으로 나오는 장면 순서와 중간 계산값. 확인 화면은 필요할 때만 들어간다(무작위 선택 없음). */
export function sequence(a: Answers, D: RelData): { steps: string[]; d: Derived } {
  const steps = ["intro1", ...P1_STEPS];
  const d: Derived = {};
  if (!P1_STEPS.every((k) => typeof a[k] === "number")) return { steps, d };

  d.self = S.scoreSelf(selfAnswers(a, D), D.part1_competency);
  const low = d.self.lowest;
  if (low.mode !== "single") {
    steps.push("c1-comp");
    const c = a["c1-comp"];
    if (typeof c === "string" && low.options.includes(c)) d.myComp = c;
  } else d.myComp = low.value;
  if (!d.myComp) return { steps, d };

  steps.push(...M1_STEPS);
  const v1 = M1_STEPS.map((k) => modeVote(a[k], d.myComp!));
  if (!v1.every((x) => x.ok && x.mode)) return { steps, d };
  d.myModeR = S.pickMode(v1.map((x) => x.mode));
  if (d.myModeR.mode !== "single") {
    steps.push("c1-mode");
    const m = a["c1-mode"];
    if (typeof m === "string" && d.myModeR.options.includes(m)) d.myMode = m;
  } else d.myMode = d.myModeR.value;
  if (!d.myMode) return { steps, d };

  steps.push("intro2", ...P2_STEPS);
  if (!P2_STEPS.every((k) => has(a, k) && (typeof a[k] === "number" || a[k] === null))) return { steps, d };
  d.partner = S.scorePartner(partnerAnswers(a, D), D.part2_competency);
  const pl = d.partner.lowest;
  if (pl.mode !== "single") {
    steps.push("c2-comp");
    const c = a["c2-comp"];
    const opts = confirmOptions("c2-comp", d);
    if (typeof c === "string" && opts.includes(c)) d.pComp = c;
  } else d.pComp = pl.value;
  if (!d.pComp) return { steps, d };

  steps.push(...M2_STEPS);
  const v2 = M2_STEPS.map((k) => modeVote(a[k], d.pComp!));
  if (!v2.every((x) => x.ok)) return { steps, d };
  d.pModeR = S.pickMode(v2.map((x) => x.mode));
  if (d.pModeR.mode !== "single") {
    steps.push("c2-mode");
    const m = a["c2-mode"];
    if (typeof m === "string" && d.pModeR.options.includes(m)) d.pMode = m;
  } else d.pMode = d.pModeR.value;
  return { steps, d };
}

/** 확인 화면에서 고를 수 있는 보기. {애칭} 판단 부족(3개 역량 미만)이면 다섯 역량 모두에서 고른다. */
export function confirmOptions(step: string, d: Derived): string[] {
  if (step === "c1-comp") return d.self?.lowest.options ?? [];
  if (step === "c1-mode") return d.myModeR?.options ?? [];
  if (step === "c2-comp") {
    const l = d.partner?.lowest;
    if (!l) return [];
    return l.mode === "insufficient" ? [...S.COMPS] : l.options;
  }
  if (step === "c2-mode") return d.pModeR?.options ?? [];
  return [];
}

export function isAnswered(step: string, a: Answers, d: Derived): boolean {
  if (!has(a, step)) return false;
  const v = a[step];
  if (step === "intro1" || step === "intro2") return v === true;
  if (step.startsWith("p1-")) return typeof v === "number";
  if (step.startsWith("p2-")) return typeof v === "number" || v === null;
  if (step.startsWith("m1-")) return !!d.myComp && modeVote(v, d.myComp).ok && !!modeVote(v, d.myComp).mode;
  if (step.startsWith("m2-")) return !!d.pComp && modeVote(v, d.pComp).ok;
  if (step.startsWith("c")) return typeof v === "string" && confirmOptions(step, d).includes(v);
  return false;
}

/** 끝났으면 null, 아니면 다음에 답할 장면 */
export function nextStep(a: Answers, D: RelData): string | null {
  const { steps, d } = sequence(a, D);
  const first = steps.find((s) => !isAnswered(s, a, d));
  if (first) return first;
  return d.pMode ? null : steps[steps.length - 1];
}

/** 이 장면을 지금 열어도 되는지: 순서에 있고, 앞 장면이 모두 답해져 있어야 한다(건너뛰기 방지). */
export function canOpen(step: string, a: Answers, D: RelData): boolean {
  const { steps, d } = sequence(a, D);
  const i = steps.indexOf(step);
  if (i < 0) return false;
  return steps.slice(0, i).every((s) => isAnswered(s, a, d));
}

/** 응답을 저장한 뒤 더는 순서에 없는 장면의 응답을 지운다(확인 화면이 필요 없어졌거나 역량이 바뀐 경우). */
export function prune(a: Answers, D: RelData): Answers {
  const { steps, d } = sequence(a, D);
  const out: Answers = {};
  for (const [k, v] of Object.entries(a)) {
    if (!steps.includes(k)) continue;
    if ((k.startsWith("m1-") || k.startsWith("m2-")) && !isAnswered(k, { [k]: v }, d)) continue;
    out[k] = v;
  }
  return out;
}

export function prevStep(step: string, a: Answers, D: RelData): string | null {
  const { steps } = sequence(a, D);
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

/** 화면 위 진행 표시용 장면 번호(1~38). 안내·확인 화면은 null */
export function sceneNumber(step: string): number | null {
  if (step.startsWith("p1-")) return Number(step.slice(3));
  if (step.startsWith("m1-")) return 20 + Number(step.slice(3));
  if (step.startsWith("p2-")) return 24 + Number(step.slice(3));
  if (step.startsWith("m2-")) return 34 + Number(step.slice(3));
  return null;
}

export const STEP_RE = /^(intro[12]|p1-(0[1-9]|1\d|20)|p2-(0[1-9]|10)|m[12]-[1-4]|c[12]-(comp|mode))$/;
