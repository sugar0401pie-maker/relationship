import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/http";
import { loadOwned, resultPayload } from "@/lib/server/sessions";

// 결과 10쪽 내용 + AI 리포트 상태(만드는 중이면 화면이 몇 초마다 다시 묻는다)
export async function GET(req: Request, ctx: RouteContext<"/api/rel/result/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    return NextResponse.json(resultPayload(await loadOwned(id, user.id)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
