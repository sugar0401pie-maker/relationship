// 응답 → 채점 결과(마스터 스펙 4장). 계산은 모두 패키지 원본 scoring.js가 하고, 여기서는 순서대로 부르기만 한다
// (report_pretest/build_input.mjs computeCase와 같은 순서·같은 히든 판정 입력).
import * as S from "./scoring.js";
import { sequence, type Answers, type RelData } from "./flow.ts";

export type CompScore = { total: number | null; inner?: number; outer?: number; 속?: number[]; 겉?: number[]; gap?: string | null; gapSize?: number; inconsistent?: boolean; unseen?: boolean };

export type RelResult = {
  version: string;
  myType: string;
  myComp: string;
  myMode: string;
  pType: string;
  pComp: string;
  pMode: string;
  hiddenSelf: boolean;
  hiddenPartner: boolean;
  /** {애칭}에 대해 판단할 수 있는 역량이 3개 미만이었는지(확인 화면에서 직접 골랐음) */
  partnerInsufficient: boolean;
  loopKey: string;
  /** 고리 문구(loop_flow)의 A가 나인지 — 내 방식이 고리 키의 앞쪽이면 A */
  meIsA: boolean;
  self: Record<string, CompScore>;
  partner: Record<string, CompScore>;
  neighbor: string | null;
  inconsistentAll: boolean;
  mismatch: { competency?: string; diff?: number; key: string };
  balance: { key: string; diff: number; badge: boolean } | null;
  innerOuter: { competency?: string; key: string };
  myVotes: Record<string, number>;
  pVotes: Record<string, number>;
};

export function computeResult(a: Answers, D: RelData & { version?: string }): RelResult {
  const { d } = sequence(a, D);
  if (!d.self || !d.myComp || !d.myMode || !d.partner || !d.pComp || !d.pMode || !d.myModeR || !d.pModeR) {
    throw new Error("아직 끝나지 않은 테스트");
  }
  const myVotes = d.myModeR.count ?? countVotes(a, "m1", d.myComp);
  const pVotes = d.pModeR.count ?? countVotes(a, "m2", d.pComp);
  const my = S.typeOf(D.types, d.myComp, d.myMode, { relyScore: d.self.comp["기대기"].total, distanceVotes: myVotes["거리두기"] ?? 0 });
  const pt = S.typeOf(D.types, d.pComp, d.pMode, { relyScore: d.partner.comp["기대기"].total, distanceVotes: pVotes["거리두기"] ?? 0 });
  if (!my || !pt) throw new Error("유형을 찾지 못함");
  return {
    version: D.version ?? "",
    myType: my.name,
    myComp: d.myComp,
    myMode: d.myMode,
    pType: pt.name,
    pComp: d.pComp,
    pMode: d.pMode,
    hiddenSelf: my.name === "바다의 노인",
    hiddenPartner: pt.name === "바다의 노인",
    partnerInsufficient: d.partner.lowest.mode === "insufficient",
    loopKey: S.loopKey(d.myMode, d.pMode),
    meIsA: S.MODES.indexOf(d.myMode) <= S.MODES.indexOf(d.pMode),
    self: d.self.comp,
    partner: d.partner.comp,
    neighbor: S.neighborOf(d.self.comp, d.myComp),
    inconsistentAll: d.self.inconsistentAll,
    mismatch: S.mismatch(d.self.comp, d.partner.comp),
    balance: S.balance(d.self.comp, d.partner.comp),
    innerOuter: S.innerOuterLine(d.self.comp, d.myComp),
    myVotes,
    pVotes,
  };
}

// 확인 화면을 거친 경우 pickMode가 count를 주지 않을 때가 있어(유효 표 2개 미만) 직접 센다
function countVotes(a: Answers, prefix: "m1" | "m2", comp: string): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(S.MODES.map((m) => [m, 0]));
  for (let i = 1; i <= 4; i++) {
    const v = a[`${prefix}-${i}`];
    if (typeof v !== "string") continue;
    const [c, m] = v.split("|");
    if (c === comp && m) out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}
