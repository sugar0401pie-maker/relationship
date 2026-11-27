// 21 × 21 모든 유형 조합 × 두 관계(연애/결혼·동거) × 받침 있는/없는 이름으로 결과 10쪽을 조립해, 렌더 안 된 {자리표시}나
// 어색한 조사가 없는지 확인한다. 4쪽 그림 규칙(관계 그림 → 반대 방향 → 소개컷 나란히)도 확인.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "./scoring.js";
import { buildResultView, parseReport, trimScores } from "./pages.ts";
import { buildCompare, gapKind } from "./compare.ts";
import type { RelResult } from "./result.ts";
import type { Manifest } from "./images.ts";

const D = JSON.parse(readFileSync(new URL("../../data/relationship_test_data.json", import.meta.url), "utf8"));
const M = JSON.parse(readFileSync(new URL("../../data/character_image_manifest.json", import.meta.url), "utf8")) as Manifest;

function fakeResult(myType: string, pType: string): RelResult {
  const my = D.types.find((t: { name: string }) => t.name === myType);
  const pt = D.types.find((t: { name: string }) => t.name === pType);
  const comp = (v: number) => ({ total: v, inner: v, outer: v, 속: [v, v], 겉: [v, v], gap: null, gapSize: 0, inconsistent: false });
  const self = Object.fromEntries(S.COMPS.map((c: string) => [c, comp(c === my.competency ? 2 : 3)]));
  const partner = Object.fromEntries(S.COMPS.map((c: string) => [c, c === "믿기" ? { total: null, unseen: true } : { total: c === pt.competency ? 2 : 3, inconsistent: false }]));
  return {
    version: D.version, myType, myComp: my.competency, myMode: my.mode, pType, pComp: pt.competency, pMode: pt.mode,
    hiddenSelf: myType === "바다의 노인", hiddenPartner: pType === "바다의 노인", partnerInsufficient: false,
    loopKey: S.loopKey(my.mode, pt.mode), meIsA: S.MODES.indexOf(my.mode) <= S.MODES.indexOf(pt.mode),
    self, partner, neighbor: null, inconsistentAll: false, mismatch: { key: "none" }, balance: { key: "balanced", diff: 0, badge: false },
    innerOuter: { key: "default" }, myVotes: {}, pVotes: {},
  };
}

const walk = (o: unknown): string[] => typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(walk) : o && typeof o === "object" ? Object.values(o).flatMap(walk) : [];
const BAD = /\{[^}]*\}|민수은|민수이 |민수을|민수과|지훈는|지훈가 |지훈를|지훈와|혜진는|혜진가 |지우은|지우이 |지우을/;

test("21×21 조합 × 관계 2 × 이름 2: 결과 10쪽 문구에 남은 자리표시·조사 오류 없음", () => {
  let n = 0;
  for (const a of D.types) for (const b of D.types) for (const rel of ["연애", "결혼·동거"] as const) for (const [name, nick] of [["혜진", "민수"], ["지우", "지훈"]]) {
    const v = buildResultView(D, M, { id: `t-${a.name}-${b.name}`, createdAt: "", name, nickname: nick, relationship: rel, r: fakeResult(a.name, b.name) });
    const { compare, ...rest } = v.pages; // compare는 브라우저에서 렌더하는 원문 틀이라 아래 비교 테스트에서 따로 본다
    const text = walk(rest).join("\n");
    assert.ok(compare.types.length === 21);
    const m = text.match(BAD);
    assert.equal(m, null, `${a.name}→${b.name} ${rel} ${nick}: ${m?.[0]} … ${text.slice(Math.max(0, (m?.index ?? 0) - 40), (m?.index ?? 0) + 40)}`);
    assert.ok(v.pages.p4.pic || v.pages.p4.side, "4쪽 그림 없음");
    assert.equal(v.pages.images.length, 8);
    assert.equal(new Set(v.pages.images.map((p) => p.src)).size, 8, "그림 중복");
    n++;
  }
  assert.equal(n, 21 * 21 * 4);
});

