// 실행: node test_scoring.mjs  (Node 18+)
// 채점 규칙과 조사 처리를 예시 응답으로 검증합니다.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { render, normalizeItemText } from "./josa.js";
import * as S from "./scoring.js";

const D = JSON.parse(readFileSync(new URL("../../data/relationship_test_data.json", import.meta.url)));
const P1 = D.part1_competency, P2 = D.part2_competency;
let pass = 0; const ok = (name, fn) => { fn(); pass++; console.log("✓", name); };

// 1부 응답 만들기: 역량별 [속1, 속2, 겉1, 겉2]
const self = (spec) => Object.fromEntries(P1.map((it) => {
  const [s1, s2, o1, o2] = spec[it.역량];
  const v = { 속1: s1, 속2: s2, 겉1: o1, 겉2: o2 }[it.id.split("-").pop()];
  return [it.id, v];
}));

ok("데이터 수량", () => {
  assert.equal(D.types.length, 21);
  assert.equal(P1.length, 20); assert.equal(P2.length, 10);
  assert.equal(D.mode_scenes.length, 40); assert.equal(D.pairs.length, 231);
  assert.equal(Object.keys(D.loop_flow).length, 10);
  for (const it of [...P1, ...P2]) assert.deepEqual(it.보기.map((b) => b.score).sort(), [1, 2, 3, 4]);
});

// 예시 A: 말하기가 가장 낮고, 속은 높은데 겉이 낮음 → 혹등고래 + 속·겉 간격
const A = self({ 기대기: [3, 3, 4, 3], 믿기: [4, 3, 4, 4], "선 지키기": [3, 3, 3, 3], 말하기: [4, 3, 1, 1], 회복하기: [3, 4, 4, 3] });
const sA = S.scoreSelf(A, P1);
ok("예시 A: 주 고민 역량 = 말하기", () => assert.deepEqual(sA.lowest, { mode: "single", options: ["말하기"], value: "말하기" }));
ok("예시 A: 속·겉 간격 = 말하기 inner_higher", () => assert.deepEqual(S.innerOuterLine(sA.comp, "말하기"), { competency: "말하기", key: "inner_higher" }));
ok("예시 A: 방식 거리두기 3표 + 기대기 3.25 → 혹등고래(히든 아님)", () => {
  const m = S.pickMode(["거리두기", "거리두기", "조율하기", "거리두기"]);
  assert.equal(m.value, "거리두기");
  assert.equal(S.typeOf(D.types, "말하기", m.value, { relyScore: sA.comp["기대기"].total, distanceVotes: m.count["거리두기"] }).name, "혹등고래");
});
ok("히든: 기대기 2.0 이하면 바다의 노인", () => {
  assert.equal(S.typeOf(D.types, "말하기", "거리두기", { relyScore: 2.0, distanceVotes: 3 }).name, "바다의 노인");
  assert.equal(S.typeOf(D.types, "말하기", "거리두기", { relyScore: 2.0, distanceVotes: 2 }).name, "혹등고래");
});

ok("동점: 겉 점수가 더 낮은 역량이 이김", () => {
  const r = S.scoreSelf(self({ 기대기: [1, 1, 3, 3], 믿기: [3, 3, 1, 1], "선 지키기": [4, 4, 4, 4], 말하기: [4, 4, 4, 4], 회복하기: [4, 4, 3, 3] }), P1);
  assert.equal(r.lowest.value, "믿기");
});
ok("동점: 겉까지 같으면 확인 화면", () => {
  const r = S.scoreSelf(self({ 기대기: [2, 2, 2, 2], 믿기: [2, 2, 2, 2], "선 지키기": [4, 4, 4, 4], 말하기: [4, 4, 4, 4], 회복하기: [4, 4, 4, 4] }), P1);
  assert.deepEqual(r.lowest, { mode: "tie", options: ["기대기", "믿기"] });
});
ok("모두 3.5 이상이면 확인 화면", () => {
  const r = S.scoreSelf(self({ 기대기: [4, 4, 3, 4], 믿기: [4, 4, 4, 4], "선 지키기": [4, 3, 4, 4], 말하기: [4, 4, 4, 3], 회복하기: [4, 4, 4, 4] }), P1);
  assert.equal(r.lowest.mode, "all_high");
});
ok("일관성: 1점과 4점이면 표시, 3개 이상이면 전체 안내", () => {
  const r = S.scoreSelf(self({ 기대기: [1, 4, 2, 2], 믿기: [2, 2, 1, 4], "선 지키기": [4, 1, 3, 3], 말하기: [3, 3, 3, 3], 회복하기: [3, 3, 3, 3] }), P1);
  assert.ok(r.comp["기대기"].inconsistent && r.comp["믿기"].inconsistent && r.inconsistentAll);
});
ok("가까운 이웃: 차이 0.75면 없음, 0.5면 있음", () => {
  assert.equal(S.neighborOf(sA.comp, "말하기"), null);
  const r = S.scoreSelf(self({ 기대기: [3, 3, 3, 3], 믿기: [4, 4, 4, 4], "선 지키기": [3, 2, 3, 3], 말하기: [3, 3, 2, 1], 회복하기: [4, 4, 4, 4] }), P1);
  assert.equal(r.lowest.value, "말하기"); assert.equal(S.neighborOf(r.comp, "말하기"), "선 지키기");
});
ok("방식 동점 2:2 → 확인 화면", () => assert.deepEqual(S.pickMode(["다가가기", "조율하기", "다가가기", "조율하기"]).options, ["다가가기", "조율하기"]));

