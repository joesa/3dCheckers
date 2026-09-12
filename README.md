# Aether Draughts

Multiplayer 3D checkers (English draughts) on a floating sky-island. Pure HTML/CSS/JS + [three.js](https://threejs.org). No build step. Plays fully offline/backend-free; an optional Supabase backend unlocks accounts, the ELO ladder, invite links, and spectating.

**Modes:** Pass & Play · Play vs Storm (solo AI — four *personalities*: Squire Bran, Knight Errant Vessa, Warlock Mordaunt, Storm Monarch Kaal) · Online Duel (serverless WebRTC — copy-paste codes **or** one-click duel links with the backend) · Open Rooms (public lounges — sit at any table, no invite, or watch) · Same-Browser Tabs · Daily Puzzle · Daily Gauntlet (5 escalating rounds with rule-bending modifiers) · Replay viewer (shareable duel codes) · Spectator passes (live watch + emoji reactions).

**Systems:** clocks (blitz/rapid/bullet with increments & flag-fall), cosmetics marketplace (piece finishes, thrones, victory dances, locked realm worlds), coin economy with a sandbox checkout (`PROVIDER` seam in `js/economy.js` — drop Stripe in there), Season battle pass (XP + free/premium tracks), coin **wagers** on online duels, emotes (keys 1–5, mirrored to the peer + crowd), and every player views the duel inside their own chosen world.

## Run locally

Any static file server works (WebRTC and BroadcastChannel need `http://localhost` or `https://`). `npx vite` does **not** — `three` is a bare import resolved by the importmap in `index.html`, which Vite ignores:

```bash
python3 -m http.server 8000                    # then open http://localhost:8000
python3 -m http.server 8000 --bind 0.0.0.0     # also reachable as http://<lan-ip>:8000
```

`supabase start` publishes every port on `0.0.0.0` and ignores `[db.network_restrictions]` (hosted-only), which leaves the raw database exposed as `postgres/postgres` to your LAN. Lock it to loopback after each start:

```bash
sudo scripts/lock-local-ports.sh       # sudo scripts/lock-local-ports.sh --off
```

## Optional backend (Supabase): accounts, ladder, links, spectating

The game runs 100% without it — these features just hide themselves. With it you get: email-less handle+password accounts, an ELO ladder (K=32, atomic SQL RPC with replay-guarded match reporting), **duel links** (`?duel=CODE` — replaces the copy-paste SDP dance), **open rooms** (public lounges under `kind='room'` in `ad_invites` — anyone, guests included, can take a free seat and duel or drop in to watch — no invite needed; guests get a one-time random handle and are offered an account at game over), **spectator passes** (`?watch=CODE` — live board + emoji reactions), all with graceful degradation.

1. Apply the migrations (tables `ad_profiles/ad_wallet/ad_equip/ad_matches/ad_invites/ad_moves/ad_reactions` + `ad_report_match` + the `ad_provision_user` trigger). `supabase/migrations/` is the source of truth; `supabase/schema.sql` is a generated concatenation of it, kept only for piping into a plain Postgres:

   ```bash
   npx supabase start                  # boots the local stack
   npx supabase db push --local        # apply pending migrations locally
   npx supabase db reset               # drop everything and replay from scratch

   # hosted project: link once, then push
   npx supabase link --project-ref YOUR-REF
   npx supabase db push --linked
   ```

   Plain `npx supabase db push` (no flag) targets the *remote* project and fails with "Cannot find project ref" when nothing is linked — that is the flag people miss.

2. Point the client at your project with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON` (the anon key is public; RLS protects the data). With no env set, `SRV_URL` auto-resolves to `http://<hostname>:54321` for loopback and private hosts (`127.0.0.1`, `localhost`, `10.x`, `192.168.x`, `172.16–31.x`, `*.local`), so serving the game to a phone over your LAN reaches the same stack. Public hosts still stay offline rather than calling a dead `:54321`. The auth panel states the resolved reason when the backend is unreachable.

3. Sign up in-game (**Sign In → Create**). Handles map to synthetic emails (`handle@aether.local`); with local Supabase mail autoconfirmation is on. The `ad_provision_user` trigger creates the profile, wallet and loadout rows atomically with the auth user.

### What persists where

| | Server (`auth.uid()`-scoped, RLS) | localStorage |
|---|---|---|
| handle, ELO, W/L | `ad_profiles` | cache |
| coins, owned items, premium, battle-pass XP & claims | `ad_wallet` | `ad-wallet:<uid>` |
| equipped skin / throne / board / clock / triumph | `ad_equip` | `ad-equip:<uid>` |
| duel links, open rooms, spectate streams | `ad_invites` (incl. `kind='room'`), `ad_moves`, `ad_reactions` | — |
| match history (seeded replay guard) | `ad_matches` | — |
| chosen world/realm, light-vs-dark UI mode, last time control | — | `ad-theme`, `ad-theme-mode`, `ad-clock` |

Signing in hydrates both rows and every write is mirrored back through a 1.2 s debounce, flushed on `pagehide`/`visibilitychange`. Signing out drops the cache back to an isolated guest bucket, so two accounts on one browser can no longer see each other's coins. Progress made while signed out lives in the unscoped `ad-wallet` and is adopted once by the next account created there.

Still client-trusted and needing an edge function before a public release: wager escrow, and the wallet write path itself (a player can edit their own `ad_wallet` row via REST today).

## Publish to the public

The site is 100% static — `index.html`, `css/`, `js/`, plus `three` loaded from the unpkg CDN. Any HTTPS static host will do; **HTTPS is required** for the online (WebRTC) mode.

| Host | How |
|---|---|
| **Cloudflare Pages / Netlify / Vercel** | Connect the repo or drag-and-drop the folder; auto-HTTPS. |
| **GitHub Pages** | Push the folder, enable Pages on the `main` branch. |
| **itch.io** | Zip the folder, upload as an HTML game, set "played in browser". Great for indie distribution. |

Then share the URL. Each duo connects by exchanging an invite code over any chat app — there is no game server to run or pay for.

The deploy is plain static files, so `VITE_*` env vars are only baked in if a bundler runs. To point a static host at a hosted Supabase without adding a build step, drop this above the module script in `index.html`:

```html
<script>window.__AD_CONFIG__={SRV_URL:'https://YOUR-PROJECT.supabase.co',SRV_ANON:'your-anon-key'};</script>
```

Without it (or `VITE_SUPABASE_URL`), a non-localhost deploy simply runs on offline local accounts — sign-up/sign-in still work, per browser.

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
- **Want to earn free points? Beat QuantKing.** The gold button on the menu: a one-on-one duel against the king of checkers himself — a near-perfect engine (deep search, zero mercy) with a pride problem: the further ahead he gets, the more likely he is to fling his crown around. Points for every piece you draw from him, for surviving 12 and 25 moves, +500 for the win (+250 first fall of the day), a free armor unlock the first time you slay him — and after 4 losses he *guarantees* one sloppy duel. The Titan also hands you 5 coins when you lose, because he is generous like that.
- **19 worlds**, including four new floats: Ring of Shards (drifting rock archipelago), Twinveil Falls (a sister isle and light-bridge), The World Tree and Eye of the Maelstrom (premium realms with their own sky, weather and ambient FX).
- Drag to orbit, scroll to zoom.
- Men move diagonally forward; jumps capture and are **forced**, chains must be completed; reach the far rank to crown a King (moves in all diagonals; crowning mid-chain ends the turn).
- Win by capturing everything or blocking all legal moves. Online duels run a 45 s turn timer (or a chess clock if you pick one); the Daily Gauntlet's *Blazing* round gives you 15 s.
- Emotes: keys **1–5** (or the HUD bar) — your avatar acts, the crowd cheers, and online opponents see it too.
- **Timepieces:** every world carries its own clock on a corner table. **Click the clock itself** (or press **C**, or the ⏱ button) to lift it into a full-3D inspection — free rotate on all axes, zoom, see the movement from the back; tap the bells of *The Skeleton Bell* to ring them. Choose any clock in **Marketplace → Clocks**; "World Default" gives each of the 19 realms its own style (duskhold's bespoke brass skeleton-bell with live gear train, sweeping hands, alarm hand and toggleable digital display, lantern-vale's flip clock, voidgarden's holographic orrery…).
- **Board sets:** Marketplace → Boards — swap the arena surface: default stone, Noir & Gold, Carrara Marble, or the premium **Mirrorglass Table** (real transmissive glass tiles with chrome frame; pairs with the Prism Glass piece skin).
- Full rules are in-game under **How to Play**.

## Layout

```
index.html      UI: menu, HUD, chat, shop/ladder/auth overlays, import map
css/style.css   theme + HUD styling
js/game.js      rules engine (pure, testable)
js/world.js     three.js scene: island, board, FX, picking, skins, victory dances
js/actors.js    avatars (hand rigs, emotes, 6 looks) + reactive seeded crowd
js/pieces.js    piece/crown meshes + cosmetic skin materials
js/net.js       transports: BroadcastChannel + WebRTC (codes, duel links)
js/ai.js        Storm AI: negamax, 5 levels (incl. QuantKing's titan) + personalities/taunts
js/clock.js     time controls (blitz/rapid/bullet) with increments + flag-fall
js/clocks.js    8 procedural clock styles (incl. the Skeleton Bell alarm) + per-world assignment
js/puzzles.js   daily capture-chain puzzles (engine-verified, unique solution)
js/gauntlet.js  daily 5-round gauntlet: blazing / attrition / king's-rush modifiers
js/replay.js    deterministic replay codes + viewer
js/economy.js   coins, purchases, sandbox checkout seam, battle pass, wagers
js/scope.js     which account owns the local asset cache + where to mirror it
js/cosmetics.js skin catalog, unlocks, loadout (persisted per account)
js/themes.js    19 world themes; locked realm packs sold in the marketplace
js/auth.js      Supabase-or-local facade; binds asset scope, mirrors wallet/loadout
js/localauth.js offline fallback accounts (per-handle localStorage)
js/srv.js       Supabase: auth, ladder, invites, spectate streams (optional)
js/main.js      game controller, lobbies, clocks, chat, spectating, UI
js/audio.js     WebAudio synth SFX · js/tween.js animation
scripts/lock-local-ports.sh  nft rules keeping the local DB off the LAN
supabase/schema.sql  accounts + wallet/loadout + ELO RPC + invite/spectate tables + RLS
```
