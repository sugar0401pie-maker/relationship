"use client";

// 브라우저 → 우리 API. 로그인 토큰(Bearer)을 붙이고, 로그인이 풀렸으면 로그인 화면으로 보낸다.
import { getAccessToken } from "@/lib/supabase/browser";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    goLogin();
    throw new ApiError("로그인이 필요합니다.", 401);
  }
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) goLogin();
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? "잠시 후 다시 시도해 주세요.", res.status);
  return json as T;
}

export function goLogin() {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (!window.location.pathname.startsWith("/login")) window.location.replace(`/login?next=${encodeURIComponent(here)}`);
}
