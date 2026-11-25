// 검증기 자기 점검: 사람이 쓴 예시 리포트 10개(4~8번) + 일부러 망가뜨린 변형 → out/sample_validation.md
// node selftest.mjs   (네트워크 없음)
import { writeFileSync, mkdirSync } from "node:fs";
import { DATA, samples, PAID_FIELDS, FREE_FIELDS, ALL_THEORY_LINES } from "./build_input.mjs";
import { validate } from "./validate.mjs";
import { render, normalizeItemText } from "../josa.js";

const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const ctxOf = (s) => {
  const pr = DATA.pair_relations[`${s.myType}→${s.partnerType}`];
  return {
    nickname: s.nickname,
    relationship: s.relationship,
    theoryLines: ALL_THEORY_LINES,
    pairTexts: Object.fromEntries([...PAID_FIELDS, ...FREE_FIELDS].map((f) => [f, render(normalizeItemText(pr[f]), { 애칭: s.nickname, 이름: "나" })])),
  };
};
const IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "X1", "X2", "X3"];
const lines = ["# 검증기 자기 점검 — 예시 리포트 10개 + 망가뜨린 변형", "",
  "예시 리포트는 `sample_reports_10pairs.md`에서 4~8번만 잘라(4번 앞 2줄·블러 표시 제외) AI 출력과 같은 형태로 검사했습니다.", "",
  `| 샘플 | 조합 | 결과 | 글자 | ${IDS.join(" | ")} |`, `|---|---|---|---:|${IDS.map(() => ":-:").join("|")}|`];
const details = [];
let samplePass = 0;
for (const s of samples()) {
  const v = validate(s.aiPart, ctxOf(s));
  if (v.pass) samplePass++;
  const ck = Object.fromEntries(v.checks.map((c) => [c.id, c.pass ? "O" : "X"]));
  lines.push(`| ${s.no} | ${s.myType}→${s.partnerType} (${s.nickname}) | ${v.pass ? "통과" : "실패"} | ${v.chars} | ${IDS.map((i) => ck[i]).join(" | ")} |`);
  for (const c of v.checks.filter((c) => !c.pass)) details.push(`- 샘플 ${s.no} ${c.id} ${c.name}: ${c.detail}`);
}
lines.push("", `예시 통과 ${samplePass}/10`, "", "## 예시 리포트 실패 상세", "", ...(details.length ? details : ["없음"]));

// ---------- 망가뜨린 변형 (샘플 1 기준) ----------
const s1 = samples()[0], ctx1 = ctxOf(s1);
const base = s1.aiPart;
const variants = [
  {
    name: "B1 헤더·분량", expect: ["R1", "R2"],
    make: (t) => "### 3. 당신이 보는 민수는 이럴 거예요\n짧은 문단입니다.\n\n" +
      t.replace("### 6. 민수가 서운한", "### 6. 민수이 서운한").split("### 7.")[0] + "### 7." + t.split("### 7.")[1].slice(0, 200) + "\n\n### 8. 오늘 한 번 해볼 수 있는 것들을 알려드립니다\n\n이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다.",
  },
  {
    name: "B2 말투·금지어·학자·고르셨", expect: ["R5", "R6", "R7", "R9"],
    make: (t) => t
      .replace("가장 큰 자원이 됩니다.", "가장 큰 자원이 돼요. Gottman의 회복 시도처럼, 이 고리는 회피형 패턴이 아니라 **함께 고칠 수 있는** 흐름입니다.")
      .replace(/고르셨/g, "선택하셨"),
  },
  {
    name: "B3 구조·문단·복사", expect: ["R3", "R4", "R8", "X1"],
    make: (t) => {
      let x = t.replace(/\n• 바로 말하는 나를 민수가 "예민하다"고 할 때\n/, "\n")
        .replace("셋째, 말이 커지기 전에", "마지막으로, 말이 커지기 전에")
        .replace("이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다.", "그리고 1주일 채팅권도 함께 드립니다.");
      // 4번 둘째·셋째 문단을 합쳐 6문장 이상으로
      x = x.replace("저녁이 지나갑니다.\n\n또 다른 장면은", "저녁이 지나갑니다. 또 다른 장면은");
      // pair_relation 흐름 문장 그대로 삽입
      return x.replace("### 5.", ctx1.pairTexts["흐름"].split(". ")[1] + ".\n\n### 5.");
    },
  },
  {
    name: "B4 동물·물 비유", expect: ["X2"],
    make: (t) => t.replace("둘 다 다가가는 방식이라", "당신은 물개처럼 바로 말하고, 민수는 복어같이 부풀었다가 물밑에서 발장구를 칩니다. 둘 다 다가가는 방식이라"),
  },
  {
    name: "B5 근거 없는 전제", expect: ["X3"],
    make: (t) => t.replace("둘 다 다가가는 방식이라", "지난 연애에서 생긴 습관일 수 있고, 양가 모임 뒤에 더 자주 부딪힐 수 있습니다. 둘 다 다가가는 방식이라"),
  },
];
lines.push("", "## 망가뜨린 변형 (샘플 1 기준)", "", "| 변형 | 기대한 실패 | 실제 실패 | 기대 모두 잡음 |", "|---|---|---|:-:|");
const vdetails = [];
for (const b of variants) {
  const v = validate(b.make(base), ctx1);
  const failed = v.checks.filter((c) => !c.pass).map((c) => c.id);
  const caught = b.expect.every((id) => failed.includes(id));
  lines.push(`| ${b.name} | ${b.expect.join(", ")} | ${failed.join(", ")} | ${caught ? "O" : "X"} |`);
  for (const c of v.checks.filter((c) => !c.pass)) vdetails.push(`- ${b.name} ${c.id}: ${c.detail}`);
}
lines.push("", ...vdetails);
writeFileSync(new URL("sample_validation.md", OUT), lines.join("\n") + "\n");
console.log(lines.join("\n"));
