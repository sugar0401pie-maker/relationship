import { NextResponse } from "next/server";
import { fail, readJson, requireUser } from "@/lib/server/http";
import { loadOwned, saveAnswer } from "@/lib/server/sessions";

// 장면 응답 저장 → 다음 장면("done"이면 끝)
export async function POST(req: Request, ctx: RouteContext<"/api/rel/session/[id]/answer">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const body = await readJson(req);
    const row = await loadOwned(id, user.id);
    const next = await saveAnswer(row, String(body.step ?? ""), body.value);
    return NextResponse.json({ next });
  } catch (e) {
    return fail(e);
  }
}
