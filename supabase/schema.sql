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
