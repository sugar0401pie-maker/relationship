import { NextResponse, after } from "next/server";
import { fail, requireUser } from "@/lib/server/http";
import { finish, loadOwned } from "@/lib/server/sessions";
import { startReport } from "@/lib/server/report";
import { relData } from "@/lib/server/data";
import { R } from "@/lib/rel/text";

// 채점해서 저장하고, AI 리포트는 응답을 보낸 뒤 만든다(after). 이 배포본은 결제 없이 전체 열람(owner 2026-11-25)이라
// 결과가 나오는 즉시 리포트를 만든다 — 결제를 붙이면 결제 확인 뒤로 옮긴다(마스터 스펙 7장: AI 리포트는 결제 후 생성).
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/rel/session/[id]/finish">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const row = await finish(await loadOwned(id, user.id));
    after(() => startReport(row).catch((e) => console.error("[rel-ai] 시작 실패:", e instanceof Error ? e.message : "unknown")));
    // 결과 기다림 문장(result_flow.loading_messages·long_wait)을 이름·애칭으로 렌더해 보낸다
    const rf = relData().result_flow as { loading_messages: string[]; long_wait: string };
    const v = { 이름: row.display_name, 애칭: row.nickname };
    return NextResponse.json({ id: row.id, loading: rf.loading_messages.map((m) => R(m, v)), longWait: R(rf.long_wait, v) });
  } catch (e) {
    return fail(e);
  }
}
