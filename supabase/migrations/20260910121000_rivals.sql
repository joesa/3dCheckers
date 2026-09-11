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
