// 장면 순서·확인 화면·결과 계산을 실제 데이터로 확인한다(패키지 test_scoring.mjs의 예시 A를 화면 흐름으로 다시 돌림 — 마스터 스펙 9장 "실서비스 코드에서도 같은 케이스 재현").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextStep, canOpen, prune, sequence, P1_STEPS, P2_STEPS, M1_STEPS, M2_STEPS, type Answers, type RelData } from "./flow.ts";
import { computeResult } from "./result.ts";

const D = JSON.parse(readFileSync(new URL("../../data/relationship_test_data.json", import.meta.url), "utf8")) as RelData & { loop_flow: Record<string, unknown> };

// 역량별 [속1, 속2, 겉1, 겉2] → 1부 응답(p1-xx)
function part1(spec: Record<string, number[]>): Answers {
  const a: Answers = {};
  D.part1_order.forEach((id, i) => {
    const it = D.part1_competency.find((x) => x.id === id)!;
    const k = id.split("-").pop() as "속1" | "속2" | "겉1" | "겉2";
    a[P1_STEPS[i]] = spec[it.역량][{ 속1: 0, 속2: 1, 겉1: 2, 겉2: 3 }[k]];
  });
  return a;
}
function part2(by: Record<string, number | null>): Answers {
  const a: Answers = {};
  D.part2_competency.forEach((it, i) => (a[P2_STEPS[i]] = by[it.역량]));
  return a;
}
const votes = (prefix: "m1" | "m2", comp: string, modes: (string | null)[]): Answers =>
  Object.fromEntries((prefix === "m1" ? M1_STEPS : M2_STEPS).map((k, i) => [k, `${comp}|${modes[i] ?? ""}`]));

const SELF_A = { 기대기: [3, 3, 4, 3], 믿기: [4, 3, 4, 4], "선 지키기": [3, 3, 3, 3], 말하기: [4, 3, 1, 1], 회복하기: [3, 4, 4, 3] };
const PARTNER_B = { 기대기: 4, 믿기: 3, "선 지키기": 4, 말하기: 4, 회복하기: 2 };

test("처음엔 안내 → 1부 첫 장면", () => {
  assert.equal(nextStep({}, D), "intro1");
  assert.equal(nextStep({ intro1: true }, D), "p1-01");
  assert.equal(canOpen("p1-05", { intro1: true }, D), false); // 건너뛰기 불가
});

test("예시 A + 2부 B: 확인 화면 없이 끝까지 → 혹등고래 × 문어 고리", () => {
  let a: Answers = { intro1: true, ...part1(SELF_A) };
  assert.equal(nextStep(a, D), "m1-1"); // 말하기가 하나로 정해져 확인 화면 없음
  a = { ...a, ...votes("m1", "말하기", ["거리두기", "거리두기", "조율하기", "거리두기"]) };
  assert.equal(nextStep(a, D), "intro2");
  a = { ...a, intro2: true, ...part2(PARTNER_B) };
  assert.equal(nextStep(a, D), "m2-1");
  a = { ...a, ...votes("m2", "회복하기", ["다가가기", "다가가기", "조율하기", "다가가기"]) };
  assert.equal(nextStep(a, D), null);
  const r = computeResult(a, D);
  assert.equal(r.myType, "혹등고래");
  assert.equal(r.pType, "문어");
  assert.equal(r.loopKey, "다가가기×거리두기");
  assert.equal(r.meIsA, false);
  assert.ok(D.loop_flow[r.loopKey]);
  assert.deepEqual(r.mismatch, { competency: "말하기", diff: -3, key: "partner_higher" });
  assert.equal(r.balance?.key, "partner");
  assert.deepEqual(r.innerOuter, { competency: "말하기", key: "inner_higher" });
});

test("역량 동점(겉까지 같음) → 확인 화면, 고른 역량의 방식 장면", () => {
  const a: Answers = { intro1: true, ...part1({ 기대기: [2, 2, 2, 2], 믿기: [2, 2, 2, 2], "선 지키기": [4, 4, 4, 4], 말하기: [4, 4, 4, 4], 회복하기: [4, 4, 4, 4] }) };
  assert.equal(nextStep(a, D), "c1-comp");
  const { d } = sequence({ ...a, "c1-comp": "믿기" }, D);
  assert.equal(d.myComp, "믿기");
  assert.equal(nextStep({ ...a, "c1-comp": "선 지키기" }, D), "c1-comp"); // 보기에 없는 값은 무시
});

test("방식 2:2 → 확인 화면", () => {
  const a: Answers = { intro1: true, ...part1(SELF_A), ...votes("m1", "말하기", ["다가가기", "조율하기", "다가가기", "조율하기"]) };
  assert.equal(nextStep(a, D), "c1-mode");
  assert.equal(nextStep({ ...a, "c1-mode": "조율하기" }, D), "intro2");
});

test("앞 답을 바꿔 확정 역량이 바뀌면 이전 방식 표는 지워진다", () => {
  let a: Answers = { intro1: true, ...part1(SELF_A), ...votes("m1", "말하기", ["거리두기", "거리두기", "조율하기", "거리두기"]), intro2: true };
  // 기대기를 가장 낮게 바꿈
  const changed = { ...a };
  D.part1_order.forEach((id, i) => { if (id.startsWith("S-기대기")) changed[P1_STEPS[i]] = 1; });
  a = prune(changed, D);
  assert.equal(a["m1-1"], undefined);
  assert.equal(a.intro2, undefined);
  assert.equal(nextStep(a, D), "m1-1");
});

test("2부 판단 부족 → 다섯 역량 중 확인, 유효 표 2개 미만 → 방식 확인", () => {
  let a: Answers = { intro1: true, ...part1(SELF_A), ...votes("m1", "말하기", ["거리두기", "거리두기", "조율하기", "거리두기"]), intro2: true };
  a = { ...a, ...part2({ 기대기: 3, 믿기: 2, "선 지키기": null, 말하기: null, 회복하기: null }) };
  assert.equal(nextStep(a, D), "c2-comp");
  a = { ...a, "c2-comp": "회복하기", ...votes("m2", "회복하기", [null, null, null, "거리두기"]) };
  assert.equal(nextStep(a, D), "c2-mode");
  a = { ...a, "c2-mode": "거리두기" };
  assert.equal(nextStep(a, D), null);
  const r = computeResult(a, D);
  assert.equal(r.pType, "가오리");
  assert.equal(r.partnerInsufficient, true);
});

test("히든: 말하기×거리두기 3표 + 기대기 2.0 이하 → 바다의 노인", () => {
  let a: Answers = { intro1: true, ...part1({ 기대기: [2, 2, 2, 2], 믿기: [4, 4, 4, 4], "선 지키기": [4, 4, 4, 4], 말하기: [2, 1, 1, 1], 회복하기: [4, 4, 4, 4] }) };
  a = { ...a, ...votes("m1", "말하기", ["거리두기", "거리두기", "거리두기", "조율하기"]), intro2: true, ...part2(PARTNER_B), ...votes("m2", "회복하기", ["다가가기", "다가가기", "다가가기", "조율하기"]) };
  const r = computeResult(a, D);
  assert.equal(r.myType, "바다의 노인");
  assert.equal(r.hiddenSelf, true);
});
