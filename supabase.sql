-- TETRIS BATTLE - Supabase 초기 설정
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(nickname) between 1 and 12),
  score integer not null check (score between 1 and 9999999),
  lines integer not null default 0 check (lines between 0 and 9999),
  level integer not null default 1 check (level between 1 and 99),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);
create index if not exists scores_week_idx on public.scores (created_at desc);

-- Row Level Security: 누구나 조회/등록 가능, 수정/삭제는 불가
alter table public.scores enable row level security;

create policy "anyone can read scores"
  on public.scores for select
  to anon
  using (true);

create policy "anyone can insert scores"
  on public.scores for insert
  to anon
  with check (true);

-- (update/delete 정책 없음 → 기록 위조 방지)
