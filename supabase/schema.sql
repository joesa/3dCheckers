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
-- Aether Draughts — correspondence (long-form) duels
-- A challenge is opened against a specific rival; the game lives server-side so
-- each player can make a move from any device, on their own schedule, and pick up
-- exactly where the other left off. The engine still runs client-side (the move
-- blob is replayed to rebuild the position); the server is the shared source of
-- truth for *whose turn it is* and the append-only move log. Writes go through
-- security-definer RPCs so a client can never post out of turn or skip a seq.

create table if not exists public.ad_corr_games(
  id bigint generated always as identity primary key,
  host_uid  uuid not null references auth.users(id) on delete cascade,
  guest_uid uuid not null references auth.users(id) on delete cascade,
  host_name  text not null default '?',
  guest_name text not null default '?',
  status text not null default 'pending',          -- pending | active | done
  turn text not null default 'host',               -- host | guest (host plays Red / moves first)
  theme text not null default 'island',
  winner_uid uuid,
  result text,                                     -- win | draw | (null while running)
  last_seq int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_move_at timestamptz,
  check (host_uid <> guest_uid),
  check (status in ('pending','active','done')),
  check (turn in ('host','guest'))
);
create index if not exists ad_corr_host_idx on public.ad_corr_games(host_uid, updated_at desc);
create index if not exists ad_corr_guest_idx on public.ad_corr_games(guest_uid, updated_at desc);
alter table public.ad_corr_games enable row level security;
drop policy if exists ad_corr_sel on public.ad_corr_games;
create policy ad_corr_sel on public.ad_corr_games for select
  using (auth.uid() = host_uid or auth.uid() = guest_uid);

create table if not exists public.ad_corr_moves(
  game_id bigint not null references public.ad_corr_games(id) on delete cascade,
  seq int not null,
  mover_uid uuid not null,
  color text not null,                             -- red | black
  move jsonb not null,
  created_at timestamptz not null default now(),
  primary key(game_id, seq)
);
alter table public.ad_corr_moves enable row level security;
drop policy if exists ad_cmoves_sel on public.ad_corr_moves;
create policy ad_cmoves_sel on public.ad_corr_moves for select
  using (exists (select 1 from public.ad_corr_games g
                 where g.id = game_id and (g.host_uid = auth.uid() or g.guest_uid = auth.uid())));
-- no insert/update policies: writes happen only inside the definer RPCs below.

create or replace function public.ad_corr_create(p_guest uuid, p_theme text default 'island')
returns bigint
language plpgsql security definer set search_path = public
as $$
declare gid bigint; h text; g text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_guest is null or p_guest = auth.uid() then raise exception 'choose a different rival'; end if;
  select handle into h from ad_profiles where uid = auth.uid();
  select handle into g from ad_profiles where uid = p_guest;
  if g is null then raise exception 'that rival does not exist'; end if;
  if exists (select 1 from ad_corr_games
             where ((host_uid = auth.uid() and guest_uid = p_guest) or (host_uid = p_guest and guest_uid = auth.uid()))
               and status <> 'done') then
    raise exception 'a correspondence duel with % is already open', g;
  end if;
  insert into ad_corr_games(host_uid, guest_uid, host_name, guest_name, theme, status, turn)
    values (auth.uid(), p_guest, coalesce(h,'?'), g, coalesce(nullif(p_theme,''),'island'), 'pending', 'host')
    returning id into gid;
  return gid;
end $$;

