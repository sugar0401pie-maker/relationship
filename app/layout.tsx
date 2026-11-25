import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Gaegu } from "next/font/google";
import "./globals.css";

// 글꼴: 본문 Noto Sans KR, 유형 이름·고리 이름은 Gaegu(결제 후 리포트 화면 시안과 같음). 한글 글꼴은 조각이 많아 미리 받지 않는다(타로와 같은 이유).
const noto = Noto_Sans_KR({ variable: "--font-noto-sans-kr", subsets: ["latin"], preload: false });
const gaegu = Gaegu({ variable: "--font-gaegu", subsets: ["latin"], weight: ["700"], preload: false });

const DESCRIPTION = "전문 심리상담사가 만든 연인·부부 관계 웰니스 테스트. 나와 내 눈에 비친 연인이 어떤 바다 친구인지, 둘이 어디서 엇갈리고 어떻게 다시 만나는지 알려드립니다.";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://couple.ssolwellnesshouse.com"),
  title: "강에 사는 나, 바다에 사는 너 · 쏠 마을 관계 테스트",
  description: DESCRIPTION,
  // 클로즈드 세션 동안은 검색에 노출하지 않는다
  robots: { index: false, follow: false },
  openGraph: { title: "강에 사는 나, 바다에 사는 너", description: DESCRIPTION, siteName: "쏠 웰니스 하우스", locale: "ko_KR", type: "website", images: ["/images/intro.jpg"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#01365C" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${noto.variable} ${gaegu.variable}`}>
      <body>{children}</body>
    </html>
  );
}
