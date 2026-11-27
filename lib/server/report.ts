import "server-only";
import { createAdminClient } from "./supabaseAdmin";
import { relData, reportDocs } from "./data";
import { aiConfigured, generateReportText, type AiUsage } from "./ai";
import { MAX_REPORT_ATTEMPTS, type Row } from "./sessions";
import { makeReportBuilder } from "@/lib/rel/reportInput.js";
import { validate } from "@/lib/rel/reportValidate.js";

// AI 리포트(4번 본문~8번) 만들기 — 리포트_AI프롬프트.md §4 운영 규칙: 자동 검증 실패 시 1회 재생성, 그래도 실패하면 저장하지 않는다.
// 한 번 호출 = 한 번 시도. 시도마다 서버 함수 하나를 써서(after) 시간 제한을 넉넉히 쓴다:
//   1회차 실패 → report_status를 'none'으로 돌려 두면 결과 화면이 다시 요청해 2회차가 돈다 → 2회차도 실패하면 'failed'.
// 같은 세션에 두 시도가 겹치지 않게 'generating'으로 바꾸는 순간(조건부 update)이 잠금 역할을 한다.

const TABLE = "rel_sessions";
const STALE_MS = 6 * 60 * 1000; // 이보다 오래 'generating'이면 중간에 끊긴 것으로 보고 다시 시도할 수 있다
const ATTEMPT_TIMEOUT_MS = 280_000; // 라우트 maxDuration 300초 안
const MAX_REVISIONS = 2;

let builder: ReturnType<typeof makeReportBuilder> | null = null;
const B = () => (builder ??= makeReportBuilder({ DATA: relData(), ...reportDocs() }));

/** 지금 이 세션의 리포트를 만들 차례인지 확인하고 잠근다. 잠갔으면 시도 번호를, 아니면 null. */
async function claim(row: Row, allowFailed: boolean): Promise<number | null> {
  if (row.status !== "completed" || !row.result) return null;
  if (row.report_attempts >= MAX_REPORT_ATTEMPTS) return null;
  const stale = row.report_status === "generating" && row.report_started_at && Date.now() - Date.parse(row.report_started_at) > STALE_MS;
  const ok = row.report_status === "none" || (allowFailed && row.report_status === "failed") || stale;
  if (!ok) return null;
  const attempt = row.report_attempts + 1;
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ report_status: "generating", report_started_at: new Date().toISOString(), report_attempts: attempt })
    .eq("id", row.id)
    .eq("report_status", row.report_status)
    .eq("report_attempts", row.report_attempts)
    .select("id");
  if (error || !data?.length) return null; // 다른 요청이 먼저 잠갔다
  return attempt;
}

export async function startReport(row: Row, { allowFailed = false } = {}): Promise<boolean> {
  if (!aiConfigured()) return false;
  const attempt = await claim(row, allowFailed);
  if (attempt == null) return false;
  await runAttempt(row, attempt);
  return true;
}