// 2부
const partner = Object.fromEntries(P2.map((it) => [it.id, { 기대기: 4, 믿기: 3, "선 지키기": 4, 말하기: 4, 회복하기: 2 }[it.역량]]));
const pB = S.scorePartner(partner, P2);
ok("2부: 주 고민 역량 = 회복하기", () => assert.equal(pB.lowest.value, "회복하기"));
ok("2부: 잘 모르겠어요가 많으면 유형 대신 안내", () => {
  const few = Object.fromEntries(P2.map((it) => [it.id, ["기대기", "믿기"].includes(it.역량) ? 3 : null]));
  assert.equal(S.scorePartner(few, P2).lowest.mode, "insufficient");
});
ok("고리 키는 순서와 무관", () => {
  assert.equal(S.loopKey("거리두기", "다가가기"), "다가가기×거리두기");
  assert.ok(D.loop_flow[S.loopKey("거리두기", "다가가기")]);
});
ok("엇갈림: 말하기에서 그 사람이 높음", () => assert.deepEqual(S.mismatch(sA.comp, pB.comp), { competency: "말하기", diff: -3, key: "partner_higher" }));
ok("먼저 건네기 저울: 내 쪽 2.25 vs 그 사람 3.0 → 그 사람 쪽", () => assert.equal(S.balance(sA.comp, pB.comp).key, "partner"));
ok("안전 문항", () => assert.ok(S.safetyFlag("말하고 싶지 않아요") && !S.safetyFlag("아니요")));

// 조사
ok("조사: 받침 유무", () => {
  assert.equal(render("{애칭|은} 보통", { 애칭: "민수" }), "민수는 보통");
  assert.equal(render("{애칭|은} 보통", { 애칭: "지훈" }), "지훈은 보통");
  assert.equal(render("{이름}님은 {유형|이에요}", { 이름: "혜진", 유형: "혹등고래" }), "혜진님은 혹등고래예요");
  assert.equal(render("{이름}님은 {유형|이에요}", { 이름: "혜진", 유형: "바다의 노인" }), "혜진님은 바다의 노인이에요");
});
ok("조사: 문항 텍스트 자동 변환 (전 문항 렌더 오류 0건)", () => {
  for (const name of ["민수", "지훈"]) {
    const texts = [...P1.flatMap((i) => [i.장면, ...i.보기.map((b) => b.text)]), ...P2.flatMap((i) => [i.장면, ...i.보기.map((b) => b.text)]),
      ...D.mode_scenes.flatMap((m) => [m.장면, ...Object.values(m.보기)])];
    for (const t of texts) {
      const out = render(normalizeItemText(t), { 애칭: name });
      assert.ok(!/민수은|민수이 |민수을|민수과|지훈는|지훈가 |지훈를|지훈와/.test(out), out);
    }
  }
  assert.equal(render(normalizeItemText("{애칭}이 친구들과 노는 날"), { 애칭: "민수" }), "민수가 친구들과 노는 날");
  assert.equal(render(normalizeItemText("{애칭}과의 시간"), { 애칭: "민수" }), "민수와의 시간");
});
console.log(`\n${pass}개 테스트 통과`);

// 결과 문구 템플릿이 모두 렌더되는지
const vars = { A: "문어", B: "혹등고래", 애칭: "민수", 이름: "혜진", 유형: "혹등고래", 역량: "말하기", 역량A: "말하기", 역량B: "회복하기", 이웃역량: "선 지키기", 이웃유형: "거북", 고리: "쫓아가면 물러나는 춤", 계기: "부딪힌 일이 생깁니다.", "나의 첫 움직임": "나는 지금 풀자며 다가갑니다." };
const walk = (o) => typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(walk) : o && typeof o === "object" ? Object.values(o).flatMap(walk) : [];
let n = 0; for (const t of walk([D.loop_flow, D.mismatch, D.balance, D.inner_outer, D.ui_copy, D.report_outline, D.base_knowledge])) { render(normalizeItemText(t), vars); n++; }
console.log(`결과 문구·base_knowledge 템플릿 ${n}개 렌더 확인`);
assert.equal(Object.keys(D.base_knowledge).length, 21);
assert.equal(render(normalizeItemText(D.report_outline[2].섹션), { 애칭: "민수" }), "3. 당신이 보는 민수는 이럴 거예요");

