import "server-only";
import { createAdminClient } from "./supabaseAdmin";
import { relData, imageManifest } from "./data";
import { RelError } from "./http";
import { STEP_RE, canOpen, nextStep, prune, type Answers } from "@/lib/rel/flow";
import { buildStep, answerFromInput, type Relationship, type StepScreen } from "@/lib/rel/steps";
import { computeResult, type RelResult } from "@/lib/rel/result";
import { buildResultView, parseReport, type ResultView, type Block } from "@/lib/rel/pages";

export type Row = {
  id: string;
  user_id: string;
  content_version: string;
  display_name: string;
  nickname: string;
  relationship: Relationship;
  answers: Answers;
  status: "in_progress" | "completed";
  result: RelResult | null;
  report_status: "none" | "generating" | "ready" | "failed";
  report_body: string | null;
  report_attempts: number;
  partner_pick_self?: string | null;
  partner_pick_view?: string | null;
  report_validation: { pass?: boolean; error?: string; chars?: number; failed?: { id: string }[] } | null;
  report_started_at: string | null;
  created_at: string;
  completed_at: string | null;
};

const TABLE = "rel_sessions";
const db = () => createAdminClient();

/** 이름·애칭: 앞뒤 공백 없이 1~10자. 화면에 그대로 나오므로 꺾쇠·중괄호(템플릿 문법)는 받지 않는다. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || [...s].length > 10 || /[<>{}|]/.test(s)) return null;
  return s;
}

export async function createSession(userId: string, input: Record<string, unknown>): Promise<string> {
  const name = cleanName(input.name), nickname = cleanName(input.nickname);
  const relationship = input.relationship === "결혼·동거" ? "결혼·동거" : input.relationship === "연애" ? "연애" : null;
  if (!name || !nickname || !relationship) throw new RelError("이름·애칭(1~10자)과 관계를 확인해 주세요.");
  const { data, error } = await db()
    .from(TABLE)
    .insert({ user_id: userId, content_version: String(relData().version ?? ""), display_name: name, nickname, relationship })
    .select("id")
    .single();
  if (error || !data) throw new Error(`세션 만들기 실패: ${error?.message}`);
  return data.id as string;
}

export async function loadOwned(id: string, userId: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RelError("찾을 수 없는 테스트입니다.", 404);
  const { data, error } = await db().from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`세션 읽기 실패: ${error.message}`);
  // 다른 사람의 세션은 있는지조차 알려 주지 않는다(404)
  if (!data || data.user_id !== userId) throw new RelError("찾을 수 없는 테스트입니다.", 404);
  return data as Row;
}

const who = (row: Row) => ({ name: row.display_name, nickname: row.nickname, relationship: row.relationship });

export function stepScreen(row: Row, step: string): { screen?: StepScreen; redirect?: string } {
  const D = relData();
  if (row.status === "completed") return { redirect: "done" };
  if (!STEP_RE.test(step) || !canOpen(step, row.answers, D)) return { redirect: nextStep(row.answers, D) ?? "done" };
  // 안전 안내는 첫 화면(/)에만 고정 표시하고 1부 안내 화면에서는 반복하지 않는다(owner 2026-11-25). 결과 10쪽 고지문에는 스펙대로 들어 있다.
  return { screen: buildStep(step, row.answers, D, who(row)) };
}

export async function saveAnswer(row: Row, step: string, value: unknown): Promise<string> {
  const D = relData();
  if (row.status === "completed") throw new RelError("이미 끝난 테스트입니다.", 409);
  if (!STEP_RE.test(step) || !canOpen(step, row.answers, D) || typeof value !== "string") throw new RelError("이 장면에는 지금 답할 수 없습니다.", 409);
  const parsed = answerFromInput(step, value, row.answers, D);
  if (!parsed.ok) throw new RelError("보기를 다시 골라 주세요.");
  const answers = prune({ ...row.answers, [step]: parsed.v }, D);
  const { error } = await db().from(TABLE).update({ answers, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "in_progress");
  if (error) throw new Error(`응답 저장 실패: ${error.message}`);
  return nextStep(answers, D) ?? "done";
}

/** 모든 장면에 답했으면 채점해서 저장. 이미 끝났으면 그대로. */
export async function finish(row: Row): Promise<Row> {
  if (row.status === "completed") return row;
  const D = relData();
  if (nextStep(row.answers, D) !== null) throw new RelError("아직 답하지 않은 장면이 있습니다.", 409);
  const result = computeResult(row.answers, D);
  const now = new Date().toISOString();
  const patch = { status: "completed", result, my_type: result.myType, partner_type: result.pType, loop_key: result.loopKey, completed_at: now, updated_at: now };
  const { error } = await db().from(TABLE).update(patch).eq("id", row.id).eq("status", "in_progress");
  if (error) throw new Error(`결과 저장 실패: ${error.message}`);
  return { ...row, ...patch, status: "completed", result };
}

