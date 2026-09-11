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
