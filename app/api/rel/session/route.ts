import { NextResponse } from "next/server";
import { fail, readJson, requireUser } from "@/lib/server/http";
import { createSession, listMine } from "@/lib/server/sessions";

// 새 테스트 시작(이름·관계·애칭) / 내 테스트 목록
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const id = await createSession(user.id, await readJson(req));
    return NextResponse.json({ id, next: "intro1" });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ items: await listMine(user.id) });
  } catch (e) {
    return fail(e);
  }
}
