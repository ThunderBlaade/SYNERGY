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
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.docs to authenticated;

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

-- Delete my account: removes the caller's rows and their sign-in. Used by Profile > Delete account.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = public, auth as
  $$ begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    delete from public.docs where uid = auth.uid();
    delete from public.admins where uid = auth.uid();
    delete from auth.users where id = auth.uid();
  end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Health sync: an iPhone Shortcut sends Apple Watch data with a private key. Safe to run twice.
create table if not exists public.health_keys (uid uuid primary key, key_hash text not null, created_at timestamptz not null default now());
alter table public.health_keys enable row level security;
revoke all on public.health_keys from anon, authenticated;

create or replace function public.health_make_key() returns text
  language plpgsql security definer set search_path = public, extensions as
  $$ declare s text := encode(gen_random_bytes(24), 'hex');
  begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    insert into public.health_keys(uid, key_hash) values (auth.uid(), encode(digest(s, 'sha256'), 'hex'))
      on conflict (uid) do update set key_hash = excluded.key_hash, created_at = now();
    return auth.uid()::text || '.' || s;
  end $$;
revoke all on function public.health_make_key() from public, anon;
grant execute on function public.health_make_key() to authenticated;

create or replace function public.health_push(k text, p jsonb) returns void
  language plpgsql security definer set search_path = public, extensions as
  $$ declare u uuid; s text; src text; du text; cur jsonb; nd jsonb; merged jsonb; pth text;
  begin
    if k is null or length(k) > 120 or p is null or octet_length(p::text) > 12000 then raise exception 'bad request'; end if;
    begin u := split_part(k, '.', 1)::uuid; exception when others then raise exception 'bad key'; end;
    s := split_part(k, '.', 2);
    if not exists (select 1 from public.health_keys where uid = u and key_hash = encode(digest(s, 'sha256'), 'hex')) then raise exception 'bad key'; end if;
    src := coalesce(p->>'source', 'apple');
    if src not in ('apple','fitbit','garmin','whoop','oura','samsung','other') then raise exception 'bad source'; end if;
    du := coalesce(p->>'distUnit', 'm');
    if du not in ('m','km','mi') then raise exception 'bad unit'; end if;
    if jsonb_typeof(p->'days') is distinct from 'object' then raise exception 'no days'; end if;
    select coalesce(jsonb_object_agg(key || '|' || src, value || jsonb_build_object('src', src, 'du', du)), '{}'::jsonb) into nd
      from jsonb_each(p->'days') where key ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(value) = 'object';
    pth := 's/' || u::text || '/d/health';
    cur := coalesce((select data->'days' from public.docs where path = pth), '{}'::jsonb);
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into merged
      from (select key, value from jsonb_each(cur || nd) order by key desc limit 80) t;
    insert into public.docs(path, coll, uid, data)
      values (pth, 's/' || u::text || '/d', u, jsonb_build_object('days', merged, 'at', (extract(epoch from now()) * 1000)::bigint))
      on conflict (path) do update set data = excluded.data;
  end $$;
revoke all on function public.health_push(text, jsonb) from public;
grant execute on function public.health_push(text, jsonb) to anon, authenticated;
