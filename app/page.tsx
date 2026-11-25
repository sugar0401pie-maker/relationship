import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import SiteFooter from "@/components/SiteFooter";
import { relData } from "@/lib/server/data";
import { R, cleanContacts } from "@/lib/rel/text";

// 첫 화면(인트로). 문구: 데이터 test_title·ui_copy + 05_다음단계/테스트이름_인트로_후보.md "확정 이름 기준 인트로 카피".
// 안전 안내(safety_notice_start + 연락처)는 시작 화면에 반드시 고정 표시(마스터 스펙 3.4·8장 6번).
const MAIN = [
  "강에 사는 나, 바다에 사는 너.",
  "사는 물이 달라 만나기 어려운 두 존재도, 강과 바다가 만나는 곳에서는 함께 머뭅니다.",
  "당신과 {애칭|은} 어떤 물에서 와서, 어디에서 만나고 있을까요?",
];
const SHORT = "쏠 마을에는 서로 다른 물에 사는 21명의 친구들이 있습니다. 38개의 장면에 답하면, 나와 내 눈에 비친 {애칭|이} 어떤 친구인지, 둘이 어디서 엇갈리고 어떻게 다시 만나는지 알려드립니다.";

export default function Home() {
  const D = relData();
  const ui = D.ui_copy as Record<string, string | string[]>;
  // 애칭을 아직 모르는 첫 화면이라 {애칭} 자리는 '연인'으로 읽는다.
  const v = { 애칭: "연인", 이름: "" };
  // 안내 3번("로그인 없이 바로 시작…30일 보관")은 로그인이 필수인 클로즈드 세션과 맞지 않아 이 배포본에서는 내지 않는다.
  const bullets = (ui.onboarding_bullets as string[]).slice(0, 2).map((b) => R(b, v));
  return (
    <AuthGate>
      <div className="hero" style={{ minHeight: "100dvh" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "28px 20px 12px", display: "grid", gap: 18 }}>
          <p className="sub">{String(D.test_subtitle)}</p>
          <h1>{String(D.test_title)}</h1>
          <div className="art"><img src="/images/intro.jpg" alt="쏠 마을 강가 벤치에서 케이크 상자를 함께 연 두 수달" /></div>
          <div style={{ display: "grid", gap: 6, fontSize: 15 }}>
            {MAIN.map((l) => <p key={l}>{R(l, v)}</p>)}
          </div>
          <p style={{ fontSize: 14, color: "var(--sky)" }}>{R(SHORT, v)}</p>
          <ul className="bullets">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          <div className="safety">
            <p>{String(ui.safety_notice_start)}</p>
            <p><b>{cleanContacts(String(ui.safety_contacts))}</b></p>
          </div>
          <Link href="/start" className="btn-cream" style={{ textDecoration: "none" }}>우리가 만나는 곳 찾기</Link>
          <Link href="/results" style={{ color: "var(--sky)", textAlign: "center", fontSize: 14 }}>내 결과 다시 보기</Link>
        </div>
        <div className="dark" style={{ maxWidth: 460, margin: "0 auto" }}><SiteFooter /></div>
      </div>
    </AuthGate>
  );
}
