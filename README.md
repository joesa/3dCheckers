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

### Optional hardening for a wide release

- **Vendor dependencies:** download `three.module.js` + `OrbitControls.js` into `vendor/` and edit the import map in `index.html`, and self-host the two Google Fonts — removes CDN/font outages and enables offline play.
- **NAT traversal:** the game uses Google's public STUN. A tiny minority of peers behind strict symmetric NATs will fail to connect; adding a free/TURN relay (e.g. `metered`, `OpenRelay`, or your own `coturn`) to the `iceServers` list in `js/net.js` fixes that.
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
