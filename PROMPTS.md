# Angle Protocol — Build Prompts

## Session Overview
Rebuilt Angle Protocol from a 2D raycaster into a finished 3D first-person shooter using Three.js, with full progression, bots, agents, and multiplayer infrastructure.

## Core Architecture Prompts

### 1. Game Engine & 3D Renderer
**Goal**: True 3D first-person arena shooter replacing 2D raycaster.
- Three.js r160 for WebGL rendering
- Foundry arena: mid room with two doors, crate flanks, jump-up angles, signs, team-colored bays
- Dusk-lit sky, directional sun, hemisphere + point lights for team colors
- First-person camera with mouse look, WASD movement, jump, sprint
- Grid-based collision (2m cells) for clean hitscan and bot pathfinding

### 2. Combat System
**Goal**: Fast, readable, responsive gunplay.
- 3 primary weapons (Pike-57 rifle, Wasp K9 SMG, Longshot DX DMR) + skinnable Backstop sidearm
- Hitscan bullets with spread, recoil, kick; visible tracers, muzzle flash, impact sparks
- Hitmarkers (head/kill variants), damage indicator arrows, flash whiteout overlay
- Splinter frag grenade (LOS falloff) and Dazzler flash (direction-based blindness)
- Ammo display, reload animation, dry-fire feedback

### 3. Bot AI & Pathfinding
**Goal**: Believable, skill-differentiated opponents.
- A* pathfinding on walkable cells (replan every 1.2s near targets)
- States: patrol, engage (strafe + burst), hunt (pursue last-seen), cover (retreat and wait)
- Reaction delays + aiming error (varies by difficulty)
- Grenade flee behavior, flash blindness + stagger, reload cycles
- 3 difficulties (Easy/Normal/Sharp) with visible speed/accuracy/aggression changes

### 4. Agent Abilities (Q key)
**Goal**: Tactical depth without power creep.
- Aegis: Bulwark Frame — deployable 3-cell barrier, blocks shots/bodies/bot paths (6s cooldown)
- Vanta: Redline Surge — instant reload + 40% speed boost (3.5s cooldown)
- Kestrel: Harrier Pulse — sonar sweep paints enemies on radar (6s cooldown)
- Morrow: Gravemark Ward — 50-point decaying overshield (8s cooldown)
- Server-authoritative ability state in multiplayer

### 5. Match Flow & Progression
**Goal**: Complete gameplay loop from boot to rewards to persistence.
- Loading screen → client (8 tabs: Home, Play, Squad, Loadout, Contracts, Profile, Collection, Settings)
- Bot Strike: 2v2 vs bots, 90s rounds, first to 4, spectate cam when down
- Training Range: free-fire with moving targets, accuracy tracking
- Round banners (freeze countdown, win/loss, stalemate), match results scoreboard, kill feed
- Results → Rewards screen with XP breakdown, level-up flash, new unlocks
- localStorage persistence of profile, stats, progression

### 6. Progression System
**Goal**: Meaningful long-term engagement hooks.
- XP from kills, headshots, damage, round wins, match outcomes, contract tiers
- 15 ranks (Ironline I → Apex Protocol) with per-rank XP thresholds
- 3 contracts (Entry, Anchor, Utility) tied to real match data (round wins / damage / utility hits)
- Unlockable skins (8 unique Backstop skins), crosshair colors (7), titles (8)
- Contract tiers reward tier-specific unlocks; levels unlock others
- Match history tracking (12 most recent)

### 7. Audio & Polish
**Goal**: Full sensory feedback, zero silence.
- Procedural WebAudio (no audio files):
  - Per-weapon shots (rifle/SMG/DMR/pistol with distinct profiles)
  - Hits, headshots, kills, reloads, dry-fire, footsteps, jump/land
  - Grenades (frag explosion, flash pop), abilities, round/match stingers
  - UI ticks, hovers, confirms, denies, ambient hum at idle
- Master volume + mute in settings and pause menu
- Audio unlocked on first user gesture (click/key)

### 8. HUD & Player Feedback
**Goal**: Information-rich without clutter.
- Health bar (low-HP vignette pulse), shield bar (for Morrow ward), ammo + reserve
- Weapon name, utility counts (with empty state), ability cooldown chip (Q key)
- Round timer (red if <15s), score pips (blue/red team), kill feed (last 5 kills, auto-fade)
- Rotating radar (top-left, north-up relative to player): blue allies, spotted red enemies, targets
- Damage direction indicator (arrow from hit direction)
- Custom crosshair (size/color settings, unlockable colors)
- Flash overlay (fade alpha tied to blind duration)

