-- MOMENTUM: your private planner sync. Paste ALL of this into Supabase: SQL Editor -> New query -> Run.
-- Safe to run twice. Unlike Synergy's shared table, only YOU can ever read or change your rows.
create table if not exists public.momentum (
  uid     uuid        not null default auth.uid(),
  kind    text        not null check (kind in ('item', 'mood', 'settings')),
  id      text        not null check (length(id) between 1 and 80),
  data    jsonb       not null default '{}'::jsonb,
  updated bigint      not null default 0,
  at      timestamptz not null default now(),
  primary key (uid, kind, id),
  constraint momentum_size_ok check (octet_length(data::text) < 20000)
);
create index if not exists momentum_at_idx on public.momentum (uid, at);

-- Newest change wins; every write gets a fresh server time so other devices notice it.
create or replace function public.momentum_touch() returns trigger language plpgsql as
  $$ begin
    if tg_op = 'UPDATE' and new.updated < old.updated then return null; end if;
    new.at = clock_timestamp(); return new;
  end $$;
drop trigger if exists momentum_touch on public.momentum;
create trigger momentum_touch before insert or update on public.momentum for each row execute function public.momentum_touch();

alter table public.momentum enable row level security;
revoke all on public.momentum from anon;
grant select, insert, update, delete on public.momentum to authenticated;

drop policy if exists momentum_own on public.momentum;
create policy momentum_own on public.momentum for all to authenticated
  using (uid = (select auth.uid())) with check (uid = (select auth.uid()));
