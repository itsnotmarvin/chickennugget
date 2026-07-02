// Static game data for Angle Protocol.

export { CELL_SIZE, MAP_GRID } from "../shared/map-data.js";

export const WEAPONS = {
  pike: {
    id: "pike",
    name: "Pike-57",
    short: "PIKE",
    slot: "primary",
    kind: "rifle",
    auto: true,
    mag: 30,
    reserve: 90,
    damage: 26,
    headMult: 2.4,
    cooldownMs: 102,
    reloadMs: 1900,
    spread: 0.011,
    moveSpread: 0.02,
    recoil: 0.0135,
    kick: 0.02,
    range: 60,
    speedMult: 1,
    blurb: "Balanced full-auto rifle. Rewards short bursts and head-level discipline.",
    stat: 74,
    statLabel: "Balanced control",
  },
  wasp: {
    id: "wasp",
    name: "Wasp K9",
    short: "WASP",
    slot: "primary",
    kind: "smg",
    auto: true,
    mag: 26,
    reserve: 104,
    damage: 18,
    headMult: 2.0,
    cooldownMs: 66,
    reloadMs: 1500,
    spread: 0.02,
    moveSpread: 0.026,
    recoil: 0.009,
    kick: 0.014,
    range: 34,
    speedMult: 1.09,
    blurb: "Close-range shredder. You move faster carrying it — win by angle, not by range.",
    stat: 62,
    statLabel: "Mobile pressure",
  },
  longshot: {
    id: "longshot",
    name: "Longshot DX",
    short: "LNG",
    slot: "primary",
    kind: "dmr",
    auto: false,
    mag: 10,
    reserve: 40,
    damage: 60,
    headMult: 2.2,
    cooldownMs: 520,
    reloadMs: 2200,
    spread: 0.0032,
    moveSpread: 0.03,
    recoil: 0.045,
    kick: 0.055,
    range: 120,
    speedMult: 0.94,
    blurb: "Semi-auto marksman rifle. One tap to the head ends the conversation.",
    stat: 88,
    statLabel: "Tap discipline",
  },
  backstop: {
    id: "backstop",
    name: "Backstop",
    short: "BCK",
    slot: "sidearm",
    kind: "pistol",
    auto: false,
    mag: 12,
    reserve: 36,
    damage: 25,
    headMult: 2.6,
    cooldownMs: 175,
    reloadMs: 1300,
    spread: 0.009,
    moveSpread: 0.018,
    recoil: 0.02,
    kick: 0.03,
    range: 40,
    speedMult: 1,
    blurb: "Standard-issue sidearm. Always with you, always honest.",
    stat: 48,
    statLabel: "Fast reset",
  },
};

export const UTILITY = {
  frag: {
    id: "frag",
    name: "Splinter Charge",
    perRound: 1,
    fuseMs: 1700,
    radius: 6.2,
    maxDamage: 92,
    throwSpeed: 15,
  },
  flash: {
    id: "flash",
    name: "Dazzler",
    perRound: 2,
    fuseMs: 1150,
    radius: 11,
    throwSpeed: 14,
  },
};

export const AGENTS = [
  {
    id: "aegis",
    name: "Aegis",
    role: "Controller",
    bio: "A calm controller who turns compact rooms into disciplined crossfires.",
    profile: "Precision controller focused on tight angles, fast reload discipline, and clean flash entries.",
    ability: {
      id: "bulwark",
      name: "Bulwark Frame",
      key: "Q",
      cooldownMs: 22000,
      durationMs: 6000,
      blurb: "Project a hard-light barrier in front of you for 6s. Blocks shots and bodies.",
    },
  },
  {
    id: "vanta",
    name: "Vanta",
    role: "Duelist",
    bio: "An entry specialist built for short bursts, fast shoulder checks, and confident first contact.",
    profile: "Aggressive duelist tuned for fast pressure, early space, and immediate trade windows.",
    ability: {
      id: "surge",
      name: "Redline Surge",
      key: "Q",
      cooldownMs: 18000,
      durationMs: 3500,
      blurb: "Instantly reload and gain +40% move speed for 3.5s. Take the space.",
    },
  },
  {
    id: "kestrel",
    name: "Kestrel",
    role: "Scout",
    bio: "A rotation reader who keeps pressure on late peeks and noisy mid-round moves.",
    profile: "Information scout who rewards patient clears, sound reads, and disciplined re-peeks.",
    ability: {
      id: "pulse",
      name: "Harrier Pulse",
      key: "Q",
      cooldownMs: 20000,
      durationMs: 6000,
      blurb: "Sweep the arena with a sonar pulse. Enemies glow on your radar for 6s.",
    },
  },
  {
    id: "morrow",
    name: "Morrow",
    role: "Anchor",
    bio: "A retake anchor who buys time, absorbs damage, and stabilizes messy fights.",
    profile: "Defensive anchor focused on delaying pushes, surviving contact, and clean retakes.",
    ability: {
      id: "ward",
      name: "Gravemark Ward",
      key: "Q",
      cooldownMs: 22000,
      durationMs: 8000,
      blurb: "Raise a 50-point overshield that decays over 8s. Built for holding the door.",
    },
  },
];

