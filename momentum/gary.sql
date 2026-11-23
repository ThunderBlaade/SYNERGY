-- G.A.R.Y. (General Autonomous Reasoning System): Gary Cloud's memory.
-- Paste ALL of this into Supabase: SQL Editor -> New query -> Run. Safe to run twice.
-- Every table is private: only your signed-in account can read or change your rows (Row Level Security).

-- Conversations, and every message in them
create table if not exists public.gary_convos (
  uid        uuid        not null default auth.uid(),
  id         text        not null check (length(id) between 1 and 40),
  title      text        not null default '' check (length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (uid, id)
);
create table if not exists public.gary_messages (
  id         bigint generated always as identity primary key,
  uid        uuid        not null default auth.uid(),
  convo      text        not null,
  role       text        not null check (role in ('user', 'gary')),
  content    text        not null check (length(content) < 20000),
  ctx        jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gary_messages_convo on public.gary_messages (uid, convo, id);

-- Long-term memory. kind: profile (who you are), personal (preferences, goals, routines),
-- episodic (moments in your life), operational (projects, decisions, deadlines), preference (how Gary should behave).
-- basis says how Gary knows it: stated (you said it), inferred (his guess), confirmed (you confirmed it).
create table if not exists public.gary_memories (
  uid        uuid        not null default auth.uid(),
  id         text        not null check (length(id) between 1 and 60),
  kind       text        not null check (kind in ('profile', 'personal', 'episodic', 'operational', 'preference')),
  text       text        not null check (length(text) between 1 and 4000),
  people     text[]      not null default '{}',
  happened   date,
  importance int         not null default 2 check (importance between 1 and 5),
  source     text        not null default 'conversation',
  basis      text        not null default 'stated' check (basis in ('stated', 'inferred', 'confirmed')),
  sensitive  boolean     not null default false,
  deleted    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts        tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (uid, id)
);
create index if not exists gary_memories_fts on public.gary_memories using gin (fts);

-- What Gary did, for you to check (audit log)
create table if not exists public.gary_audit (
  id     bigint generated always as identity primary key,
  uid    uuid        not null default auth.uid(),
  action text        not null,
  detail jsonb,
  ok     boolean     not null default true,
  at     timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['gary_convos', 'gary_messages', 'gary_memories', 'gary_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (uid = (select auth.uid())) with check (uid = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;

-- Gary Local: jobs Gary leaves for your PC, and your PC saying "I'm on" (added in Phase 5)
create table if not exists public.gary_jobs (
  uid        uuid        not null default auth.uid(),
  id         text        not null check (length(id) between 1 and 40),
  tool       text        not null check (tool in ('status','open_app','open_url','media','find_files','open_file','lock','sleep')),
  args       jsonb       not null default '{}'::jsonb,
  status     text        not null default 'pending' check (status in ('needs_ok','pending','running','done','failed','denied')),
  result     jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (uid, id)
);
create table if not exists public.gary_agents (
  uid       uuid        not null default auth.uid(),
  id        text        not null check (length(id) between 1 and 40),
  name      text,
  last_seen timestamptz,
  info      jsonb,
  primary key (uid, id)
);
do $$ declare t text; begin
  foreach t in array array['gary_jobs', 'gary_agents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (uid = (select auth.uid())) with check (uid = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;
