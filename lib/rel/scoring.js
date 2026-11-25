// 관계성 테스트 채점 로직 v1.0 (2026-10-07)
// 규칙 원문은 01_설계/관계성테스트_마스터스펙.md 5장. 무작위 선택은 어디에도 쓰지 않는다.
// 모든 4지선다 점수는 4·3·2·1. 2부 '잘 모르겠어요'는 null.

export const COMPS = ["기대기", "믿기", "선 지키기", "말하기", "회복하기"]; // 동점 시 고정 순서로도 사용
export const MODES = ["다가가기", "맞춰주기", "거리두기", "조율하기"];

export const TH = {
  ALL_HIGH: 3.5,      // 모든 역량이 이 이상이면 확인 화면(5개 중 선택)
  NEIGHBOR: 0.5,      // 가장 낮은 역량과 두 번째 차이가 이 이하면 '가까운 이웃'
  GAP: 1.5,           // 속·겉 간격 문장 기준
  INCONSISTENT: 3,    // 비슷한 장면 두 문항 차이가 이 값이면 '상황에 따라 달라요'
  INCONSISTENT_ALL: 3,// 이런 역량이 이 개수 이상이면 전체 안내
  HIDDEN_RELY: 2.0,   // 히든: 기대기 역량이 이 이하
  HIDDEN_VOTES: 3,    // 히든: 거리두기 표가 이 이상
  MISMATCH: 1.5,      // 가장 엇갈리는 지점 문장 노출 기준
  BALANCE: 0.6,       // 먼저 건네기 저울 균형 기준
  BADGE_MIN: 3.0,     // 상리공생 배지: 모든 겉 점수 이 이상
  PARTNER_MIN_COMPS: 3// 판단 가능한 역량이 이 개수 미만이면 2부 유형 대신 안내
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const EPS = 1e-9;

// ---------- 1부: 나 ----------
// answers: { "S-기대기-속1": 1..4, ... } (문항 ID는 데이터 파일 part1_competency 기준)
export function scoreSelf(answers, items) {
  const by = {};
  for (const c of COMPS) by[c] = { 속: [], 겉: [] };
  for (const it of items) {
    const v = answers[it.id];
    if (v == null) throw new Error(`1부 응답 누락: ${it.id}`); // 1부는 필수 응답(화면에서 건너뛰기 불가)
    const n = Number(it.id.slice(-1)) - 1;               // 속1 → 0, 속2 → 1
    by[it.역량][it.구분][n] = v;
  }
  const comp = {};
  for (const c of COMPS) {
    const { 속, 겉 } = by[c];
    const inner = mean(속), outer = mean(겉);
    const gaps = [속[0] - 겉[0], 속[1] - 겉[1]];       // 속n ↔ 겉n (보기 구조가 같은 짝)
    const sameDir = gaps[0] * gaps[1] > 0;
    const gapAvg = mean(gaps);
    comp[c] = {
      total: mean([...속, ...겉]), inner, outer, 속, 겉,
      gap: sameDir && Math.abs(gapAvg) >= TH.GAP ? (gapAvg > 0 ? "inner_higher" : "outer_higher") : null,
      gapSize: Math.abs(gapAvg),
      inconsistent: Math.abs(속[0] - 속[1]) >= TH.INCONSISTENT || Math.abs(겉[0] - 겉[1]) >= TH.INCONSISTENT,
    };
  }
  const lowest = pickLowest(comp, (c) => comp[c].outer);
  const inconsistentCount = COMPS.filter((c) => comp[c].inconsistent).length;
  return { comp, lowest, inconsistentAll: inconsistentCount >= TH.INCONSISTENT_ALL };
}

// 가장 낮은 역량. 동점이면 tieBreak(겉 점수)이 더 낮은 쪽 → 그래도 같으면 확인 화면
export function pickLowest(comp, tieBreak) {
  const totals = COMPS.filter((c) => comp[c] && comp[c].total != null);
  const low = Math.min(...totals.map((c) => comp[c].total));
  if (totals.every((c) => comp[c].total >= TH.ALL_HIGH)) return { mode: "all_high", options: [...totals] };
  let tied = totals.filter((c) => Math.abs(comp[c].total - low) < EPS);
  if (tied.length > 1 && tieBreak) {
    const lowTB = Math.min(...tied.map(tieBreak));
    tied = tied.filter((c) => Math.abs(tieBreak(c) - lowTB) < EPS);
  }
  if (tied.length > 1) return { mode: "tie", options: tied };
  return { mode: "single", options: tied, value: tied[0] };
}

// 가까운 이웃: 확정 역량과 다음으로 낮은 역량의 차이가 0.5 이하
export function neighborOf(comp, confirmed) {
  const others = COMPS.filter((c) => c !== confirmed && comp[c]?.total != null)
    .sort((a, b) => comp[a].total - comp[b].total || COMPS.indexOf(a) - COMPS.indexOf(b));
  const n = others[0];
  return n && comp[n].total - comp[confirmed].total <= TH.NEIGHBOR + EPS ? n : null;
}

// ---------- 방식 (1부·2부 공통) ----------
// votes: ["거리두기","조율하기",...] 4개. 2부는 '잘 모르겠어요' = null
export function pickMode(votes) {
  const valid = votes.filter(Boolean);
  if (valid.length < 2) return { mode: "confirm", options: [...MODES] };
  const count = Object.fromEntries(MODES.map((m) => [m, valid.filter((v) => v === m).length]));
  const top = Math.max(...Object.values(count));
  const leaders = MODES.filter((m) => count[m] === top);
  return leaders.length > 1 ? { mode: "confirm", options: leaders, count } : { mode: "single", value: leaders[0], count };
}

// ---------- 유형 ----------
export function typeOf(types, competency, mode, opts = {}) {
  const { relyScore, distanceVotes } = opts; // 히든 판정용
  if (competency === "말하기" && mode === "거리두기" &&
      distanceVotes >= TH.HIDDEN_VOTES && relyScore != null && relyScore <= TH.HIDDEN_RELY + EPS) {
    return types.find((t) => t.name === "바다의 노인");
  }
  return types.find((t) => t.competency === competency && t.mode === mode && t.name !== "바다의 노인");
}

// ---------- 2부: 내 눈에 비친 {애칭} ----------
// answers: { "O-기대기-A": 1..4 | null }
export function scorePartner(answers, items) {
  const comp = {};
  for (const c of COMPS) {
    const vals = items.filter((it) => it.역량 === c).map((it) => answers[it.id] ?? null);
    const seen = vals.filter((v) => v != null);
    comp[c] = seen.length
      ? { total: mean(seen), inconsistent: seen.length === 2 && Math.abs(seen[0] - seen[1]) >= TH.INCONSISTENT }
      : { total: null, unseen: true };
  }
  const judged = COMPS.filter((c) => comp[c].total != null);
  if (judged.length < TH.PARTNER_MIN_COMPS) return { comp, lowest: { mode: "insufficient", options: [] } };
  return { comp, lowest: pickLowest(comp, null) }; // 2부는 겉만 있으므로 동점이면 바로 확인 화면
}

// ---------- 두 사람 ----------
export function loopKey(myMode, partnerMode) {
  const [a, b] = [myMode, partnerMode].sort((x, y) => MODES.indexOf(x) - MODES.indexOf(y));
  return `${a}×${b}`; // 데이터 loop_flow의 키. A = 앞쪽 방식의 사람
}

// 가장 엇갈리는 지점: 내 겉 vs 그 사람 점수
export function mismatch(selfComp, partnerComp) {
  let best = null;
  for (const c of COMPS) {
    const p = partnerComp[c]?.total;
    if (p == null) continue;
    const d = selfComp[c].outer - p;
    if (Math.abs(d) >= TH.MISMATCH - EPS && (!best || Math.abs(d) > Math.abs(best.diff) + EPS)) best = { competency: c, diff: d };
  }
  return best ? { ...best, key: best.diff > 0 ? "me_higher" : "partner_higher" } : { key: "none" };
}

// 먼저 건네기 저울: 말하기·회복하기 겉
export function balance(selfComp, partnerComp) {
  const ps = ["말하기", "회복하기"].map((c) => partnerComp[c]?.total).filter((v) => v != null);
  if (!ps.length) return null;
  const me = mean([selfComp["말하기"].outer, selfComp["회복하기"].outer]);
  const d = me - mean(ps);
  const key = Math.abs(d) < TH.BALANCE ? "balanced" : d > 0 ? "me" : "partner";
  const allHigh = COMPS.every((c) => selfComp[c].outer >= TH.BADGE_MIN &&
    (partnerComp[c]?.total == null || partnerComp[c].total >= TH.BADGE_MIN));
  return { key, diff: d, badge: key === "balanced" && allHigh };
}

// 공유 카드 '내 마음' 문장: 확정 역량 우선 → 간격 큰 순 → 고정 순서
export function innerOuterLine(selfComp, confirmed) {
  const cands = COMPS.filter((c) => selfComp[c].gap)
    .sort((a, b) => (b === confirmed) - (a === confirmed) || selfComp[b].gapSize - selfComp[a].gapSize || COMPS.indexOf(a) - COMPS.indexOf(b));
  return cands.length ? { competency: cands[0], key: selfComp[cands[0]].gap } : { key: "default" };
}

// (2026-10-22 안전 문항 삭제 — 화면에서 쓰지 않음. 호환용으로만 남김)
export function safetyFlag(answer) {
  return answer === "예" || answer === "말하고 싶지 않아요";
}