// Sidearm skins. `css` paints the Collection card silhouette; `main/accent/grip`
// drive the in-match 3D viewmodel materials.
export const SKINS = [
  {
    id: "snowtiger",
    name: "Snow Tiger",
    description: "Bone-white frame raked with black tiger striping.",
    main: "#dfe4e8", accent: "#16181b", grip: "#15171a", glow: "#ffffff",
    bg: "linear-gradient(135deg, #0c0d0f, #2c2f33)",
    css: "repeating-linear-gradient(112deg, #15171a 0 6px, transparent 6px 21px), linear-gradient(170deg, #f4f7f9, #c6ced3)",
  },
  {
    id: "orchard",
    name: "Orchard",
    description: "Tropical yellow lacquer with hand-painted leaves.",
    main: "#e7c23c", accent: "#2f7d3a", grip: "#3a2c12", glow: "#fff1a8",
    bg: "linear-gradient(135deg, #20240e, #5c4a13)",
    css: "radial-gradient(ellipse 16px 9px at 22% 32%, #2f7d3a 60%, transparent 64%), radial-gradient(ellipse 18px 10px at 70% 58%, #1c5128 60%, transparent 64%), radial-gradient(ellipse 13px 8px at 46% 80%, #3a9a47 60%, transparent 64%), linear-gradient(160deg, #f0cf45, #d8a72b)",
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description: "Glazed ceramic shell scattered with blue blossoms.",
    main: "#dfe7f2", accent: "#2f5fb0", grip: "#1b2740", glow: "#bcd2f5",
    bg: "linear-gradient(135deg, #0e1726, #324a73)",
    css: "radial-gradient(circle 4px at 24% 30%, #2f5fb0 60%, transparent 64%), radial-gradient(circle 3px at 60% 54%, #4f7fd0 60%, transparent 64%), radial-gradient(circle 4px at 80% 34%, #2f5fb0 60%, transparent 64%), linear-gradient(180deg, #eef3fb, #cfdcef)",
  },
  {
    id: "violetprowl",
    name: "Violet Prowl",
    description: "Amethyst body torn with deep violet stripes.",
    main: "#6b3fb0", accent: "#c9a6ff", grip: "#1d0f33", glow: "#c79bff",
    bg: "linear-gradient(135deg, #160a2c, #43236f)",
    css: "repeating-linear-gradient(108deg, #2c1550 0 6px, transparent 6px 20px), linear-gradient(170deg, #7a4cc0, #4a2a86)",
  },
  {
    id: "bonsai",
    name: "Bonsai",
    description: "Cream enamel under a turning autumn canopy.",
    main: "#e0d3b6", accent: "#b8402a", grip: "#3c2a18", glow: "#f0b27a",
    bg: "linear-gradient(135deg, #1c1710, #5a3a1d)",
    css: "radial-gradient(circle 5px at 30% 34%, #b8402a 60%, transparent 64%), radial-gradient(circle 4px at 64% 30%, #7a8c3a 60%, transparent 64%), radial-gradient(circle 5px at 78% 62%, #b8402a 60%, transparent 64%), linear-gradient(160deg, #ece0c6, #d4c39a)",
  },
  {
    id: "blackoutstud",
    name: "Blackout Stud",
    description: "Matte black hide studded with chrome rivets.",
    main: "#1b1e22", accent: "#c7ccd2", grip: "#0a0b0d", glow: "#dfe6ec",
    bg: "linear-gradient(135deg, #0a0b0d, #2a2e33)",
    css: "radial-gradient(#cfd5da 1.6px, transparent 2.1px) 0 0 / 15px 15px, linear-gradient(150deg, #23272c, #0f1115)",
  },
  {
    id: "roselattice",
    name: "Rose Lattice",
    description: "Blush frame webbed in navy and rose lattice.",
    main: "#e6789f", accent: "#22305a", grip: "#3a1422", glow: "#ffb6cf",
    bg: "linear-gradient(135deg, #2a0f1b, #6e2a44)",
    css: "repeating-linear-gradient(45deg, #22305a 0 2px, transparent 2px 13px), repeating-linear-gradient(-45deg, #b23a5e 0 2px, transparent 2px 13px), linear-gradient(160deg, #e885a8, #d85f88)",
  },
  {
    id: "neonriot",
    name: "Neon Riot",
    description: "Blacked-out frame tagged in neon spray.",
    main: "#241a30", accent: "#ff3da6", grip: "#0f0a16", glow: "#36e0e0",
    bg: "linear-gradient(135deg, #0c0712, #2a1640)",
    css: "radial-gradient(ellipse 20px 13px at 24% 34%, #ff3da6 55%, transparent 62%), radial-gradient(ellipse 18px 12px at 70% 30%, #36e0e0 55%, transparent 62%), radial-gradient(ellipse 22px 13px at 60% 70%, #ffe14d 50%, transparent 60%), linear-gradient(150deg, #241a30, #100a18)",
  },
];

