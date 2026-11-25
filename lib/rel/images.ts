// 결과 그림 고르기(데이터 result_flow.report_images). 그림 파일은 scripts/build_images.py가 manifest대로 만든 것:
//   /images/types/{slug}-1.jpg ~ -3.jpg (소개컷 3장), /images/pairs/{id 세 자리}.jpg (관계 그림, status done만)
// 무작위가 필요한 곳(5~10쪽)은 결과 번호를 시드로 섞어, 새로 고침해도 같은 결과면 같은 그림이 나온다.

export type Manifest = {
  types: { id: number; name: string; slug: string; intro_cuts: string[]; pair_images_done: number[] }[];
  pairs: { id: number; pair_id: string; title: string; status: string }[];
};

export type Pic = { src: string; alt: string; kind: "pair" | "intro" };

const pairSrc = (id: number) => `/images/pairs/${String(id).padStart(3, "0")}.jpg`;
const introSrc = (slug: string, n: number) => `/images/types/${slug}-${n}.jpg`;

export function typeSlug(M: Manifest, name: string): string | null {
  return M.types.find((t) => t.name === name)?.slug ?? null;
}

/** 유형 카드에 쓰는 대표 그림(소개컷 첫 장) */
export function typeImage(M: Manifest, name: string): string | null {
  const slug = typeSlug(M, name);
  return slug ? introSrc(slug, 1) : null;
}

/**
 * 4쪽 '우리가 만나는 곳' 그림: ① 내 유형→애칭 유형 관계 그림 ② 반대 방향 ③ (승인된 다른 그림 — 지금은 없음)
 * ④ 두 유형 소개컷 나란히. 그림이 없을 때 ④는 두 장을 돌려준다.
 */
export function meetImages(M: Manifest, myType: string, pType: string): { pair: Pic | null; side: [string, string] | null } {
  const done = (key: string) => M.pairs.find((p) => p.pair_id === key && p.status === "done");
  const hit = done(`${myType}→${pType}`) ?? done(`${pType}→${myType}`);
  if (hit) return { pair: { src: pairSrc(hit.id), alt: hit.title, kind: "pair" }, side: null };
  const a = typeImage(M, myType), b = typeImage(M, pType);
  return { pair: null, side: a && b ? [a, b] : null };
}

// 결과 번호(uuid) → 32비트 시드 → 간단한 의사 난수(mulberry32). 화면 그림 순서에만 쓴다(채점·유형에는 무작위를 쓰지 않음).
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 5~10쪽 제목 아래 그림 6장: 두 유형 중 하나가 나오는 관계 그림 + 두 유형 소개컷 3장씩, 중복 없이 */
export function reportImages(M: Manifest, myType: string, pType: string, resultId: string, count = 6, exclude: string[] = []): Pic[] {
  const pool: Pic[] = [];
  const seen = new Set<string>(exclude);
  for (const name of [myType, pType]) {
    const t = M.types.find((x) => x.name === name);
    if (!t) continue;
    for (const id of t.pair_images_done) {
      const p = M.pairs.find((x) => x.id === id && x.status === "done");
      if (p && !seen.has(pairSrc(id))) { seen.add(pairSrc(id)); pool.push({ src: pairSrc(id), alt: "쏠 마을 그림", kind: "pair" }); }
    }
    for (let n = 1; n <= t.intro_cuts.length; n++) {
      const s = introSrc(t.slug, n);
      if (!seen.has(s)) { seen.add(s); pool.push({ src: s, alt: "쏠 마을 그림", kind: "intro" }); }
    }
  }
  const r = rng(seedFrom(resultId));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const seededIndex = (resultId: string, n: number) => (n > 0 ? Math.floor(rng(seedFrom(resultId + ":lead"))() * n) : 0);
