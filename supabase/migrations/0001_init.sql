-- Quiet Time: private single-user schema. Every table has RLS; access requires
-- the signed-in email to be on app_allowlist, and user rows are scoped to auth.uid().

create table public.app_allowlist (email text primary key);
alter table public.app_allowlist enable row level security; -- no policies: invisible to clients

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Block every signup that isn't on the allowlist.
create or replace function public.enforce_signup_allowlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_allowlist where lower(email) = lower(new.email)) then
    raise exception 'Signups are closed for this application';
  end if;
  return new;
end $$;
revoke all on function public.enforce_signup_allowlist() from public, anon, authenticated;
create trigger enforce_signup_allowlist before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- ---------- Source text ----------
create table public.bible_books (
  id smallint primary key check (id between 1 and 66),
  code text not null unique,
  name text not null,
  testament text not null check (testament in ('OT','NT'))
);

create table public.bible_sources (
  id serial primary key,
  translation text not null,           -- e.g. 'NIV 1984'
  edition text,
  provenance text,
  checksum_sha256 text,
  verse_count int,
  validation jsonb,
  imported_at timestamptz not null default now(),
  is_active boolean not null default false
);

create table public.bible_verses (
  id int primary key,                  -- BBCCCVVV, e.g. Gen 1:1 = 1001001
  source_id int not null references public.bible_sources(id),
  book_id smallint not null references public.bible_books(id),
  chapter smallint not null,
  verse smallint not null,
  text text not null,
  formatting jsonb,                    -- optional: paragraph/poetry/heading metadata
  unique (book_id, chapter, verse),
  check (id = book_id * 1000000 + chapter * 1000 + verse)
);
create index bible_verses_source_idx on public.bible_verses (source_id);

