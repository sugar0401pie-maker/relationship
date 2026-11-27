-- 10쪽에서 고른 상대 결과 두 유형을 결과에 함께 저장(owner 2026-11-27 결정 — 패키지 v2.6은 "저장하지 않음"이었음).
-- 유형 이름 두 개만 저장한다(상대의 점수·문항 답은 받지도 저장하지도 않음). 다른 기기에서 열어도 11·12쪽 비교가 그대로 보이게.
alter table public.rel_sessions
  add column if not exists partner_pick_self text,      -- {애칭}(나): 상대 결과 1쪽 유형
  add column if not exists partner_pick_view text,      -- {이름}(상대): 상대 결과 2쪽 유형(상대가 본 나)
  add column if not exists partner_pick_at timestamptz;
