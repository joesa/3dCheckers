-- Aether Draughts — close the two RPCs that must never be reachable with the anon key
--
-- Background: a Supabase database carries `alter default privileges` granting
-- EXECUTE on every public function to anon, authenticated and service_role. That
-- silently overrode the `grant execute ... to authenticated` lines in the earlier
-- migrations, so anything SECURITY DEFINER without an internal auth.uid() check was
-- callable by whoever holds the public anon key. Two such functions exist:
--
--   ad_settle_bets(p_duel, p_winner)  moves `stakes` and pays out / refunds the
--       whole betting pool for a duel, and trusted p_winner outright. The only
--       intended caller is ad_duel_attest, which already proves the caller is one
--       of the two players. Reachable directly, it let any anon caller pick the
--       winner of any duel.
--   ad_push_due(p_minutes)            returns every push subscription's endpoint,
--       p256dh and auth — i.e. a full dump of users' push endpoints. Meant for the
--       server-side VAPID worker only (see sw.js); it has no auth.uid() filter.
--
-- Both are revoked from the client roles here and given a role check inside the
-- function body, because the default-privileges grant is exactly the mechanism that
-- undid the previous `grant ... to authenticated`: a restore or a re-applied default
-- privileges could hand the grant back, and an in-body check survives that.
--
-- ad_settle_bets cannot require service_role outright — ad_duel_attest calls it
-- inside a SECURITY DEFINER context where the original player's JWT is still in
-- scope — so its guard accepts service_role or one of the two duel participants,
-- which is precisely what ad_duel_attest already establishes.
--
-- The remaining unguarded SECURITY DEFINER functions (ad_corr_standings,
-- ad_corr_quickest, ad_corr_longest, ad_ladder_winrate, ad_duels_open,
-- ad_watch_heartbeat, ad_watch_roster, ad_watch_leave) are public by design:
-- anonymous ladder pages and open-room spectators. They are left alone.

revoke execute on function public.ad_settle_bets(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.ad_push_due(int)             from public, anon, authenticated;
grant  execute on function public.ad_settle_bets(bigint, uuid) to service_role;
grant  execute on function public.ad_push_due(int)             to service_role;

-- Settlement: service_role, or the host/guest of that duel (the ad_duel_attest path).
create or replace function public.ad_settle_bets(p_duel bigint, p_winner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare win_side text; poolw int; pooll int; caller uuid; caller_role text;
        duel_a uuid; duel_b uuid;
begin
  -- Resolve the duel first: with a bogus id both owner lookups come back NULL and
  -- `null is distinct from null` is false, which would wave an anonymous caller
  -- straight through a "not one of the two players" test.
  select a_uid, b_uid into duel_a, duel_b from ad_duels where id = p_duel;
  if not found then raise exception 'no such duel' using errcode = 'P0002'; end if;

  caller := auth.uid();
  caller_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role', ''),
    'anon');
  if caller_role <> 'service_role'
     and caller is distinct from duel_a
     and caller is distinct from duel_b then
    raise exception 'not authorized to settle this duel' using errcode = '42501';
  end if;

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

-- Push queue: the VAPID worker (service_role) only. Kept as plpgsql so the guard
-- can raise instead of quietly returning nothing; the role is read from the JWT
-- claim directly because `auth` is also an output column name here.
create or replace function public.ad_push_due(p_minutes int default 60)
returns table(uid uuid, endpoint text, p256dh text, auth text, kind text, game_id bigint, title text, body text)
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role', ''),
       'anon') <> 'service_role' then
    raise exception 'ad_push_due is service-role only' using errcode = '42501';
  end if;
  return query
  select s.uid, s.endpoint, s.p256dh, s.auth, 'your_move'::text, g.id,
    'Your move, duelist'::text,
    (case when g.turn = 'host' then g.guest_name else g.host_name end) || ' is waiting on your reply.'::text
    from ad_corr_games g
    join ad_push_subs s on s.uid = (case when g.turn = 'host' then g.guest_uid else g.host_uid end)
   where g.status = 'active'
     and coalesce(g.last_move_at, g.created_at) < now() - make_interval(mins => greatest(p_minutes, 0))
  union all
  select s.uid, s.endpoint, s.p256dh, s.auth, 'new_challenge'::text, g.id,
    'A rival challenges you'::text,
    g.host_name || ' invited you to a correspondence duel.'::text
    from ad_corr_games g
    join ad_push_subs s on s.uid = g.guest_uid
   where g.status = 'pending';
end $$;
