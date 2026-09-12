-- Aether Draughts — open rooms: public lounges where anyone can take a seat or watch.
-- Rows live in ad_invites with kind='room'. guest_name records who took the second
-- seat (works for anonymous guests); updated_at powers staleness filtering so an
-- abandoned room drops out of the public listing without any cleanup job —
-- the seated clients heartbeat it while the room is alive.

alter table public.ad_invites add column if not exists guest_name text;
alter table public.ad_invites add column if not exists updated_at timestamptz not null default now();

create index if not exists ad_inv_room_browse on public.ad_invites(kind, status, updated_at desc);
