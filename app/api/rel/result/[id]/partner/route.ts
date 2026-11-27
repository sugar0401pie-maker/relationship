import { NextResponse } from "next/server";
import { fail, readJson, requireUser } from "@/lib/server/http";
import { loadOwned, savePartnerPick } from "@/lib/server/sessions";

// 10쪽: 상대 결과 화면에서 고른 두 유형 저장 { self, view } (유형 이름만)
export async function POST(req: Request, ctx: RouteContext<"/api/rel/result/[id]/partner">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    await savePartnerPick(await loadOwned(id, user.id), await readJson(req));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
