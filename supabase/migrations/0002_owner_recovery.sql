-- Allowlisted accounts are confirmed on creation (no confirmation email, no cooldown),
-- and password recovery uses an owner-held recovery code instead of email.
create or replace function public.enforce_signup_allowlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_allowlist where lower(email) = lower(new.email)) then
    raise exception 'Signups are closed for this application';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;

create table public.owner_recovery (
  email text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.owner_recovery enable row level security; -- service role only

create or replace function public.new_recovery_code() returns text
language plpgsql security definer set search_path = '' as $$
declare raw text; code text;
begin
  if not public.is_owner() then raise exception 'not authorized'; end if;
  raw := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  code := substr(raw,1,4)||'-'||substr(raw,5,4)||'-'||substr(raw,9,4)||'-'||substr(raw,13,4)||'-'||substr(raw,17,4);
  insert into public.owner_recovery (email, user_id, code_hash)
  values (lower(auth.jwt()->>'email'), auth.uid(), encode(extensions.digest(raw, 'sha256'), 'hex'))
  on conflict (email) do update set code_hash = excluded.code_hash, user_id = excluded.user_id,
    failed_attempts = 0, locked_until = null, created_at = now();
  return code;
end $$;
revoke all on function public.new_recovery_code() from public, anon;
grant execute on function public.new_recovery_code() to authenticated;
