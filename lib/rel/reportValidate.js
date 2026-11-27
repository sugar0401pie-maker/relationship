const MAX_SAME_ENDING = 3; // 같은 끝 표현 허용 연속 수
// AI 리포트 자동 검증 — 01_설계/리포트_AI프롬프트.md §4의 9개 규칙 + 추가 3개(X1 pair_relations 문장 복사, X2 동물·물 비유, X3 근거 없는 전제)
// validate(text, ctx) → { pass, checks: [{ id, name, pass, detail }] }
// ctx: { nickname, theoryLines: [관련 이론 줄...], pairTexts: { 필드: 렌더된 문장 }, typeNames?: [유형 이름...] }

import { render } from "./josa.js";

export const BANNED = ["회피형", "불안형", "집착", "이기적", "최악", "상극", "헤어지", "이별하", "참아야", "**"];
const CLOSING = "이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다";
const CHAR_MIN = 3000, CHAR_MAX = 4500;
const OVERLAP = 25;

// X2 비유 검사: 21개 유형 이름(데이터 JSON에서 읽음) 바로 뒤 '처럼·같이·답게', 물·바다 은유 단어
// 운영본: 유형 이름은 호출하는 쪽이 ctx.typeNames로 넘긴다(서버 번들에서 파일 경로로 데이터를 읽지 않으려고). 그 밖의 규칙은 report_pretest/validate.mjs와 같다.
export const TYPE_NAMES = [];
export const SIMILE_SUFFIXES = ["처럼", "같이", "답게"];
export const METAPHOR_WORDS = ["물밑", "발장구", "수면 위", "껍데기", "모래 속", "파도에"];
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function findMetaphors(text, typeNames = TYPE_NAMES) {
  const names = [...typeNames].sort((a, b) => b.length - a.length).map(reEsc);
  const re = new RegExp(`(${names.join("|")})(${SIMILE_SUFFIXES.join("|")})`, "g");
  const similes = [...text.matchAll(re)].map((m) => m[0]);
  const words = METAPHOR_WORDS.filter((w) => text.includes(w));
  return { similes, words };
}

// X3 근거 없는 전제(마스터 원칙 P7): 테스트 응답에는 지난 연애·가족 이야기가 없으므로 이런 말은 쓰지 않음
export const PREMISE_WORDS = ["지난 연애", "전 연인", "전 애인", "전 남자친구", "전 여자친구", "전남친", "전여친", "시댁", "처가", "시어머니", "시아버지", "시부모", "장모님", "장인어른", "양가", "부모님 댁", "이혼"];
const PREMISE_IF_NOT_MARRIED = ["결혼 생활", "동거"];
export function findPremises(text, relationship = "") {
  const married = /결혼|동거|부부/.test(relationship);
  return [...PREMISE_WORDS, ...(married ? [] : PREMISE_IF_NOT_MARRIED)].filter((w) => text.includes(w));
}

export const titles = (nickname) => [
  "4. 우리 관계는 보통 이렇게 흘러갑니다",
  "5. 당신이 주로 서운함을 느끼는 순간은...",
  render("6. {n|은} 주로 이럴 때 서운함을 느껴요", { n: nickname }),
  "7. 우리, 더 싸우지 말자! 할 수 있는 방향을 알려드려요",
  "8. 오늘 한 번 해볼 수 있는 것들을 알려드립니다",
];

