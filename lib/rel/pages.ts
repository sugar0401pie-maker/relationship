// 결과 10쪽의 화면 내용 조립(결과화면_결제유도_v2.md + 결제후_리포트화면_v1.md). 문구는 모두 데이터 파일에서만 가져온다.
// 이 배포본(클로즈드 세션, owner 2026-11-25)은 결제를 붙이지 않고 전체를 열람한다 — 그래서 4쪽은 결제 상자 없이
// '카드 뒤집기'만 남기고, 5~9쪽은 흐림 예시 대신 AI 리포트 본문을 바로 보여 준다. 결제를 붙일 때는 4~10쪽을 서버에서 빼고
// blur_samples를 보내는 쪽으로 바꾼다(결제 전 유료 본문을 클라이언트로 보내지 않는다 — 마스터 스펙 8장 7번).
import * as S from "./scoring.js";
import { R, boldParts, cleanContacts, cleanLoopName, type Vars } from "./text.ts";
import { meetImages, reportImages, seededIndex, typeImage, type Manifest, type Pic } from "./images.ts";
import type { RelResult } from "./result.ts";
import type { Relationship } from "./steps.ts";
import type { TypeRow } from "./flow.ts";
import type { CompareData } from "./compare.ts";

type Dict = Record<string, unknown>;
type Card = { slot: string; practice_id: string; title: string; how: string; cue: string; minutes: number; format: string; why: string; role?: string };

export type TypeCard = {
  who: string; name: string; img: string | null; family: string; comp: string; mode: string; desc: string;
  sentence?: string; hiddenLine?: string; neighbor?: string;
};
export type Block = { t: "p"; parts: { b: boolean; t: string }[] } | { t: "item"; text: string } | { t: "step"; n: number; text: string };
export type AiSection = { no: number; title: string; blocks: Block[] };
export type PracticeCardView = { slot: string; minutes: number; format: string; title: string; how: string; cue: string; why: string; id: string; role?: string; together: boolean };
export type PlanStep = { day: string; both: boolean; title: string; how?: string; ex?: string[]; role?: string; tired?: string };

export type ResultView = {
  id: string;
  title: string;
  subtitle: string;
  name: string;
  nickname: string;
  relationship: Relationship;
  createdAt: string;
  pages: {
    p1: { title: string; intro: { b: boolean; t: string }[]; card: TypeCard; free: string; strengths: string[]; weaknesses: string[]; theory: string; consistency: string[] };
    p2: { title: string; card: TypeCard; free: string; unseen: string[]; radar: { comps: string[]; me: number[]; partner: (number | null)[] }; insufficient?: string };
    p3: { title: string; cards: [TypeCard, TypeCard]; common: string; diff: string; free: string; twoTitle: string; loopName: string; trigger: string; myMove: string; theirMove: string; loopNote?: string; lead: { b: boolean; t: string }[]; mesh: string; stop: { b: boolean; t: string }[]; next: string };
    p4: { title: string; teaser: string; cta: string; pic: Pic | null; side: [string, string] | null; line: string; story: string; bridge: string; myStep: string; ask: string; shareNote: string; shareText: string; shareButton: string; shareImage: string };
    ai: Record<4 | 5 | 6 | 7 | 8, { title: string; teaser: string }>;
    leadLines: string;
    images: Pic[];
    p9: { note: string; cards: PracticeCardView[] };
    p10: { title: string; intro: string; sub: string; selSelf: string; selView: string; placeholder: string; button: string; invite: string; inviteNote: string };
    p11: { title: string; locked: string; lockButton: string; notJudge: string };
    p12: {
      title: string; talkTitle: string; planTitle: string; planNote: string; plan: PlanStep[]; planWhy?: string; planSrc: string; solo?: string;
      extraTitle: string; sowellaTitle: string; bubble: string; starters: string[]; disclaimer: string;
    };
    compare: CompareData;
  };
};

export type BuildInput = {
  id: string;
  createdAt: string;
  name: string;
  nickname: string;
  relationship: Relationship;
  r: RelResult;
};