-- ---------- Plan ----------
create table public.reading_plans (
  id text primary key,
  title text not null,
  start_date date not null,
  end_date date not null,
  version int not null default 1,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.plan_assignments (
  plan_id text not null references public.reading_plans(id) on delete cascade,
  day smallint not null check (day >= 1),
  passage_order smallint not null,
  start_id int not null,
  end_id int not null check (end_id >= start_id),
  label text not null,
  primary key (plan_id, day, passage_order)
);

-- ---------- User data ----------
create table public.transcriptions (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  verse_id int not null,
  typed text not null default '',
  status text not null default 'draft' check (status in ('draft','complete','unverified')),
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (owner_id, verse_id)
);
create index transcriptions_status_idx on public.transcriptions (owner_id, status);

create table public.user_progress (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  plan_id text,
  current_day smallint,
  verse_id int,
  caret int,
  prefs jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  refs jsonb not null default '[]',     -- [{"s": start_verse_id, "e": end_verse_id}]
  tags text[] not null default '{}',
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  fts tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored
);
create index notes_owner_updated_idx on public.notes (owner_id, updated_at);
create index notes_fts_idx on public.notes using gin (fts);
create index notes_tags_idx on public.notes using gin (tags);
create index notes_refs_idx on public.notes using gin (refs jsonb_path_ops);

create table public.sermons (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  refs jsonb not null default '[]',
  note_ids uuid[] not null default '{}',
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index sermons_owner_updated_idx on public.sermons (owner_id, updated_at);

-- ---------- RLS ----------
alter table public.bible_books enable row level security;
alter table public.bible_sources enable row level security;
alter table public.bible_verses enable row level security;
alter table public.reading_plans enable row level security;
alter table public.plan_assignments enable row level security;
alter table public.transcriptions enable row level security;
alter table public.user_progress enable row level security;
alter table public.notes enable row level security;
alter table public.sermons enable row level security;

-- Source + plan: read-only for the owner. Writes happen only through privileged import.
create policy "owner reads books" on public.bible_books for select to authenticated using ((select public.is_owner()));
create policy "owner reads sources" on public.bible_sources for select to authenticated using ((select public.is_owner()));
create policy "owner reads verses" on public.bible_verses for select to authenticated using ((select public.is_owner()));
create policy "owner reads plans" on public.reading_plans for select to authenticated using ((select public.is_owner()));
create policy "owner reads assignments" on public.plan_assignments for select to authenticated using ((select public.is_owner()));

-- Owned rows: full CRUD scoped to auth.uid().
do $$
declare t text;
begin
  foreach t in array array['transcriptions','user_progress','notes','sermons'] loop
    execute format('create policy "own select" on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner()))', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_owner()))', t);
    execute format('create policy "own update" on public.%I for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner()))', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;

-- ---------- Revision-aware saves (security invoker: RLS applies) ----------
-- items: [{verse_id, typed, status, base_revision}] -> [{verse_id, ok, revision} | {verse_id, ok:false, conflict:{typed,status,revision}}]
create or replace function public.save_transcriptions(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb; cur public.transcriptions; res jsonb := '[]'::jsonb;
  v_id int; v_typed text; v_status text; v_base int;
begin
  if not public.is_owner() then raise exception 'not authorized'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := (it->>'verse_id')::int; v_typed := it->>'typed'; v_status := it->>'status';
    v_base := coalesce((it->>'base_revision')::int, 0);
    insert into public.transcriptions (verse_id, typed, status, revision, completed_at)
      values (v_id, v_typed, v_status, 1, case when v_status = 'complete' then now() end)
      on conflict (owner_id, verse_id) do nothing;
    if found then
      res := res || jsonb_build_object('verse_id', v_id, 'ok', true, 'revision', 1);
      continue;
    end if;
    select * into cur from public.transcriptions where owner_id = auth.uid() and verse_id = v_id for update;
    if cur.revision = v_base or cur.typed = v_typed then
      update public.transcriptions set typed = v_typed, status = v_status,
        revision = cur.revision + 1, updated_at = now(),
        completed_at = case when v_status = 'complete' then coalesce(cur.completed_at, now()) else null end
        where owner_id = auth.uid() and verse_id = v_id;
      res := res || jsonb_build_object('verse_id', v_id, 'ok', true, 'revision', cur.revision + 1);
    else
      res := res || jsonb_build_object('verse_id', v_id, 'ok', false,
        'conflict', jsonb_build_object('typed', cur.typed, 'status', cur.status, 'revision', cur.revision));
    end if;
  end loop;
  return res;
end $$;

-- Generic doc save for notes/sermons. p: {id, title, body, refs, tags|note_ids, deleted, base_revision}
create or replace function public.save_doc(p_table text, p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare cur_rev int; v_id uuid := (p->>'id')::uuid; v_base int := coalesce((p->>'base_revision')::int, 0);
begin
  if not public.is_owner() then raise exception 'not authorized'; end if;
  if p_table not in ('notes','sermons') then raise exception 'bad table'; end if;
  execute format('select revision from public.%I where id = $1 and owner_id = auth.uid() for update', p_table)
    into cur_rev using v_id;
  if cur_rev is null then
    if p_table = 'notes' then
      insert into public.notes (id, title, body, refs, tags, deleted_at)
      values (v_id, coalesce(p->>'title',''), coalesce(p->>'body',''), coalesce(p->'refs','[]'),
              coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'),
              case when (p->>'deleted')::boolean then now() end);
    else
      insert into public.sermons (id, title, body, refs, note_ids, deleted_at)
      values (v_id, coalesce(p->>'title',''), coalesce(p->>'body',''), coalesce(p->'refs','[]'),
              coalesce(array(select jsonb_array_elements_text(p->'note_ids'))::uuid[], '{}'),
              case when (p->>'deleted')::boolean then now() end);
    end if;
    return jsonb_build_object('ok', true, 'revision', 1);
  end if;
  if cur_rev <> v_base then
    return jsonb_build_object('ok', false, 'revision', cur_rev);
  end if;
  if p_table = 'notes' then
    update public.notes set title = coalesce(p->>'title',''), body = coalesce(p->>'body',''),
      refs = coalesce(p->'refs','[]'), tags = coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'),
      deleted_at = case when (p->>'deleted')::boolean then coalesce(deleted_at, now()) end,
      revision = cur_rev + 1, updated_at = now()
      where id = v_id and owner_id = auth.uid();
  else
    update public.sermons set title = coalesce(p->>'title',''), body = coalesce(p->>'body',''),
      refs = coalesce(p->'refs','[]'), note_ids = coalesce(array(select jsonb_array_elements_text(p->'note_ids'))::uuid[], '{}'),
      deleted_at = case when (p->>'deleted')::boolean then coalesce(deleted_at, now()) end,
      revision = cur_rev + 1, updated_at = now()
      where id = v_id and owner_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'revision', cur_rev + 1);
end $$;

revoke all on function public.save_transcriptions(jsonb) from public, anon;
revoke all on function public.save_doc(text, jsonb) from public, anon;
grant execute on function public.save_transcriptions(jsonb) to authenticated;
grant execute on function public.save_doc(text, jsonb) to authenticated;

-- Owner allowlist is set per deployment (not committed):
--   insert into public.app_allowlist (email) values ('you@example.com');
