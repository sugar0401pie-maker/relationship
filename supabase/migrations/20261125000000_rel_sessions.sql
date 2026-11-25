-- 강에 사는 나, 바다에 사는 너 — 쏠 마을 관계 테스트 테이블 (클로즈드 세션 배포본, 2026-11-25).
-- 같은 Supabase 프로젝트를 디저트 테스트(ssol_*)·쏘웰라(접두사 없음)·타로(tarot_*)와 공유하므로 이 앱은 rel_ 접두사만 쓴다.
-- 다른 앱의 테이블은 건드리지 않는다.
--
-- 패키지 초안(db/01_schema_draft.sql)은 7개 테이블(세션·응답·결과·리포트·공유·프로필·이벤트)로 나눠 두었는데,
-- 이번 배포본은 로그인 필수·결제 없음이라 한 테이블에 응답(answers)·채점 결과(result)·AI 리포트를 함께 둔다.
-- 결제·공유 링크·퍼널 이벤트를 붙일 때 초안대로 테이블을 나눈다.
--
-- 모든 읽기·쓰기는 서버(service_role)에서만 한다. '내 눈에 비친 {애칭}' 응답은 상대에 대한 정보라 브라우저 키에는 정책을 하나도 열지 않는다.
-- RLS는 켜 두되 정책이 없으므로 브라우저(anon/authenticated) 키로는 0행.

create table if not exists public.rel_sessions (
  id uuid primary key default gen_random_uuid(),
  -- 로그인 필수(클로즈드 세션). 계정을 지우면 기록도 함께 지운다.
  user_id uuid not null references auth.users (id) on delete cascade,
  content_version text not null,
  display_name text not null check (char_length(display_name) between 1 and 10),
  nickname text not null check (char_length(nickname) between 1 and 10),
  relationship text not null check (relationship in ('연애', '결혼·동거')),
  -- 장면별 응답(lib/rel/flow.ts 형식). 점수·방식만 있고 자유 입력 글은 없다.
  answers jsonb not null default '{}'::jsonb,
  -- 'in_progress' | 'completed'
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  -- 채점 결과(lib/rel/result.ts computeResult 출력 그대로)
  result jsonb,
  my_type text,
  partner_type text,
  loop_key text,
  -- AI 리포트(4번 본문~8번). 'none' | 'generating' | 'ready' | 'failed'
  report_status text not null default 'none' check (report_status in ('none', 'generating', 'ready', 'failed')),
  report_body text,
  report_validation jsonb,
  report_attempts smallint not null default 0,
  report_model text,
  report_usage jsonb,
  report_started_at timestamptz,
  report_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists rel_sessions_user_idx on public.rel_sessions (user_id, created_at desc);
create index if not exists rel_sessions_type_idx on public.rel_sessions (my_type, partner_type);

alter table public.rel_sessions enable row level security;
-- 새 테이블은 service_role 권한이 자동으로 생기지 않는다(쏘웰라 저장소 기록) — 명시한다.
grant select, insert, update, delete on public.rel_sessions to service_role;
