"use client";

// 화면 맨 아래 로그인/로그아웃 자리(쏠 타로 하우스 AuthFooterLink와 같은 방식, owner 2026-11-25 요청).
// 로그인 상태 → '{이메일} · 내 결과 · 로그아웃', 로그아웃 상태 → '로그인'. 로그아웃하면 로그인 화면으로 간다
// (클로즈드 세션이라 로그인 없이는 볼 수 있는 화면이 없음). 쏠 웰니스 하우스 계정 쿠키를 함께 쓰므로
// 여기서 로그아웃하면 쏘웰라·타로에서도 로그아웃된다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient, isRealSession } from "@/lib/supabase/browser";
import { signOut } from "@/lib/supabase/authClient";

export default function AccountLink({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [state, setState] = useState<{ in: boolean; email: string } | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      queueMicrotask(() => setState({ in: false, email: "" }));
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setState({ in: isRealSession(data.session), email: data.session?.user.email ?? "" }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setState({ in: isRealSession(s), email: s?.user.email ?? "" }));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!state) return null;
  const color = tone === "dark" ? "var(--cream)" : "var(--navy)";
  return (
    <p className="account" style={{ color: tone === "dark" ? "#FDF6E9bb" : "var(--muted)" }}>
      {state.in ? (
        <>
          {state.email && <span>{state.email}로 로그인됨 · </span>}
          <Link href="/results" style={{ color }}>내 결과</Link>
          {" · "}
          <button type="button" style={{ color }} onClick={() => void signOut().then(() => window.location.replace("/login"))}>로그아웃</button>
        </>
      ) : (
        <Link href="/login" style={{ color }}>로그인</Link>
      )}
    </p>
  );
}
