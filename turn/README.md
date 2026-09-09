# Coturn TURN Server Setup

This directory contains the TURN server configuration and systemd unit for Aether Draughts.

## Installation

1. Install coturn:
   ```bash
   sudo apt-get install -y coturn
   ```

2. Copy the config:
   ```bash
   sudo cp turn/coturn.conf /etc/turnserver.conf
   ```

3. Copy the systemd unit:
   ```bash
   sudo cp turn/turnserver.service /etc/systemd/system/turnserver.service
   ```

4. Reload systemd and enable:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable turnserver.service
   sudo systemctl start turnserver.service
   ```

5. Verify it's running:
   ```bash
   systemctl status turnserver
   ss -lnup | grep 3478
   ```

## Troubleshooting

- **Port 3478 already in use:** Stop any existing coturn containers (`docker stop checkers-coturn` or `docker rm checkers-coturn`)
- **Check logs:** `journalctl -u turnserver -f`
- **Manual start (without systemd):** `/usr/bin/turnserver -c /etc/turnserver.conf --pidfile= -o`

## Configuration

Edit `/etc/turnserver.conf` to change:
- `realm` - the TURN realm
- `user` - username:password credentials (sync with `js/net.js` TURN_CFG)
- `min-port`/`max-port` - port range for relay connections (forward on router if needed)

For WAN play, uncomment `external-ip` with your public IP address and forward ports 3478 (tcp+udp) and 49160-49180 (udp) on your router.