const str = (x: unknown) => (typeof x === "string" ? x : "");

export function buildResultView(D: Dict, M: Manifest, inp: BuildInput): ResultView {
  const { r, name, nickname } = inp;
  const vars: Vars = { 이름: name, 애칭: nickname };
  const types = D.types as TypeRow[];
  const ui = D.ui_copy as Dict;
  const rf = D.result_flow as Dict;
  const bk = D.base_knowledge as Record<string, Dict>;
  const families = D.families as { 역량: string; 계열: string }[];
  const T = (n: string) => types.find((t) => t.name === n)!;
  const fam = (c: string) => (families.find((f) => f.역량 === c)?.계열 ?? "").replace(/\s*계열$/, "");
  const pageTitle = (no: number) => R(str((rf.pages as { page: number; title: string }[]).find((p) => p.page === no)?.title), vars);

  // ---------- 유형 카드 ----------
  const my = T(r.myType), pt = T(r.pType);
  const neighborType = r.neighbor ? S.typeOf(types, r.neighbor, r.myMode, {})?.name : null;
  const myCard: TypeCard = {
    who: "나", name: my.name, img: typeImage(M, my.name), family: fam(my.competency), comp: my.competency, mode: my.mode, desc: R(my.desc, vars),
    sentence: R(str(ui.result_sentence), { ...vars, 유형: my.name }),
    hiddenLine: r.hiddenSelf ? R(str(ui.hidden_reveal), { ...vars, 유형: my.name }) : undefined,
    neighbor: r.neighbor && neighborType ? R(str(ui.neighbor), { ...vars, 이웃역량: r.neighbor, 이웃유형: neighborType }) : undefined,
  };
  const pCard: TypeCard = {
    who: R(str(ui.partner_title), vars), name: pt.name, img: typeImage(M, pt.name), family: fam(pt.competency), comp: pt.competency, mode: pt.mode, desc: R(pt.desc, vars),
    hiddenLine: r.hiddenPartner ? R(str(ui.hidden_reveal), { ...vars, 유형: pt.name }) : undefined,
  };

  // ---------- 1쪽 ----------
  const consistency: string[] = [];
  const incons = S.COMPS.filter((c) => r.self[c]?.inconsistent);
  if (incons.length) consistency.push(`${incons.join(" · ")}: ${str(ui.consistency_item)}`);
  if (r.inconsistentAll) consistency.push(str(ui.consistency_all));

  // ---------- 2쪽 ----------
  const unseen = S.COMPS.filter((c) => r.partner[c]?.unseen);

  // ---------- 3쪽: 우리 사이 두 줄(pairs_render 규칙) ----------
  const pairs = D.pairs as { A: string; B: string; 공통점: string; 차이점: string }[];
  let pair = pairs.find((p) => p.A === r.myType && p.B === r.pType);
  let pv: Vars = { A: name, B: nickname };
  if (!pair) {
    pair = pairs.find((p) => p.A === r.pType && p.B === r.myType)!;
    pv = { A: nickname, B: name };
  }
  const prel = (D.pair_relations as Record<string, Record<string, string>>)[`${r.myType}→${r.pType}`];
  const loops = D.loops as { 조합: string; 고리: string }[];
  const loopName = cleanLoopName(loops.find((l) => l.조합.replace(/\s/g, "") === r.loopKey)?.고리 ?? "");
  const flow = (D.loop_flow as Record<string, Record<string, string>>)[r.loopKey];
  const fv: Vars = r.meIsA ? { A: "나", B: nickname } : { A: nickname, B: "나" };
  const myMove = R(r.meIsA ? flow.A : flow.B, fv);
  const theirMove = R(r.meIsA ? flow.B : flow.A, fv);
  const leads = rf.change_leads as string[];
  const lead = leads[seededIndex(inp.id, leads.length)];
  const sameMode = r.myMode === r.pMode;
  const leadLines = R(str(ui.report_lead_template), { 고리: loopName, 계기: flow.계기, "나의 첫 움직임": myMove });

  // ---------- 4쪽 ----------
  const meet = meetImages(M, r.myType, r.pType);
  const share = rf.share as Dict;

  // ---------- 5~10쪽 그림 ----------
  const images = reportImages(M, r.myType, r.pType, inp.id, 8, meet.pair ? [meet.pair.src] : []);

  // ---------- 9쪽: 실천 카드 + 작심삼일 ----------
  const cv: Vars = { ...vars, A: r.meIsA ? "나" : nickname, B: r.meIsA ? nickname : "나" };
  const mine = ((D.practice_cards as Record<string, Card[]>)[r.myType] ?? []).map((c) => card(c, cv, false));
  const loopCards = (D.loop_practices as Record<string, Card[]>)[r.loopKey] ?? [];
  const merged = couplePlan(D, r, cv, mine, loopCards);
  const { plan, solo } = merged;
  const pc = rf.partner_compare as Dict;
  const box = pc.box as Record<string, string>;

  // ---------- 10쪽 ----------
  const reflect = ((D.reflect_questions as Record<string, { question: string }[]>)[r.myType] ?? []).map((q) => R(q.question, vars));
  const cpl = ((D.couple_plans as Dict).loops as Record<string, { sowella?: Record<string, string> }>)[r.loopKey];
  const disclaimer = R(str(ui.disclaimer), vars);

  const teasers = rf.teasers as Record<string, string>;
  const aiTitle = (no: number) => pageTitle(no + 1);

  return {
    id: inp.id,
    title: str(D.test_title),
    subtitle: str(D.test_subtitle),
    name, nickname, relationship: inp.relationship, createdAt: inp.createdAt,
    pages: {
      p1: {
        title: pageTitle(1), intro: boldParts(R(str(rf.intro), vars)), card: myCard,
        free: R(str(bk[r.myType]?.["무료_당신은"]), vars),
        strengths: my.강점.slice(0, 3).map((s) => R(s, vars)), weaknesses: my.약점.slice(0, 3).map((s) => R(s, vars)),
        theory: str(bk[r.myType]?.["관련 이론"]), consistency,
      },
      p2: {
        title: pageTitle(2), card: pCard, free: R(str(bk[r.pType]?.["무료_애칭은"]), vars),
        unseen: unseen.length ? [`${unseen.join(" · ")}: ${str(ui.partner_unseen)}`] : [],
        radar: { comps: [...S.COMPS], me: S.COMPS.map((c) => r.self[c].total ?? 0), partner: S.COMPS.map((c) => r.partner[c]?.total ?? null) },
        insufficient: r.partnerInsufficient ? R(str(ui.partner_insufficient), vars) : undefined,
      },
      p3: {
        title: pageTitle(3), cards: [myCard, pCard],
        common: R(pair.공통점, pv), diff: R(pair.차이점, pv), free: R(prel.무료_설명, vars),
        twoTitle: str(rf.two_title), loopName, trigger: R(flow.계기, fv), myMove, theirMove,
        loopNote: flow.안내 ? R(flow.안내, fv) : undefined,
        lead: boldParts(lead), mesh: R(flow.맞물림, fv),
        stop: boldParts(R(str(sameMode ? rf.stop_same_mode : rf.stop), vars)),
        next: str(rf.next_button),
      },
      p4: {
        title: pageTitle(4), teaser: R(str(rf.p4_teaser), { ...vars, 고리: loopName }), cta: str(rf.p4_cta),
        pic: meet.pair, side: meet.side,
        line: R(prel.이야기_한줄, vars), story: R(prel.쏠_마을_이야기, vars), bridge: R(flow.다리, fv),
        myStep: R(prel.내가_해볼_한_걸음, vars), ask: R(prel.부탁해_볼_말, vars),
        shareNote: str(share.sheet_note), shareText: R(prel.이야기_한줄, vars),
        // 공유 카드: 4쪽 두 캐릭터 그림(없으면 내 유형 그림) + 이야기 한 줄 + [당신이 보는 우리는?]. 이름·애칭·점수는 넣지 않는다(result_flow.share 규칙)
        shareButton: str(ui.share_button), shareImage: meet.pair?.src ?? myCard.img ?? "/images/intro.jpg",
      },
      ai: {
        4: { title: aiTitle(4), teaser: R(str(teasers["5"]), vars) },
        5: { title: aiTitle(5), teaser: R(str(teasers["6"]), vars) },
        6: { title: aiTitle(6), teaser: R(str(teasers["7"]), vars) },
        7: { title: aiTitle(7), teaser: R(str(teasers["8"]), vars) },
        8: { title: aiTitle(8), teaser: R(str(teasers["9"]), vars) },
      },
      leadLines,
      images,
      // 9쪽: 혼자 카드 3장만(v2.6.1 — '{애칭|과} 함께'는 12쪽 작심삼일에 합침)
      p9: { note: R("혼자 해 볼 카드 세 장입니다. {애칭|과} 함께 해 볼 것은 마지막 12쪽에 모았습니다.", vars), cards: mine },
      // 10쪽: 상대 결과 고르기(partner_compare.box). 안내 문단은 시안 문장을 일반화한 것
      p10: {
        title: pageTitle(10),
        intro: R("{애칭}도 테스트를 했다면, 두 사람이 서로를 어떻게 보고 있는지 맞춰 볼 수 있습니다. {애칭|이} 아직 안 했다면 링크를 보내 보세요. 비교하지 않아도 12쪽 '{애칭|과} 함께 해 볼 일'은 그대로 볼 수 있습니다.", vars),
        sub: R(box.sub, vars), selSelf: R(box.select_partner_self, vars), selView: R(box.select_partner_view_me, vars), placeholder: box.placeholder,
        button: box.button, invite: R(box.invite, vars), // 데이터 box.invite_note("저장되지 않고…")는 owner 2026-11-27 저장 결정과 맞지 않아 이 문장으로 바꿔 보인다
        inviteNote: R("고른 두 유형만 내 결과에 함께 저장되고, {애칭}의 점수나 답은 저장되지 않습니다.", vars),
      },
      p11: {
        title: pageTitle(11), locked: R(str(pc.locked), vars), lockButton: R("{애칭} 결과 넣으러 가기", vars),
        notJudge: "누가 맞고 틀린 것이 아닙니다. 서로의 행동은 보였고, 그 이유를 각자 다르게 짐작했을 수 있습니다.",
      },
      p12: {
        title: pageTitle(12),
        talkTitle: "생각의 차이를 좁히는 서로 해볼 말",
        planTitle: "둘이 함께하는 작심삼일",
        planNote: "하루에 하나씩, 둘이 함께 해 보는 계획입니다. 쏘웰라가 2일차와 3일차에 먼저 말을 걸어 드립니다.",
        plan, planWhy: merged.why, planSrc: merged.src, solo,
        extraTitle: "생각의 차이를 좁히는 데 더해 볼 것",
        sowellaTitle: "쏘웰라와 이어서 이야기하기",
        bubble: cpl?.sowella?.day2 ? R(cpl.sowella.day2, { ...vars, day2_title: plan[1]?.title ?? "", day2_tired_title: merged.tiredTitle ?? "" }) : "",
        starters: [...reflect.slice(0, 2), "오늘 해 본 실천 이야기하기"],
        disclaimer: cleanContacts(disclaimer),
      },
      compare: compareData(D, M, r, name, nickname, merged.family),
    },
  };
}

