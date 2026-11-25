# 강에 사는 나, 바다에 사는 너 — 쏠 마을 관계 테스트

쏠 웰니스 하우스의 연인·부부 관계 웰니스 테스트 — `couple.ssolwellnesshouse.com`.
기획 원본은 owner 개발 패키지 v2.5(`docs/`, `data/`, `db/`, `lib/rel/` 원본 코드). 작업 규칙은 [CLAUDE.md](CLAUDE.md).

```
npm install
npm run dev      # http://localhost:3300
npm test         # 패키지 채점 테스트 19개 + 흐름·결과 조립·리포트 입력 테스트
npm run lint && npm run build
```

DB 테이블은 `supabase/migrations/`의 SQL을 Supabase SQL Editor에서 실행해 만듭니다.
그림은 `python3 scripts/build_images.py`가 owner의 Codex 폴더 원본에서 `public/images/`로 줄여 만듭니다.