export type ResultPayload = {
  view: ResultView;
  report: { status: Row["report_status"]; sections: Record<number, Block[]> | null; canRetry: boolean; aiOff: boolean; attempts: number; why: string | null };
  partnerPick: [string, string] | null;
};

// 한 결과당 AI 시도 상한. 시도 한 번 = 쓰기 + (검증에 걸리면) 고쳐 쓰기. 자동으로 2번, 그 뒤엔 사용자가 [다시 만들기]로.
// 클로즈드 세션·luna 모델이라 넉넉히 10(owner 2026-11-25 — 4번을 다 써서 버튼이 사라졌음). 공개 전에 비용을 보고 줄인다.
export const MAX_REPORT_ATTEMPTS = 10;

export function resultPayload(row: Row): ResultPayload {
  if (row.status !== "completed" || !row.result) throw new RelError("아직 끝나지 않은 테스트입니다.", 409);
  const view = buildResultView(relData(), imageManifest(), {
    id: row.id, createdAt: row.completed_at ?? row.created_at, name: row.display_name, nickname: row.nickname, relationship: row.relationship, r: row.result,
  });
  return {
    view,
    report: {
      status: row.report_status,
      sections: row.report_status === "ready" && row.report_body ? parseReport(row.report_body) : null,
      canRetry: row.report_status === "failed" && row.report_attempts < MAX_REPORT_ATTEMPTS,
      // 클로즈드 세션 점검용: 리포트가 안 나올 때 이유를 화면에 짧게 보인다(글 내용은 없음 — 오류 종류·걸린 검증 규칙 번호만)
      aiOff: !process.env.OPENAI_API_KEY,
      attempts: row.report_attempts,
      why: reportWhy(row.report_validation),
    },
    partnerPick: row.partner_pick_self && row.partner_pick_view ? [row.partner_pick_self, row.partner_pick_view] : null,
  };
}

function reportWhy(v: Row["report_validation"]): string | null {
  if (!v || v.pass) return null;
  if (v.error) return `AI 호출 오류: ${v.error.slice(0, 120)}`;
  if (v.failed?.length)
    return `자동 검증에서 걸린 규칙: ${v.failed.map((f) => f.id).join(", ")}`;
  return null;
}

/** 10쪽에서 고른 상대 결과 두 유형 저장(유형 이름만, owner 2026-11-27). 둘 다 비우면 지운다. */
export async function savePartnerPick(row: Row, input: Record<string, unknown>): Promise<void> {
  if (row.status !== "completed") throw new RelError("아직 끝나지 않은 테스트입니다.", 409);
  const names = new Set((relData().types as { name: string }[]).map((t) => t.name));
  const self = typeof input.self === "string" ? input.self : "", view = typeof input.view === "string" ? input.view : "";
  const clear = !self && !view;
  if (!clear && (!names.has(self) || !names.has(view))) throw new RelError("유형을 다시 골라 주세요.");
  const { error } = await db()
    .from(TABLE)
    .update({ partner_pick_self: clear ? null : self, partner_pick_view: clear ? null : view, partner_pick_at: clear ? null : new Date().toISOString() })
    .eq("id", row.id);
  // 칸이 아직 없으면(마이그레이션 전) 저장만 건너뛴다 — 화면은 이 기기에 남긴 값으로 계속 비교한다
  if (error) throw new RelError("고른 유형을 저장하지 못했습니다(이 기기에는 남아 있습니다).", 503);
}

export async function listMine(userId: string) {
  const { data, error } = await db()
    .from(TABLE)
    .select("id, display_name, nickname, status, my_type, partner_type, created_at, completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`목록 읽기 실패: ${error.message}`);
  return data ?? [];
}