### 9. Client UI Architecture
**Goal**: Fast, responsive, keyboard/mouse-navigable.
- React-less vanilla JS with CSS Grid/Flexbox
- Tab routing (Home, Play, Squad, Loadout, Contracts, Profile, Collection, Settings)
- Subtab groups (Loadout: overview/builds; Profile: overview/history)
- In-game pause menu (volume, sensitivity, mute, resume/restart/exit)
- Onboarding brief on first run, consent modal for online features

### 10. Multiplayer Infrastructure (Later Additions)
**Goal**: Guest queue play + private rooms without auth friction.
- Cloudflare Workers backend (server-authoritative movement, combat, heartbeat)
- Queue modes: Random 1v1, Random 2v2
- Private rooms: create invite code or join via URL parameter (`?room=CODE&region=uswest`)
- Region selection (location hint, not hard pin)
- Guest mode (no sign-in required)
- Match simulation (server runs bot tick loop, clients smooth-interpolate)

---

## Key Design Decisions

### Why Three.js Over Babylon.js?
- Smaller vendored footprint (~1.2MB module vs ~2.5MB for Babylon)
- Simpler material/light API for quick prototyping
- Adequate performance for low-poly arena
- Strong community for FPS controller patterns

### Why Grid-Based Collision?
- Simple, predictable, easy to reason about (2m cells)
- Bots can use same grid for A* pathfinding (no separate geometry)
- Eliminates physics engine overhead and floating-point rounding edge cases
- Props can't be "inside" geometry; collisions are cell-level (binary walkable/not)

### Why Procedural Audio Instead of Files?
- No external asset downloads; game loads instantly
- Replicable across sessions (no silence on first load)
- Smaller project scope (no audio engineering dependency)
- Synthesis is tight and snappy (perfect for an arcade FPS)

### Why No Engine (Unreal/Unity)?
- Ship time (one person, few weeks)
- Leverage browser APIs directly (WebGL, localStorage, Web Audio)
- Three.js + vanilla JS is simpler to iterate on than engine learning curve
- No runtime bloat or asset pipeline complexity

### Why localStorage for Persistence?
- Works offline, no backend required for solo play
- Instant save/load (no network latency)
- Simple JSON serialization, easy to inspect/debug
- Opt-in backend for multiplayer (doesn't block offline progress)

---

## Testing & Verification

### End-to-End Test Suite
- Automated Playwright script covering:
  - Fresh load → onboarding → skip
  - All 8 client tabs route correctly
  - Agent + weapon + callsign customization
  - Match start → freeze → live phase
  - Player movement, ammo depletion, flash throw, ability cooldown
  - Victory, results scoreboard, XP calculation
  - Save inspection + **reload with profile intact**
  - Training Range + pause menu (resume/exit)
  - **Zero console errors**

### Visual Verification
- Bot close-up rig inspection (low-poly geometry, team coloring)
- Aegis barrier opacity and placement
- Viewmodel scale and FOV (smaller than early iterations for clarity)
- Arena lighting (dusk sky visible, team colors painted by fill lights)
- Crosshair and HUD readability

---

## Scope Boundaries (v1 Finished)

### Included
- One polished 3D map (Foundry arena)
- One single-player mode (Bot Strike), one warm-up (Training Range)
- 3 full primary weapons + sidearm (4 total)
- 4 agents with real abilities
- Frag + flash utility (2 slots per round)
- Full progression loop (XP, levels, ranks, contracts, unlocks)
- Persistence (localStorage)
- Audio (procedural synthesis)
- Pause, settings, onboarding

### Deferred (v1.1+)
- Additional maps
- 1v1 / squad multiplayer modes (infrastructure exists, gameplay polish deferred)
- Team composition strategies beyond agent pick
- Ranked ladder / seasonal systems
- Cosmetics beyond skins (charms, cards, borders)

---

## Build Time & Scope Trade-offs

**Total session**: ~8 hours over 2 days
- **Engine**: 2h (Three.js setup, Foundry geometry, lighting, player controller)
- **Combat**: 1.5h (hitscan, tracers, feedback, hitmarkers)
- **Bots**: 1.5h (A*, states, difficulty, reactions)
- **Abilities**: 45m (barrier, surge, pulse, ward)
- **Progression**: 1.5h (XP, contracts, unlocks, localStorage)
- **Audio**: 1h (procedural synthesis, UI feedback)
- **Polish & Testing**: 1h (HUD, pause, onboarding, E2E verification)

**Core insight**: Depth in one mode beats breadth across three modes. A single arena with tight combat, believable bots, and working progression is more "finished" than three half-baked modes.