create or replace function public.ad_corr_join(p_game bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare st text; g public.ad_corr_games%rowtype;
begin
  select * into g from ad_corr_games where id = p_game;
  if not found then raise exception 'no such game'; end if;
  if auth.uid() <> g.guest_uid then raise exception 'only the invited rival can accept'; end if;
  if g.status <> 'pending' then return g.status; end if;
  update ad_corr_games set status = 'active', turn = 'host', updated_at = now() where id = p_game;
  return 'active';
end $$;

create or replace function public.ad_corr_decline(p_game bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare g public.ad_corr_games%rowtype;
begin
  select * into g from ad_corr_games where id = p_game;
  if not found then raise exception 'no such game'; end if;
  if auth.uid() <> g.guest_uid then raise exception 'not your invitation'; end if;
  if g.status = 'pending' then update ad_corr_games set status = 'done', result = 'declined', updated_at = now() where id = p_game; end if;
  return 'done';
end $$;

-- Resign an active game: the opponent wins, no phantom move is written.
create or replace function public.ad_corr_resign(p_game bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare g public.ad_corr_games%rowtype; opp uuid;
begin
  select * into g from ad_corr_games where id = p_game;
  if not found then raise exception 'no such game'; end if;
  if auth.uid() not in (g.host_uid, g.guest_uid) then raise exception 'not your game'; end if;
  if g.status <> 'active' then return g.status; end if;
  opp := case when auth.uid() = g.host_uid then g.guest_uid else g.host_uid end;
  update ad_corr_games set status = 'done', result = 'resign', winner_uid = opp, updated_at = now() where id = p_game;
  return 'done';
end $$;

-- Post one move for the side to move. p_end: 'win' | 'draw' | null (still running).
create or replace function public.ad_corr_post(p_game bigint, p_move jsonb, p_end text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare g public.ad_corr_games%rowtype; side text; col text; nxt int;
begin
  if p_move is null then raise exception 'no move'; end if;
  select * into g from ad_corr_games where id = p_game;
  if not found then raise exception 'no such game'; end if;
  if g.status <> 'active' then raise exception 'game is not live'; end if;
  side := g.turn;
  if auth.uid() <> (case side when 'host' then g.host_uid else g.guest_uid end) then
    raise exception 'not your move';
  end if;
  col := case side when 'host' then 'red' else 'black' end;
  nxt := g.last_seq + 1;
  insert into ad_corr_moves(game_id, seq, mover_uid, color, move)
    values (p_game, nxt, auth.uid(), col, p_move);
  if p_end in ('win','draw','loss') then
    update ad_corr_games
      set last_seq = nxt, last_move_at = now(), updated_at = now(), status = 'done', result = p_end,
          winner_uid = case
            when p_end = 'win'  then (case side when 'host' then g.host_uid  else g.guest_uid end)
            when p_end = 'loss' then (case side when 'host' then g.guest_uid else g.host_uid  end)
            else null end
      where id = p_game;
    return 'done';
  end if;
  update ad_corr_games
    set last_seq = nxt, last_move_at = now(), updated_at = now(),
        turn = case side when 'host' then 'guest' else 'host' end
    where id = p_game;
  return 'active';
end $$;

-- My correspondence inbox: everything I host or play, freshest first, with the
-- fields the client needs to render a card and know if it is my move.
create or replace function public.ad_corr_list()
returns table(id bigint, opp_name text, me_side text, status text, turn text,
              my_turn boolean, last_seq int, theme text, last_move_at timestamptz)
language sql security definer set search_path = public
as $$
  select g.id,
         case when g.host_uid = auth.uid() then g.guest_name else g.host_name end as opp_name,
         case when g.host_uid = auth.uid() then 'host' else 'guest' end as me_side,
         g.status, g.turn,
         (g.status = 'active' and ((g.turn = 'host' and g.host_uid = auth.uid())
                                or (g.turn = 'guest' and g.guest_uid = auth.uid()))) as my_turn,
         g.last_seq, g.theme, g.last_move_at
    from ad_corr_games g
   where auth.uid() in (g.host_uid, g.guest_uid)
   order by g.updated_at desc;
$$;

-- Full state for one game, including the ordered move log to replay from scratch.
create or replace function public.ad_corr_game(p_game bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare g public.ad_corr_games%rowtype; out jsonb;
begin
  select * into g from ad_corr_games where id = p_game;
  if not found or auth.uid() not in (g.host_uid, g.guest_uid) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'id', g.id, 'status', g.status, 'turn', g.turn, 'theme', g.theme, 'result', g.result,
    'winner_uid', g.winner_uid, 'host_uid', g.host_uid, 'guest_uid', g.guest_uid,
    'host_name', g.host_name, 'guest_name', g.guest_name, 'last_seq', g.last_seq,
    'me_side', case when g.host_uid = auth.uid() then 'host' else 'guest' end,
    'my_turn', (g.status = 'active' and ((g.turn = 'host' and g.host_uid = auth.uid())
                                      or (g.turn = 'guest' and g.guest_uid = auth.uid()))),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('seq',m.seq,'color',m.color,'move',m.move) order by m.seq)
                       from ad_corr_moves m where m.game_id = g.id), '[]'::jsonb)
  ) into out;
  return out;
end $$;

grant execute on function public.ad_corr_create(uuid,text)             to authenticated;
grant execute on function public.ad_corr_join(bigint)                  to authenticated;
grant execute on function public.ad_corr_decline(bigint)               to authenticated;
grant execute on function public.ad_corr_resign(bigint)                to authenticated;
grant execute on function public.ad_corr_post(bigint,jsonb,text)       to authenticated;
grant execute on function public.ad_corr_list()                        to authenticated;
grant execute on function public.ad_corr_game(bigint)                  to authenticated;
-- Aether Draughts — rivals / follow graph
-- A light social graph so players can track rivals and friends, see them surface in
-- their inbox, and one-tap a correspondence challenge. The graph is read only by the
-- two people a connection involves; writes go through definer RPCs so no one can
-- follow themselves or forge someone else's list.

create table if not exists public.ad_follows(
  follower_uid uuid not null references auth.users(id) on delete cascade,
  followee_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_uid, followee_uid),
  check (follower_uid <> followee_uid)
);
alter table public.ad_follows enable row level security;
drop policy if exists ad_follows_sel on public.ad_follows;
create policy ad_follows_sel on public.ad_follows for select
  using (auth.uid() = follower_uid or auth.uid() = followee_uid);