async function runAttempt(row: Row, attempt: number) {
  const s = { nickname: row.nickname, relationship: row.relationship, answers: row.answers, result: row.result };
  let usage: AiUsage | undefined;
  let patch: Record<string, unknown>;
  try {
    const started = Date.now();
    const req = B().buildRequest(s);
    const ctx = B().buildContext(s);
    let out = await generateReportText(req.system, req.user, ATTEMPT_TIMEOUT_MS);
    usage = out.usage;
    let v = validate(out.text, ctx);
    // 검증에 걸리면 같은 시도 안에서 한 번 고쳐 쓰게 한다(owner 2026-11-25 — luna가 분량 R2·말투 R7에 자주 걸림).
    // 처음부터 다시 쓰게 하면 같은 곳에서 또 걸리기 쉬워, 방금 쓴 글과 걸린 규칙(자동 검증의 상세)을 함께 돌려준다.
    // 시스템 프롬프트는 그대로이고, 고친 글도 똑같이 검증한다. 남은 시간이 넉넉할 때만.
    // 고친 글도 걸리면 시간이 남는 한 한 번 더 고친다(최대 2번, owner 2026-11-27).
    for (let round = 0; round < MAX_REVISIONS && !v.pass; round++) {
      const left = ATTEMPT_TIMEOUT_MS - (Date.now() - started);
      if (left <= 90_000) break;
      const fix = await generateReportText(req.system, [
        { role: "user", content: req.user },
        { role: "assistant", content: out.text },
        { role: "user", content: revisionNote(v) },
      ], left - 5_000);
      usage = sumUsage(usage, fix.usage);
      out = fix;
      v = validate(fix.text, ctx);
    }
    if (v.pass) {
      patch = { report_status: "ready", report_body: out.text, report_validation: v, report_ready_at: new Date().toISOString() };
    } else {
      // 검증 실패 글은 저장하지 않는다(어떤 규칙에서 걸렸는지만 남김 — 글 내용 없음)
      const checks = v.checks.filter((c: { pass: boolean }) => !c.pass).map((c: { id: string; detail: string }) => ({ id: c.id, detail: String(c.detail).slice(0, 200) }));
      console.warn(`[rel-ai] 검증 실패 attempt=${attempt} chars=${v.chars} rules=${checks.map((c: { id: string }) => c.id).join(",")}`);
      patch = { report_status: nextStatus(attempt), report_validation: { pass: false, chars: v.chars, failed: checks } };
    }
  } catch (e) {
    usage = (e as { usage?: AiUsage }).usage ?? usage;
    console.error(`[rel-ai] 생성 오류 attempt=${attempt}:`, e instanceof Error ? e.message : "unknown");
    patch = { report_status: nextStatus(attempt), report_validation: { pass: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" } };
  }
  await createAdminClient().from(TABLE).update({ ...patch, report_model: usage?.model ?? null, report_usage: usage ?? null, updated_at: new Date().toISOString() }).eq("id", row.id);
}

// 짝수 번째 시도(=그 회차의 재생성)까지 실패하면 'failed', 홀수 번째면 한 번 더 할 수 있게 'none'
const nextStatus = (attempt: number) => (attempt % 2 === 1 && attempt < MAX_REPORT_ATTEMPTS ? "none" : "failed");

const sumUsage = (a: AiUsage, b: AiUsage): AiUsage => ({ model: b.model, input: a.input + b.input, output: a.output + b.output, reasoning: a.reasoning + b.reasoning, ms: a.ms + b.ms });

// 고쳐 쓰기 요청: 걸린 규칙과 자동 검증이 찾은 자리(문장 끝 일부·글자 수)만 알려 준다. 규칙 원문은 시스템 프롬프트에 이미 있다.
const RULE_HINT: Record<string, string> = {
  R1: "### 4. ~ ### 8. 헤더 5개를 제목 그대로, 이 순서로만 씁니다(1~3번 헤더 금지).",
  R3: "5·6·8번은 '• ' 말머리 줄이 정확히 3개, 7번은 '첫째,' '둘째,' '셋째,'로 시작하는 문단이 있어야 합니다.",
  R4: "8번 마지막 문단은 '이 리포트와 함께 1주일간 AI 채팅 이용권이 제공됩니다'로 시작합니다.",
  R5: "금지어(회피형·불안형·집착·이기적·최악·상극·헤어지·이별하·참아야·**)를 쓰지 않습니다.",
  R6: "학자 이름과 영어 이론명을 쓰지 않습니다.",
  R7: "따옴표 밖 모든 문장을 합쇼체(~습니다/~입니다, 제안은 ~해 보세요)로 끝내고, 같은 끝 표현이 한 섹션 안에서 6문장 이상 연달아 이어지지 않게 끝맺음을 바꿉니다.",
  R8: "한 문단은 5문장 이하로 나눕니다.",
  R9: "'N번 장면에서 '…'를 고르셨습니다' 인용을 3개 이상 넣습니다.",
  X1: "<pair_relation> 문장을 그대로 옮기지 말고 풀어 씁니다.",
  X2: "동물·캐릭터 비유(○○처럼)와 물·바다 은유를 실제 행동으로 바꿉니다.",
  X3: "지난 연애·상대 가족·이혼처럼 응답에 없는 전제를 지웁니다.",
};
function revisionNote(v: { chars: number; checks: { id: string; name: string; pass: boolean; detail: string }[] }): string {
  const bad = v.checks.filter((c) => !c.pass);
  return [
    "방금 쓴 글이 자동 검증에서 아래 항목에 걸렸습니다. 내용과 구성은 그대로 두고 걸린 부분만 고쳐서, 4번 본문~8번 전체를 같은 형식으로 다시 써 주세요. 설명이나 머리말 없이 글만 씁니다.",
    ...bad.map((c) => `- ${c.id}: ${RULE_HINT[c.id] ?? c.name} / 검증 결과: ${String(c.detail).slice(0, 300)}`),
  ].join("\n");
}
