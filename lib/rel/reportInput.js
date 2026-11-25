// AI 리포트 입력 조립 — 운영본. 패키지 report_pretest/build_input.mjs와 같은 규칙(리포트_AI프롬프트.md §2 입력 값·§3 시스템 프롬프트 전문)을
// 실제 저장된 응답에서 만든다. 데이터·문서는 파일 경로로 읽지 않고 호출하는 쪽(lib/server/report.ts)이 넘긴다.
// 유료 재료(pair_relations 흐름 등 5필드)가 들어 있으므로 서버에서만 쓴다.
import { render, normalizeItemText, josa } from "./josa.js";
import * as S from "./scoring.js";

export const PAID_FIELDS = ["흐름", "서로에게_주는_것", "엇갈리는_순간", "내가_해볼_한_걸음", "부탁해_볼_말"];
export const FREE_FIELDS = ["무료_설명", "쏠_마을_이야기", "이야기_한줄"];

const f2 = (x) => (x == null ? "-" : x.toFixed(2));
const married = (rel) => rel === "결혼·동거";

export function makeReportBuilder({ DATA, PROMPT_DOC, SAMPLES_DOC }) {
  const rn = (text, nickname) => render(normalizeItemText(text), { 애칭: nickname, 이름: "나" });
  const loopName = (key) => DATA.loops.find((x) => x.조합.replace(/\s/g, "") === key).고리.replace(/\s*\(.*\)\s*$/, "");

  // ---------- 시스템 프롬프트 (§3 전문을 그대로 잘라 씀) ----------
  function systemTemplate() {
    const start = PROMPT_DOC.indexOf("## 3. 시스템 프롬프트 전문");
    const end = PROMPT_DOC.indexOf("\n---", start);
    if (start < 0 || end < 0) throw new Error("프롬프트 문서에서 §3을 찾지 못함");
    return PROMPT_DOC.slice(start, end).split("\n").slice(1).join("\n").trim();
  }
  function renderSystem(nickname) {
    let t = systemTemplate().replace(
      /\{nickname\}(["”'’]?)(이에요|예요|으로|은|는|이|가|을|를|과|와|로)(?=의|[^가-힣]|$)/g,
      (_, q, p) => `{nickname}${q}{_j_${p}}`
    );
    t = t.replace(/\{_j_([^}]+)\}/g, (_, p) => josa(nickname, p));
    t = t.replace(/\{(?!nickname[}|])([a-z_]+)\}/g, "<$1>");
    return render(t, { nickname });
  }

  // ---------- 장면 번호(화면 노출 순서와 같음: 1~20 / 21~24 / 25~34 / 35~38) ----------
  function itemByNumber(n, myComp, partnerComp) {
    const P1 = DATA.part1_competency, P2 = DATA.part2_competency;
    if (n >= 1 && n <= 20) return { part: 1, kind: "comp", item: P1.find((x) => x.id === DATA.part1_order[n - 1]) };
    if (n >= 21 && n <= 24) return { part: 1, kind: "mode", item: DATA.mode_scenes.filter((m) => m.부 === "1부" && m.역량 === myComp)[n - 21] };
    if (n >= 25 && n <= 34) return { part: 2, kind: "comp", item: P2[n - 25] };
    if (n >= 35 && n <= 38) return { part: 2, kind: "mode", item: DATA.mode_scenes.filter((m) => m.부 === "2부" && m.역량 === partnerComp)[n - 35] };
    throw new Error(`문항 번호 범위 밖: ${n}`);
  }
  const sceneText = (item, rel, nick) => rn(married(rel) && item.결혼 ? item.결혼 : item.장면, nick);
  function optionText(entry, answer, rel, nick) {
    const { item, kind } = entry;
    if (kind === "mode") {
      const ov = married(rel) && item.결혼_보기_override?.[answer];
      return rn(ov || item.보기[answer], nick);
    }
    const idx = item.보기.findIndex((b) => b.score === answer);
    const ov = married(rel) && item.결혼_보기_override?.[String(idx)];
    return rn(ov || item.보기[idx].text, nick);
  }

  // 저장된 응답(flow.ts 형식)에서 N번 장면의 답
  function answerAt(answers, n) {
    const pad = (x) => String(x).padStart(2, "0");
    if (n <= 20) return answers[`p1-${pad(n)}`];
    if (n <= 24) return String(answers[`m1-${n - 20}`] ?? "").split("|")[1] || null;
    if (n <= 34) return answers[`p2-${pad(n - 24)}`];
    return String(answers[`m2-${n - 34}`] ?? "").split("|")[1] || null;
  }

  /**
   * 강하게 답한 장면 4~6개(§2 {notable_answers}). 패키지에는 케이스마다 사람이 고른 번호가 있었고, 운영에서는 아래 고정 규칙으로 고른다
   * (무작위 없음): ① 1부 역량 장면 중 1점·4점(확정 역량 먼저, 번호 순) 최대 3개 ② 2부 역량 장면 중 1점·4점(그 사람 확정 역량 먼저) 최대 2개
   * ③ 4개가 안 되면 1부 방식 장면 중 확정 방식에 투표한 장면 ④ 그래도 모자라면 2부 방식 장면 중 그 사람 확정 방식에 투표한 장면.
   */
  function pickNotable(answers, r) {
    const P1 = DATA.part1_competency, P2 = DATA.part2_competency;
    const out = [];
    const strong = (n) => [1, 4].includes(answerAt(answers, n));
    const p1 = Array.from({ length: 20 }, (_, i) => i + 1).filter(strong);
    const compOf1 = (n) => P1.find((x) => x.id === DATA.part1_order[n - 1]).역량;
    p1.sort((a, b) => (compOf1(b) === r.myComp) - (compOf1(a) === r.myComp) || a - b);
    out.push(...p1.slice(0, 3));
    const p2 = Array.from({ length: 10 }, (_, i) => i + 25).filter(strong);
    p2.sort((a, b) => (P2[b - 25].역량 === r.pComp) - (P2[a - 25].역량 === r.pComp) || a - b);
    out.push(...p2.slice(0, 2));
    for (let n = 21; n <= 24 && out.length < 4; n++) if (answerAt(answers, n) === r.myMode) out.push(n);
    for (let n = 35; n <= 38 && out.length < 4; n++) if (answerAt(answers, n) === r.pMode) out.push(n);
    return out.sort((a, b) => a - b).slice(0, 6);
  }

  // ---------- 예시 리포트 ----------
  let _samples;
  function samples() {
    if (_samples) return _samples;
    const parts = SAMPLES_DOC.split(/^# 샘플 /m).slice(1);
    _samples = parts.map((p) => {
      const summary = (p.match(/^> 입력 요약: (.+)$/m) || [])[1] || "";
      const loop = (summary.match(/^고리 (.+?) \//) || [])[1];
      const body = p.replace(/\n---\s*$/, "").trimEnd();
      const s4 = body.indexOf("### 4.");
      const paid = body.slice(s4).split("\n");
      const aiPart = [paid[0], ...paid.slice(2).filter((l) => !/여기부터 유료/.test(l))].join("\n").replace(/\n{3,}/g, "\n\n").trim();
      return { loop, aiPart };
    });
    return _samples;
  }
  const sampleForLoop = (key) => samples().find((s) => s.loop === loopName(key));

  // ---------- base_knowledge 블록 ----------
  function bkBlock(typeName, nickname, isPartner) {
    const bk = DATA.base_knowledge[typeName];
    const t = DATA.types.find((x) => x.name === typeName);
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
  // s: { nickname, relationship, answers, result } — result는 lib/rel/result.ts computeResult 출력
  function buildVars(s) {
    const res = s.result;
    const r = {
      myType: res.myType, myComp: res.myComp, myMode: res.myMode, pType: res.pType, pComp: res.pComp, pMode: res.pMode,
      loopKey: res.loopKey, meIsA: res.meIsA, mismatch: res.mismatch, balance: res.balance, innerOuter: res.innerOuter,
    };
    const nick = s.nickname, rel = s.relationship;
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

    const C = res.self, P = res.partner;
    const mm = r.mismatch.key === "none" ? "none"
      : `${r.mismatch.competency} (내 겉 ${f2(C[r.mismatch.competency].outer)}점 / ${nick} ${f2(P[r.mismatch.competency].total)}점): ${rn(DATA.mismatch[r.mismatch.competency][r.mismatch.key], nick)}`;
    const bl = r.balance == null ? "none"
      : rn(DATA.balance[r.balance.badge ? "balanced" : r.balance.key], nick) + (r.balance.badge ? ` (배지: ${DATA.balance.badge})` : "");
    const io = r.innerOuter.key === "default" ? "none"
      : `${r.innerOuter.competency} ${r.innerOuter.key === "inner_higher" ? "속이 겉보다 높음" : "겉이 속보다 높음"}: ${rn(DATA.inner_outer[r.innerOuter.competency][r.innerOuter.key], nick)}`;

    const myScores = S.COMPS.map((k) => `${k}: 속 ${f2(C[k].inner)} / 겉 ${f2(C[k].outer)} / 합계 ${f2(C[k].total)}`).join("\n");
    const pScores = S.COMPS.map((k) => `${k}: ${f2(P[k]?.total)}`).join("\n");

    const notable = pickNotable(s.answers, r).map((n) => {
      const e = itemByNumber(n, r.myComp, r.pComp);
      const ans = answerAt(s.answers, n);
      const who = e.part === 1 ? "1부·나" : `2부·내 눈에 비친 ${nick}`;
      return `[${n}번 장면] (${who}) ${sceneText(e.item, rel, nick)} / 고른 보기: '${optionText(e, ans, rel, nick)}'`;
    }).join("\n");

    const pr = DATA.pair_relations[`${r.myType}→${r.pType}`];
    if (!pr) throw new Error(`pair_relations 없음: ${r.myType}→${r.pType}`);
    const pairPaid = Object.fromEntries(PAID_FIELDS.map((f) => [f, rn(pr[f], nick)]));
    const pairFree = Object.fromEntries(FREE_FIELDS.map((f) => [f, rn(pr[f], nick)]));

    return {
      r, lead, pairPaid, pairFree,
      v: {
        relationship: rel, nickname: nick,
        my_type: r.myType, my_comp: r.myComp, my_mode: r.myMode,
        partner_type: r.pType, partner_comp: r.pComp, partner_mode: r.pMode,
        loop_name: lname, loop_flow: loopFlow, mismatch: mm, balance: bl, inner_outer: io,
        my_scores: myScores, partner_scores: pScores, notable_answers: notable, lead_lines: lead,
      },
    };
  }

  function practiceLines(r, nick) {
    const mine = DATA.practice_cards?.[r.myType] || [], loop = DATA.loop_practices?.[r.loopKey] || [];
    const vars = { 애칭: nick, 이름: "나", A: r.meIsA ? "나" : nick, B: r.meIsA ? nick : "나" };
    const R = (t) => render(t, vars);
    const line = (c, slot) => `[${slot} · ${c.minutes}분] ${R(c.title)} — ${R(c.how)} (언제: ${R(c.cue)})${c.role ? " (역할: " + R(c.role) + ")" : ""}`;
    return [...mine.map((c) => line(c, c.slot)), ...loop.map((c) => line(c, "이번 주(함께)"))];
  }

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

  function buildRequest(s) {
    const { r, v, pairPaid } = buildVars(s);
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
    const sample = sampleForLoop(r.loopKey);
    if (sample) parts.push("", "<style_example>", sample.aiPart, "</style_example>");
    return { system: renderSystem(nick), user: parts.join("\n") };
  }

  const ALL_THEORY_LINES = Object.values(DATA.base_knowledge).map((b) => b["관련 이론"]);
  function buildContext(s) {
    const { v, pairPaid, pairFree, lead } = buildVars(s);
    return {
      nickname: v.nickname,
      leadLines: lead,
      theoryLines: ALL_THEORY_LINES,
      pairTexts: { ...pairPaid, ...pairFree },
      relationship: v.relationship,
      typeNames: DATA.types.map((t) => t.name),
    };
  }

  return { buildRequest, buildContext, pickNotable, renderSystem };
}

export const UNRESOLVED_RE = /\{[^{}\n]{1,40}\}/g;
