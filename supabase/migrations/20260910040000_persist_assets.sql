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
