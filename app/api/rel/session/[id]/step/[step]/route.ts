import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/http";
import { loadOwned, stepScreen } from "@/lib/server/sessions";

// 장면 하나의 화면 내용. 열 수 없는 장면(건너뛰기·이미 끝남)이면 열어야 할 장면을 알려 준다.
export async function GET(req: Request, ctx: RouteContext<"/api/rel/session/[id]/step/[step]">) {
  try {
    const { id, step } = await ctx.params;
    const user = await requireUser(req);
    const row = await loadOwned(id, user.id);
    return NextResponse.json(stepScreen(row, step));
  } catch (e) {
    return fail(e);
  }
}