export const CROSSHAIR_COLORS = [
  { id: "bone", name: "Bone", value: "#f4ead6" },
  { id: "gold", name: "Gold", value: "#f1c36e" },
  { id: "teal", name: "Teal", value: "#3bd0c2" },
  { id: "green", name: "Green", value: "#8bc971" },
  { id: "violet", name: "Violet", value: "#9a7bff" },
  { id: "ember", name: "Ember", value: "#f05f51" },
  { id: "rose", name: "Rose", value: "#ff7bb1" },
];

export const TITLES = [
  { id: "recruit", name: "Recruit" },
  { id: "operator", name: "Operator" },
  { id: "lancer", name: "Lancer" },
  { id: "vector", name: "Vector" },
  { id: "warden", name: "Warden" },
  { id: "ghost", name: "Ghost" },
  { id: "prism", name: "Prism" },
  { id: "apex", name: "Apex" },
];

// Everything a player can earn. `via` is either {level:n} or {contract:id, tier:n}.
export const UNLOCKS = [
  { type: "skin", id: "snowtiger", via: { level: 1 } },
  { type: "skin", id: "orchard", via: { level: 2 } },
  { type: "skin", id: "porcelain", via: { level: 3 } },
  { type: "skin", id: "violetprowl", via: { level: 4 } },
  { type: "skin", id: "bonsai", via: { level: 6 } },
  { type: "skin", id: "blackoutstud", via: { level: 8 } },
  { type: "skin", id: "roselattice", via: { contract: "entry", tier: 3 } },
  { type: "skin", id: "neonriot", via: { contract: "utility", tier: 3 } },
  { type: "crosshair", id: "bone", via: { level: 1 } },
  { type: "crosshair", id: "gold", via: { level: 1 } },
  { type: "crosshair", id: "teal", via: { level: 3 } },
  { type: "crosshair", id: "green", via: { level: 5 } },
  { type: "crosshair", id: "ember", via: { level: 7 } },
  { type: "crosshair", id: "violet", via: { contract: "anchor", tier: 2 } },
  { type: "crosshair", id: "rose", via: { contract: "utility", tier: 2 } },
  { type: "title", id: "recruit", via: { level: 1 } },
  { type: "title", id: "operator", via: { level: 3 } },
  { type: "title", id: "lancer", via: { level: 5 } },
  { type: "title", id: "vector", via: { level: 8 } },
  { type: "title", id: "apex", via: { level: 12 } },
  { type: "title", id: "ghost", via: { contract: "entry", tier: 4 } },
  { type: "title", id: "warden", via: { contract: "anchor", tier: 4 } },
  { type: "title", id: "prism", via: { contract: "utility", tier: 4 } },
];

