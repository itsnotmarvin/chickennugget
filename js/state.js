// Persistent profile state for Angle Protocol. Everything lives under one
// localStorage key so reset/export stays simple.

import { CONTRACTS, UNLOCKS, levelFromXp, rankForLevel, TITLES } from "./data.js";

const SAVE_KEY = "angleProtocolSave_v1";

const DEFAULTS = {
  version: 1,
  callsign: "Aegis",
  onlineRegion: "auto",
  motto: "Hold the angle. Break the round.",
  tone: "Neon noir",
  agent: "aegis",
  primary: "pike",
  skin: "snowtiger",
  crosshairColor: "bone",
  title: "recruit",
  contract: "entry",
  onboarded: false,
  xp: 0,
  settings: {
    volume: 0.8,
    muted: false,
    sensitivity: 1.0,
    crosshairSize: 1.0,
    quality: "high",
    botDifficulty: "normal",
  },
  stats: {
    kills: 0,
    deaths: 0,
    headshots: 0,
    damage: 0,
    roundWins: 0,
    roundLosses: 0,
    matches: 0,
    matchWins: 0,
    utilityHits: 0,
    rangeTargets: 0,
    bestKillsInMatch: 0,
  },
  contracts: {
    entry: { progress: 0, claimedTier: 0 },
    anchor: { progress: 0, claimedTier: 0 },
    utility: { progress: 0, claimedTier: 0 },
  },
  matchHistory: [],
};

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!extra || typeof extra !== "object") return out;
  for (const key of Object.keys(extra)) {
    const b = base ? base[key] : undefined;
    const e = extra[key];
    if (b && typeof b === "object" && !Array.isArray(b) && e && typeof e === "object" && !Array.isArray(e)) {
      out[key] = deepMerge(b, e);
    } else if (e !== undefined) {
      out[key] = e;
    }
  }
  return out;
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch (err) {
    console.warn("Angle Protocol: save unreadable, starting fresh.", err);
    return structuredClone(DEFAULTS);
  }
}

export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Angle Protocol: could not persist save.", err);
  }
}

export function resetProgress() {
  const fresh = structuredClone(DEFAULTS);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  save();
}

export function levelInfo() {
  return levelFromXp(state.xp);
}

export function rankName() {
  return rankForLevel(levelInfo().level);
}

export function titleName() {
  const t = TITLES.find((title) => title.id === state.title);
  return t ? t.name : "Recruit";
}

export function contractTier(contractId) {
  const def = CONTRACTS.find((c) => c.id === contractId);
  const prog = state.contracts[contractId];
  if (!def || !prog) return 0;
  let tier = 0;
  for (const threshold of def.tiers) {
    if (prog.progress >= threshold) tier += 1;
  }
  return tier;
}

export function isUnlocked(type, id) {
  const rule = UNLOCKS.find((u) => u.type === type && u.id === id);
  if (!rule) return true;
  if (rule.via.level !== undefined) return levelInfo().level >= rule.via.level;
  return contractTier(rule.via.contract) >= rule.via.tier;
}

export function unlockRuleLabel(type, id) {
  const rule = UNLOCKS.find((u) => u.type === type && u.id === id);
  if (!rule) return "";
  if (rule.via.level !== undefined) return `Level ${rule.via.level}`;
  const contract = CONTRACTS.find((c) => c.id === rule.via.contract);
  return `${contract ? contract.name : rule.via.contract} tier ${rule.via.tier}`;
}

// Snapshot of unlock state, so we can diff after a match and announce new gear.
export function unlockSnapshot() {
  return UNLOCKS.map((u) => `${u.type}:${u.id}:${isUnlocked(u.type, u.id) ? 1 : 0}`);
}

export function diffUnlocks(before) {
  const after = unlockSnapshot();
  const fresh = [];
  for (let i = 0; i < after.length; i += 1) {
    if (before[i] !== after[i] && after[i].endsWith(":1")) {
      const [type, id] = after[i].split(":");
      fresh.push({ type, id });
    }
  }
  return fresh;
}

export function recordMatch(entry) {
  state.matchHistory.unshift(entry);
  if (state.matchHistory.length > 12) state.matchHistory.length = 12;
}
