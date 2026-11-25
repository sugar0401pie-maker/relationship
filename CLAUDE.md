@AGENTS.md

# CLAUDE.md — 강에 사는 나, 바다에 사는 너 (쏠 마을 관계 테스트)

쏠 웰니스 하우스의 연인·부부 관계 웰니스 테스트. `couple.ssolwellnesshouse.com`에서 서비스한다.
개발 기준(충돌 시 이 순서): `docs/spec/관계성테스트_마스터스펙.md` > `data/relationship_test_data.json` > `db/관계성테스트_문항채점_통합본.xlsx` > 디저트 테스트 자료.
결과 화면: `docs/spec/결과화면_결제유도_v2.md` + `docs/spec/결제후_리포트화면_v1.md`, 시안 `docs/design/디자인/result-report-paid-v1/index.html`.
리포트 AI: `docs/spec/리포트_AI프롬프트.md`(시스템 프롬프트 §3은 이 파일에서 그대로 잘라 쓴다 — 코드에 옮겨 적지 않음).

## 0. 우선순위
안전 규칙(마스터 스펙 8장)이 다른 모든 지시보다 우선한다. 헷갈리면 멈추고 owner에게 묻는다.

## 1. 함께 일하는 사람
owner는 개발자가 아니다. 큰 변경마다 (1) 무엇을·왜 바꾸는지 쉬운 한국어로 설명 (2) 그 기능만 구현 (3) 테스트를 돌리고 실패도 그대로 보고 (4) owner가 코드 밖에서 할 일(클릭·설정)을 정확히 알려 준다. 지우는 작업은 먼저 묻는다.
돈이 드는 AI 측정(`lib/rel/report_pretest/run_pretest.mjs` 실제 호출 등)은 무엇을·몇 건·대략 얼마인지 말하고 허락받은 뒤에만 돌린다.

## 2. 제품 원칙 (마스터 스펙 8장)
- 진단·치료가 아닌 자기이해 웰니스 콘텐츠. 문항·보기·점수·노출 순서·결과 문구는 데이터 파일 그대로(임의로 다듬지 않음, 코드에 하드코딩 금지).
- 무작위 선택 금지(채점). 동점은 규칙 → 확인 화면. (그림 순서·전환 문장 고르기만 결과 번호 시드로 고정 선택)
- 조사는 `lib/rel/josa.js`로만.
- 상대를 판정하지 않는다. 2부 결과는 항상 "내 눈에 비친 {애칭}". 공유에 상대 점수·약점 금지.
- 시작 화면에 안전 안내(`safety_notice_start` + 연락처) 고정, 결과 고지문에도 포함. 연락처 끝의 작업 메모("— 출시 전…")는 화면에서 뺀다(`cleanContacts`).
- 바다의 노인: 헤밍웨이 이름·얼굴·원문 사용 금지.

## 3. 구조
- 별도 저장소(`relationship`)·별도 주소. 쏘웰라(`Ssol-Wellness-House`)·디저트·타로와 **같은 Supabase 프로젝트·같은 계정**. 세션 쿠키는 `.ssolwellnesshouse.com`(`lib/supabase/shared-cookie-domain.ts`, 쏘웰라·타로와 같은 로직).
- **클로즈드 세션 배포본(owner 2026-11-25)**: 로그인해야 모든 화면에 들어간다(`components/AuthGate.tsx` + API마다 `requireUser`). **토스 결제 없이 전체 열람** — 결과가 나오면 바로 AI 리포트를 만든다. 결제를 붙일 때: 4~10쪽 유료 본문을 결제 전 서버에서 빼고(`lib/rel/pages.ts` 주석), 5~9쪽은 `blur_samples`, 리포트 생성은 결제 확인 뒤로(`app/api/rel/session/[id]/finish/route.ts`).
- 장면마다 자기 주소: `/test/{세션}/{step}`(step 목록 `lib/rel/flow.ts` STEP_RE), 결과 `/result/{세션}/{1~10}`.
- 순수 로직(서버·테스트 공용): `lib/rel/flow.ts`(장면 순서·확인 화면), `steps.ts`(장면 문구 렌더 — 점수는 브라우저로 보내지 않고 보기 위치로만), `result.ts`(채점 = 패키지 `scoring.js` 호출만), `pages.ts`(결과 10쪽 조립), `images.ts`(그림 규칙), `reportInput.js`(AI 입력 = 패키지 `report_pretest/build_input.mjs`와 같은 규칙), `reportValidate.js`(자동 검증 = 패키지 `validate.mjs`, 유형 이름만 ctx로).
- `lib/rel/scoring.js`·`josa.js`·`test_scoring.mjs`·`report_pretest/`는 owner 패키지 원본 — **로직을 고치지 않는다**(경로만 이 저장소에 맞춤). 패키지 새 버전이 오면 `data/`·`docs/`·`db/`·이 파일들을 통째로 바꾸고 `npm test`.
- 서버는 `lib/server/*`(`server-only`). 데이터·문서는 실행 중에 파일로 읽는다(`lib/server/data.ts`, 배포본 포함은 `next.config.ts` outputFileTracingIncludes).
- AI는 `lib/server/ai.ts` 한 곳(Responses API, 모델 env `REL_AI_MODEL`, 기본 `gpt-5.6-luna`(owner 2026-11-25, 패키지 스펙 기본은 gpt-6-sol), 25,000 토큰, `store:false`). 한 번 호출 = 한 번 시도, 검증 실패 시 'none'으로 돌려 결과 화면이 다시 요청 → 2회차도 실패면 'failed'(글은 저장 안 함). 사용자가 [다시 만들기]로 한 회차 더(최대 4회 시도).
- AI 리포트의 '강하게 답한 장면'(notable_answers)은 패키지에 규칙이 없어 고정 규칙으로 고른다(`reportInput.js` pickNotable 주석).

