// 관계성 테스트 AI 리포트 입력 조립 (서버 전용 — 유료 재료가 들어 있으므로 클라이언트로 보내지 않음)
// 기준: 01_설계/리포트_AI프롬프트.md §2(입력 값)·§3(시스템 프롬프트 전문)
import { readFileSync } from "node:fs";
import { render, normalizeItemText, josa } from "../josa.js";
import * as S from "../scoring.js";

const ROOT = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

export const DATA = JSON.parse(read("data/relationship_test_data.json"));
const PROMPT_DOC = read("docs/spec/리포트_AI프롬프트.md");
const SAMPLES_DOC = read("docs/spec/sample_reports_10pairs.md");

export const PAID_FIELDS = ["흐름", "서로에게_주는_것", "엇갈리는_순간", "내가_해볼_한_걸음", "부탁해_볼_말"];
export const FREE_FIELDS = ["무료_설명", "쏠_마을_이야기", "이야기_한줄"];

export const SECTION_TITLES = (nickname) => [
  "4. 우리 관계는 보통 이렇게 흘러갑니다",
  "5. 당신이 주로 서운함을 느끼는 순간은...",
  render("6. {n|은} 주로 이럴 때 서운함을 느껴요", { n: nickname }),
  "7. 우리, 더 싸우지 말자! 할 수 있는 방향을 알려드려요",
  "8. 오늘 한 번 해볼 수 있는 것들을 알려드립니다",
];

const rn = (text, nickname) => render(normalizeItemText(text), { 애칭: nickname, 이름: "나" });
const f2 = (x) => (x == null ? "-" : x.toFixed(2));
const loopName = (key) => {
  const l = DATA.loops.find((x) => x.조합.replace(/\s/g, "") === key);
  return l.고리.replace(/\s*\(.*\)\s*$/, "");
};

// ---------- 시스템 프롬프트 (§3 전문을 그대로 잘라 씀) ----------
export function systemTemplate() {
  const start = PROMPT_DOC.indexOf("## 3. 시스템 프롬프트 전문");
  const end = PROMPT_DOC.indexOf("\n---", start);
  if (start < 0 || end < 0) throw new Error("프롬프트 문서에서 §3을 찾지 못함");
  return PROMPT_DOC.slice(start, end).split("\n").slice(1).join("\n").trim();
}

// {nickname}은 값 + 조사로 렌더, 나머지 {변수}는 user 메시지의 같은 이름 태그(<변수>)를 가리키게 바꿈
export function renderSystem(nickname) {
  // '"내 눈에 비친 {nickname}"이'처럼 닫는 따옴표 뒤에 조사가 오는 경우도 처리
  let t = systemTemplate().replace(
    /\{nickname\}(["”'’]?)(이에요|예요|으로|은|는|이|가|을|를|과|와|로)(?=의|[^가-힣]|$)/g,
    (_, q, p) => `{nickname}${q}{_j_${p}}`
  );
  t = t.replace(/\{_j_([^}]+)\}/g, (_, p) => josa(nickname, p));
  t = t.replace(/\{(?!nickname[}|])([a-z_]+)\}/g, "<$1>");
  return render(t, { nickname });
}

// ---------- 문항 번호 (화면 노출 순서: 1부 역량 1~20, 1부 방식 21~24, 2부 역량 25~34, 2부 방식 35~38) ----------
export function itemByNumber(n, myComp, partnerComp) {
  const P1 = DATA.part1_competency, P2 = DATA.part2_competency;
  if (n >= 1 && n <= 20) return { part: 1, kind: "comp", item: P1.find((x) => x.id === DATA.part1_order[n - 1]) };
  if (n >= 21 && n <= 24) return { part: 1, kind: "mode", item: DATA.mode_scenes.filter((m) => m.부 === "1부" && m.역량 === myComp)[n - 21] };
  if (n >= 25 && n <= 34) return { part: 2, kind: "comp", item: P2[n - 25] };
  if (n >= 35 && n <= 38) return { part: 2, kind: "mode", item: DATA.mode_scenes.filter((m) => m.부 === "2부" && m.역량 === partnerComp)[n - 35] };
  throw new Error(`문항 번호 범위 밖: ${n}`);
}

const married = (rel) => rel === "결혼·동거";
export function sceneText(item, rel, nickname) {
  return rn(married(rel) && item.결혼 ? item.결혼 : item.장면, nickname);
}
// answer: 역량 문항은 점수(1~4), 방식 문항은 방식 이름
export function optionText(entry, answer, rel, nickname) {
  const { item, kind } = entry;
  if (kind === "mode") {
    const ov = married(rel) && item.결혼_보기_override?.[answer];
    return rn(ov || item.보기[answer], nickname);
  }
  const idx = item.보기.findIndex((b) => b.score === answer);
  const ov = married(rel) && item.결혼_보기_override?.[String(idx)];
  return rn(ov || item.보기[idx].text, nickname);
}

