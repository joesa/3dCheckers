#!/usr/bin/env bash
# Deploy the TURN config + systemd unit from this repo to the system.
#
#   sudo turn/deploy.sh
#
# The live config is /etc/turnserver.conf, NOT the copy in this repo: the repo
# lives on /run/media/joe/Data1, which is mounted by udisks2 at desktop login
# and therefore does not exist during boot. A unit pointing at the repo can
# never start at boot.
set -euo pipefail

SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONF_SRC="$SRC_DIR/coturn.conf"
UNIT_SRC="$SRC_DIR/turnserver.service"
CONF_DST=/etc/turnserver.conf
UNIT_DST=/etc/systemd/system/turnserver.service

if [[ $EUID -ne 0 ]]; then
  echo "error: must run as root (use: sudo turn/deploy.sh)" >&2
  exit 1
fi

for f in "$CONF_SRC" "$UNIT_SRC"; do
  [[ -r $f ]] || { echo "error: cannot read $f" >&2; exit 1; }
done

# --- config -----------------------------------------------------------------
if [[ -e $CONF_DST ]]; then
  if cmp -s "$CONF_DST" "$CONF_SRC"; then
    echo "config: already up to date"
  else
    bak="$CONF_DST.bak-$(date +%Y%m%d-%H%M%S)"
    cp -a "$CONF_DST" "$bak"
    echo "config: backed up existing -> $bak"
  fi
fi
owner=root:root
getent group turnserver >/dev/null && owner=root:turnserver
install -m 640 -o "${owner%:*}" -g "${owner#*:}" "$CONF_SRC" "$CONF_DST"
echo "config: installed $CONF_DST ($owner, mode 640)"

# --- unit -------------------------------------------------------------------
install -m 644 -o root -g root "$UNIT_SRC" "$UNIT_DST"
echo "unit:   installed $UNIT_DST"

systemctl daemon-reload
systemctl enable turnserver.service >/dev/null
systemctl restart turnserver.service

# --- verify -----------------------------------------------------------------
echo
echo "--- verification ---"
systemd-analyze verify "$UNIT_DST" 2>&1 | grep -i 'failed to parse' && {
  echo "FAIL: unit has parse errors"; exit 1
}
echo "unit syntax     : ok"

leaked=$(systemctl show turnserver.service \
  -p ExecStart -p RequiresMountsFor -p ReadWritePaths | grep -c /run/media || true)
if [[ $leaked -ne 0 ]]; then
  echo "FAIL: unit still references /run/media (will not start at boot)"; exit 1
fi
echo "drive refs      : none"

echo "active          : $(systemctl is-active turnserver.service)"
echo "enabled         : $(systemctl is-enabled turnserver.service)"

udp=$(ss -lnu | grep -c '0.0.0.0:3478' || true)
tcp=$(ss -lnt | grep -c '0.0.0.0:3478' || true)
echo "listening       : udp=$udp tcp=$tcp"
[[ $udp -gt 0 && $tcp -gt 0 ]] || { echo "FAIL: not listening on both transports"; exit 1; }

echo
echo "Done. TURN will now start at boot without a login."
echo "Conclusive check: reboot, then compare 'uptime -s' with"
echo "  systemctl show turnserver -p ExecMainStartTimestamp"