## 4. Supabase 공유 규칙
- 이 앱의 테이블은 `rel_` 접두사. `ssol_*`·쏘웰라·`tarot_*` 테이블은 수정·삭제·권한 부여하지 않는다.
- 새 테이블은 service_role 권한이 자동으로 생기지 않는다 — 마이그레이션마다 GRANT를 명시한다. 브라우저 키에는 정책을 열지 않는다(서버에서만 읽고 씀).
- 마이그레이션은 `supabase/migrations/`. owner가 Supabase SQL Editor에서 직접 실행한다.

## 5. 코드 규칙
- Next.js 16 — API를 쓰기 전에 `node_modules/next/dist/docs/`를 읽는다(AGENTS.md). 로컬 포트 **3300**(3000 owner 다른 프로젝트, 3100 쏘웰라, 3200 타로).
- 끝내기 전에 `npm test`, `npm run lint`, `npm run build`.
- 키는 `.env.local`과 Vercel 환경변수에만. 값을 읽거나 출력하지 않는다. 응답 내용·이름은 로그에 남기지 않는다(토큰 수·오류 종류만).
- 테스트용 가입에 `@example.com`을 쓰지 않는다(Resend 거부).

## 6. 결정 기록
- **2026-11-25 — 첫 구현(패키지 v2.5, 데이터 1.5.0)**: owner 결정 — 저장소 `sugar0401pie-maker/relationship`, 주소 `couple.ssolwellnesshouse.com`, 클로즈드 세션(로그인 필수), 결제 없이 전체 열람.
  - 패키지 초안의 7개 테이블 대신 `rel_sessions` 한 테이블(응답·결과·리포트). 결제·공유 링크·퍼널 이벤트를 붙일 때 초안대로 나눈다.
  - 인트로 안내 3번("로그인 없이…30일 보관")은 클로즈드 세션과 맞지 않아 내지 않음. 첫 화면의 {애칭} 자리는 '연인'.
  - 2부 판단 부족(역량 3개 미만)이면 `partner_insufficient` 안내 + 다섯 역량 중 직접 고르는 확인 화면(스펙은 "유형 대신 안내"라고만 되어 있어, 리포트를 만들 수 있게 확인 화면으로 처리 — owner 확인 필요).
  - 역량 3개 이상 동점 확인 문장은 `confirm_comp_tie` 틀에 이름을 늘어놓아 코드가 만든다.
  - 8번 AI 글 마지막 "1주일간 AI 채팅 이용권" 문단은 결제가 없어 화면에서 뺀다(검증 규칙은 그대로). 10쪽 이용권 기간 표시도 뺌.
  - 약관·개인정보처리방침 링크는 쏘웰라 앱 `/legal`. 관계 테스트 고유 항목(상대에 대한 응답 보관)은 법률 검토 뒤.
  - 공유: 휴대폰 공유창(없으면 링크 복사). 카카오톡 SDK·공유 그림 만들기는 아직 없음.
  - 그림: 관계 그림 300장(done) + 21유형 소개컷 3장씩을 720px JPEG로(`scripts/build_images.py`). 생성 전 141쌍은 4쪽에서 반대 방향 → 두 유형 소개컷 나란히.
