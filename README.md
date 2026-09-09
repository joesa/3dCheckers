# Aether Draughts

Multiplayer 3D checkers (English draughts) on a floating sky-island. Pure HTML/CSS/JS + [three.js](https://threejs.org). No build step, no backend, no accounts.

**Modes:** Pass & Play · Play vs Storm (solo AI — four levels: Squire, Knight, Warlock, Storm Monarch) · Online Duel (serverless WebRTC with copy-paste invite codes) · Same-Browser Tabs.

## Run locally

Any static file server works (WebRTC and BroadcastChannel need `http://localhost` or `https://`):

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## Publish to the public

The site is 100% static — `index.html`, `css/`, `js/`, plus `three` loaded from the unpkg CDN. Any HTTPS static host will do; **HTTPS is required** for the online (WebRTC) mode.

| Host | How |
|---|---|
| **Cloudflare Pages / Netlify / Vercel** | Connect the repo or drag-and-drop the folder; auto-HTTPS. |
| **GitHub Pages** | Push the folder, enable Pages on the `main` branch. |
| **itch.io** | Zip the folder, upload as an HTML game, set "played in browser". Great for indie distribution. |

Then share the URL. Each duo connects by exchanging an invite code over any chat app — there is no game server to run or pay for.

### TURN relay (coturn) for strict/symmetric NATs

Public STUN alone fails when either player sits behind a symmetric NAT (many ISPs, CGNAT, corporate Wi-Fi). Public free TURN relays are unreliable, so run your own coturn:

```bash
sudo apt-get install -y coturn
sudo cp turn/coturn.conf /etc/turnserver.conf
sudo turnserver -c /etc/turnserver.conf -o      # -o = daemonize
ss -lnup | grep 3478                             # confirm it's listening
```

The game reads TURN from `TURN_CFG` at the top of `js/net.js` (host, port, username, credential — keep them in sync with `/etc/turnserver.conf`'s `user=` line).

- **Same-LAN players:** the default LAN address (`172.16.0.107`) works as-is once coturn is running.
- **WAN players:** port-forward **3478 tcp+udp** and **udp 49160–49180** to the coturn box, uncomment `external-ip=<public>/<private>` in the config, restart, and set `TURN_CFG.host` to the public address.
- Verify from a browser console — a `typ relay` candidate should appear:

```js
const pc=new RTCPeerConnection({iceServers:[{urls:'turn:172.16.0.107:3478',username:'aether',credential:'devturnpass123'}]});
pc.createDataChannel('t');
pc.onicecandidate=e=>e.candidate&&console.log(e.candidate.candidate);
pc.createOffer().then(o=>pc.setLocalDescription(o));
```

- For production: change the `devturnpass123` credential, and enable TLS (`cert=`, `pkey=`, `tls-listening-port=5349`) if players' networks block plain TURN.

### Optional hardening for a wide release

- **Vendor dependencies:** download `three.module.js` + `OrbitControls.js` into `vendor/` and edit the import map in `index.html`, and self-host the two Google Fonts — removes CDN/font outages and enables offline play.
- **Analytics/abuse:** static hosts provide traffic stats; there is no user data (chat is peer-to-peer only, nothing is stored).

## How to play

- Click a piece → glowing tiles show legal moves (green = move, red = capture) → click one.
- Drag to orbit, scroll to zoom.
- Men move diagonally forward; jumps capture and are **forced**, chains must be completed; reach the far rank to crown a King (moves in all diagonals; crowning mid-chain ends the turn).
- Win by capturing everything or blocking all legal moves. Online duels have a 45 s turn timer.
- Full rules are in-game under **How to Play**.

## Layout

```
index.html      UI: menu, HUD, chat, overlays, import map
css/style.css   theme + HUD styling
js/game.js      rules engine (pure, testable)
js/world.js     three.js scene: island, board, FX, picking
js/actors.js    player avatars with hand rigs + reactive crowd
js/pieces.js    piece/crown meshes
js/net.js       transports: BroadcastChannel + WebRTC (manual SDP exchange)
js/ai.js        Storm AI: iterative-deepening negamax, time-budgeted, 4 levels
js/main.js      game controller, lobby, timer, chat
js/audio.js     WebAudio synth SFX · js/tween.js animation
```
