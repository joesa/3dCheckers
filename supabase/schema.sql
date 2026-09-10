-- GENERATED FILE — do not edit.
-- Regenerate: cat supabase/migrations/*.sql > supabase/schema.sql
-- Source of truth is supabase/migrations/; apply with 'npx supabase db push --local'.

-- Aether Draughts — ladder, invites, spectating
create table if not exists public.ad_profiles(
  uid uuid primary key,
  handle text unique not null,
  elo int not null default 1200,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ad_profiles enable row level security;
drop policy if exists ad_prof_read on public.ad_profiles;
create policy ad_prof_read on public.ad_profiles for select using(true);
drop policy if exists ad_prof_ins on public.ad_profiles;
create policy ad_prof_ins on public.ad_profiles for insert with check(auth.uid()=uid);
drop policy if exists ad_prof_upd on public.ad_profiles;
create policy ad_prof_upd on public.ad_profiles for update using(auth.uid()=uid);

create table if not exists public.ad_matches(
  id bigint generated always as identity primary key,
  host_uid uuid not null,
  guest_uid uuid not null,
  winner_uid uuid,
  mode text not null default 'duel',
  rated boolean not null default true,
  seed bigint not null,
  created_at timestamptz not null default now(),
  unique(host_uid,guest_uid,seed)
);
alter table public.ad_matches enable row level security;
drop policy if exists ad_match_read on public.ad_matches;
create policy ad_match_read on public.ad_matches for select using(true);

create table if not exists public.ad_invites(
  code text primary key,
  kind text not null default 'duel',
  status text not null default 'open',
  host_uid uuid,
  guest_uid uuid,
  host_name text,
  theme text,
  clock text,
  offer text,
  answer text,
  created_at timestamptz not null default now()
);
alter table public.ad_invites enable row level security;
drop policy if exists ad_inv_read on public.ad_invites;
create policy ad_inv_read on public.ad_invites for select using(true);
drop policy if exists ad_inv_ins on public.ad_invites;
create policy ad_inv_ins on public.ad_invites for insert with check(true);
drop policy if exists ad_inv_upd on public.ad_invites;
create policy ad_inv_upd on public.ad_invites for update using(true);

create table if not exists public.ad_moves(
  code text not null,
  seq int not null,
  mover text not null,
  move jsonb not null,
  created_at timestamptz not null default now(),
  primary key(code,seq)
);
alter table public.ad_moves enable row level security;
drop policy if exists ad_mv_read on public.ad_moves;
create policy ad_mv_read on public.ad_moves for select using(true);
drop policy if exists ad_mv_ins on public.ad_moves;
create policy ad_mv_ins on public.ad_moves for insert with check(true);

create table if not exists public.ad_reactions(
  id bigint generated always as identity primary key,
  code text not null,
  emoji text not null,
  created_at timestamptz not null default now()
);
alter table public.ad_reactions enable row level security;
drop policy if exists ad_rx_read on public.ad_reactions;
create policy ad_rx_read on public.ad_reactions for select using(true);
drop policy if exists ad_rx_ins on public.ad_reactions;
create policy ad_rx_ins on public.ad_reactions for insert with check(true);

create or replace function public.ad_report_match(p_opponent uuid, p_result text, p_nonce bigint)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare e0 int; e1 int; d int; w real;
begin
  if p_opponent is null or auth.uid() is null or p_opponent=auth.uid() then return null; end if;
  if exists(select 1 from ad_matches
            where host_uid=least(auth.uid(),p_opponent) and guest_uid=greatest(auth.uid(),p_opponent)
              and seed=p_nonce) then
    return (select elo from ad_profiles where uid=auth.uid());
  end if;
  select elo into e0 from ad_profiles where uid=auth.uid();
  select elo into e1 from ad_profiles where uid=p_opponent;
  if e0 is null or e1 is null then return null; end if;
  w := case p_result when 'win' then 1.0 when 'loss' then 0.0 else 0.5 end;
  d := round(32*(w-(1.0/(1.0+power(10.0,(e1-e0)/400.0)))));
  update ad_profiles
     set elo=elo+d,
         wins=wins+(case when p_result='win' then 1 else 0 end),
         losses=losses+(case when p_result='loss' then 1 else 0 end),
         updated_at=now()
   where uid=auth.uid();
  update ad_profiles
     set elo=elo-d,
         wins=wins+(case when p_result='loss' then 1 else 0 end),
         losses=losses+(case when p_result='win' then 1 else 0 end),
         updated_at=now()
   where uid=p_opponent;
  insert into ad_matches(host_uid,guest_uid,winner_uid,mode,rated,seed)
  values(least(auth.uid(),p_opponent),greatest(auth.uid(),p_opponent),
         case when p_result='win' then auth.uid()
              when p_result='loss' then p_opponent end,
         'duel', true, p_nonce);
  return e0+d;
end $$;
grant execute on function public.ad_report_match(uuid,text,bigint) to authenticated;
-- Aether Draughts — per-account assets (wallet, battle pass, equipped cosmetics)
-- Everything a player owns is keyed by uid so it survives sign-out and follows them across devices.

create table if not exists public.ad_wallet(
  uid uuid primary key references auth.users(id) on delete cascade,
  coins int not null default 300,
  purchases text[] not null default '{}',
  premium boolean not null default false,
  pass_xp int not null default 0,
  pass_claimed int[] not null default '{}',
  pass_season text not null default 's1',
  last_login text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.ad_wallet enable row level security;
drop policy if exists ad_wallet_sel on public.ad_wallet;
create policy ad_wallet_sel on public.ad_wallet for select using(auth.uid()=uid);
drop policy if exists ad_wallet_ins on public.ad_wallet;
create policy ad_wallet_ins on public.ad_wallet for insert with check(auth.uid()=uid);
drop policy if exists ad_wallet_upd on public.ad_wallet;
create policy ad_wallet_upd on public.ad_wallet for update using(auth.uid()=uid) with check(auth.uid()=uid);

create table if not exists public.ad_equip(
  uid uuid primary key references auth.users(id) on delete cascade,
  skin text not null default 'default',
  throne text not null default 'default',
  victory text not null default 'default',
  board text not null default 'island',
  clock text not null default 'auto',
  updated_at timestamptz not null default now()
);
alter table public.ad_equip enable row level security;
drop policy if exists ad_equip_sel on public.ad_equip;
create policy ad_equip_sel on public.ad_equip for select using(auth.uid()=uid);
drop policy if exists ad_equip_ins on public.ad_equip;
create policy ad_equip_ins on public.ad_equip for insert with check(auth.uid()=uid);
drop policy if exists ad_equip_upd on public.ad_equip;
create policy ad_equip_upd on public.ad_equip for update using(auth.uid()=uid) with check(auth.uid()=uid);

-- One row set per identity, created atomically with the auth user.
create or replace function public.ad_provision_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare h text;
begin
  h := coalesce(nullif(new.raw_user_meta_data->>'handle',''), split_part(new.email,'@',1));
  h := left(h,18);
  if h = '' then h := 'duelist' || right(new.id::text,6); end if;
  insert into ad_profiles(uid,handle) values(new.id,h)
    on conflict do nothing;
  insert into ad_wallet(uid) values(new.id) on conflict do nothing;
  insert into ad_equip(uid) values(new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists ad_provision_user on auth.users;
create trigger ad_provision_user
  after insert on auth.users
  for each row execute function public.ad_provision_user();

-- Backfill identities that predate the trigger.
insert into ad_wallet(uid)
  select uid from ad_profiles on conflict do nothing;
insert into ad_equip(uid)
  select uid from ad_profiles on conflict do nothing;

-- Profiles were created without a foreign key, so deleting a user left them on
-- the ladder forever.
delete from ad_profiles p
 where not exists (select 1 from auth.users u where u.id = p.uid);
alter table public.ad_profiles drop constraint if exists ad_profiles_uid_fkey;
alter table public.ad_profiles
  add constraint ad_profiles_uid_fkey foreign key (uid)
  references auth.users(id) on delete cascade;