// 학자 이름: 관련 이론 줄에서 괄호(영어 이론명)를 뺀 나머지의 로마자 단어
// 영어 이론명: 괄호 안 로마자 구절과 약어(EFT, DBT …) — 프롬프트 규칙 1도 금지
const TRANSLIT = {
  Johnson: ["존슨"], Gottman: ["가트맨", "고트만", "가트먼"], Bowlby: ["볼비"], Bowen: ["보웬"], Linehan: ["리네한", "라인한"],
  Brennan: ["브레넌", "브레넌"], Shaver: ["셰이버", "쉐이버"], Hazan: ["하잔"], Rempel: ["렘펠"], Rusbult: ["러스벌트", "루스불트"],
  Altman: ["알트만", "올트먼"], Taylor: ["테일러"], Gross: ["그로스"], Townsend: ["타운센드"], Cohen: ["코헨", "코언"],
  Clark: ["클라크"], Young: ["제프리 영"], Cloud: ["헨리 클라우드"],
};
export function extractScholars(lines = []) {
  const names = new Set(), terms = new Set();
  for (const line of lines) {
    for (const m of line.matchAll(/\(([^)]*)\)/g)) {
      for (const part of m[1].split(",")) {
        const t = part.trim();
        if (/[A-Za-z]/.test(t)) terms.add(t);
      }
    }
    const outside = line.replace(/\([^)]*\)/g, " ");
    for (const m of outside.matchAll(/[A-Z][a-zA-Z'-]+/g)) names.add(m[0]);
  }
  const translit = [...names].flatMap((n) => TRANSLIT[n] || []);
  return { names: [...names], translit, terms: [...terms] };
}

// 따옴표 안(대사·생각·고른 보기)을 ⟪Q⟫로 가림. 큰따옴표 먼저, 그다음 작은따옴표(안에 큰따옴표가 든 경우 처리)
export function maskQuotes(s) {
  return s
    .replace(/"[^"\n]*"/g, "⟪Q⟫").replace(/“[^”\n]*”/g, "⟪Q⟫")
    .replace(/'[^'\n]*'/g, "⟪Q⟫").replace(/‘[^’\n]*’/g, "⟪Q⟫");
}

export function splitSentences(paragraph) {
  const m = maskQuotes(paragraph).replace(/\s+/g, " ").trim();
  if (!m) return [];
  return m.split(/(?<=[.?!…])\s+/).map((x) => x.trim()).filter(Boolean);
}

// 섹션 나누기: "### " 헤더 기준
export function splitSections(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let cur = null;
  for (const l of lines) {
    const h = l.match(/^#{1,6}\s+(.*)$/);
    if (h) { cur = { header: l.trim(), title: h[1].trim(), body: [] }; sections.push(cur); continue; }
    if (cur) cur.body.push(l);
  }
  for (const s of sections) {
    s.text = s.body.join("\n").trim();
    s.paragraphs = s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  return sections;
}
const isBullet = (l) => /^\s*•/.test(l);
// 문단에서 말머리(•) 줄을 뺀 본문 줄
const proseOf = (p) => p.split("\n").filter((l) => !isBullet(l)).join(" ").trim();

// 끝 표현: 마지막 어절. '수 있습니다', '것 같습니다'처럼 의존명사 + 보조 표현이면 앞 어절까지
const BOUND = new Set(["수", "것", "줄", "적", "듯", "리", "뿐", "때"]);
export function endingKey(sentence) {
  const s = sentence.replace(/[.?!…\s]+$/, "");
  if (/⟪Q⟫$/.test(s)) return null; // 대사로 끝나는 문장은 세지 않음
  const toks = s.split(/\s+/);
  const last = toks[toks.length - 1];
  const prev = toks[toks.length - 2];
  return prev && BOUND.has(prev) ? `${prev} ${last}` : last;
}

export function validate(text, ctx = {}) {
  const nick = ctx.nickname ?? "";
  const checks = [];
  const add = (id, name, pass, detail = "") => checks.push({ id, name, pass, detail });
  const T = titles(nick);
  const secs = splitSections(text);
  const byNo = Object.fromEntries(secs.map((s) => [s.title.match(/^(\d+)\./)?.[1], s]));

  // R1 헤더
  {
    const problems = [];
    const hdrs = secs.map((s) => s.title);
    const forbidden = hdrs.filter((h) => /^[123]\./.test(h));
    if (forbidden.length) problems.push(`1~3번 헤더 있음: ${forbidden.join(" | ")}`);
    T.forEach((t, i) => {
      const s = byNo[String(i + 4)];
      if (!s) problems.push(`${i + 4}번 헤더 없음`);
      else if (s.header !== `### ${t}`) problems.push(`${i + 4}번 제목 불일치: "${s.header}" ≠ "### ${t}"`);
    });
    const extra = hdrs.filter((h) => !/^[45678]\./.test(h) && !/^[123]\./.test(h));
    if (extra.length) problems.push(`그 밖의 헤더: ${extra.join(" | ")}`);
    if (secs.length !== 5) problems.push(`헤더 수 ${secs.length}개`);
    const order = secs.map((s) => s.title.match(/^(\d+)/)?.[1]).join(",");
    if (!problems.length && order !== "4,5,6,7,8") problems.push(`순서 ${order}`);
    const pre = text.split(/^#{1,6}\s/m)[0].trim();
    if (pre) problems.push(`첫 헤더 앞 텍스트 있음(${pre.slice(0, 30)}…)`);
    add("R1", "헤더 4~8 제목 일치", !problems.length, problems.join("; ") || "5개 일치");
  }

  // R2 분량
  const chars = text.replace(/\s/g, "").length;
  // 운영본: 분량은 걸러 내지 않는다(owner 2026-11-27 — 분량은 크게 신경 쓰지 않음). 글자 수만 남긴다. 패키지 validate.mjs·프롬프트의 3,000~4,500자 안내는 그대로.
  const inRange = chars >= CHAR_MIN && chars <= CHAR_MAX;
  add("R2", `분량(참고용 ${CHAR_MIN.toLocaleString()}~${CHAR_MAX.toLocaleString()}자, 공백 제외)`, true, inRange ? `${chars}자` : `${chars}자(참고 범위 밖 — 통과 처리)`);

  // R3 말머리·첫째/둘째/셋째
  {
    const problems = [];
    for (const n of ["5", "6", "8"]) {
      const s = byNo[n];
      const cnt = s ? s.body.filter(isBullet).length : 0;
      if (cnt !== 3) problems.push(`${n}번 • ${cnt}개`);
      const dash = s ? s.body.filter((l) => /^\s*[-*]\s/.test(l)).length : 0;
      if (dash) problems.push(`${n}번 '-' 말머리 ${dash}개`);
    }
    const s7 = byNo["7"];
    const heads = s7 ? s7.paragraphs.map((p) => p.match(/^(첫째|둘째|셋째),/)?.[1]).filter(Boolean) : [];
    if (heads.join(",") !== "첫째,둘째,셋째") problems.push(`7번 문단 시작: [${heads.join(",")}]`);
    add("R3", "5·6·8번 • 3개, 7번 첫째·둘째·셋째", !problems.length, problems.join("; ") || "통과");
  }

  // R4 마지막 문단
  {
    const s8 = byNo["8"];
    const last = s8?.paragraphs.at(-1) ?? "";
    add("R4", "8번 마지막 문단 안내 문장", last.startsWith(CLOSING), last.startsWith(CLOSING) ? "통과" : `마지막 문단: "${last.slice(0, 40)}…"`);
  }

  // R5 금지어
  {
    const hits = BANNED.filter((w) => text.includes(w));
    add("R5", "금지어 없음", !hits.length, hits.length ? hits.join(", ") : "없음");
  }

  // R6 학자 이름(+영어 이론명)
  {
    const { names, translit, terms } = extractScholars(ctx.theoryLines);
    const hitN = names.filter((n) => new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`).test(text));
    const hitT = translit.filter((n) => text.includes(n));
    const hitE = terms.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
    const hits = [...hitN, ...hitT, ...hitE];
    add("R6", "학자 이름·영어 이론명 없음", !hits.length, hits.length ? hits.join(", ") : `검사 ${names.length}명·${terms.length}개 이론명`);
  }

  // R7 해요체·같은 끝 표현 4연속 금지 (3연속까지 허용, 6번 섹션 '~수 있습니다' 예외)
  {
    const haeyo = [], runs = [];
    for (const s of secs) {
      let prevKey = null, run = 0;
      for (const p of s.paragraphs) {
        const prose = proseOf(p);
        if (!prose) continue; // 말머리 줄만 있는 문단은 건너뜀(연속 세기는 이어감)
        for (const sent of splitSentences(prose)) {
          const bare = sent.replace(/\s+$/, "");
          if (/요[.?!…]*$/.test(bare) && !/세요[.?!…]*$/.test(bare) && !/까요\?$/.test(bare)) haeyo.push(`${s.title.slice(0, 2)} "…${bare.slice(-20)}"`);
          const k = endingKey(sent);
          if (k == null) continue;
          // 6번 섹션의 "~수 있습니다"는 예외(상대 속마음을 단정하지 않는 표현이라 허용)
          if (/^6\./.test(s.title.trim()) && /수 있습니다/.test(k)) continue;
          if (k === prevKey) run++; else { prevKey = k; run = 1; }
          if (run === MAX_SAME_ENDING + 1) runs.push(`${s.title.slice(0, 2)} "${k}" ${run}연속 (…${bare.slice(-25)})`);
        }
      }
    }
    const pass = !haeyo.length && !runs.length;
    add("R7", "해요체 0건·같은 끝 표현 4연속 없음", pass, pass ? "통과" : [...haeyo.map((x) => "해요체 " + x), ...runs].join("; "));
  }

  // R8 문단당 5문장 이하
  {
    const over = [];
    for (const s of secs) for (const p of s.paragraphs) {
      const n = splitSentences(proseOf(p)).length;
      if (n > 5) over.push(`${s.title.slice(0, 2)} ${n}문장 (${proseOf(p).slice(0, 20)}…)`);
    }
    add("R8", "문단당 5문장 이하", !over.length, over.join("; ") || "통과");
  }

  // R9 고르셨
  {
    const n = (text.match(/고르셨/g) || []).length;
    add("R9", "'고르셨' 인용 3개 이상", n >= 3, `${n}회`);
  }

  // X1 pair_relations 문장 그대로 옮김(공백 제외 25자 이상 겹침)
  {
    const hay = text.replace(/\s/g, "");
    const hits = [];
    for (const [f, src] of Object.entries(ctx.pairTexts || {})) {
      const s = String(src).replace(/\s/g, "");
      for (let i = 0; i + OVERLAP <= s.length; i++) {
        const w = s.slice(i, i + OVERLAP);
        if (hay.includes(w)) {
          let j = i + OVERLAP; // 겹침을 끝까지 늘려 보여 줌
          while (j < s.length && hay.includes(s.slice(i, j + 1))) j++;
          hits.push(`${f}: "${s.slice(i, j)}"`);
          break;
        }
      }
    }
    add("X1", `pair_relations 문장 복사 없음(${OVERLAP}자 이상)`, !hits.length, hits.join("; ") || "통과");
  }

  // X2 동물·캐릭터 비유(유형 이름+처럼·같이·답게)와 물·바다 은유 단어 없음
  {
    const { similes, words } = findMetaphors(text, ctx.typeNames ?? TYPE_NAMES);
    const hits = [...similes.map((x) => `비유 "${x}"`), ...words.map((x) => `은유 "${x}"`)];
    add("X2", "동물·캐릭터 비유와 물·바다 은유 없음", !hits.length, hits.join("; ") || "통과");
  }

  // X3 근거 없는 전제 단어 없음(지난 연애·가족 일은 응답에 없음)
  {
    const hits = findPremises(text, ctx.relationship);
    add("X3", "근거 없는 전제(지난 연애·가족 일) 없음", !hits.length, hits.map((x) => `"${x}"`).join(", ") || "통과");
  }

  return { pass: checks.every((c) => c.pass), chars, checks };
}
