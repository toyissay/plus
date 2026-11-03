-- 국방이음+ (계획·실시 연계형 업무 점검 도구) — 시연용 테이블 (교육·시연용 가상 데이터 전용)
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행한다.
-- 각 테이블은 (id, data jsonb) 구조로, 화면 코드의 store 계층(js/store.js)이 그대로 읽고 쓴다.
-- 로그인이 없으므로 anon 키로 조회·추가·수정·삭제를 허용한다. 이 테이블들에만 적용되며 실제 자료를 넣지 않는다.

do $$
declare
  t text;
begin
  foreach t in array array['members','documents','tasks','task_evidence','weekly_plans','daily_logs','check_requests'] loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists demo_select on public.%I', t);
    execute format('drop policy if exists demo_insert on public.%I', t);
    execute format('drop policy if exists demo_update on public.%I', t);
    execute format('drop policy if exists demo_delete on public.%I', t);
    execute format('create policy demo_select on public.%I for select to anon using (true)', t);
    execute format('create policy demo_insert on public.%I for insert to anon with check (true)', t);
    execute format('create policy demo_update on public.%I for update to anon using (true) with check (true)', t);
    execute format('create policy demo_delete on public.%I for delete to anon using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
  end loop;
end $$;