// ---------- 채점 (scoring.js 그대로) ----------
export function computeCase(c) {
  const P1 = DATA.part1_competency, P2 = DATA.part2_competency;
  const selfAns = Object.fromEntries(P1.map((it) => {
    const [s1, s2, o1, o2] = c.self[it.역량];
    return [it.id, { 속1: s1, 속2: s2, 겉1: o1, 겉2: o2 }[it.id.split("-").pop()]];
  }));
  const self = S.scoreSelf(selfAns, P1);
  const myComp = self.lowest.mode === "single" ? self.lowest.value : c.confirm?.my_comp;
  const myModeR = S.pickMode(c.self_mode_votes);
  const myMode = myModeR.mode === "single" ? myModeR.value : c.confirm?.my_mode;
  const myType = S.typeOf(DATA.types, myComp, myMode, { relyScore: self.comp["기대기"].total, distanceVotes: myModeR.count?.["거리두기"] ?? 0 });

  const partAns = Object.fromEntries(P2.map((it) => [it.id, c.partner[it.역량][it.id.endsWith("-A") ? 0 : 1]]));
  const partner = S.scorePartner(partAns, P2);
  const pComp = partner.lowest.mode === "single" ? partner.lowest.value : c.confirm?.partner_comp;
  const pModeR = S.pickMode(c.partner_mode_votes);
  const pMode = pModeR.mode === "single" ? pModeR.value : c.confirm?.partner_mode;
  const pType = S.typeOf(DATA.types, pComp, pMode, { relyScore: partner.comp["기대기"].total, distanceVotes: pModeR.count?.["거리두기"] ?? 0 });

  return {
    self, partner, myComp, myMode, myType: myType.name, pComp, pMode, pType: pType.name,
    loopKey: S.loopKey(myMode, pMode),
    meIsA: S.MODES.indexOf(myMode) <= S.MODES.indexOf(pMode),
    mismatch: S.mismatch(self.comp, partner.comp),
    balance: S.balance(self.comp, partner.comp),
    innerOuter: S.innerOuterLine(self.comp, myComp),
  };
}

