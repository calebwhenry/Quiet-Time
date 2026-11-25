-- Active time per device per local day. Clients upsert absolute totals, so retries never double count.
create table public.daily_activity (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text not null,
  day date not null,
  typing_seconds int not null default 0 check (typing_seconds >= 0),
  notes_seconds int not null default 0 check (notes_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, device_id, day)
);
alter table public.daily_activity enable row level security;
create policy "own select" on public.daily_activity for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy "own insert" on public.daily_activity for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy "own update" on public.daily_activity for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner())) with check (owner_id = (select auth.uid()));
create policy "own delete" on public.daily_activity for delete to authenticated using (owner_id = (select auth.uid()) and (select public.is_owner()));
revoke all on public.daily_activity from anon;

create index transcriptions_completed_idx on public.transcriptions (owner_id, completed_at);
create index notes_created_idx on public.notes (owner_id, created_at);

-- One row per local day from p_from to today: time, verses and words written, notes and note words.
create or replace function public.daily_stats(p_tz text, p_from date)
returns table(day date, typing_seconds int, notes_seconds int, verses int, words int, notes int, note_words int)
language sql stable security invoker set search_path = '' as $$
  with days as (
    select generate_series(p_from, (now() at time zone p_tz)::date, interval '1 day')::date as d
  ), a as (
    select da.day as d, sum(da.typing_seconds)::int ts, sum(da.notes_seconds)::int ns
    from public.daily_activity da where da.owner_id = auth.uid() and da.day >= p_from group by da.day
  ), t as (
    select (tr.completed_at at time zone p_tz)::date as d, count(*)::int v,
      sum(coalesce(array_length(regexp_split_to_array(nullif(btrim(tr.typed), ''), '\s+'), 1), 0))::int w
    from public.transcriptions tr
    where tr.owner_id = auth.uid() and tr.status = 'complete' and tr.completed_at is not null
      and (tr.completed_at at time zone p_tz)::date >= p_from
    group by 1
  ), n as (
    select (nt.created_at at time zone p_tz)::date as d, count(*)::int c,
      sum(coalesce(array_length(regexp_split_to_array(nullif(btrim(nt.title || ' ' || nt.body), ''), '\s+'), 1), 0))::int w
    from public.notes nt
    where nt.owner_id = auth.uid() and nt.deleted_at is null and (nt.created_at at time zone p_tz)::date >= p_from
    group by 1
  )
  select days.d, coalesce(a.ts, 0), coalesce(a.ns, 0), coalesce(t.v, 0), coalesce(t.w, 0), coalesce(n.c, 0), coalesce(n.w, 0)
  from days left join a on a.d = days.d left join t on t.d = days.d left join n on n.d = days.d
  order by 1;
$$;
revoke all on function public.daily_stats(text, date) from public, anon;
grant execute on function public.daily_stats(text, date) to authenticated;
