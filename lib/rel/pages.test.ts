// 21 × 21 모든 유형 조합 × 두 관계(연애/결혼·동거) × 받침 있는/없는 이름으로 결과 10쪽을 조립해, 렌더 안 된 {자리표시}나
// 어색한 조사가 없는지 확인한다. 4쪽 그림 규칙(관계 그림 → 반대 방향 → 소개컷 나란히)도 확인.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "./scoring.js";
import { buildResultView, parseReport } from "./pages.ts";
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
    const text = walk(v.pages).join("\n");
    const m = text.match(BAD);
    assert.equal(m, null, `${a.name}→${b.name} ${rel} ${nick}: ${m?.[0]} … ${text.slice(Math.max(0, (m?.index ?? 0) - 40), (m?.index ?? 0) + 40)}`);
    assert.ok(v.pages.p4.pic || v.pages.p4.side, "4쪽 그림 없음");
    assert.equal(v.pages.images.length, 6);
    assert.equal(new Set(v.pages.images.map((p) => p.src)).size, 6, "그림 중복");
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
