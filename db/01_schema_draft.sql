-- 강에 사는 나, 바다에 사는 너 — 쏠 마을 관계 테스트 — 서비스 DB 스키마 초안 v0.1 (2026-10-07)
-- 대상: Supabase(Postgres). 디저트 테스트와 같은 프로젝트에 붙이는 것을 전제로, 새 테이블은 rel_ 접두어.
-- 가정: 계정은 auth.users, 결제·AI 채팅권은 디저트 테스트 테이블이 이미 있음.
--       기존 테이블 이름을 몰라서 아래에서는 public.orders / public.chat_entitlements 로 적었음 → 실제 이름으로 바꿀 것.
-- 우선순위: [P0] 출시에 반드시 필요 / [P1] 출시 직후 1~2주 안 / [P2] 파일럿 분석용

-- =========================================================
-- [P0] 1. 테스트 세션 — 한 사람이 테스트를 한 번 한 기록
-- =========================================================
create table public.rel_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,  -- 로그인 없이 시작 가능 → null 허용
  anon_key         text,                         -- 비로그인 사용자의 브라우저 키(결과 다시 보기용)
  content_version  text not null default '1.0',  -- 문항·문구 데이터 버전 (relationship_test_data.json version)
  relationship     text not null check (relationship in ('dating','married')), -- 연애 / 결혼·동거
  display_name     text not null,                -- {이름}
  nickname         text not null,                -- {애칭}
  invited_by       uuid,                         -- 공유 카드 "당신이 보는 우리는?"으로 들어온 경우 (아래 4번 생성 후 FK 추가)
  status           text not null default 'in_progress'
                   check (status in ('in_progress','completed','abandoned')),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz
);
-- ※ invited_by FK는 5번(rel_share_links) 아래에서 alter table로 붙임

-- =========================================================
-- [P0] 2. 응답 — 문항 하나당 한 줄 (1부·2부·방식 장면·확인 화면 선택 모두)
-- =========================================================
create table public.rel_answers (
  session_id   uuid not null references public.rel_sessions(id) on delete cascade,
  item_id      text not null,        -- 예: 'S-말하기-속1', 'O-기대기-A', 'M1-말하기-2', 'CONFIRM-comp', 'SAFETY'
  part         text not null check (part in ('self','partner','mode_self','mode_partner','confirm','safety')),
  score        smallint check (score between 1 and 4),   -- 역량 장면 점수 (모르겠어요 = null)
  mode_choice  text check (mode_choice in ('다가가기','맞춰주기','거리두기','조율하기')), -- 방식 장면
  dont_know    boolean not null default false,           -- 2부 '잘 모르겠어요'
  raw_value    text,                 -- 확인 화면에서 고른 역량/방식, 안전 문항 응답 등
  answered_at  timestamptz not null default now(),
  primary key (session_id, item_id)
);
-- (2026-10-22) 안전 문항 삭제: part 'safety'와 safety_flag는 쓰지 않음. 호환을 위해 칸은 남겨 두되 항상 false

-- =========================================================
-- [P0] 3. 결과 — 채점이 끝난 값 (scoring.js 출력 그대로)
-- =========================================================
create table public.rel_results (
  session_id        uuid primary key references public.rel_sessions(id) on delete cascade,
  my_type           text not null,      -- '혹등고래' 등 21개
  my_competency     text not null,
  my_mode           text not null,
  partner_type      text,               -- 판단 부족이면 null
  partner_competency text,
  partner_mode      text,
  loop_key          text,               -- '다가가기×거리두기'
  my_scores         jsonb not null,     -- {기대기:{total,inner,outer,속:[..],겉:[..],gap,inconsistent}, ...}
  partner_scores    jsonb,              -- {기대기:{total,inconsistent} | {unseen:true}}
  neighbor          text,               -- 가까운 이웃 역량
  mismatch          jsonb,              -- {competency, diff, key}
  balance           jsonb,              -- {key, diff, badge}
  inner_outer       jsonb,              -- {competency, key}
  inconsistent_all  boolean not null default false,
  hidden_self       boolean not null default false,
  hidden_partner    boolean not null default false,
  safety_flag       boolean not null default false,  -- true면 공유·2인 유료 섹션 비활성
  free_sections     jsonb not null,     -- 리포트 1~3번 + 4번 앞 2줄 렌더 결과 (재방문 시 재계산 없이 사용)
  created_at        timestamptz not null default now()
);
create index on public.rel_results (my_type);
create index on public.rel_results (loop_key);

