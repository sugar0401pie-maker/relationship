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
    const req = B().buildRequest(s);
    const out = await generateReportText(req.system, req.user, ATTEMPT_TIMEOUT_MS);
    usage = out.usage;
    const v = validate(out.text, B().buildContext(s));
    if (v.pass) {
      patch = { report_status: "ready", report_body: out.text, report_validation: v, report_ready_at: new Date().toISOString() };
    } else {
      // 검증 실패 글은 저장하지 않는다(어떤 규칙에서 걸렸는지만 남김 — 글 내용 없음)
      const checks = v.checks.filter((c: { pass: boolean }) => !c.pass).map((c: { id: string; detail: string }) => ({ id: c.id, detail: String(c.detail).slice(0, 200) }));
      console.warn(`[rel-ai] 검증 실패 attempt=${attempt} rules=${checks.map((c: { id: string }) => c.id).join(",")}`);
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
