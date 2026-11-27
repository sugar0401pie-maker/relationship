// 10~12쪽 상대 결과로 두 사람 생각 비교(패키지 v2.6·v2.6.1, 결제후_리포트화면_v1.md §7·§8, 데이터 result_flow.partner_compare).
// 상대 결과는 연결·저장하지 않는다 — 사용자가 상대 결과 화면을 보고 두 유형을 고르면, 이 순수 함수가 브라우저에서 비교한다.
// 상대의 점수·문항 답·약점은 받지 않는다(유형 이름 두 개만). 누가 맞고 틀렸다고 쓰지 않는다.
// 판정·문장 조립은 패키지 시안(docs/design/디자인/result-report-paid-v1/index.html)의 비교 스크립트와 같은 규칙.
import { render, normalizeItemText } from "./josa.js";

export type CmpType = { name: string; comp: string; mode: string; img: string | null; cause: string; family: string };
export type CmpFamily = { code: string; cat: string; title: string; how: string };
export type GapKindCopy = { title: string; body: string; why?: string; action: string };
export type CompareData = {
  types: CmpType[];
  comps: string[];
  modes: string[];
  loops: Record<string, string>; // 고리 키 → 고리 이름(괄호 메모 뺀 것)
  families: Record<string, CmpFamily>; // 2일차 제목·방법({애칭} 렌더 전)
  loopFamily: string; // 작심삼일(합친 판)에 이미 나온 가족 — '더해 볼 것'에서 뺀다
  modeActions: Record<string, string>;
  kinds: Record<"same" | "mode_same" | "comp_same" | "both_diff" | "projection", GapKindCopy>;
  lines: Record<string, string>;
  me: { name: string; self: string; view: string }; // 내 결과: 내가 본 나, 내가 본 {애칭}
  nickname: string;
};

export type GapKind = "same" | "mode_same" | "comp_same" | "both_diff";
export type Gap = {
  head: string;
  label: string;
  kind: GapKind;
  title: string;
  body: string;
  inside?: { who: string; text: string };
  outside?: { who: string; text: string };
  why?: string;
  projection?: string;
  action: string;
  projectionAction?: string;
};
export type CompareView = {
  cards: { label: string; type: CmpType; other: boolean }[];
  aboutMe: Gap;
  aboutPartner: Gap;
  loops: string;
  extra: { code: string; cat: string; title: string; how: string }[];
};

const R = (t: string, v: Record<string, string>) => render(normalizeItemText(t), v);

const loopKey = (D: CompareData, a: string, b: string) => [a, b].sort((x, y) => D.modes.indexOf(x) - D.modes.indexOf(y)).join("×");

export function gapKind(T: Record<string, CmpType>, s: string, v: string): GapKind {
  if (s === v) return "same";
  if (T[s].mode === T[v].mode) return "mode_same";
  if (T[s].comp === T[v].comp) return "comp_same";
  return "both_diff";
}

/** pSelf = {애칭}이 본 자기 유형(상대 결과 1쪽), pViewMe = {애칭}이 본 나(상대 결과 2쪽) */
export function buildCompare(D: CompareData, pSelf: string, pViewMe: string): CompareView | null {
  const T = Object.fromEntries(D.types.map((t) => [t.name, t]));
  if (!T[pSelf] || !T[pViewMe] || !T[D.me.self] || !T[D.me.view]) return null;
  const me = D.me.name, nick = D.nickname;

  // 한 방향 차이: target이 본 자기 유형 s ↔ viewer가 본 target v. otherOfTarget = target의 상대(두 시선 문장의 {애칭} 자리)
  const gap = (head: string, target: string, viewer: string, s: string, v: string, otherOfTarget: string, projected: boolean): Gap => {
    const k = gapKind(T, s, v);
    const G = D.kinds[k];
    const vars = { 대상: target, 보는이: viewer, 방식: T[s].mode, 방식행동: D.modeActions[T[s].mode] ?? "", 역량: T[s].comp, 보인방식: T[v].mode };
    const cv = { 애칭: otherOfTarget, 이름: otherOfTarget };
    return {
      head,
      label: `${target} ${s} ↔ ${R("{x|이} 본 ", { x: viewer })}${v}`,
      kind: k,
      title: G.title,
      body: R(G.body, vars),
      ...(k !== "same"
        ? {
            inside: { who: R(D.lines.inside, vars), text: R(T[s].cause, cv) },
            outside: { who: R(D.lines.outside, vars), text: R(T[v].cause, cv) },
            why: G.why,
          }
        : {}),
      ...(projected ? { projection: R(D.kinds.projection.body, vars), projectionAction: R(D.kinds.projection.action, vars) } : {}),
      action: R(G.action, vars),
    };
  };

  // 덧붙임 projection: 보는 사람이 상대를 자기와 같은 유형으로 봤고, 그게 실제(상대가 본 자기)와 다를 때
  const aboutMe = gap(D.lines.about_me, me, nick, D.me.self, pViewMe, nick, pViewMe === pSelf && pViewMe !== D.me.self);
  const aboutPartner = gap(R(D.lines.about_partner, { 애칭: nick }), nick, me, pSelf, D.me.view, me, D.me.view === D.me.self && D.me.view !== pSelf);

  const l1 = D.loops[loopKey(D, T[D.me.self].mode, T[D.me.view].mode)] ?? "";
  const l2 = D.loops[loopKey(D, T[pSelf].mode, T[pViewMe].mode)] ?? "";
  const loops = l1 === l2 ? R(D.lines.loops_same, { 고리: l1 }) : R(D.lines.loops_diff, { 이름: me, 애칭: nick, 내고리: l1, 상대고리: l2 });

  // 12쪽 ③ 더해 볼 것: 내 자기 유형 가족·상대 자기 유형 가족 중 작심삼일(고리 가족)과 다른 것만, 같으면 하나(partner_compare.extra_rule)
  const shown = [D.loopFamily];
  const extra: CompareView["extra"] = [];
  for (const code of [T[D.me.self].family, T[pSelf].family]) {
    if (!code || shown.includes(code) || !D.families[code]) continue;
    shown.push(code);
    const F = D.families[code];
    extra.push({ code, cat: F.cat, title: R(F.title, { 애칭: nick }), how: R(F.how, { 애칭: nick }) });
  }

  return {
    cards: [
      { label: "내가 본 나", type: T[D.me.self], other: false },
      { label: `내가 본 ${nick}`, type: T[D.me.view], other: false },
      { label: `${R("{x|이} 본 ", { x: nick })}${nick}`, type: T[pSelf], other: true },
      { label: R("{x|이} 본 나", { x: nick }), type: T[pViewMe], other: true },
    ],
    aboutMe,
    aboutPartner,
    loops,
    extra,
  };
}
