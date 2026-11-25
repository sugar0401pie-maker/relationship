// 휴대폰 너비 한 줄 틀(시안 .app) + 위 띠(테스트 이름).
import Link from "next/link";

export default function Shell({ children, top, bottom }: { children: React.ReactNode; top?: React.ReactNode; bottom?: React.ReactNode }) {
  return (
    <div className="app" style={{ minHeight: "100dvh" }}>
      <header className="top">
        <div className="brand">
          <Link href="/" style={{ textDecoration: "none" }}><b>강에 사는 나, 바다에 사는 너</b></Link>
          <span>쏠 마을 관계 테스트</span>
        </div>
        {top}
      </header>
      <main>{children}</main>
      {bottom}
    </div>
  );
}