// 방향별 관계 441개
{
  const keys = Object.keys(D.pair_relations);
  assert.equal(keys.length, 441);
  const names = D.types.map((t) => t.name);
  for (const a of names) for (const b of names) assert.ok(D.pair_relations[`${a}→${b}`], `${a}→${b} 없음`);
  let m = 0;
  for (const name of ["민수", "지훈"]) for (const k of keys) for (const [f, t] of Object.entries(D.pair_relations[k])) {
    const out = render(t, { 애칭: name, 이름: name === "민수" ? "지훈" : "민수" });
    assert.ok(!/\{|\}/.test(out), `${k}.${f} 렌더 실패`);
    assert.ok(!/민수은|민수이 |민수을|민수과|지훈는|지훈가 |지훈를|지훈와/.test(out), out);
    m++;
  }
  console.log(`방향별 관계 441개 × 8필드 렌더 확인 (${m}건)`);
}

// 231쌍 관계 문장: {A}/{B} → {이름}/{애칭} 양방향 렌더
{
  let m = 0;
  for (const p of D.pairs) for (const f of ["공통점", "차이점"]) for (const v of [{ A: "민지", B: "지훈" }, { A: "지훈", B: "민지" }]) {
    const out = render(p[f], v);
    assert.ok(!/\{|\}/.test(out), `pairs ${p.A}-${p.B} ${f}`);
    assert.ok(!D.types.some((t) => out.includes(t.name)), `유형 이름 남음: ${out}`);
    m++;
  }
  console.log(`231쌍 관계 문장 양방향 렌더 확인 (${m}건)`);
}

// 결과 화면 v2 · 실천 카드 · 흐림 예시
{
  const rf = D.result_flow, names = D.types.map((t) => t.name), loops = Object.keys(D.loop_flow);
  assert.equal(rf.pages.length, 10);
  assert.deepEqual(Object.keys(rf.blur_samples.sets), loops);
  for (const k of loops) { for (const p of ["5", "6", "7", "8", "9"]) assert.ok(rf.blur_samples.sets[k][p].length > 300); assert.equal(D.loop_practices[k].length, 2); }
  for (const n of names) { assert.deepEqual(D.practice_cards[n].map((c) => c.slot), ["오늘", "3일 안에", "이번 주"]); assert.equal(D.reflect_questions[n].length, 2); }
  for (const m of S.MODES) assert.ok(rf.paywall_title_by_mode[m]);
  assert.ok(Array.isArray(rf.paywall_reviews)); // 실제 후기만 — 비어 있으면 영역을 그리지 않음
  assert.equal(D.worry_input.enabled, false);
  const v = { 애칭: "지훈", 이름: "민지", A: "민지", B: "지훈", 고리: "다가갈수록 멀어지는 사이", price: "2,900원" };
  let m = 0; for (const t of walk([D.practice_cards, D.loop_practices, D.reflect_questions, rf.intro, rf.stop, rf.stop_same_mode, rf.p4_teaser, rf.paywall_price_lead, rf.paywall_button, rf.paywall_body, rf.teasers, rf.loading_messages, rf.pages.map((p) => p.title)])) { const o = render(t, v); assert.ok(!/\{|\}/.test(o), o); m++; }
  console.log(`결과 화면 v2·실천 카드 문구 ${m}개 렌더 확인`);
}

// v2.5: 유형×뿌리 대조 · 연인과 함께 하는 작심삼일 · 일상어 입력 마스터 대조
{
  const names = D.types.map((t) => t.name), loops = Object.keys(D.loop_flow);
  assert.deepEqual(Object.keys(D.type_roots.types).sort(), [...names].sort());
  for (const n of names) {
    const x = D.type_roots.types[n];
    assert.ok(/^ROOT-/.test(x.main.id) && x.cause_line.endsWith("됩니다."), n);
    const bad = new Set(x.excluded.map((e) => e.id));
    for (const k of [x.main, ...x.sub]) assert.ok(!bad.has(k.id), `${n}: 빼는 뿌리 ${k.id}가 주·보조에 있음`);
  }
  assert.deepEqual(Object.keys(D.loop_branches), loops);
  assert.deepEqual(Object.keys(D.couple_plans.loops), loops);
  const fams = D.couple_activities.families;
  for (const k of loops) assert.ok(fams[D.couple_plans.loops[k].family], k);
  for (const [k, a] of Object.entries(fams)) assert.deepEqual(a.steps.map((s) => s.slot), ["지친 날 2일차", "2일차", "1주일", "1달"], k);
  const w = D.worry_input;
  assert.equal(w.counts.sub_absorbed + w.counts.sub_new + w.counts.sub_test_or_safety, 20);
  const v = { 애칭: "지훈", 이름: "민지", day2_title: "쉬어 가기 약속 네 줄 함께 쓰기", day2_tired_title: "'잠깐 쉬자' 신호 한 단어 정하기" };
  let m = 0;
  for (const t of walk([Object.values(D.type_roots.types).map((x) => x.cause_line), fams, D.couple_plans.loops])) { const o = render(t, v); assert.ok(!/\{|\}/.test(o), o); m++; }
  console.log(`유형×뿌리 21개 · 연인 작심삼일 40단계 · 계획 10개 문구 ${m}개 렌더 확인`);
}
