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
