"use client";

// 클로즈드 세션(owner 2026-11-25): 로그인 화면 말고는 모두 로그인해야 들어갈 수 있다.
// 쏠 웰니스 하우스 계정(쏘웰라·디저트·타로와 같은 계정, .ssolwellnesshouse.com 쿠키 공유)으로 로그인돼 있으면 그대로 통과.
// 화면 가림일 뿐이고, 실제 데이터는 API가 매번 로그인 토큰을 확인한다(lib/server/http.ts requireUser).
import { useEffect, useState } from "react";
import { getRealSession } from "@/lib/supabase/browser";
import { goLogin } from "@/lib/client/api";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void getRealSession().then((s) => (s ? setOk(true) : goLogin()));
  }, []);
  if (!ok) return <div className="wait"><div className="wave-dot" aria-label="확인 중" /></div>;
  return <>{children}</>;
}