export const CONTRACTS = [
  {
    id: "entry",
    name: "Entry Fundamentals",
    body: "Win rounds. Survive the first contact, trade for your bot teammate, close it out.",
    metric: "roundWins",
    metricLabel: "rounds won",
    tiers: [2, 5, 9, 14, 20],
    tierXp: 150,
  },
  {
    id: "anchor",
    name: "Anchor Work",
    body: "Deal damage. Hold the lane, delay the collapse, and make every bullet count.",
    metric: "damage",
    metricLabel: "damage dealt",
    tiers: [600, 1600, 3200, 5600, 9000],
    tierXp: 150,
  },
  {
    id: "utility",
    name: "Utility Timing",
    body: "Land utility. Blind enemies with Dazzlers and catch bodies with Splinter charges.",
    metric: "utilityHits",
    metricLabel: "utility hits",
    tiers: [3, 8, 15, 25, 40],
    tierXp: 150,
  },
];

export const RANKS = [
  "Ironline I", "Ironline II", "Ironline III",
  "Steelcast I", "Steelcast II", "Steelcast III",
  "Vectorline I", "Vectorline II", "Vectorline III",
  "Halcyon I", "Halcyon II", "Halcyon III",
  "Apex Protocol",
];

export function xpForLevel(level) {
  // XP needed to go from `level` to `level + 1`.
  return 350 + (level - 1) * 130;
}

export function levelFromXp(xp) {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level) && level < 60) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return { level, into: remaining, next: xpForLevel(level) };
}

export function rankForLevel(level) {
  return RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))];
}

export const BOT_TUNING = {
  easy: {
    label: "Easy",
    reactionMs: 620, reactionJitterMs: 420,
    aimError: 0.13, burstMs: 300, burstGapMs: 780,
    speed: 3.4, damageScale: 0.72, sightRange: 26, fov: 1.9,
  },
  normal: {
    label: "Normal",
    reactionMs: 400, reactionJitterMs: 300,
    aimError: 0.075, burstMs: 420, burstGapMs: 560,
    speed: 4.1, damageScale: 1.0, sightRange: 34, fov: 2.2,
  },
  sharp: {
    label: "Sharp",
    reactionMs: 240, reactionJitterMs: 180,
    aimError: 0.04, burstMs: 560, burstGapMs: 380,
    speed: 4.7, damageScale: 1.25, sightRange: 42, fov: 2.6,
  },
};

export const BOT_NAMES = {
  ally: ["Cinder", "Rook", "Talon", "Mesa"],
  enemy: ["Hex", "Vireo", "Slate", "Onyx", "Fathom", "Quill"],
};

export const MODES = {
  botstrike: {
    id: "botstrike",
    name: "Bot Strike",
    tag: "Solo vs squad",
    body: "You and a bot ally versus two hostiles. First team to 4 round wins takes the match.",
    players: "1 player + 3 bots",
    scoreTarget: 4,
    roundMs: 90000,
  },
  duelbot: {
    id: "duelbot",
    name: "Bot Duel",
    tag: "Solo duel",
    body: "You versus one hostile bot. First to 4 round wins takes the match.",
    players: "1 player + 1 bot",
    scoreTarget: 4,
    roundMs: 90000,
  },
  range: {
    id: "range",
    name: "Training Range",
    tag: "Warm-up",
    body: "Free-fire in the Foundry against pop-up target frames. No timer, no stakes — just reps.",
    players: "1 player",
    scoreTarget: 0,
    roundMs: 0,
  },
};

export const MAP_INFO = {
  id: "foundry",
  name: "Foundry",
  tempo: "Long mid control",
  body: "A dusk-lit casting hall: one long mid lane, two crate-choked flanks, and a stack of jump-up angles.",
};

export const XP_RULES = {
  kill: 55,
  headshotBonus: 20,
  roundWin: 60,
  matchWin: 220,
  matchLoss: 90,
  damagePer100: 8,
  utilityHit: 15,
  rangeTargetsPer10: 30,
};
