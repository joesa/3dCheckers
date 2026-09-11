-- Aether Draughts — staking ledger + two-party-verified duel escrow
-- The casual coin economy stays client-side, but anything wagerable is moved onto a
-- SERVER-OWNED `stakes` balance that a client can only grow through non-farmable
-- channels (one idempotent daily grant, and winnings from duels the *opponent* also
-- attested to). Escrow is debited up-front; a duel pays out only when both parties
-- attest to a mutually consistent result. A lone malicious client therefore cannot
-- mint stakes or win a duel it did not actually play — the opponent's attestation is
-- required, and the money was already held before play.

alter table public.ad_wallet
  add column if not exists stakes int not null default 0,
  add column if not exists last_stake_day text not null default '';

create or replace function public.ad_stake_balance()
returns int
language sql security definer set search_path = public
as $$
  select coalesce((select stakes from ad_wallet where uid = auth.uid()), 0);
$$;

-- Once per calendar day (UTC), idempotent server-side: cannot be farmed by replay.
create or replace function public.ad_stake_claim_daily(p_amount int default 100)
returns int
language plpgsql security definer set search_path = public
as $$
declare today text; stored text; cur int; amt int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  amt := least(greatest(coalesce(p_amount,0), 0), 500);
  today := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  select stakes, last_stake_day into cur, stored from ad_wallet where uid = auth.uid() for update;
  if cur is null then return 0; end if;
  if stored = today then return cur; end if;
  update ad_wallet set stakes = stakes + amt, last_stake_day = today where uid = auth.uid();
  return cur + amt;
end $$;

create table if not exists public.ad_duels(
  id bigint generated always as identity primary key,
  a_uid uuid not null references auth.users(id) on delete cascade,
  b_uid uuid not null references auth.users(id) on delete cascade,
  seed bigint not null,
  stake int not null,                 -- per side; escrow = 2 * stake
  status text not null default 'pending',   -- pending|active|completed|refunded|cancelled
  a_attest text,                      -- win|loss (null until attested)
  b_attest text,
  winner_uid uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(a_uid, b_uid, seed),
  check (a_uid <> b_uid),
  check (stake > 0),
  check (status in ('pending','active','completed','refunded','cancelled'))
);
alter table public.ad_duels enable row level security;
drop policy if exists ad_duels_sel on public.ad_duels;
create policy ad_duels_sel on public.ad_duels for select
  using (auth.uid() = a_uid or auth.uid() = b_uid);

-- Opener funds its side immediately; the duel is only live once the opponent accepts.
create or replace function public.ad_duel_open(p_opponent uuid, p_seed bigint, p_stake int)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare gid bigint; me_stake int; opp_stake int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_opponent is null or p_opponent = auth.uid() then raise exception 'pick a real opponent'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 50000 then raise exception 'stake must be 1..50000'; end if;
  if not exists (select 1 from ad_wallet where uid = p_opponent) then raise exception 'opponent has no account'; end if;
  select stakes into me_stake from ad_wallet where uid = auth.uid();
  select stakes into opp_stake from ad_wallet where uid = p_opponent;
  if coalesce(me_stake,0) < p_stake then raise exception 'you cannot cover that stake'; end if;
  if coalesce(opp_stake,0) < p_stake then raise exception 'opponent cannot cover that stake'; end if;
  if exists (select 1 from ad_duels
             where seed = p_seed and status in ('pending','active')
               and ((a_uid = auth.uid() and b_uid = p_opponent) or (a_uid = p_opponent and b_uid = auth.uid()))) then
    raise exception 'a duel for that seed is already open';
  end if;
  update ad_wallet set stakes = stakes - p_stake where uid = auth.uid();
  insert into ad_duels(a_uid, b_uid, seed, stake, status)
    values (auth.uid(), p_opponent, p_seed, p_stake, 'pending')
    returning id into gid;
  return gid;
end $$;

create or replace function public.ad_duel_accept(p_duel bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare d public.ad_duels%rowtype; opp_stake int;
begin
  select * into d from ad_duels where id = p_duel;
  if not found then raise exception 'no such duel'; end if;
  if d.status <> 'pending' then return d.status; end if;
  if auth.uid() <> d.b_uid then raise exception 'only the invited opponent can accept'; end if;
  select stakes into opp_stake from ad_wallet where uid = d.b_uid;
  if coalesce(opp_stake,0) < d.stake then raise exception 'you cannot cover that stake'; end if;
  update ad_wallet set stakes = stakes - d.stake where uid = d.b_uid;
  update ad_duels set status = 'active' where id = p_duel;
  return 'active';
end $$;

create or replace function public.ad_duel_decline(p_duel bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare d public.ad_duels%rowtype;
begin
  select * into d from ad_duels where id = p_duel;
  if not found then raise exception 'no such duel'; end if;
  if d.status <> 'pending' then return d.status; end if;
  if auth.uid() <> d.b_uid then raise exception 'not your invitation'; end if;
  update ad_wallet set stakes = stakes + d.stake where uid = d.a_uid;   -- refund opener
  update ad_duels set status = 'cancelled', resolved_at = now() where id = p_duel;
  return 'cancelled';
end $$;

-- Both parties must attest; payout only on a consistent (win/loss) pair.
create or replace function public.ad_duel_attest(p_duel bigint, p_outcome text)
returns text
language plpgsql security definer set search_path = public
as $$
declare d public.ad_duels%rowtype; me_is_a boolean; aa text; bb text; winner uuid;
begin
  if p_outcome not in ('win','loss') then raise exception 'outcome must be win or loss'; end if;
  select * into d from ad_duels where id = p_duel;
  if not found then raise exception 'no such duel'; end if;
  if auth.uid() not in (d.a_uid, d.b_uid) then raise exception 'not your duel'; end if;
  if d.status <> 'active' then return d.status; end if;
  me_is_a := auth.uid() = d.a_uid;
  if me_is_a and d.a_attest is not null then return 'active'; end if;   -- idempotent
  if (not me_is_a) and d.b_attest is not null then return 'active'; end if;
  update ad_duels set a_attest = case when me_is_a then p_outcome else a_attest end,
                      b_attest = case when me_is_a then b_attest else p_outcome end
    where id = p_duel;
  aa := case when me_is_a then p_outcome else d.a_attest end;
  bb := case when me_is_a then d.b_attest else p_outcome end;
  if aa is null or bb is null then return 'active'; end if;          -- waiting on the other side
  if aa = bb then                                                     -- both claimed the same: disputed
    update ad_wallet set stakes = stakes + d.stake where uid in (d.a_uid, d.b_uid);
    update ad_duels set status = 'refunded', resolved_at = now() where id = p_duel;
    return 'refunded';
  end if;
  winner := case when aa = 'win' then d.a_uid else d.b_uid end;
  update ad_wallet set stakes = stakes + 2 * d.stake where uid = winner;   -- winner recovers its escrow + takes loser's
  update ad_duels set status = 'completed', winner_uid = winner, resolved_at = now() where id = p_duel;
  return 'completed';
end $$;

grant execute on function public.ad_stake_balance()                          to authenticated;
grant execute on function public.ad_stake_claim_daily(int)                   to authenticated;
grant execute on function public.ad_duel_open(uuid,bigint,int)              to authenticated;
grant execute on function public.ad_duel_accept(bigint)                     to authenticated;
grant execute on function public.ad_duel_decline(bigint)                    to authenticated;
grant execute on function public.ad_duel_attest(bigint,text)                to authenticated;
