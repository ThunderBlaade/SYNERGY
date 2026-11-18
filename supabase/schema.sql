-- SYNERGY database. Paste ALL of this into Supabase: SQL Editor -> New query -> Run.
-- Safe to run twice.

create table if not exists public.docs (
  path       text primary key,
  coll       text not null,
  uid        uuid not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint docs_path_ok check (path ~ '^s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/(d|e)/[^/]{1,120})?$'),
  constraint docs_coll_ok check (coll = regexp_replace(path, '/[^/]+$', '')),
  constraint docs_uid_ok  check (uid::text = split_part(path, '/', 2)),
  constraint docs_size_ok check (octet_length(data::text) < 20000)
);
create index if not exists docs_coll_idx on public.docs (coll);

create table if not exists public.admins (uid uuid primary key);
alter table public.admins enable row level security;   -- no policies: nobody can read or edit it from the app
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as
  $$ select exists (select 1 from public.admins where uid = auth.uid()) $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.docs_touch() returns trigger language plpgsql as
  $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs for each row execute function public.docs_touch();

alter table public.docs enable row level security;
revoke all on public.docs from anon;

drop policy if exists docs_read on public.docs;
drop policy if exists docs_ins  on public.docs;
drop policy if exists docs_upd  on public.docs;
drop policy if exists docs_del  on public.docs;

-- Signed-in friends can read; you can only write under your own id; the owner (admins table) can also delete.
create policy docs_read on public.docs for select to authenticated using (true);
create policy docs_ins  on public.docs for insert to authenticated with check (uid = (select auth.uid()));
create policy docs_upd  on public.docs for update to authenticated using (uid = (select auth.uid())) with check (uid = (select auth.uid()));
create policy docs_del  on public.docs for delete to authenticated using (uid = (select auth.uid()) or public.is_admin());

-- Live updates
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
