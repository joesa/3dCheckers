-- Aether Draughts — niche leaderboards
-- Beyond the raw ELO ladder: correspondence standings and duel-shaped stats that
-- give different kinds of players something to chase. Pure read functions over the
-- tables that already exist, so they are cheap and can be exposed publicly.

create or replace function public.ad_corr_standings(p_limit int default 100)
returns table(uid uuid, handle text, elo int, played int, wins int, active int, winrate numeric)
language sql security definer set search_path = public
as $$
  with parts as (
    select host_uid as uid, id, status, winner_uid from ad_corr_games
    union all
    select guest_uid as uid, id, status, winner_uid from ad_corr_games
  )
  select prof.uid, prof.handle, prof.elo,
    count(*) filter (where parts.status = 'done')::int as played,
    count(*) filter (where parts.status = 'done' and parts.winner_uid = parts.uid)::int as wins,
    count(*) filter (where parts.status = 'active')::int as active,
    round((count(*) filter (where parts.status = 'done' and parts.winner_uid = parts.uid)) * 100.0
          / nullif(count(*) filter (where parts.status = 'done'), 0)) as winrate
    from parts
    join ad_profiles prof on prof.uid = parts.uid
   group by prof.uid, prof.handle, prof.elo
   order by wins desc, played desc, prof.elo desc
   limit greatest(p_limit, 1);
$$;

-- Shortest decisive correspondence wins — the "crushed them fast" board.
create or replace function public.ad_corr_quickest(p_limit int default 25)
returns table(id bigint, host_name text, guest_name text, winner_name text, moves int, theme text)
language sql security definer set search_path = public
as $$
  select g.id, g.host_name, g.guest_name,
    case g.winner_uid when g.host_uid then g.host_name when g.guest_uid then g.guest_name end as winner_name,
    g.last_seq as moves, g.theme
    from ad_corr_games g
   where g.status = 'done' and g.result = 'win' and g.last_seq > 0
   order by g.last_seq asc, g.last_move_at desc
   limit greatest(p_limit, 1);
$$;

-- Longest grinding duels ever played.
create or replace function public.ad_corr_longest(p_limit int default 25)
returns table(id bigint, host_name text, guest_name text, moves int, theme text)
language sql security definer set search_path = public
as $$
  select g.id, g.host_name, g.guest_name, g.last_seq as moves, g.theme
    from ad_corr_games g
   where g.status = 'done' and g.last_seq > 0
   order by g.last_seq desc
   limit greatest(p_limit, 1);
$$;

-- Win-rate ladder for the seasoned (needs a minimum number of rated games).
create or replace function public.ad_ladder_winrate(p_min int default 3, p_limit int default 50)
returns table(uid uuid, handle text, elo int, wins int, losses int, winrate numeric)
language sql security definer set search_path = public
as $$
  select p.uid, p.handle, p.elo, p.wins, p.losses,
    round(p.wins * 100.0 / nullif(p.wins + p.losses, 0)) as winrate
    from ad_profiles p
   where p.wins + p.losses >= greatest(p_min, 1)
   order by winrate desc, p.elo desc
   limit greatest(p_limit, 1);
$$;

grant execute on function public.ad_corr_standings(int)  to anon, authenticated;
grant execute on function public.ad_corr_quickest(int)   to anon, authenticated;
grant execute on function public.ad_corr_longest(int)    to anon, authenticated;
grant execute on function public.ad_ladder_winrate(int,int) to anon, authenticated;
