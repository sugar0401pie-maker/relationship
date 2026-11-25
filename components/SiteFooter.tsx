// 하단 사업자 정보 — 쏠 타로 하우스 SiteFooter와 같은 문구(owner 2026-10-21 전달). 약관은 쏘웰라 앱 /legal.
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal/urls";

export default function SiteFooter() {
  return (
    <footer className="foot">
      <p style={{ marginBottom: 4 }}>
        <a href="https://ssolwellnesshouse.com" target="_blank" rel="noopener">by 쏠 웰니스 하우스</a> · <a href={PRIVACY_URL} target="_blank" rel="noopener">개인정보처리방침</a> · <a href={TERMS_URL} target="_blank" rel="noopener">이용약관</a>
      </p>
      <p>쏠 웰니스 하우스 · 대표 김준석 · 사업자등록번호 572-07-03549 · 통신판매업신고번호 2026-서울마포-2770</p>
      <p>서울시 마포구 독막로 100 4층 408호</p>
      <p>010-2835-2263 · contact@ssolwellness.com</p>
    </footer>
  );
}
