# Coturn TURN Server Setup

TURN config and systemd unit for Aether Draughts. WebRTC falls back to a TURN
relay when both peers sit behind symmetric NAT and STUN alone cannot connect.

## Where the live config lives

| File | Role |
| --- | --- |
| `turn/coturn.conf` | source of truth, tracked in git |
| `/etc/turnserver.conf` | the config coturn actually reads |
| `turn/turnserver.service` | source of truth for the unit |
| `/etc/systemd/system/turnserver.service` | the unit systemd actually loads |

**The unit must not read the config out of this repo.** The repo lives on
`/run/media/joe/Data1`, an NTFS partition that is not in `/etc/fstab` — udisks2
mounts it when the desktop session logs in, so during boot the path does not
exist. A unit pointing there cannot start at boot, and a `ReadWritePaths=` on
that path makes systemd fail the unit outright. Hence `/etc/turnserver.conf`.

## Install / update

```bash
sudo apt-get install -y coturn     # once
sudo turn/deploy.sh
```

`turn/deploy.sh` backs up any existing `/etc/turnserver.conf`, installs the
config (mode 640, `root:turnserver`) and the unit, runs `daemon-reload`,
enables and restarts the service, then verifies: unit syntax, that nothing
references `/run/media`, active/enabled state, and that both UDP and TCP 3478
are listening. It refuses to run without root.

Re-run it after **any** edit to `coturn.conf` or `turnserver.service` — editing
the repo copy alone changes nothing on the running system.

## Verify

```bash
systemctl is-active turnserver && systemctl is-enabled turnserver
ss -lnut | grep 3478              # expect one udp UNCONN and one tcp LISTEN
journalctl -u turnserver -f
```

Credentials, end to end — the second command **must** fail:

```bash
turnutils_uclient -u aether -w devturnpass123 -e 127.0.0.1 -n 1 -c 172.16.0.107
turnutils_uclient -u aether -w WRONGPASS      -e 127.0.0.1 -n 1 -c 172.16.0.107
```

A wrong password logs `ERROR: Cannot complete Allocation`. The 100% packet-loss
summary is normal — there is no echo peer running; only allocation matters here.

Boot startup has one conclusive test. After a reboot:

```bash
uptime -s
systemctl show turnserver -p ExecMainStartTimestamp
```

Those should be within seconds of each other. If the service start is hours
later, it was started by hand and boot startup is still broken.

## Configuration

Edit `turn/coturn.conf`, then re-run `sudo turn/deploy.sh`:

- `realm` — TURN realm (`aether.local`)
- `user` — `username:password`. **Must match** `VITE_TURN_USER` /
  `VITE_TURN_CRED`, which reach the browser as `CONFIG.TURN_USER` /
  `CONFIG.TURN_CRED` in [`js/config.js`](../js/config.js) and are assembled into
  `TURN_CFG` in [`js/net.js`](../js/net.js).
- `listening-port` — 3478, must match `VITE_TURN_PORT`
- `relay-ip` — this host's LAN address (`172.16.0.107`), must match
  `VITE_TURN_HOST`
- `min-port` / `max-port` — relay port window (49160-49180), forward on the
  router if needed

`js/net.js` offers the relay over both UDP and TCP (`turn:host:3478` and
`turn:host:3478?transport=tcp`), so coturn must listen on both — the default
config does.

## WAN play

Uncomment `external-ip` in `coturn.conf` with your public address and forward on
the router:

- 3478 **tcp and udp**
- 49160-49180 **udp**

Then re-run `sudo turn/deploy.sh`.

## Troubleshooting

- **Port 3478 already in use** — something else holds it. The distro also ships
  `coturn.service`, which binds the same port; keep it disabled (`systemctl
  status coturn`), and consider `sudo systemctl mask coturn.service` so a package
  upgrade cannot re-enable it. Also check for a container: `docker ps | grep -i turn`.
- **Unit changes seem ignored** — systemd warns the loaded unit is stale; run
  `sudo systemctl daemon-reload` (`deploy.sh` does this).
- **`Failed to parse ProtectProc=...`** — only `noaccess`, `invisible`,
  `ptraceable` and `default` are valid. `inaccessible` is not.
- **Service dead after reboot** — check nothing in the unit points at
  `/run/media`: `systemctl show turnserver -p ExecStart -p ReadWritePaths -p RequiresMountsFor | grep /run/media` should print nothing.
- **Manual start, bypassing systemd** —
  `sudo /usr/bin/turnserver -c /etc/turnserver.conf --pidfile= -o`
