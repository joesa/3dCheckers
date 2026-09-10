#!/usr/bin/env bash
# Keep the raw Supabase database off the LAN.
#
# `supabase start` publishes every port on 0.0.0.0 and ignores
# [db.network_restrictions] — that block only applies to hosted projects.
# Docker uses its userland proxy here, so LAN clients reach these ports as
# ordinary INPUT traffic that never traversed the loopback interface. Dropping
# exactly that keeps psql/Studio on 127.0.0.1 working and refuses the LAN.
#
#   sudo scripts/lock-local-ports.sh      # apply
#   sudo scripts/lock-local-ports.sh --off # remove
#
# Re-apply after every `supabase start`; the rules live in the kernel, not the repo.

set -euo pipefail

# postgres, shadow database, analytics (unauthenticated).
# Add 54321 (API) / 54323 (Studio) / 54324 (Mailpit) to lock those too.
LOCK_PORTS=(54322 54320 54327)

if [[ "${EUID}" -ne 0 ]]; then
  echo "needs root: sudo $0 ${1:-}" >&2
  exit 1
fi

IFS=','
PORTS="${LOCK_PORTS[*]}"
unset IFS

if [[ "${1:-}" == "--off" ]]; then
  nft delete table inet ad_local_lock 2>/dev/null || true
  echo "LAN lock removed."
  exit 0
fi

nft -f - <<EOF
table inet ad_local_lock
delete table inet ad_local_lock
table inet ad_local_lock {
  chain lock_input {
    type filter hook input priority filter; policy accept;
    iifname "lo"            tcp dport { $PORTS } accept
    iifname != "lo"         tcp dport { $PORTS } drop
  }
}
EOF

echo "Locked TCP $PORTS to loopback."
echo "Check from another machine: psql postgresql://postgres:postgres@<this-host>:54322/postgres  -> should hang/refuse"
echo "Check here:                 PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -c select 1"