-- =========================================================
-- [P0] 4. 유료 리포트 — 결제 후 AI 생성분 (디저트 테스트 리포트 테이블에 test_type 칸을 더해 공용으로 써도 됨)
-- =========================================================
create table public.rel_reports (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null unique references public.rel_sessions(id) on delete cascade,
  order_id        uuid not null,        -- references public.orders(id)  ← 기존 결제 테이블
  status          text not null default 'queued'
                  check (status in ('queued','generating','ready','failed')),
  model           text not null default 'gpt-6-sol',
  prompt_version  text not null default 'rel-v1',
  body_md         text,                 -- AI가 쓴 4번 본문~8번 (마크다운)
  validation      jsonb,                -- 자동 검증 결과 (항목별 통과/실패)
  attempts        smallint not null default 0,  -- 재생성 1회까지
  tokens_in       int, tokens_out int, tokens_reasoning int, cost_krw numeric(8,2),
  created_at      timestamptz not null default now(),
  ready_at        timestamptz
);
-- 결제 전에는 이 테이블 행이 없음 → 유료 본문이 클라이언트로 갈 일이 없음 (블러 구간은 rel_placeholder 문장 사용)

-- =========================================================
-- [P1] 5. 공유 링크 — 공유 카드, "당신이 보는 우리는?"
-- =========================================================
create table public.rel_share_links (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.rel_sessions(id) on delete cascade,
  code          text not null unique,     -- 짧은 공유 코드 (URL용)
  card_payload  jsonb not null,           -- 고리, 리포트 1번 두 줄, (결제 시) 내 마음 문장 — 상대 점수·약점 넣지 않음
  includes_inner_line boolean not null default false,
  opened_count  int not null default 0,
  started_count int not null default 0,   -- 이 링크로 테스트를 시작한 수 (바이럴 지표)
  revoked       boolean not null default false,  -- 공유 취소
  created_at    timestamptz not null default now()
);
alter table public.rel_sessions
  add constraint rel_sessions_invited_by_fk foreign key (invited_by) references public.rel_share_links(id);
-- (안전 문항 삭제로 safety_flag는 항상 false — 공유 제한 없음)

-- =========================================================
-- [P1] 6. 쏘웰라 연계 — 사용자의 최신 관계 유형을 채팅이 참고
-- =========================================================
create table public.rel_user_profile (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  latest_session uuid references public.rel_sessions(id) on delete set null,
  my_type        text,
  loop_key       text,
  updated_at     timestamptz not null default now()
);
-- 쏘웰라 이론 선택: 관계성 유형의 base_knowledge 관련 이론을 1순위 후보로 (디저트 테스트와 같은 규칙)
-- D19 실천 제외는 테스트 응답이 아니라 쏘웰라 대화의 안전 신호·계정 위기 이력으로만 판단 (rel_safety_d19 태그)

-- =========================================================
-- [P2] 7. 퍼널 이벤트 — 결제율·페이월 A/B
-- =========================================================
create table public.rel_events (
  id          bigserial primary key,
  session_id  uuid references public.rel_sessions(id) on delete cascade,
  event       text not null check (event in (
                'intro_view','onboarding_done','part1_done','part2_done','result_view',
                'preview_reached','paywall_view','paywall_click','payment_success',
                'report_ready','share_click','share_open','invite_start')),
  variant     text,             -- 페이월 A/B: 'cut_loop2' / 'cut_mismatch'
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index on public.rel_events (event, created_at);

-- =========================================================
-- RLS(행 수준 보안) 원칙 — 정책 문은 개발 시 작성
-- =========================================================
-- rel_sessions / rel_answers / rel_results : 본인(user_id = auth.uid()) 또는 같은 anon_key만 읽기
-- rel_reports  : 본인 + 결제 완료(order 상태 확인)일 때만 body_md 읽기. 서버(service role)만 쓰기
-- rel_share_links : code로 card_payload만 공개 읽기 (다른 칸 노출 금지)
-- rel_answers 2부(partner) 응답은 상대에 대한 정보 → 비로그인 세션은 30일 뒤 삭제(2026-10-21 결정, 첫 화면 안내와 일치), 로그인 저장 시 동의 문구 (법률 검토)
