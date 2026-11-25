import "server-only";
import { NextResponse } from "next/server";
import { getAuthUser } from "./supabaseAdmin";

// 이 앱은 클로즈드 세션용이라 모든 API가 로그인(쏠 웰니스 하우스 계정)을 요구한다(owner 2026-11-25).
export class RelError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function requireUser(req: Request): Promise<{ id: string; email: string | null }> {
  const u = await getAuthUser(req.headers.get("authorization")).catch(() => null);
  if (!u) throw new RelError("로그인이 필요합니다.", 401, { needLogin: true });
  return u;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function fail(e: unknown) {
  if (e instanceof RelError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  // 응답 내용·이름은 로그에 남기지 않는다(개인정보) — 오류 종류만.
  console.error("관계 테스트 API 오류:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
}