// ---------- 예시 리포트 ----------
export function parseSamples() {
  const parts = SAMPLES_DOC.split(/^# 샘플 /m).slice(1);
  return parts.map((p) => {
    const head = p.match(/^(\d+)\. 나 = (\S+(?: \S+)*?) · 내 눈에 비친 (\S+) = (.+?) \((.+?)\)/);
    const summary = (p.match(/^> 입력 요약: (.+)$/m) || [])[1] || "";
    const loop = (summary.match(/^고리 (.+?) \//) || [])[1];
    const body = p.replace(/\n---\s*$/, "").trimEnd();
    const s4 = body.indexOf("### 4.");
    const paid = body.slice(s4).split("\n");
    // 4번 앞 2줄(서버 문장)과 블러 표시 줄을 빼면 AI가 써야 하는 형태와 같아짐
    const leadLine = paid[1];
    const aiPart = [paid[0], ...paid.slice(2).filter((l) => !/여기부터 유료/.test(l))].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { no: Number(head[1]), myType: head[2], nickname: head[3], partnerType: head[4], relationship: head[5], summary, loop, leadLine, aiPart };
  });
}
let _samples;
export const samples = () => (_samples ??= parseSamples());
export function sampleForLoop(key) {
  const name = loopName(key);
  return samples().find((s) => s.loop === name);
}

// ---------- base_knowledge 블록 ----------
function bkBlock(typeName, nickname, isPartner) {
  const bk = DATA.base_knowledge[typeName];
  const t = DATA.types.find((x) => x.name === typeName);
  // 내 유형: {애칭} = 실제 애칭. 그 사람 유형: 그 유형 당사자 시점의 글이라 '당신' = {애칭}, '{애칭}' 자리 = 그 상대(사용자 본인) → '상대'로 렌더
  const R = (s) => (isPartner ? render(normalizeItemText(s), { 애칭: "상대", 이름: "나" }) : rn(s, nickname));
  const lines = [`<base_knowledge type="${typeName}">`];
  if (isPartner) lines.push(`(이 블록은 ${typeName} 유형 당사자 시점으로 쓰인 재료입니다. 여기서 '당신'은 내 눈에 비친 ${nickname}, '상대'는 사용자 본인을 가리킵니다. 리포트에서는 ${nickname}에 관한 해석을 단정하지 말고 "내 눈에 비친", "~해 보입니다"로 씁니다.)`);
  lines.push("", "[성격적 특징]", R(bk["성격적 특징"]), "", "[연애 장면]", R(bk["연애 장면"]), "");
  lines.push("[서운함을 느끼는 순간]", ...bk["서운함을 느끼는 순간"].map((x) => "- " + R(x)), "");
  lines.push("[상대를 서운하게 하기 쉬운 순간]", ...bk["상대를 서운하게 하기 쉬운 순간"].map((x) => "- " + R(x)), "");
  lines.push("[조율 포인트]", R(bk["조율 포인트"]), "");
  if (t?.제안?.length) lines.push("[제안]", ...t.제안.map((x) => "- " + R(x)), "");
  lines.push(`[관련 이론] ${bk["관련 이론"]}`, "</base_knowledge>");
  return lines.join("\n");
}

// ---------- 입력 값 ----------
export function buildVars(c) {
  const r = computeCase(c);
  const nick = c.nickname, rel = c.relationship;
  const flow = DATA.loop_flow[r.loopKey];
  const vars = r.meIsA ? { A: "나", B: nick } : { A: nick, B: "나" };
  const meLine = render(r.meIsA ? flow.A : flow.B, vars);
  const pLine = render(r.meIsA ? flow.B : flow.A, vars);
  const lname = loopName(r.loopKey);

  const lead = render(DATA.ui_copy.report_lead_template, { 고리: lname, 계기: flow.계기, "나의 첫 움직임": meLine });
  const loopFlow = [
    `1. 계기: ${render(flow.계기, vars)}`, `2. 나: ${meLine}`, `3. ${nick}: ${pLine}`, `4. 끝맺음: ${render(flow.끝, vars)}`,
    `잘 맞물리는 순간: ${render(flow.맞물림, vars)}`, `다리 놓기: ${render(flow.다리, vars)}`,
    ...(flow.안내 ? [`안내: ${render(flow.안내, vars)}`] : []),
  ].join("\n");

  const C = r.self.comp, P = r.partner.comp;
  const mm = r.mismatch.key === "none" ? "none"
    : `${r.mismatch.competency} (내 겉 ${f2(C[r.mismatch.competency].outer)}점 / ${nick} ${f2(P[r.mismatch.competency].total)}점): ${rn(DATA.mismatch[r.mismatch.competency][r.mismatch.key], nick)}`;
  const bl = r.balance == null ? "none"
    : rn(DATA.balance[r.balance.badge ? "balanced" : r.balance.key], nick) + (r.balance.badge ? ` (배지: ${DATA.balance.badge})` : "");
  const io = r.innerOuter.key === "default" ? "none"
    : `${r.innerOuter.competency} ${r.innerOuter.key === "inner_higher" ? "속이 겉보다 높음" : "겉이 속보다 높음"}: ${rn(DATA.inner_outer[r.innerOuter.competency][r.innerOuter.key], nick)}`;

  const myScores = S.COMPS.map((k) => `${k}: 속 ${f2(C[k].inner)} / 겉 ${f2(C[k].outer)} / 합계 ${f2(C[k].total)}`).join("\n");
  const pScores = S.COMPS.map((k) => `${k}: ${f2(P[k].total)}`).join("\n");

  const notable = c.notable.map((n) => {
    const e = itemByNumber(n, r.myComp, r.pComp);
    const ans = answerFor(c, e, n);
    const who = e.part === 1 ? "1부·나" : `2부·내 눈에 비친 ${nick}`;
    return `[${n}번 장면] (${who}) ${sceneText(e.item, rel, nick)} / 고른 보기: '${optionText(e, ans, rel, nick)}'`;
  }).join("\n");

  const pr = DATA.pair_relations[`${r.myType}→${r.pType}`];
  if (!pr) throw new Error(`pair_relations 없음: ${r.myType}→${r.pType}`);
  const pairPaid = Object.fromEntries(PAID_FIELDS.map((f) => [f, rn(pr[f], nick)]));
  const pairFree = Object.fromEntries(FREE_FIELDS.map((f) => [f, rn(pr[f], nick)]));

  return {
    r, lead, lname, pairPaid, pairFree,
    v: {
      relationship: rel, nickname: nick,
      my_type: r.myType, my_comp: r.myComp, my_mode: r.myMode,
      partner_type: r.pType, partner_comp: r.pComp, partner_mode: r.pMode,
      loop_name: lname, loop_flow: loopFlow, mismatch: mm, balance: bl, inner_outer: io,
      my_scores: myScores, partner_scores: pScores, notable_answers: notable, lead_lines: lead,
    },
  };
}

export function answerFor(c, e, n) {
  if (e.kind === "mode") return e.part === 1 ? c.self_mode_votes[n - 21] : c.partner_mode_votes[n - 35];
  if (e.part === 1) {
    const [s1, s2, o1, o2] = c.self[e.item.역량];
    return { 속1: s1, 속2: s2, 겉1: o1, 겉2: o2 }[e.item.id.split("-").pop()];
  }
  return c.partner[e.item.역량][e.item.id.endsWith("-A") ? 0 : 1];
}

// 실천 카드: 내 유형 3장 + 우리 고리 함께 실천 2개 (쏘웰라 실천 DB v5.12 기준, 데이터 practice_cards / loop_practices)
function practiceLines(r, nick) {
  const mine = DATA.practice_cards?.[r.myType] || [], loop = DATA.loop_practices?.[r.loopKey] || [];
  const flow = DATA.loop_flow[r.loopKey];
  const meIsA = S.MODES.indexOf(r.myMode) <= S.MODES.indexOf(r.pMode);
  const vars = { 애칭: nick, 이름: "나", A: meIsA ? "나" : nick, B: meIsA ? nick : "나" };
  const R = (t) => render(t, vars);
  const line = (c, slot) => `[${slot} · ${c.minutes}분] ${R(c.title)} — ${R(c.how)} (언제: ${R(c.cue)})${c.role ? " (역할: " + R(c.role) + ")" : ""}`;
  return [...mine.map((c) => line(c, c.slot)), ...loop.map((c) => line(c, "이번 주(함께)"))];
}

// 유형 × 뿌리(마스터 v1.14): 원인 → 결과 문장, 결과 뿌리, 빼는 뿌리
function rootLines(r, nick) {
  const R = (s) => render(s, { 애칭: nick, 이름: "나" });
  const one = (who, name) => {
    const x = DATA.type_roots?.types?.[name];
    if (!x) return [];
    return [
      `[${who} = ${name}] 원인: ${x.main.name}${x.sub.length ? " / 보조: " + x.sub.map((s) => s.name).join(", ") : ""}`,
      `  원인 → 결과: ${R(x.cause_line)}`,
      ...(x.result.length ? [`  결과로 나타나는 모습(원인 문장 뒤에만): ${x.result.map((s) => s.name).join(", ")}`] : []),
      ...x.excluded.map((e) => `  쓰지 않는 해석: ${e.name} — ${R(e.reason).replace(/\s*→\s*RL-.*$/, "").replace(/\s*\(ROOT-[^)]*\)/g, "")}`),
    ];
  };
  return [...one("나", r.myType), ...one(`내 눈에 비친 ${nick}`, r.pType)];
}

// ---------- 최종 요청 ----------
export function buildRequest(caseObj, opts = {}) {
  const { useStyle = !caseObj.noStyle } = opts;
  const { r, v, pairPaid } = buildVars(caseObj);
  const nick = v.nickname;
  const tag = (k) => `<${k}>\n${v[k]}\n</${k}>`;
  const scalar = (k) => `<${k}>${v[k]}</${k}>`;
  const parts = [
    "아래 입력으로 4번 본문과 5·6·7·8번을 써 주세요.",
    "",
    scalar("relationship"), scalar("nickname"),
    scalar("my_type"), scalar("my_comp"), scalar("my_mode"),
    scalar("partner_type"), scalar("partner_comp"), scalar("partner_mode"),
    scalar("loop_name"), tag("loop_flow"), tag("mismatch"), tag("balance"), tag("inner_outer"),
    tag("my_scores"), tag("partner_scores"), tag("notable_answers"), tag("lead_lines"),
    "",
    `<pair_relation id="${r.myType}→${r.pType}">`,
    ...PAID_FIELDS.map((f) => `${f}: ${pairPaid[f]}`),
    "</pair_relation>",
    "",
    "<type_roots>",
    ...rootLines(r, nick),
    "</type_roots>",
    "",
    "<practice_cards>",
    ...practiceLines(r, nick),
    "</practice_cards>",
    "",
    bkBlock(r.myType, nick, false),
    "",
    bkBlock(r.pType, nick, true),
  ];
  if (useStyle) {
    const s = sampleForLoop(r.loopKey);
    parts.push("", "<style_example>", s.aiPart, "</style_example>");
  }
  return { system: renderSystem(nick), user: parts.join("\n") };
}

// 검증에 필요한 맥락 (validate.mjs의 ctx)
export function buildContext(caseObj) {
  const { r, v, pairPaid, pairFree, lead } = buildVars(caseObj);
  return {
    nickname: v.nickname,
    leadLines: lead,
    theoryLines: ALL_THEORY_LINES, // 두 유형만이 아니라 21유형 전체의 학자명으로 검사(다른 유형 이론을 끌어와도 잡히도록)
    pairTexts: { ...pairPaid, ...pairFree },
    relationship: v.relationship,
  };
}

export const ALL_THEORY_LINES = Object.values(DATA.base_knowledge).map((b) => b["관련 이론"]);
export const UNRESOLVED_RE = /\{[^{}\n]{1,40}\}/g;
