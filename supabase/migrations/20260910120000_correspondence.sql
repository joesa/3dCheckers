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