function card(c: Card, v: Vars, together: boolean): PracticeCardView {
  return {
    slot: together ? "함께" : c.slot, minutes: c.minutes, format: c.format, title: R(c.title, v), how: R(c.how, v), cue: R(c.cue, v), why: R(c.why, v),
    id: c.practice_id, role: c.role ? R(c.role, v) : undefined, together,
  };
}

// 12쪽 「둘이 함께하는 작심삼일」(v2.6.1 합친 판, couple_plans.merge_rule): 1일차 = 내 '오늘' 카드, 2일차 = 둘이 + 함께 실천 2개를 녹임,
// 3일차 = 돌아보기, 1주일, 1달. 문구는 couple_plans·couple_activities·loop_practices 그대로(서버 조립, AI 아님).
// 합치는 방법: 가족 2일차 how에 ①·③ 칸이 있으면 ①에 loop_practices[0]의 예시 문장, ③에 loop_practices[1] 제목을 '— 예:'로 끼우고,
// 칸이 없으면 같은 두 줄을 2일차 아래 예시로 붙인다. loop_practices[0].role = 역할 줄, [0].why = 계획 아래 한 줄.
function couplePlan(D: Dict, r: RelResult, v: Vars, mine: PracticeCardView[], lp: Card[]) {
  const cp = ((D.couple_plans as Dict).loops as Record<string, Dict>)[r.loopKey];
  const fams = (D.couple_activities as Dict).families as Record<string, { solo_version: string; steps: { code: string; title: string; how: string }[] }>;
  const empty = { plan: [] as PlanStep[], src: "", family: "" } as { plan: PlanStep[]; src: string; family: string; why?: string; solo?: string; tiredTitle?: string };
  if (!cp) return empty;
  const famCode = str(cp.family);
  const fam = fams[famCode];
  const step = (code: unknown) => fam?.steps.find((s) => s.code === code);
  const d2 = step((cp.day2 as Dict)?.code), d2t = step((cp.day2_tired as Dict)?.code), wk = step((cp.week as Dict)?.code), mo = step((cp.month as Dict)?.code);
  const today = mine.find((c) => c.slot === "오늘");
  const reflect = (D.reflect_questions as Record<string, { question: string }[]>)[r.myType]?.[0];
  const quote = lp[0] ? (R(lp[0].how, v).match(/"[^"]+"|“[^”]+”/)?.[0] ?? null) : null;
  const second = lp[1] ? R(lp[1].title, v) : null;
  const plan: PlanStep[] = [];
  if (today) plan.push({ day: "1일차", both: false, title: today.title, how: "9쪽 '오늘' 카드를 혼자 해 봅니다." });
  if (d2) {
    let how = R(d2.how, v);
    const ex: string[] = [];
    if (/①/.test(how) && /③/.test(how)) {
      if (quote) how = how.replace(/(①[^②③④]*?)(\s*②)/, `$1 — 예: ${quote}$2`);
      if (second) how = how.replace(/(③[^④]*?)(\s*④)/, `$1 — 예: ${second}$2`);
    } else {
      if (quote) ex.push(`예: ${quote}`);
      if (second) ex.push(`함께 더해 보기: ${second}`);
    }
    plan.push({
      day: "2일차", both: true, title: R(d2.title, v), how, ex,
      role: lp[0]?.role ? R(lp[0].role, v) : undefined,
      tired: d2t ? `${R(d2t.title, v)} — ${R(d2t.how, v)}` : undefined,
    });
    plan.push({ day: "3일차", both: false, title: R(str((cp.day3 as Dict)?.title), { ...v, day2_title: R(d2.title, v) }), how: reflect ? R(reflect.question, v) : undefined });
  }
  if (wk) plan.push({ day: "1주일", both: true, title: R(wk.title, v), how: R(wk.how, v) });
  if (mo) plan.push({ day: "1달", both: true, title: R(mo.title, v), how: R(mo.how, v) });
  const ids = lp.map((c) => c.practice_id).join(" · ");
  return {
    plan, family: famCode,
    why: lp[0] ? R(lp[0].why, v) : undefined,
    src: `연인과 함께 하는 작심삼일 ${famCode}${ids ? ` + 쏘웰라 실천 DB ${ids}를 합침` : ""}`,
    solo: fam ? R(fam.solo_version, v) : undefined,
    tiredTitle: d2t ? R(d2t.title, v) : undefined,
  };
}

// 10~12쪽 비교에 쓰는 재료(무료 문구만 — 상대 결과는 브라우저에서 유형 두 개로만 비교). lib/rel/compare.ts가 쓴다.
function compareData(D: Dict, M: Manifest, r: RelResult, name: string, nickname: string, loopFamily: string): CompareData {
  const pc = (D.result_flow as Dict).partner_compare as Dict;
  const types = D.types as TypeRow[];
  const roots = ((D.type_roots as Dict).types ?? {}) as Record<string, { main?: { id: string }; cause_line?: string }>;
  const fams = (D.couple_activities as Dict).families as Record<string, { category: string; types: string[]; roots: { id: string }[]; steps: { slot: string; title: string; how: string }[] }>;
  // 가족 찾기: families[].types에 그 유형이 있으면 그것, 없으면 그 유형 main 뿌리가 들어간 가족, 그래도 없으면 CPL-GOOD('모든 유형')
  const famOf = (n: string) => {
    for (const [k, f] of Object.entries(fams)) if (f.types.includes(n)) return k;
    const root = roots[n]?.main?.id;
    for (const [k, f] of Object.entries(fams)) if (root && f.roots.some((x) => x.id === root)) return k;
    return fams["CPL-GOOD"] ? "CPL-GOOD" : "";
  };
  const loops = Object.fromEntries((D.loops as { 조합: string; 고리: string }[]).map((l) => [l.조합.replace(/\s/g, ""), cleanLoopName(l.고리)]));
  return {
    types: types.map((t) => ({ name: t.name, comp: t.competency, mode: t.mode, img: typeImage(M, t.name), cause: roots[t.name]?.cause_line ?? "", family: famOf(t.name) })),
    comps: [...S.COMPS],
    modes: [...S.MODES],
    loops,
    families: Object.fromEntries(Object.entries(fams).map(([k, f]) => {
      const d2 = f.steps.find((x) => x.slot === "2일차");
      return [k, { code: k, cat: f.category, title: d2?.title ?? "", how: d2?.how ?? "" }];
    })),
    loopFamily,
    modeActions: pc.mode_actions as Record<string, string>,
    kinds: pc.gap_kinds as CompareData["kinds"],
    lines: pc.lines as Record<string, string>,
    me: { name, self: r.myType, view: r.pType },
    nickname,
  };
}

// ---------- AI 리포트 본문(### 4. ~ ### 8.) → 화면 조각 ----------
const CLOSING = "이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다";

/** 리포트 글 속 점수 표기에서 끝의 0을 뺀다(4.00점 → 4점, 3.50점 → 3.5점 — owner 2026-11-25). 이미 만든 리포트·예시 문체를 따라 쓴 경우까지 화면에서 맞춘다. */
export function trimScores(text: string): string {
  return text.replace(/(\d+)\.(\d)(\d)(?=\s*점)/g, (_, a, b, c) => (c !== "0" ? `${a}.${b}${c}` : b !== "0" ? `${a}.${b}` : a));
}

export function parseReport(md: string): Record<number, Block[]> {
  const out: Record<number, Block[]> = {};
  const parts = trimScores(md).split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const m = part.match(/^(\d)\./);
    if (!m) continue;
    const no = Number(m[1]);
    const body = part.split("\n").slice(1).join("\n").trim();
    const blocks: Block[] = [];
    for (const para of body.split(/\n\s*\n/)) {
      const t = para.trim();
      if (!t) continue;
      // 클로즈드 세션은 결제(=1주일 채팅권)가 없어 이 안내 문단은 화면에 내지 않는다(10쪽에서 쏘웰라로 이어 줌).
      if (no === 8 && t.startsWith(CLOSING)) continue;
      for (const line of t.split("\n")) {
        const l = line.trim();
        if (!l) continue;
        if (l.startsWith("•")) blocks.push({ t: "item", text: l.replace(/^•\s*/, "") });
        else {
          const st = l.match(/^(첫째|둘째|셋째),/);
          if (st) blocks.push({ t: "step", n: ["첫째", "둘째", "셋째"].indexOf(st[1]) + 1, text: l });
          else blocks.push({ t: "p", parts: [{ b: false, t: l }] });
        }
      }
    }
    out[no] = blocks;
  }
  return out;
}