create or replace function public.ad_follow(p_uid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_uid is null or p_uid = auth.uid() then raise exception 'cannot follow yourself'; end if;
  if not exists (select 1 from ad_profiles where uid = p_uid) then raise exception 'that player does not exist'; end if;
  insert into ad_follows(follower_uid, followee_uid) values (auth.uid(), p_uid) on conflict do nothing;
end $$;

create or replace function public.ad_unfollow(p_uid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from ad_follows where follower_uid = auth.uid() and followee_uid = p_uid;
end $$;

create or replace function public.ad_is_following(p_uid uuid)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (select 1 from ad_follows where follower_uid = auth.uid() and followee_uid = p_uid);
$$;

-- Everyone connected to me (I follow them, or they follow me) with both directions flagged.
create or replace function public.ad_rivals()
returns table(uid uuid, handle text, elo int, wins int, losses int,
              i_follow boolean, follows_me boolean, mutual boolean)
language sql security definer set search_path = public
as $$
  select p.uid, p.handle, p.elo, p.wins, p.losses,
    (select count(*) from ad_follows f where f.follower_uid = auth.uid() and f.followee_uid = p.uid) > 0 as i_follow,
    (select count(*) from ad_follows f where f.follower_uid = p.uid and f.followee_uid = auth.uid()) > 0 as follows_me,
    (select count(*) from ad_follows f where f.follower_uid = auth.uid() and f.followee_uid = p.uid) > 0
      and (select count(*) from ad_follows f where f.follower_uid = p.uid and f.followee_uid = auth.uid()) > 0 as mutual
    from ad_profiles p
   where p.uid <> auth.uid()
     and ( exists (select 1 from ad_follows f where f.follower_uid = auth.uid() and f.followee_uid = p.uid)
        or exists (select 1 from ad_follows f where f.follower_uid = p.uid      and f.followee_uid = auth.uid()) )
   order by p.elo desc;
$$;

grant execute on function public.ad_follow(uuid)        to authenticated;
grant execute on function public.ad_unfollow(uuid)      to authenticated;
grant execute on function public.ad_is_following(uuid)  to authenticated;
grant execute on function public.ad_rivals()            to authenticated;
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
-- Aether Draughts — web push subscriptions + reminder feed
-- Stores browser push subscriptions (linked to the signed-in uid) and exposes a
-- "who should be nudged right now" query for a trusted server sender (an Edge
-- Function running as service_role, holding the VAPID private key — which is NOT
-- stored here and must never be). Clients can only manage their own subscriptions.

create table if not exists public.ad_push_subs(
  id bigint generated always as identity primary key,
  uid uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_push_subs enable row level security;
drop policy if exists ad_push_subs_sel on public.ad_push_subs;
create policy ad_push_subs_sel on public.ad_push_subs for select using (auth.uid() = uid);
create index if not exists ad_push_subs_uid_idx on public.ad_push_subs(uid);

create or replace function public.ad_push_register(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or p_endpoint = '' or p_p256dh is null or p_p256dh = '' or p_auth is null or p_auth = '' then
    raise exception 'incomplete subscription';
  end if;
  insert into ad_push_subs(uid, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
    on conflict (endpoint) do update
      set uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, updated_at = now();
end $$;

create or replace function public.ad_push_unregister(p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from ad_push_subs where endpoint = p_endpoint and uid = auth.uid();
end $$;

-- Consumed only by the trusted sender (service_role): active duels it is the
-- subscriber's turn in (idle past p_minutes), plus pending challenges to them.
create or replace function public.ad_push_due(p_minutes int default 60)
returns table(uid uuid, endpoint text, p256dh text, auth text, kind text, game_id bigint, title text, body text)
language sql security definer set search_path = public
as $$
  select s.uid, s.endpoint, s.p256dh, s.auth, 'your_move'::text, g.id,
    'Your move, duelist'::text,
    (case when g.turn = 'host' then g.guest_name else g.host_name end) || ' is waiting on your reply.'::text
    from ad_corr_games g
    join ad_push_subs s on s.uid = (case when g.turn = 'host' then g.host_uid else g.guest_uid end)
   where g.status = 'active'
     and coalesce(g.last_move_at, g.created_at) < now() - make_interval(mins => greatest(p_minutes, 0))
  union all
  select s.uid, s.endpoint, s.p256dh, s.auth, 'new_challenge'::text, g.id,
    'A rival challenges you'::text,
    g.host_name || ' invited you to a correspondence duel.'::text
    from ad_corr_games g
    join ad_push_subs s on s.uid = g.guest_uid
   where g.status = 'pending';
$$;

grant execute on function public.ad_push_register(text,text,text,text) to authenticated;
grant execute on function public.ad_push_unregister(text)              to authenticated;
grant execute on function public.ad_push_due(int)                      to service_role;
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
-- Aether Draughts — live spectator presence for watch links.
-- A spectator (or a duel player observing) heartbeats into a short-lived roster keyed by
-- the spectator pass code. Other clients poll the roster and render each watcher as a 3D
-- avatar with a floating handle tag. Rows self-expire (seen_at), so no cleanup job needed.

create table if not exists public.ad_watch_watchers(
  code text not null,
  sid text not null,
  name text,
  look jsonb,
  seen_at timestamptz not null default now(),
  primary key(code, sid)
);
alter table public.ad_watch_watchers enable row level security;
-- no select/insert policies: only the definer functions below touch this table.

create or replace function public.ad_watch_heartbeat(p_code text, p_sid text, p_name text, p_look jsonb)
returns void
language sql security definer set search_path = public
as $$
  insert into ad_watch_watchers(code, sid, name, look, seen_at)
    values (left(p_code, 24), left(p_sid, 40), left(p_name, 24), coalesce(p_look, '{}'::jsonb), now())
  on conflict (code, sid) do update
    set name = excluded.name, look = excluded.look, seen_at = now();
$$;

create or replace function public.ad_watch_roster(p_code text, p_sid text default null)
returns table(sid text, name text, look jsonb, me boolean)
language sql security definer set search_path = public
as $$
  select w.sid, w.name, w.look, (p_sid is not null and w.sid = p_sid) as me
    from ad_watch_watchers w
   where w.code = p_code and w.seen_at > now() - interval '75 seconds'
   order by w.seen_at;
$$;

create or replace function public.ad_watch_leave(p_code text, p_sid text)
returns void
language sql security definer set search_path = public
as $$
  delete from ad_watch_watchers where code = p_code and sid = p_sid;
  delete from ad_watch_watchers where seen_at < now() - interval '5 minutes';
$$;

grant execute on function public.ad_watch_heartbeat(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.ad_watch_roster(text,text)              to anon, authenticated;
grant execute on function public.ad_watch_leave(text,text)               to anon, authenticated;
-- Aether Draughts — open rooms: public lounges where anyone can take a seat or watch.
-- Rows live in ad_invites with kind='room'. guest_name records who took the second
-- seat (works for anonymous guests); updated_at powers staleness filtering so an
-- abandoned room drops out of the public listing without any cleanup job —
-- the seated clients heartbeat it while the room is alive.

alter table public.ad_invites add column if not exists guest_name text;
alter table public.ad_invites add column if not exists updated_at timestamptz not null default now();

create index if not exists ad_inv_room_browse on public.ad_invites(kind, status, updated_at desc);