test("같은 결과 번호면 같은 그림 순서(새로 고침해도 같음)", () => {
  const r = fakeResult("문어", "혹등고래");
  const a = buildResultView(D, M, { id: "same", createdAt: "", name: "혜진", nickname: "민수", relationship: "연애", r });
  const b = buildResultView(D, M, { id: "same", createdAt: "", name: "혜진", nickname: "민수", relationship: "연애", r });
  assert.deepEqual(a.pages.images, b.pages.images);
});

test("AI 본문 나누기: 말머리·첫째/둘째/셋째·채팅권 문단 처리", () => {
  const md = "### 4. 제목\n본문 하나.\n\n### 7. 방향\n결론.\n\n첫째, 내가.\n\n둘째, 부탁.\n\n셋째, 함께.\n\n### 8. 실천\n결론.\n\n• 오늘 · 5분 — 카드\n\n설명.\n\n이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다. 나눠 보세요.";
  const r = parseReport(md);
  assert.equal(r[4].length, 1);
  assert.deepEqual(r[7].filter((b) => b.t === "step").map((b) => (b as { n: number }).n), [1, 2, 3]);
  assert.equal(r[8].some((b) => b.t === "item"), true);
  assert.equal(JSON.stringify(r[8]).includes("채팅 이용권"), false);
});

test("점수 표기: 끝의 0을 뺀다", () => {
  assert.equal(trimScores("겉이 4.00점, 속이 3.50점, 합계 2.25점, 1.00 점"), "겉이 4점, 속이 3.5점, 합계 2.25점, 1 점");
  assert.equal(trimScores("2026.11.25 10.50점"), "2026.11.25 10.5점");
});

test("10~12쪽 비교: 21×21 내 결과 × 상대가 고른 유형 조합 일부 — 자리표시·조사 오류 없음, 판정 4종", () => {
  const names = D.types.map((t: { name: string }) => t.name);
  const kinds = new Set<string>();
  let n = 0;
  for (const a of names) for (const b of names) {
    const v = buildResultView(D, M, { id: "c", createdAt: "", name: "혜진", nickname: "민수", relationship: "연애", r: fakeResult(a, b) });
    for (const [ps, pv] of [[b, a], [a, b], [names[(names.indexOf(a) + 5) % 21], names[(names.indexOf(b) + 9) % 21]]]) {
      const c = buildCompare(v.pages.compare, ps, pv)!;
      assert.ok(c, `${a}/${b}/${ps}/${pv}`);
      const text = walk([c.aboutMe, c.aboutPartner, c.loops, c.extra, c.cards.map((x) => x.label)]).join("\n");
      const m = text.match(BAD);
      assert.equal(m, null, `${a}→${b} 상대 ${ps}/${pv}: ${m?.[0]}`);
      kinds.add(c.aboutMe.kind); kinds.add(c.aboutPartner.kind);
      assert.ok(!c.extra.some((f) => f.code === v.pages.compare.loopFamily), "작심삼일 가족이 '더해 볼 것'에 다시 나옴");
      n++;
    }
  }
  assert.deepEqual([...kinds].sort(), ["both_diff", "comp_same", "mode_same", "same"]);
  assert.equal(n, 21 * 21 * 3);
});

test("비교 판정: 같음·방식만·역량만·둘 다 다름 + 덧붙임(상대를 나와 같은 유형으로 봄)", () => {
  const v = buildResultView(D, M, { id: "c", createdAt: "", name: "지민", nickname: "서준", relationship: "연애", r: fakeResult("문어", "혹등고래") });
  const T = Object.fromEntries(v.pages.compare.types.map((t) => [t.name, t]));
  assert.equal(gapKind(T, "문어", "문어"), "same");
  assert.equal(gapKind(T, "문어", "수달"), "mode_same");
  assert.equal(gapKind(T, "문어", "해파리"), "comp_same");
  assert.equal(gapKind(T, "문어", "펭귄"), "both_diff");
  // 서준이 자기를 물개로, 나도 물개로 봄 → 서준이 나를 자기와 같은 유형으로 봄(내 실제 유형 문어와 다름) → 덧붙임
  const c = buildCompare(v.pages.compare, "물개", "물개")!;
  assert.ok(c.aboutMe.projection && c.aboutMe.projectionAction);
  assert.ok(!c.aboutPartner.projection);
  assert.ok(c.loops.includes("지민님은"));
});
