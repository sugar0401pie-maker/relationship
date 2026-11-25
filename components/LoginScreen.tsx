"use client";

// 로그인 화면(/login) — 쏠 타로 하우스 LoginScreen과 같은 구성(카카오·네이버·이메일, 같은 계정).
// 클로즈드 세션이라 로그인 없이 하는 길은 두지 않는다(owner 2026-11-25).
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthStep from "./auth/AuthStep";
import SiteFooter from "./SiteFooter";
import { safeNext } from "@/lib/client/loginForm";
import { oauthErrorFromUrl } from "@/lib/auth/oauthError";
import { getRealSession } from "@/lib/supabase/browser";
import { signOut } from "@/lib/supabase/authClient";

export default function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const goNext = useCallback(() => router.replace(next), [router, next]);
  const justOAuth = params.get("via") === "oauth";
  const [checked, setChecked] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    void getRealSession().then((s) => {
      if (s && justOAuth) return goNext();
      if (s) setAccount(s.user.email ?? "");
      setChecked(true);
    });
  }, [goNext, justOAuth]);

  const oauthReason = oauthErrorFromUrl({ search: `?${params.toString()}`, hash: "" });
  const title = "로그인하고\n우리가 만나는 곳을 찾아볼까요?";
  const art = <img src="/images/intro.jpg" alt="" style={{ width: "100%", maxWidth: 320, margin: "4px auto 20px", borderRadius: 20, display: "block" }} />;

  return (
    <div style={{ background: "var(--navy-deep)", minHeight: "100dvh" }}>
      <div className="auth" style={{ maxWidth: 460, margin: "0 auto", padding: "28px 24px 12px" }}>
        {!checked ? null : account !== null ? (
          <div style={{ display: "grid", gap: 20 }}>
            <h1 className="big" style={{ whiteSpace: "pre-line" }}>{title}</h1>
            <p className="small" style={{ whiteSpace: "pre-line" }}>{account ? `지금 ${account}\n계정으로 로그인되어 있습니다.` : "지금 쏠 웰니스 하우스 계정으로\n로그인되어 있습니다."}</p>
            {art}
            <button type="button" className="btn block" onClick={goNext}>이 계정으로 계속하기</button>
            <button type="button" className="linkish" onClick={() => void signOut().then(() => setAccount(null))}>다른 계정으로 로그인하기</button>
          </div>
        ) : (
          <AuthStep
            title={title}
            subtitle="쏠 웰니스 하우스(쏘웰라·디저트·타로 테스트)와 같은 계정입니다. 결과는 내 계정에 저장됩니다."
            start
            initialMode={params.get("mode") === "signup" ? "signup" : "signin"}
            oauthRedirect={typeof window !== "undefined" ? `${window.location.origin}/login?via=oauth&next=${encodeURIComponent(next)}` : undefined}
            initialError={oauthReason}
            onSignedIn={goNext}
            art={art}
          />
        )}
      </div>
      <div style={{ maxWidth: 460, margin: "0 auto" }} className="dark">
        <SiteFooter />
      </div>
    </div>
  );
}
