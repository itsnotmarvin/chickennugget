# Angle Protocol

A fast, low-poly, browser-based first-person arena shooter. One excellent map, one core mode, real progression — no build step, no external assets, everything procedural.

## Run it

```bash
python3 -m http.server 8642
# then open http://localhost:8642
```

Any static file server works (ES modules require http://, not file://). Three.js is vendored in `js/vendor/`, so no network access is needed at runtime.

## What's included

- **True 3D match core** — Three.js first-person renderer with the *Foundry* arena: a dusk-lit casting hall with a two-door mid room, crate-choked flanks, jump-up low cover, signs, hanging lights, team-colored bays, and fog.
- **Bot Strike (core mode)** — you plus a bot ally versus two hostiles. 90-second rounds, first team to 4 round wins. Round freeze countdowns, win/loss banners, timer-expiry HP tiebreak, spectate cam when you're down, full post-match scoreboard.
- **Training Range** — free-fire warm-up against static and moving target frames with live accuracy tracking.
- **Movement & gunplay** — WASD + mouse look (pointer lock), sprint, jump (crates are jump-up angles), air control, recoil/kick, moving-spread, tracers, muzzle flash, impact sparks, hitmarkers (head/kill variants), reload animation.
- **Three primaries + sidearm** — Pike-57 (auto rifle), Wasp K9 (fast SMG, +move speed), Longshot DX (semi DMR, one-tap heads), Backstop sidearm (always equipped, skinnable).
- **Utility** — Splinter Charge (frag, LOS-checked falloff damage) and Dazzler (flash; blinds you, your ally, and bots — bots visibly stagger).
- **Four agents with real abilities (Q)** — Aegis (deployable hard-light barrier that blocks shots, bodies, and bot pathing), Vanta (instant reload + speed surge), Kestrel (sonar pulse that paints enemies on the radar), Morrow (decaying 50-point overshield).
- **Bots that behave** — grid A* pathfinding, patrol/ally-follow, engage with strafing and burst cadence, reaction delays, hunt last-seen positions, retreat to cover when low, reload, flee grenades, get flashed. Easy / Normal / Sharp visibly change reaction, accuracy, aggression, and speed.
- **Progression that persists** — XP with levels and ranks, three contracts driven by real match data (round wins / damage / utility hits), unlockable sidearm skins, crosshair colors, and titles. Callsign, agent, loadout, skin, settings, stats, and match history all persist in `localStorage`.
- **Full loop** — loading screen → client (Home / Play / Squad / Loadout / Contracts / Profile / Collection / Settings) → match → round results → match results → XP/rewards/unlock debrief → Play Again / Change Loadout / Return to Client.
- **Pause menu** — Esc: resume, restart match, quick volume/sensitivity/mute, exit to client.
- **Audio** — fully synthesized WebAudio: per-weapon shots, reloads, hits, headshots, kills, footsteps, grenades, abilities, round/match stingers, UI ticks, ambient hum. Master volume + mute in Settings and pause.
- **HUD** — health/shield bars, ammo + reserve, utility counts, ability cooldown chip, round timer, score pips, kill feed, rotating radar with spotted-enemy blips, damage direction indicator, flash whiteout, low-HP vignette, custom crosshair (size + unlockable colors).
- **Settings** — volume, mute, sensitivity, crosshair size/color, bot difficulty, visual quality (Fast/High: pixel ratio + shadows), fullscreen, reset progress.
- **Onboarding** — first-run protocol brief with controls and a one-click jump into the Training Range.

## Controls

| Action | Key |
| --- | --- |
| Move | W A S D |
| Aim / Shoot | Mouse / Left click |
| Sprint | Shift |
| Jump | Space |
| Reload | R |
| Primary / Sidearm | 1 / 2 |
| Splinter (frag) | 3 |
| Dazzler (flash) | 4 |
| Agent ability | Q |
| Pause | Esc |

## Project layout

```
index.html        client shell, HUD, overlays
styles.css        client + HUD styling
js/main.js        entry point
js/client.js      screens, results/rewards flow, settings, onboarding
js/engine.js      3D match engine (map, player, weapons, bots, abilities, HUD)
js/data.js        weapons, agents, skins, contracts, ranks, map grid
js/state.js       localStorage profile + progression
js/audio.js       procedural WebAudio sound
js/vendor/        three.js r160 (vendored)
```

## Known limitations

- Single arena (Foundry) and single competitive mode by design — depth over breadth for v1.
- Bots don't use agent abilities or jump; they fight on the ground plane.
- No split-screen/local multiplayer (the old 2D raycaster mode was retired with the 3D rewrite).
- Grid-based collision: props snap to 2m cells; bullets treat pillar cells as full cells.
