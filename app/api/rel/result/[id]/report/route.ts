import { NextResponse, after } from "next/server";
import { fail, readJson, requireUser } from "@/lib/server/http";
import { loadOwned } from "@/lib/server/sessions";
import { startReport } from "@/lib/server/report";

// 리포트 만들기 이어 하기: 1회차가 검증에 걸려 'none'으로 돌아왔거나(자동 재생성), 사용자가 실패 뒤 [다시 만들기]를 누른 경우.
// 이미 만드는 중이거나 횟수를 다 썼으면 아무것도 하지 않는다(lib/server/report.ts claim).
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/rel/result/[id]/report">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const body = await readJson(req);
    const row = await loadOwned(id, user.id);
    after(() => startReport(row, { allowFailed: body.retry === true }).catch((e) => console.error("[rel-ai] 시작 실패:", e instanceof Error ? e.message : "unknown")));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
