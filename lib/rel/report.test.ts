// 운영용 AI 입력 조립(reportInput.js)과 검증(reportValidate.js)을 실제 데이터로 확인 — AI는 부르지 않는다(비용 없음).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeReportBuilder, UNRESOLVED_RE } from "./reportInput.js";
import { validate } from "./reportValidate.js";
import { P1_STEPS, P2_STEPS, type Answers, type RelData } from "./flow.ts";
import { computeResult } from "./result.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const DATA = JSON.parse(read("../../data/relationship_test_data.json")) as RelData;
const B = makeReportBuilder({ DATA, PROMPT_DOC: read("../../docs/spec/리포트_AI프롬프트.md"), SAMPLES_DOC: read("../../docs/spec/sample_reports_10pairs.md") });

function exampleAnswers(): Answers {
  const spec: Record<string, number[]> = { 기대기: [3, 3, 4, 3], 믿기: [4, 3, 4, 4], "선 지키기": [3, 3, 3, 3], 말하기: [4, 3, 1, 1], 회복하기: [3, 4, 4, 3] };
  const a: Answers = { intro1: true, intro2: true };
  DATA.part1_order.forEach((id, i) => {
    const it = DATA.part1_competency.find((x) => x.id === id)!;
    a[P1_STEPS[i]] = spec[it.역량][{ 속1: 0, 속2: 1, 겉1: 2, 겉2: 3 }[id.split("-").pop() as "속1"]!];
  });
  ["거리두기", "거리두기", "조율하기", "거리두기"].forEach((m, i) => (a[`m1-${i + 1}`] = `말하기|${m}`));
  const p: Record<string, number> = { 기대기: 4, 믿기: 3, "선 지키기": 4, 말하기: 4, 회복하기: 1 };
  DATA.part2_competency.forEach((it, i) => (a[P2_STEPS[i]] = p[it.역량]));
  ["다가가기", "다가가기", "조율하기", "다가가기"].forEach((m, i) => (a[`m2-${i + 1}`] = `회복하기|${m}`));
  return a;
}

for (const rel of ["연애", "결혼·동거"]) {
  test(`입력 조립(${rel}): 렌더 안 된 자리표시 없음, 강하게 답한 장면 4~6개, 같은 고리 예시 포함`, () => {
    const answers = exampleAnswers();
    const s = { nickname: "민수", relationship: rel, answers, result: computeResult(answers, DATA) };
    const req = B.buildRequest(s);
    assert.equal(req.system.match(UNRESOLVED_RE), null);
    assert.equal(req.user.match(UNRESOLVED_RE), null);
    assert.ok(req.system.startsWith("당신은 쏠 웰니스 하우스의 관계 리포트 작가입니다"));
    const n = (req.user.match(/^\[\d+번 장면\]/gm) || []).length;
    assert.ok(n >= 4 && n <= 6, `장면 ${n}개`);
    assert.ok(req.user.includes("<style_example>"));
    assert.ok(req.user.includes('<pair_relation id="혹등고래→문어">'));
  });
}

test("검증기: 비어 있는 글은 실패, 예시 리포트 형식 규칙을 그대로 적용", () => {
  const answers = exampleAnswers();
  const s = { nickname: "민수", relationship: "연애", answers, result: computeResult(answers, DATA) };
  const v = validate("### 4. 우리 관계는 보통 이렇게 흘러갑니다\n짧은 글입니다.", B.buildContext(s));
  assert.equal(v.pass, false);
  assert.ok(v.checks.find((c) => c.id === "R2" && !c.pass));
});
