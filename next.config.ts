import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버가 실행 중에 읽는 패키지 데이터·리포트 문서(lib/server/data.ts)를 배포본에 싣는다.
  outputFileTracingIncludes: {
    "/api/rel/**": [
      "./data/relationship_test_data.json",
      "./data/character_image_manifest.json",
      "./docs/spec/리포트_AI프롬프트.md",
      "./docs/spec/sample_reports_10pairs.md",
    ],
  },
  images: {
    localPatterns: [{ pathname: "/images/**" }],
    qualities: [75],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
