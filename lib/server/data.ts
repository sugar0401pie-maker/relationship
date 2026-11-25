import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FullData } from "@/lib/rel/steps";
import type { Manifest } from "@/lib/rel/images";

// 패키지 데이터(1.7MB)와 리포트 문서는 서버에서만 읽는다 — 브라우저에는 장면·결과에 필요한 문장만 렌더해서 보낸다.
// 배포본에 이 파일들을 싣는 설정은 next.config.ts outputFileTracingIncludes.
const root = () => process.cwd();
let data: FullData & Record<string, unknown> | null = null;
let manifest: Manifest | null = null;
let docs: { PROMPT_DOC: string; SAMPLES_DOC: string } | null = null;

export function relData() {
  data ??= JSON.parse(readFileSync(path.join(root(), "data/relationship_test_data.json"), "utf8"));
  return data!;
}
export function imageManifest(): Manifest {
  manifest ??= JSON.parse(readFileSync(path.join(root(), "data/character_image_manifest.json"), "utf8"));
  return manifest!;
}
export function reportDocs() {
  docs ??= {
    PROMPT_DOC: readFileSync(path.join(root(), "docs/spec/리포트_AI프롬프트.md"), "utf8"),
    SAMPLES_DOC: readFileSync(path.join(root(), "docs/spec/sample_reports_10pairs.md"), "utf8"),
  };
  return docs;
}
