-- Aether Draughts — spectator betting on ranked duels (pari-mutuel)
-- Spectators stake server-owned `stakes` on one side of a live ranked duel; escrow is
-- debited when the bet is placed and paid out only once the duel's result has been
-- verified by BOTH players (see ad_duel_attest). Payouts are pari-mutuel: winners split
-- the losing pool pro-rata to their stake, so the house never fronts money and the total
-- paid can never exceed the total staked. Players cannot bet on their own duel.

create table if not exists public.ad_bets(
  id bigint generated always as identity primary key,
  duel_id bigint not null references public.ad_duels(id) on delete cascade,
  better_uid uuid not null references auth.users(id) on delete cascade,
  pick text not null,                     -- 'a' or 'b' (ad_duels side)
  stake int not null,
  status text not null default 'open',    -- open|won|lost|refunded
  payout int not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(duel_id, better_uid),
  check (pick in ('a','b')),
  check (stake > 0),
  check (status in ('open','won','lost','refunded'))
);
alter table public.ad_bets enable row level security;
drop policy if exists ad_bets_sel on public.ad_bets;
create policy ad_bets_sel on public.ad_bets for select using (auth.uid() = better_uid);
create index if not exists ad_bets_duel_idx on public.ad_bets(duel_id, status);

-- Internal: settle all open bets on a duel. p_winner = the winning duel side uid, or
-- NULL to refund every open bet (dispute / cancelled). Called only from other definer
-- functions. Pari-mutuel; a tiny rounding remainder stays as pool dust (never minted).
create or replace function public.ad_settle_bets(p_duel bigint, p_winner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare win_side text; poolw int; pooll int;
begin
  if p_winner is null then
    update ad_wallet w set stakes = w.stakes + s.refund
      from (select better_uid, sum(stake) refund from ad_bets
             where duel_id = p_duel and status = 'open' group by better_uid) s
     where w.uid = s.better_uid;
    update ad_bets set status = 'refunded', payout = 0, resolved_at = now()
     where duel_id = p_duel and status = 'open';
    return;
  end if;
  win_side := case when p_winner = (select a_uid from ad_duels where id = p_duel) then 'a' else 'b' end;
  select coalesce(sum(stake) filter (where pick = win_side), 0),
         coalesce(sum(stake) filter (where pick <> win_side), 0)
    into poolw, pooll
    from ad_bets where duel_id = p_duel and status = 'open';
  if poolw > 0 then
    update ad_bets set status = 'won', payout = (stake * (poolw + pooll)) / poolw, resolved_at = now()
     where duel_id = p_duel and status = 'open' and pick = win_side;
    update ad_wallet w set stakes = w.stakes + s.payout
      from (select better_uid, sum(payout) payout from ad_bets
             where duel_id = p_duel and status = 'won' group by better_uid) s
     where w.uid = s.better_uid;
  else
    update ad_bets set status = 'refunded', payout = 0, resolved_at = now()
     where duel_id = p_duel and status = 'open';
    update ad_wallet w set stakes = w.stakes + s.refund
      from (select better_uid, sum(stake) refund from ad_bets
             where duel_id = p_duel and status = 'refunded' group by better_uid) s
     where w.uid = s.better_uid;
  end if;
  update ad_bets set status = 'lost', payout = 0, resolved_at = now()
   where duel_id = p_duel and status = 'open';   -- remaining (losing side)
end $$;

create or replace function public.ad_bet_place(p_duel bigint, p_pick text, p_stake int)
returns text
language plpgsql security definer set search_path = public
as $$
declare d public.ad_duels%rowtype; me int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_pick not in ('a','b') then raise exception 'pick a side'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 50000 then raise exception 'stake must be 1..50000'; end if;
  select * into d from ad_duels where id = p_duel;
  if not found then raise exception 'no such duel'; end if;
  if d.status <> 'active' then raise exception 'betting is closed for this duel'; end if;
  if auth.uid() in (d.a_uid, d.b_uid) then raise exception 'you cannot bet on your own duel'; end if;
  if exists (select 1 from ad_bets where duel_id = p_duel and better_uid = auth.uid()) then
    raise exception 'you already have a bet on this duel';
  end if;
  select stakes into me from ad_wallet where uid = auth.uid();
  if coalesce(me,0) < p_stake then raise exception 'you cannot cover that stake'; end if;
  update ad_wallet set stakes = stakes - p_stake where uid = auth.uid();
  insert into ad_bets(duel_id, better_uid, pick, stake) values (p_duel, auth.uid(), p_pick, p_stake);
  return 'open';
end $$;

-- Public betting board: live ranked duels with their current pools.
create or replace function public.ad_duels_open(p_limit int default 50)
returns table(id bigint, a_uid uuid, a_handle text, b_uid uuid, b_handle text,
              stake int, pool_a int, pool_b int, started timestamptz)
language sql security definer set search_path = public
as $$
  select d.id, d.a_uid, pa.handle, d.b_uid, pb.handle, d.stake,
    coalesce((select sum(b.stake) from ad_bets b where b.duel_id = d.id and b.status = 'open' and b.pick = 'a'), 0) as pool_a,
    coalesce((select sum(b.stake) from ad_bets b where b.duel_id = d.id and b.status = 'open' and b.pick = 'b'), 0) as pool_b,
    d.created_at
    from ad_duels d
    join ad_profiles pa on pa.uid = d.a_uid
    join ad_profiles pb on pb.uid = d.b_uid
   where d.status = 'active'
   order by d.created_at desc
   limit greatest(p_limit, 1);
$$;

create or replace function public.ad_bet_pools(p_duel bigint)
returns table(pool_a int, pool_b int, my_pick text, my_stake int)
language sql security definer set search_path = public
as $$
  select
    coalesce((select sum(stake) from ad_bets where duel_id = p_duel and status = 'open' and pick = 'a'), 0),
    coalesce((select sum(stake) from ad_bets where duel_id = p_duel and status = 'open' and pick = 'b'), 0),
    (select pick from ad_bets where duel_id = p_duel and better_uid = auth.uid()),
    (select stake from ad_bets where duel_id = p_duel and better_uid = auth.uid());
$$;

create or replace function public.ad_bet_mine()
returns table(id bigint, duel_id bigint, a_handle text, b_handle text, pick text,
              stake int, payout int, status text)
language sql security definer set search_path = public
as $$
  select b.id, b.duel_id, pa.handle, pb.handle, b.pick, b.stake, b.payout, b.status
    from ad_bets b
    join ad_duels d on d.id = b.duel_id
    join ad_profiles pa on pa.uid = d.a_uid
    join ad_profiles pb on pb.uid = d.b_uid
   where b.better_uid = auth.uid()
   order by b.id desc
   limit 50;
$$;

-- Route duel settlement through ad_settle_bets. Replaces the staking-migration versions.
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
  update ad_wallet set stakes = stakes + d.stake where uid = d.a_uid;
  update ad_duels set status = 'cancelled', resolved_at = now() where id = p_duel;
  return 'cancelled';
end $$;

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
  if me_is_a and d.a_attest is not null then return 'active'; end if;
  if (not me_is_a) and d.b_attest is not null then return 'active'; end if;
  update ad_duels set a_attest = case when me_is_a then p_outcome else a_attest end,
                      b_attest = case when me_is_a then b_attest else p_outcome end
    where id = p_duel;
  aa := case when me_is_a then p_outcome else d.a_attest end;
  bb := case when me_is_a then d.b_attest else p_outcome end;
  if aa is null or bb is null then return 'active'; end if;
  if aa = bb then
    update ad_wallet set stakes = stakes + d.stake where uid in (d.a_uid, d.b_uid);
    update ad_duels set status = 'refunded', resolved_at = now() where id = p_duel;
    perform ad_settle_bets(p_duel, null);
    return 'refunded';
  end if;
  winner := case when aa = 'win' then d.a_uid else d.b_uid end;
  update ad_wallet set stakes = stakes + 2 * d.stake where uid = winner;
  update ad_duels set status = 'completed', winner_uid = winner, resolved_at = now() where id = p_duel;
  perform ad_settle_bets(p_duel, winner);
  return 'completed';
end $$;

grant execute on function public.ad_bet_place(bigint,text,int)  to authenticated;
grant execute on function public.ad_duels_open(int)             to anon, authenticated;
grant execute on function public.ad_bet_pools(bigint)          to authenticated;
grant execute on function public.ad_bet_mine()                 to authenticated;
