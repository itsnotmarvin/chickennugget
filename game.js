const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const loadingEl = document.getElementById("loading");
const loadingFill = document.getElementById("loadingFill");
const loadingText = document.getElementById("loadingText");
const startMatchButton = document.getElementById("startMatch");
const exitMatchButton = document.getElementById("exitMatch");
const selectedModeTitle = document.getElementById("selectedModeTitle");
const selectedModeBody = document.getElementById("selectedModeBody");
const selectedModePlayers = document.getElementById("selectedModePlayers");
const roundLengthLabel = document.getElementById("roundLengthLabel");
const skinGrid = document.getElementById("skinGrid");
const equippedSkinLabel = document.getElementById("equippedSkinLabel");
const roundLengthSelect = document.getElementById("roundLength");
const botDifficultySelect = document.getElementById("botDifficulty");
const visualQualitySelect = document.getElementById("visualQuality");
const statRounds = document.getElementById("statRounds");
const statWins = document.getElementById("statWins");
const statDamage = document.getElementById("statDamage");
const historyList = document.getElementById("historyList");
const profileInitial = document.getElementById("profileInitial");
const profileName = document.getElementById("profileName");
const profileTitle = document.getElementById("profileTitle");
const profileBio = document.getElementById("profileBio");
const selectedModeMap = document.getElementById("selectedModeMap");
const selectedModeAgent = document.getElementById("selectedModeAgent");
const selectedMapTitle = document.getElementById("selectedMapTitle");
const selectedMapTempo = document.getElementById("selectedMapTempo");
const selectedAgentName = document.getElementById("selectedAgentName");
const selectedAgentBio = document.getElementById("selectedAgentBio");
const selectedPrimaryName = document.getElementById("selectedPrimaryName");
const selectedPrimaryBody = document.getElementById("selectedPrimaryBody");
const activeContractTitle = document.getElementById("activeContractTitle");
const activeContractBody = document.getElementById("activeContractBody");
const callsignInput = document.getElementById("callsignInput");
const squadMottoInput = document.getElementById("squadMotto");
const seasonToneSelect = document.getElementById("seasonTone");
const briefingMotto = document.getElementById("briefingMotto");
const briefCallsign = document.getElementById("briefCallsign");
const briefAgent = document.getElementById("briefAgent");
const briefMap = document.getElementById("briefMap");
const briefTone = document.getElementById("briefTone");
const homeMode = document.getElementById("homeMode");
const homePrimary = document.getElementById("homePrimary");
const homeContract = document.getElementById("homeContract");
const loadoutSkinLabel = document.getElementById("loadoutSkinLabel");

const TEAM_BLUE = "blue";
const TEAM_RED = "red";
const ROUND_PAUSE_MS = 3600;
const FOV = Math.PI * 0.4;
const MAX_VIEW_DIST = 18.5;
const WALL_STEP = 0.025;
const PLAYER_RADIUS = 0.18;
const ENTITY_VIEW_DIST = 17.5;
const ENTITY_FOV_LIMIT = FOV * 0.72;
const ENTITY_VISIBILITY_SAMPLE_RADIUS = PLAYER_RADIUS;
const ENTITY_CORNER_OCCLUSION_MARGIN = 0.42;
const BOT_SIGHT_RANGE = 10.5;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 34;
const STAMINA_REGEN = 24;
const SPRINT_MULTIPLIER = 1.55;
const JUMP_BOOST_MULTIPLIER = 1.25;
const JUMP_POWER = 4.2;
const GRAVITY = 11.5;

const WEAPONS = {
  rifle: {
    label: "AK-47",
    short: "AK",
    maxAmmo: 30,
    cooldown: 145,
    reloadMs: 1650,
    damage: 30,
    headDamage: 115,
    projectileSpeed: 24,
    range: 12.5,
    radius: 0.075,
  },
  pistol: {
    label: "Pistol",
    short: "PST",
    maxAmmo: 10,
    cooldown: 440,
    reloadMs: 900,
    damage: 26,
    headDamage: 78,
    projectileSpeed: 17,
    range: 8.5,
    radius: 0.07,
  },
};

const RAW_MAP = [
  "###############################",
  "#.............................#",
  "#........#...........#..#..#..#",
  "#....#...#...#...#............#",
  "#......#.......#.......#......#",
  "#.......#.............#.......#",
  "#...###.###.........###.###...#",
  "#...###.#.#.........###.###...#",
  "#...###.#.#.........###.###...#",
  "#.............................#",
  "#...###.###.........#.#.###...#",
  "#...###.###.........#.#.###...#",
  "#...###.###.........###.###...#",
  "#.......#.............#.......#",
  "#......#.......#.......#......#",
  "#............#...#...#...#....#",
  "#..#..#..#...........#........#",
  "#.............................#",
  "###############################",
];

const CONTROLS = {
  p1: {
    forward: "w",
    back: "s",
    left: "a",
    right: "d",
    // P1 aims with the mouse (pointer lock); left/right become strafe keys.
    // P2 stays keyboard-only since split-screen shares one mouse.
    mouseAim: true,
    shoot: "q",
    reload: "e",
    sprint: ["shift"],
    jump: "f",
    primary: "1",
    secondary: "2",
    lethal: "3",
    flash: ["4"],
  },
  p2: {
    forward: "p",
    back: ";",
    left: "l",
    right: "'",
    shoot: "o",
    reload: "[",
    sprint: ["/", "?"],
    jump: ".",
    primary: "8",
    secondary: "9",
    lethal: "0",
    flash: ["-"],
  },
};

// Each sidearm skin carries two looks driven from one palette:
//  - css:     layered CSS background painted onto the gun silhouette in the Collection card
//  - pattern: a procedural motif drawn over the pistol body in-match (drawSkinPattern)
const SKINS = [
  {
    id: "snowtiger",
    name: "Snow Tiger",
    description: "Bone-white frame raked with black tiger striping.",
    main: "#dfe4e8",
    accent: "#16181b",
    grip: "#15171a",
    glow: "#ffffff",
    bg: "linear-gradient(135deg, #0c0d0f, #2c2f33)",
    css:
      "repeating-linear-gradient(112deg, #15171a 0 6px, transparent 6px 21px)," +
      "linear-gradient(170deg, #f4f7f9, #c6ced3)",
    pattern: { type: "stripes", colors: ["#15171a"] },
  },
  {
    id: "orchard",
    name: "Orchard",
    description: "Tropical yellow lacquer with hand-painted leaves.",
    main: "#e7c23c",
    accent: "#2f7d3a",
    grip: "#3a2c12",
    glow: "#fff1a8",
    bg: "linear-gradient(135deg, #20240e, #5c4a13)",
    css:
      "radial-gradient(ellipse 16px 9px at 22% 32%, #2f7d3a 60%, transparent 64%)," +
      "radial-gradient(ellipse 18px 10px at 70% 58%, #1c5128 60%, transparent 64%)," +
      "radial-gradient(ellipse 13px 8px at 46% 80%, #3a9a47 60%, transparent 64%)," +
      "radial-gradient(ellipse 14px 8px at 86% 26%, #2f7d3a 60%, transparent 64%)," +
      "linear-gradient(160deg, #f0cf45, #d8a72b)",
    pattern: { type: "leaves", colors: ["#2f7d3a", "#1c5128", "#3a9a47"] },
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description: "Glazed ceramic shell scattered with blue blossoms.",
    main: "#dfe7f2",
    accent: "#2f5fb0",
    grip: "#1b2740",
    glow: "#bcd2f5",
    bg: "linear-gradient(135deg, #0e1726, #324a73)",
    css:
      "radial-gradient(circle 4px at 24% 30%, #2f5fb0 60%, transparent 64%)," +
      "radial-gradient(circle 3px at 60% 54%, #4f7fd0 60%, transparent 64%)," +
      "radial-gradient(circle 4px at 80% 34%, #2f5fb0 60%, transparent 64%)," +
      "radial-gradient(circle 3px at 40% 76%, #3a6bc0 60%, transparent 64%)," +
      "linear-gradient(180deg, #eef3fb, #cfdcef)",
    pattern: { type: "dots", colors: ["#2f5fb0", "#4f7fd0"] },
  },
  {
    id: "violetprowl",
    name: "Violet Prowl",
    description: "Amethyst body torn with deep violet stripes.",
    main: "#6b3fb0",
    accent: "#c9a6ff",
    grip: "#1d0f33",
    glow: "#c79bff",
    bg: "linear-gradient(135deg, #160a2c, #43236f)",
    css:
      "repeating-linear-gradient(108deg, #2c1550 0 6px, transparent 6px 20px)," +
      "linear-gradient(170deg, #7a4cc0, #4a2a86)",
    pattern: { type: "stripes", colors: ["#2c1550"] },
  },
  {
    id: "bonsai",
    name: "Bonsai",
    description: "Cream enamel under a turning autumn canopy.",
    main: "#e0d3b6",
    accent: "#b8402a",
    grip: "#3c2a18",
    glow: "#f0b27a",
    bg: "linear-gradient(135deg, #1c1710, #5a3a1d)",
    css:
      "radial-gradient(circle 5px at 30% 34%, #b8402a 60%, transparent 64%)," +
      "radial-gradient(circle 4px at 64% 30%, #7a8c3a 60%, transparent 64%)," +
      "radial-gradient(circle 5px at 78% 62%, #b8402a 60%, transparent 64%)," +
      "radial-gradient(circle 4px at 45% 72%, #cf6a2a 60%, transparent 64%)," +
      "linear-gradient(160deg, #ece0c6, #d4c39a)",
    pattern: { type: "dots", colors: ["#b8402a", "#7a8c3a", "#cf6a2a"] },
  },
  {
    id: "blackoutstud",
    name: "Blackout Stud",
    description: "Matte black hide studded with chrome rivets.",
    main: "#1b1e22",
    accent: "#c7ccd2",
    grip: "#0a0b0d",
    glow: "#dfe6ec",
    bg: "linear-gradient(135deg, #0a0b0d, #2a2e33)",
    css:
      "radial-gradient(#cfd5da 1.6px, transparent 2.1px) 0 0 / 15px 15px," +
      "linear-gradient(150deg, #23272c, #0f1115)",
    pattern: { type: "studs", colors: ["#cfd5da", "#8d9298"] },
  },
  {
    id: "roselattice",
    name: "Rose Lattice",
    description: "Blush frame webbed in navy and rose lattice.",
    main: "#e6789f",
    accent: "#22305a",
    grip: "#3a1422",
    glow: "#ffb6cf",
    bg: "linear-gradient(135deg, #2a0f1b, #6e2a44)",
    css:
      "repeating-linear-gradient(45deg, #22305a 0 2px, transparent 2px 13px)," +
      "repeating-linear-gradient(-45deg, #b23a5e 0 2px, transparent 2px 13px)," +
      "linear-gradient(160deg, #e885a8, #d85f88)",
    pattern: { type: "lattice", colors: ["#22305a", "#b23a5e"] },
  },
  {
    id: "neonriot",
    name: "Neon Riot",
    description: "Blacked-out frame tagged in neon spray.",
    main: "#241a30",
    accent: "#ff3da6",
    grip: "#0f0a16",
    glow: "#36e0e0",
    bg: "linear-gradient(135deg, #0c0712, #2a1640)",
    css:
      "radial-gradient(ellipse 20px 13px at 24% 34%, #ff3da6 55%, transparent 62%)," +
      "radial-gradient(ellipse 18px 12px at 70% 30%, #36e0e0 55%, transparent 62%)," +
      "radial-gradient(ellipse 22px 13px at 60% 70%, #ffe14d 50%, transparent 60%)," +
      "radial-gradient(ellipse 16px 11px at 30% 76%, #8a5cff 55%, transparent 62%)," +
      "linear-gradient(150deg, #241a30, #100a18)",
    pattern: { type: "graffiti", colors: ["#ff3da6", "#36e0e0", "#ffe14d", "#8a5cff"] },
  },
];

const AGENTS = [
  {
    id: "aegis",
    name: "Aegis",
    role: "Controller",
    bio: "A calm controller who turns compact rooms into disciplined crossfires.",
    profile: "Precision controller focused on tight angles, fast reload discipline, and clean flash entries.",
  },
  {
    id: "vanta",
    name: "Vanta",
    role: "Duelist",
    bio: "An entry specialist built for short bursts, fast shoulder checks, and confident first contact.",
    profile: "Aggressive duelist tuned for fast pressure, early space, and immediate trade windows.",
  },
  {
    id: "kestrel",
    name: "Kestrel",
    role: "Scout",
    bio: "A rotation reader who keeps pressure on late peeks and noisy mid-round moves.",
    profile: "Information scout who rewards patient clears, sound reads, and disciplined re-peeks.",
  },
  {
    id: "morrow",
    name: "Morrow",
    role: "Anchor",
    bio: "A retake anchor who buys time, absorbs damage, and stabilizes messy fights.",
    profile: "Defensive anchor focused on delaying pushes, surviving contact, and clean retakes.",
  },
];

const MAPS = [
  {
    id: "foundry",
    name: "Warehouse",
    tempo: "Long mid control",
    tag: "Warehouse",
  },
  {
    id: "relay",
    name: "Relay",
    tempo: "Mid pressure",
    tag: "Relay",
  },
  {
    id: "harbor",
    name: "Harbor",
    tempo: "Long sightlines",
    tag: "Harbor",
  },
];

const PRIMARY_LOADOUTS = {
  rifle: {
    name: "AK-47",
    body: "A hard-hitting primary rifle with a 30-round magazine and strong head-level pressure.",
    actualWeapon: "rifle",
  },
  pistol: {
    name: "Pistol Start",
    body: "A fast reset drill that forces cleaner movement, reload timing, and utility discipline.",
    actualWeapon: "pistol",
  },
  guardian: {
    name: "Marksman",
    body: "A tap-fire identity for players who want the client fantasy of precise one-shot lanes.",
    actualWeapon: "rifle",
  },
};

const CONTRACTS = {
  entry: {
    name: "Entry Fundamentals",
    body: "Win rounds by surviving the first contact and trading for your bot teammate.",
  },
  anchor: {
    name: "Anchor Work",
    body: "Hold the first lane, delay the collapse, and leave enough health for the retake.",
  },
  utility: {
    name: "Utility Timing",
    body: "Flash before contact, isolate one target, and convert the swing before the response.",
  },
};

const MODE_COPY = {
  multiplayer: {
    title: "Split-screen Duel",
    body: "Blue and red squads enter a compact angle map. Win by eliminating the other team before the timer expires.",
    players: "2 local players",
  },
  singleplayer: {
    title: "Practice Strike",
    body: "Player 1 leads blue with one bot teammate against two red defenders.",
    players: "1 local player",
  },
};

const BOT_TUNING = {
  easy: { cooldown: 1120, aimError: 0.16, speed: 1.08, reactionMin: 520, reactionJitter: 500, damage: 14, head: 42 },
  normal: { cooldown: 850, aimError: 0.105, speed: 1.25, reactionMin: 360, reactionJitter: 360, damage: 18, head: 54 },
  sharp: { cooldown: 640, aimError: 0.065, speed: 1.38, reactionMin: 220, reactionJitter: 260, damage: 22, head: 66 },
};

const watchedKeys = new Set([
  ...Object.values(CONTROLS.p1).flat(),
  ...Object.values(CONTROLS.p2).flat(),
  " ",
  "escape",
]);

const keys = new Set();
let screen = { w: 1280, h: 720, dpr: 1 };
let lastFrame = performance.now();

const app = {
  view: "loading",
  page: "home",
  selectedMode: "singleplayer",
  selectedMap: "foundry",
  selectedAgent: "aegis",
  selectedPrimary: "rifle",
  selectedContract: "entry",
  selectedSkin: "snowtiger",
  callsign: "Aegis",
  motto: "Hold the angle. Break the round.",
  seasonTone: "Neon noir",
  roundLengthMs: 120000,
  botDifficulty: "normal",
  visualQuality: "high",
  stats: {
    rounds: 0,
    wins: 0,
    damage: 0,
  },
  history: ["Training range ready", "Split-screen controls verified", "Flash kit unlocked"],
};

const game = {
  mode: "singleplayer",
  round: 0,
  scores: { [TEAM_BLUE]: 0, [TEAM_RED]: 0 },
  entities: [],
  humans: [],
  projectiles: [],
  blasts: [],
  active: false,
  roundStartedAt: 0,
  roundEndedAt: 0,
  winner: null,
  message: "",
};

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  screen = {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr,
  };
  canvas.width = Math.floor(screen.w * dpr);
  canvas.height = Math.floor(screen.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

canvas.addEventListener("click", () => canvas.focus());

const MOUSE_SENSITIVITY = 0.0026;
const mouse = { dx: 0, down: false };

function pointerLocked() {
  return document.pointerLockElement === canvas;
}

function requestPointerAim() {
  if (pointerLocked() || !canvas.requestPointerLock) return;
  const result = canvas.requestPointerLock();
  if (result && typeof result.catch === "function") result.catch(() => {});
}

canvas.addEventListener("click", () => {
  if (app.view === "match") requestPointerAim();
});

window.addEventListener("mousemove", (event) => {
  if (pointerLocked()) mouse.dx += event.movementX;
});

canvas.addEventListener("mousedown", (event) => {
  // On the click that acquires pointer lock, lock isn't held yet at
  // mousedown time, so that click never fires a shot.
  if (event.button === 0 && app.view === "match" && pointerLocked()) mouse.down = true;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) mouse.down = false;
});

document.addEventListener("pointerlockchange", () => {
  if (!pointerLocked()) {
    mouse.down = false;
    mouse.dx = 0;
  }
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (app.view === "loading" && (key === " " || key === "enter")) {
    event.preventDefault();
    showClient();
    return;
  }

  if (app.view !== "match") return;

  if (watchedKeys.has(key)) event.preventDefault();
  if (key === "escape") {
    showClient();
    return;
  }

  keys.add(key);

  if (key === " " && !game.active) {
    startRound();
    return;
  }

  const now = performance.now();
  for (const human of game.humans) {
    if (!human.alive || !game.active) continue;
    const controls = CONTROLS[human.controlId];
    if (key === controls.shoot) shoot(human, now);
    if (key === controls.reload) reload(human, now);
    if (key === controls.primary) switchWeapon(human, "rifle", now);
    if (key === controls.secondary) switchWeapon(human, "pistol", now);
    if (key === controls.lethal) useLethal(human, now);
    if (keyMatches(key, controls.jump)) jump(human, now);
    if (keyMatches(key, controls.flash)) useFlash(human, now);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function getSkin(id = app.selectedSkin) {
  return SKINS.find((skin) => skin.id === id) || SKINS[0];
}

function getAgent(id = app.selectedAgent) {
  return AGENTS.find((agent) => agent.id === id) || AGENTS[0];
}

function getMap(id = app.selectedMap) {
  return MAPS.find((map) => map.id === id) || MAPS[0];
}

function getPrimaryLoadout(id = app.selectedPrimary) {
  return PRIMARY_LOADOUTS[id] || PRIMARY_LOADOUTS.rifle;
}

function getContract(id = app.selectedContract) {
  return CONTRACTS[id] || CONTRACTS.entry;
}

function getCallsign() {
  return (app.callsign || getAgent().name).trim().slice(0, 12) || getAgent().name;
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function keyMatches(key, binding) {
  return Array.isArray(binding) ? binding.includes(key) : key === binding;
}

function isBindingDown(binding) {
  return Array.isArray(binding) ? binding.some((key) => keys.has(key)) : keys.has(binding);
}

function setView(view) {
  app.view = view;
  document.body.classList.toggle("is-client", view === "client");
  document.body.classList.toggle("is-match", view === "match");
  loadingEl.classList.toggle("is-active", view === "loading");
}

function showClient() {
  game.active = false;
  game.roundEndedAt = 0;
  keys.clear();
  if (pointerLocked()) document.exitPointerLock();
  setView("client");
  updateStatsUi();
}

function showPage(page) {
  app.page = page;
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === page);
  });
  document.querySelectorAll(".client-page").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === page);
  });
}

function updateClientSummary() {
  const mode = MODE_COPY[app.selectedMode] || MODE_COPY.multiplayer;
  const map = getMap();
  const agent = getAgent();
  const primary = getPrimaryLoadout();
  const contract = getContract();
  const skin = getSkin();
  const callsign = getCallsign();
  const initial = callsign[0].toUpperCase();
  const roundMinutes = app.roundLengthMs / 60000;
  const roundLabel = `${Number.isInteger(roundMinutes) ? roundMinutes : roundMinutes.toFixed(1)} minute rounds`;

  setText(selectedModeTitle, mode.title);
  setText(selectedModeBody, mode.body);
  setText(selectedModePlayers, mode.players);
  setText(roundLengthLabel, roundLabel);
  setText(selectedModeMap, map.name);
  setText(selectedModeAgent, agent.name);
  setText(selectedMapTitle, map.name);
  setText(selectedMapTempo, map.tempo);
  setText(selectedAgentName, agent.name);
  setText(selectedAgentBio, `${agent.role}: ${agent.bio}`);
  setText(selectedPrimaryName, primary.name);
  setText(selectedPrimaryBody, primary.body);
  setText(activeContractTitle, contract.name);
  setText(activeContractBody, contract.body);
  setText(profileInitial, initial);
  setText(profileName, callsign);
  setText(profileTitle, callsign);
  setText(profileBio, agent.profile);
  setText(briefingMotto, app.motto);
  setText(briefCallsign, `${callsign} online`);
  setText(briefAgent, `Agent: ${agent.name}`);
  setText(briefMap, `Map: ${map.name}`);
  setText(briefTone, `Tone: ${app.seasonTone}`);
  setText(homeMode, mode.title);
  setText(homePrimary, primary.name);
  setText(homeContract, contract.name);
  setText(loadoutSkinLabel, `Sidearm: ${skin.name}`);
  setText(equippedSkinLabel, `Equipped: ${skin.name}`);

  document.querySelectorAll(".profile-avatar").forEach((avatar) => {
    avatar.textContent = initial;
  });
}

function syncIdentityFromInputs() {
  app.callsign = callsignInput.value.trim() || getAgent().name;
  app.motto = squadMottoInput.value.trim() || "Hold the angle. Break the round.";
  app.seasonTone = seasonToneSelect.value;
  updateClientSummary();
}

function selectMode(mode) {
  app.selectedMode = mode;
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.mode === mode);
  });
  updateClientSummary();
}

function selectMap(id) {
  app.selectedMap = id;
  document.querySelectorAll(".map-card").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.map === id);
  });
  updateClientSummary();
}

function selectAgent(id) {
  const previousAgent = getAgent();
  app.selectedAgent = id;
  const agent = getAgent();
  if (callsignInput.value.trim() === previousAgent.name) {
    callsignInput.value = agent.name;
    app.callsign = agent.name;
  }
  document.querySelectorAll(".agent-card").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.agent === id);
  });
  updateClientSummary();
}

function selectPrimary(id) {
  app.selectedPrimary = id;
  document.querySelectorAll(".weapon-card").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.weapon === id);
  });
  updateClientSummary();
}

function selectContract(id) {
  app.selectedContract = id;
  document.querySelectorAll(".contract-card").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.contract === id);
  });
  updateClientSummary();
}

function renderSkins() {
  skinGrid.innerHTML = "";
  for (const skin of SKINS) {
    const button = document.createElement("button");
    button.className = "skin-card";
    button.type = "button";
    button.dataset.skin = skin.id;
    button.style.setProperty("--skin-bg", skin.bg);
    button.style.setProperty("--skin-pattern", skin.css);
    button.style.setProperty("--skin-accent", skin.accent);
    button.innerHTML = `
      <span class="skin-preview" aria-hidden="true"></span>
      <strong>${skin.name}</strong>
      <span>${skin.description}</span>
    `;
    button.addEventListener("click", () => selectSkin(skin.id));
    skinGrid.appendChild(button);
  }
  selectSkin(app.selectedSkin);
}

function selectSkin(id) {
  app.selectedSkin = id;
  const skin = getSkin();
  document.querySelectorAll(".skin-card").forEach((button) => {
    button.classList.toggle("is-equipped", button.dataset.skin === id);
  });
  updateClientSummary();
}

function addHistory(text, result) {
  app.history.unshift(`${text}|${result}`);
  app.history = app.history.slice(0, 5);
  updateStatsUi();
}

function updateStatsUi() {
  statRounds.textContent = String(app.stats.rounds);
  statWins.textContent = String(app.stats.wins);
  statDamage.textContent = String(app.stats.damage);
  historyList.innerHTML = "";
  for (const item of app.history) {
    const [text, result = "Ready"] = item.split("|");
    const li = document.createElement("li");
    li.innerHTML = `<span>${text}</span><strong>${result}</strong>`;
    historyList.appendChild(li);
  }
}

function startLoading() {
  const started = performance.now();
  const labels = ["Loading assets", "Building range", "Preparing squads", "Syncing local controls"];

  function frame(now) {
    if (app.view !== "loading") return;
    const elapsed = now - started;
    const progress = clamp(elapsed / 1800, 0, 1);
    const percent = Math.round(progress * 100);
    loadingFill.style.width = `${percent}%`;
    loadingText.textContent = `${labels[Math.min(labels.length - 1, Math.floor(progress * labels.length))]} ${percent}%`;
    if (progress >= 1) {
      window.setTimeout(showClient, 260);
      return;
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function startMatch(mode) {
  game.mode = mode;
  game.round = 0;
  game.scores = { [TEAM_BLUE]: 0, [TEAM_RED]: 0 };
  setView("match");
  startRound();
  canvas.focus();
  // Called from a click gesture (Play button), so the lock request is allowed.
  requestPointerAim();
}

function quickPlay() {
  syncIdentityFromInputs();
  startMatch(app.selectedMode);
}

function isWall(x, y) {
  const row = Math.floor(y);
  const col = Math.floor(x);
  if (row < 0 || row >= RAW_MAP.length) return true;
  if (col < 0 || col >= RAW_MAP[row].length) return true;
  return RAW_MAP[row][col] === "#";
}

function canStandAt(x, y) {
  const r = PLAYER_RADIUS;
  return (
    !isWall(x - r, y - r) &&
    !isWall(x + r, y - r) &&
    !isWall(x - r, y + r) &&
    !isWall(x + r, y + r)
  );
}

function moveEntity(entity, dx, dy) {
  const nextX = entity.x + dx;
  const nextY = entity.y + dy;
  if (canStandAt(nextX, entity.y)) entity.x = nextX;
  if (canStandAt(entity.x, nextY)) entity.y = nextY;
}

function hasLineOfSight(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.ceil(dist / WALL_STEP));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isWall(ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

function raycast(x, y, angle, maxDist = MAX_VIEW_DIST) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let lastOpenX = x;
  let lastOpenY = y;
  for (let dist = WALL_STEP; dist < maxDist; dist += WALL_STEP) {
    const rx = x + cos * dist;
    const ry = y + sin * dist;
    if (isWall(rx, ry)) {
      const cellX = Math.floor(rx);
      const cellY = Math.floor(ry);
      const fx = Math.abs(rx - Math.floor(rx) - 0.5);
      const fy = Math.abs(ry - Math.floor(ry) - 0.5);
      return { dist, x: rx, y: ry, cellX, cellY, side: fx > fy ? 0 : 1, lastOpenX, lastOpenY };
    }
    lastOpenX = rx;
    lastOpenY = ry;
  }
  return { dist: maxDist, x: x + cos * maxDist, y: y + sin * maxDist, side: 0, lastOpenX, lastOpenY };
}

function makeEntity(config) {
  const tuning = BOT_TUNING[app.botDifficulty];
  const isBot = config.kind === "bot";
  return {
    id: config.id,
    name: config.name,
    team: config.team,
    kind: config.kind,
    controlId: config.controlId || null,
    skinId: config.skinId || app.selectedSkin,
    x: config.x,
    y: config.y,
    spawnX: config.x,
    spawnY: config.y,
    angle: config.angle,
    spawnAngle: config.angle,
    hp: 100,
    alive: true,
    activeWeapon: config.activeWeapon || "rifle",
    ammoByWeapon: {
      rifle: isBot ? 8 : WEAPONS.rifle.maxAmmo,
      pistol: WEAPONS.pistol.maxAmmo,
    },
    reloadingUntil: 0,
    lastShotAt: 0,
    speed: isBot ? tuning.speed : 2.25,
    turnSpeed: isBot ? 2.0 : 2.55,
    stamina: STAMINA_MAX,
    isSprinting: false,
    jumpHeight: 0,
    jumpVelocity: 0,
    jumpBoostUntil: 0,
    flashCharges: isBot ? 0 : 1,
    lethalCharges: isBot ? 0 : 1,
    flashCooldownUntil: 0,
    lethalCooldownUntil: 0,
    flashedUntil: 0,
    hurtUntil: 0,
    hitMarkerUntil: 0,
    muzzleFlashUntil: 0,
    weaponKickUntil: 0,
    lastDamageText: "",
    aiNextThink: 0,
    aiAimError: 0,
    aiWanderAngle: config.angle,
  };
}

function startRound() {
  if (app.view !== "match") return;

  game.round += 1;
  game.active = true;
  game.roundStartedAt = performance.now();
  game.roundEndedAt = 0;
  game.winner = null;
  game.message = "";
  game.projectiles = [];
  game.blasts = [];

  const p1 = makeEntity({
    id: "p1",
    name: getCallsign(),
    team: TEAM_BLUE,
    kind: "human",
    controlId: "p1",
    skinId: app.selectedSkin,
    activeWeapon: getPrimaryLoadout().actualWeapon,
    x: 2.6,
    y: 3.6,
    angle: 0.4,
  });
  const b1 = makeEntity({
    id: "b1",
    name: "B1",
    team: TEAM_BLUE,
    kind: "bot",
    x: 6.4,
    y: 2.6,
    angle: 0.6,
  });

  if (game.mode === "singleplayer") {
    const r1 = makeEntity({
    id: "r1",
      name: "R1",
      team: TEAM_RED,
      kind: "bot",
      x: 27.4,
      y: 14.4,
      angle: Math.PI + 0.4,
    });
    const r2 = makeEntity({
      id: "r2",
      name: "R2",
      team: TEAM_RED,
      kind: "bot",
      x: 23.6,
      y: 15.4,
      angle: Math.PI + 0.6,
    });
    game.entities = [p1, b1, r1, r2];
    game.humans = [p1];
    return;
  }

  const p2 = makeEntity({
    id: "p2",
    name: "P2",
    team: TEAM_RED,
    kind: "human",
    controlId: "p2",
    skinId: "neonriot",
    x: 27.4,
    y: 14.4,
    angle: Math.PI + 0.4,
  });
  const b2 = makeEntity({
    id: "b2",
    name: "B2",
    team: TEAM_RED,
    kind: "bot",
    x: 23.6,
    y: 15.4,
    angle: Math.PI + 0.6,
  });

  game.entities = [p1, b1, p2, b2];
  game.humans = [p1, p2];
}

function teamEntities(team) {
  return game.entities.filter((entity) => entity.team === team);
}

function livingTeamEntities(team) {
  return teamEntities(team).filter((entity) => entity.alive);
}

function enemyEntities(entity) {
  return game.entities.filter((other) => other.team !== entity.team && other.alive);
}

function totalTeamHp(team) {
  return livingTeamEntities(team).reduce((sum, entity) => sum + entity.hp, 0);
}

function getWeapon(entity) {
  return WEAPONS[entity.activeWeapon] || WEAPONS.rifle;
}

function getAmmo(entity) {
  return entity.ammoByWeapon[entity.activeWeapon] ?? 0;
}

function setAmmo(entity, amount) {
  entity.ammoByWeapon[entity.activeWeapon] = clamp(amount, 0, getWeapon(entity).maxAmmo);
}

function switchWeapon(entity, weaponKey, now) {
  if (!entity.alive || entity.kind === "bot") return;
  if (!WEAPONS[weaponKey]) return;
  if (entity.reloadingUntil > now) return;
  entity.activeWeapon = weaponKey;
  entity.weaponKickUntil = now + 100;
}

function reload(entity, now) {
  if (!entity.alive) return;
  if (entity.reloadingUntil > now) return;
  const weapon = getWeapon(entity);
  if (getAmmo(entity) >= weapon.maxAmmo) return;
  entity.reloadingUntil = now + (entity.kind === "bot" ? weapon.reloadMs + 250 : weapon.reloadMs);
}

function finishReloads(now) {
  for (const entity of game.entities) {
    if (entity.reloadingUntil > 0 && entity.reloadingUntil <= now) {
      setAmmo(entity, getWeapon(entity).maxAmmo);
      entity.reloadingUntil = 0;
    }
  }
}

function damageEntity(target, amount, attacker, isHeadshot, now) {
  if (!target.alive) return;
  const applied = Math.min(target.hp, amount);
  target.hp = clamp(target.hp - amount, 0, 100);
  target.hurtUntil = now + 260;
  attacker.hitMarkerUntil = now + 180;
  attacker.lastDamageText = isHeadshot ? "HEAD" : "HIT";
  if (attacker.team === TEAM_BLUE) {
    app.stats.damage += Math.round(applied);
    updateStatsUi();
  }
  if (target.hp <= 0) {
    target.alive = false;
    target.hp = 0;
  }
}

function shoot(entity, now, aimOffset = 0) {
  if (!entity.alive || !game.active) return;
  if (entity.reloadingUntil > now) return;
  const weapon = getWeapon(entity);
  const cooldown = entity.kind === "bot" ? BOT_TUNING[app.botDifficulty].cooldown : weapon.cooldown;
  if (now - entity.lastShotAt < cooldown) return;
  if (getAmmo(entity) <= 0) {
    reload(entity, now);
    return;
  }

  setAmmo(entity, getAmmo(entity) - 1);
  entity.lastShotAt = now;
  entity.muzzleFlashUntil = now + 110;
  entity.weaponKickUntil = now + 150;

  const aimAngle = normalizeAngle(entity.angle + aimOffset);
  const tuning = BOT_TUNING[app.botDifficulty];
  game.projectiles.push({
    type: "bullet",
    ownerId: entity.id,
    team: entity.team,
    x: entity.x + Math.cos(aimAngle) * 0.32,
    y: entity.y + Math.sin(aimAngle) * 0.32,
    prevX: entity.x,
    prevY: entity.y,
    angle: aimAngle,
    speed: weapon.projectileSpeed,
    range: weapon.range,
    traveled: 0,
    radius: weapon.radius,
    damage: entity.kind === "bot" ? tuning.damage : weapon.damage,
    headDamage: entity.kind === "bot" ? tuning.head : weapon.headDamage,
    color: entity.team === TEAM_BLUE ? "#77e7ff" : "#ff8074",
    createdAt: now,
  });
}

function useFlash(entity, now) {
  if (!entity.alive || !game.active) return;
  if (entity.flashCharges <= 0) return;
  if (entity.flashCooldownUntil > now) return;

  entity.flashCharges -= 1;
  entity.flashCooldownUntil = now + 8000;
  entity.hitMarkerUntil = now + 130;
  entity.lastDamageText = "FLASH";
  throwUtility(entity, "flash", now);
}

function useLethal(entity, now) {
  if (!entity.alive || !game.active) return;
  if (entity.lethalCharges <= 0) return;
  if (entity.lethalCooldownUntil > now) return;

  entity.lethalCharges -= 1;
  entity.lethalCooldownUntil = now + 9000;
  entity.hitMarkerUntil = now + 130;
  entity.lastDamageText = "LETHAL";
  throwUtility(entity, "lethal", now);
}

function throwUtility(entity, type, now) {
  const speed = type === "lethal" ? 5.2 : 6.2;
  game.projectiles.push({
    type,
    ownerId: entity.id,
    team: entity.team,
    x: entity.x + Math.cos(entity.angle) * 0.34,
    y: entity.y + Math.sin(entity.angle) * 0.34,
    prevX: entity.x,
    prevY: entity.y,
    angle: entity.angle,
    speed,
    range: type === "lethal" ? 5.8 : 6.6,
    traveled: 0,
    radius: 0.14,
    createdAt: now,
    detonateAt: now + (type === "lethal" ? 720 : 430),
    color: type === "lethal" ? "#ff9b45" : "#fff1a8",
  });
}

function jump(entity, now) {
  if (!entity.alive || entity.kind === "bot") return;
  if (entity.jumpHeight > 0.02) return;
  entity.jumpVelocity = JUMP_POWER;
  const controls = CONTROLS[entity.controlId];
  if (isBindingDown(controls.sprint) || entity.isSprinting) {
    entity.jumpBoostUntil = now + 520;
  }
}

function updateHuman(entity, dt, now) {
  if (!entity.alive) return;
  const controls = CONTROLS[entity.controlId];
  const flashed = entity.flashedUntil > now;
  const strafing = controls.mouseAim && (keys.has(controls.left) || keys.has(controls.right));
  const moving = keys.has(controls.forward) || keys.has(controls.back) || strafing;
  const wantsSprint = isBindingDown(controls.sprint) && moving && entity.stamina > 2;
  entity.isSprinting = wantsSprint;
  if (wantsSprint) {
    entity.stamina = clamp(entity.stamina - STAMINA_DRAIN * dt, 0, STAMINA_MAX);
  } else {
    entity.stamina = clamp(entity.stamina + STAMINA_REGEN * dt, 0, STAMINA_MAX);
  }

  entity.jumpVelocity -= GRAVITY * dt;
  entity.jumpHeight += entity.jumpVelocity * dt;
  if (entity.jumpHeight <= 0) {
    entity.jumpHeight = 0;
    entity.jumpVelocity = 0;
  }

  let moveScale = flashed ? 0.78 : 1;
  if (entity.isSprinting) moveScale *= SPRINT_MULTIPLIER;
  if (entity.jumpBoostUntil > now) moveScale *= JUMP_BOOST_MULTIPLIER;
  const turnScale = flashed ? 0.62 : 1;

  if (controls.mouseAim) {
    if (mouse.dx !== 0) {
      entity.angle = normalizeAngle(entity.angle + mouse.dx * MOUSE_SENSITIVITY * turnScale);
      mouse.dx = 0;
    }

    let mx = 0;
    let my = 0;
    if (keys.has(controls.forward)) {
      mx += Math.cos(entity.angle);
      my += Math.sin(entity.angle);
    }
    if (keys.has(controls.back)) {
      mx -= Math.cos(entity.angle);
      my -= Math.sin(entity.angle);
    }
    const strafeAngle = entity.angle + Math.PI / 2;
    if (keys.has(controls.right)) {
      mx += Math.cos(strafeAngle);
      my += Math.sin(strafeAngle);
    }
    if (keys.has(controls.left)) {
      mx -= Math.cos(strafeAngle);
      my -= Math.sin(strafeAngle);
    }
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      const step = (entity.speed * moveScale * dt) / mag;
      moveEntity(entity, mx * step, my * step);
    }
  } else {
    if (keys.has(controls.left)) entity.angle = normalizeAngle(entity.angle - entity.turnSpeed * turnScale * dt);
    if (keys.has(controls.right)) entity.angle = normalizeAngle(entity.angle + entity.turnSpeed * turnScale * dt);

    let direction = 0;
    if (keys.has(controls.forward)) direction += 1;
    if (keys.has(controls.back)) direction -= 1;
    if (direction !== 0) {
      const step = entity.speed * moveScale * dt * direction;
      moveEntity(entity, Math.cos(entity.angle) * step, Math.sin(entity.angle) * step);
    }
  }

  if (keys.has(controls.shoot) || (controls.mouseAim && mouse.down)) shoot(entity, now);
}

function tryBotMove(entity, desiredAngle, speed, dt) {
  const options = [0, 0.45, -0.45, 0.9, -0.9, 1.45, -1.45, Math.PI];
  for (const option of options) {
    const angle = normalizeAngle(desiredAngle + option);
    const dx = Math.cos(angle) * speed * dt;
    const dy = Math.sin(angle) * speed * dt;
    if (canStandAt(entity.x + dx, entity.y + dy)) {
      moveEntity(entity, dx, dy);
      entity.aiWanderAngle = angle;
      return true;
    }
  }
  return false;
}

function rotateToward(entity, desiredAngle, maxStep) {
  const diff = normalizeAngle(desiredAngle - entity.angle);
  entity.angle = normalizeAngle(entity.angle + clamp(diff, -maxStep, maxStep));
}

function updateBot(entity, dt, now) {
  if (!entity.alive) return;
  const tuning = BOT_TUNING[app.botDifficulty];

  if (entity.flashedUntil > now) {
    entity.angle = normalizeAngle(entity.angle + Math.sin(now * 0.006 + entity.x) * 0.7 * dt);
    return;
  }

  if (entity.reloadingUntil > now) return;
  if (getAmmo(entity) <= 0) {
    reload(entity, now);
    return;
  }

  const enemies = enemyEntities(entity);
  if (!enemies.length) return;

  let target = enemies[0];
  let targetDist = distance(entity.x, entity.y, target.x, target.y);
  for (const enemy of enemies.slice(1)) {
    const dist = distance(entity.x, entity.y, enemy.x, enemy.y);
    if (dist < targetDist) {
      target = enemy;
      targetDist = dist;
    }
  }

  const desired = angleTo(entity.x, entity.y, target.x, target.y);
  const seesTarget = targetDist < BOT_SIGHT_RANGE && hasLineOfSight(entity.x, entity.y, target.x, target.y);

  if (now > entity.aiNextThink) {
    entity.aiAimError = (Math.random() - 0.5) * tuning.aimError;
    entity.aiNextThink = now + tuning.reactionMin + Math.random() * tuning.reactionJitter;
  }

  if (seesTarget) {
    rotateToward(entity, desired + entity.aiAimError, entity.turnSpeed * dt);
    const diff = Math.abs(normalizeAngle(desired - entity.angle));
    if (targetDist > 4.2) {
      tryBotMove(entity, desired, entity.speed * 0.72, dt);
    } else if (targetDist < 2.2) {
      tryBotMove(entity, desired + Math.PI, entity.speed * 0.45, dt);
    }
    if (diff < 0.11 && targetDist < BOT_SIGHT_RANGE) {
      shoot(entity, now, entity.aiAimError);
    }
    return;
  }

  rotateToward(entity, desired, entity.turnSpeed * 0.72 * dt);
  tryBotMove(entity, desired, entity.speed * 0.85, dt);
}

function updateProjectiles(dt, now) {
  const nextProjectiles = [];

  for (const projectile of game.projectiles) {
    projectile.prevX = projectile.x;
    projectile.prevY = projectile.y;

    if (projectile.type === "bullet") {
      if (advanceProjectile(projectile, dt)) {
        const hit = findProjectileHit(projectile);
        if (hit) {
          const distFromCenter = distance(projectile.x, projectile.y, hit.x, hit.y);
          const isHeadshot = distFromCenter < 0.055;
          const attacker = game.entities.find((entity) => entity.id === projectile.ownerId);
          damageEntity(hit, isHeadshot ? projectile.headDamage : projectile.damage, attacker || hit, isHeadshot, now);
          game.blasts.push(makeBlast(projectile.x, projectile.y, "spark", projectile.color, now, 360, 0.52));
          continue;
        }
        if (!isWall(projectile.x, projectile.y) && projectile.traveled < projectile.range) {
          nextProjectiles.push(projectile);
          continue;
        }
      }
      game.blasts.push(makeBlast(projectile.prevX, projectile.prevY, "spark", projectile.color, now, 300, 0.42));
      continue;
    }

    advanceProjectile(projectile, dt);
    if (isWall(projectile.x, projectile.y) || projectile.traveled >= projectile.range || now >= projectile.detonateAt) {
      detonateUtility(projectile, now);
      continue;
    }
    nextProjectiles.push(projectile);
  }

  game.projectiles = nextProjectiles;
  game.blasts = game.blasts.filter((blast) => now - blast.createdAt < blast.duration);
}

function advanceProjectile(projectile, dt) {
  const step = projectile.speed * dt;
  projectile.x += Math.cos(projectile.angle) * step;
  projectile.y += Math.sin(projectile.angle) * step;
  projectile.traveled += step;
  return !isWall(projectile.x, projectile.y);
}

function findProjectileHit(projectile) {
  let hit = null;
  let hitDist = Infinity;
  for (const entity of game.entities) {
    if (!entity.alive || entity.team === projectile.team || entity.id === projectile.ownerId) continue;
    const dist = distancePointToSegment(entity.x, entity.y, projectile.prevX, projectile.prevY, projectile.x, projectile.y);
    if (dist < PLAYER_RADIUS + projectile.radius && dist < hitDist) {
      hit = entity;
      hitDist = dist;
    }
  }
  return hit;
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return distance(px, py, ax + dx * t, ay + dy * t);
}

function makeBlast(x, y, type, color, now, duration, radius) {
  return { x, y, type, color, createdAt: now, duration, radius };
}

function detonateUtility(projectile, now) {
  const blastRadius = projectile.type === "lethal" ? 1.45 : 4.6;
  const duration = projectile.type === "lethal" ? 620 : 760;
  game.blasts.push(makeBlast(projectile.x, projectile.y, projectile.type, projectile.color, now, duration, blastRadius));

  for (const target of game.entities) {
    if (!target.alive || target.team === projectile.team) continue;
    const dist = distance(projectile.x, projectile.y, target.x, target.y);
    if (dist > blastRadius) continue;
    if (!hasLineOfSight(projectile.x, projectile.y, target.x, target.y)) continue;

    const owner = game.entities.find((entity) => entity.id === projectile.ownerId) || target;
    if (projectile.type === "lethal") {
      const damage = Math.round(82 * (1 - dist / blastRadius) + 18);
      damageEntity(target, damage, owner, false, now);
    } else {
      const facing = Math.cos(normalizeAngle(angleTo(target.x, target.y, projectile.x, projectile.y) - target.angle));
      const facingFactor = 0.2 + 0.8 * clamp((facing + 1) / 2, 0, 1);
      const proximity = 1 - dist / blastRadius;
      const durationMs = Math.round((900 + proximity * 2100) * facingFactor);
      target.flashedUntil = Math.max(target.flashedUntil, now + durationMs);
      owner.hitMarkerUntil = now + 190;
      owner.lastDamageText = "FLASH";
    }
  }
}

function checkRoundState(now) {
  if (app.view !== "match") return;

  if (!game.active) {
    if (game.roundEndedAt && now - game.roundEndedAt > ROUND_PAUSE_MS) startRound();
    return;
  }

  const blueAlive = livingTeamEntities(TEAM_BLUE).length;
  const redAlive = livingTeamEntities(TEAM_RED).length;
  const timeLeft = app.roundLengthMs - (now - game.roundStartedAt);

  if (blueAlive === 0 && redAlive === 0) endRound(null, "DRAW", now);
  else if (blueAlive === 0) endRound(TEAM_RED, "RED TEAM WINS", now);
  else if (redAlive === 0) endRound(TEAM_BLUE, "BLUE TEAM WINS", now);
  else if (timeLeft <= 0) {
    const blueHp = totalTeamHp(TEAM_BLUE);
    const redHp = totalTeamHp(TEAM_RED);
    if (blueHp === redHp) endRound(null, "TIME DRAW", now);
    else if (blueHp > redHp) endRound(TEAM_BLUE, "BLUE TEAM WINS", now);
    else endRound(TEAM_RED, "RED TEAM WINS", now);
  }
}

function endRound(winner, message, now) {
  game.active = false;
  game.winner = winner;
  game.message = message;
  game.roundEndedAt = now;
  if (winner) game.scores[winner] += 1;
  app.stats.rounds += 1;
  if (winner === TEAM_BLUE) app.stats.wins += 1;
  addHistory(`Round ${game.round} ${getMap().name} ${game.mode === "singleplayer" ? "Solo" : "Local 2v2"}`, message);
}

function update(now, dt) {
  if (app.view === "match" && game.active) {
    finishReloads(now);
    for (const human of game.humans) updateHuman(human, dt, now);
    for (const entity of game.entities) {
      if (entity.kind === "bot") updateBot(entity, dt, now);
    }
    updateProjectiles(dt, now);
  }
  checkRoundState(now);
}

function shadeColor(color, amount) {
  const r = clamp(Math.round(color[0] * amount), 0, 255);
  const g = clamp(Math.round(color[1] * amount), 0, 255);
  const b = clamp(Math.round(color[2] * amount), 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function getWallMaterial(hit) {
  const row = hit.cellY ?? Math.floor(hit.y);
  const col = hit.cellX ?? Math.floor(hit.x);
  const isBoundary =
    row <= 0 ||
    col <= 0 ||
    row >= RAW_MAP.length - 1 ||
    col >= RAW_MAP[0].length - 1;

  if (isBoundary) {
    return {
      kind: "brick",
      base: [148, 86, 72],
      dark: "rgba(78, 42, 36, 0.42)",
      light: "rgba(230, 176, 145, 0.22)",
    };
  }

  const containerKey = (Math.floor(col / 4) + Math.floor(row / 3)) % 3;
  if (containerKey === 0) {
    return {
      kind: "container",
      base: [89, 113, 90],
      dark: "rgba(25, 42, 33, 0.42)",
      light: "rgba(178, 197, 161, 0.18)",
    };
  }
  if (containerKey === 1) {
    return {
      kind: "container",
      base: [72, 104, 119],
      dark: "rgba(22, 36, 46, 0.42)",
      light: "rgba(173, 200, 209, 0.18)",
    };
  }
  return {
    kind: "container",
    base: [142, 112, 76],
    dark: "rgba(62, 45, 25, 0.42)",
    light: "rgba(223, 187, 130, 0.2)",
  };
}

function drawWallMaterialDetails(material, x, top, colW, wallHeight, corrected, columnIndex) {
  if (material.kind === "brick") {
    const mortarAlpha = clamp(0.38 - corrected * 0.022, 0.08, 0.26);
    ctx.fillStyle = `rgba(52, 30, 27, ${mortarAlpha})`;
    const course = Math.max(14, Math.min(26, wallHeight * 0.075));
    for (let y = top + course; y < top + wallHeight; y += course) {
      ctx.fillRect(x, y, colW + 1.2, 1);
    }
    if (columnIndex % 8 === 0) {
      ctx.fillStyle = material.dark;
      ctx.fillRect(x, top, 1.2, wallHeight);
    }
    if (columnIndex % 17 === 0) {
      ctx.fillStyle = material.light;
      ctx.fillRect(x, top + wallHeight * 0.18, colW + 1.2, wallHeight * 0.18);
    }
    const windowBand = columnIndex % 64;
    if (windowBand > 20 && windowBand < 35 && wallHeight > 48) {
      ctx.fillStyle = `rgba(119, 153, 158, ${clamp(0.26 - corrected * 0.012, 0.08, 0.2)})`;
      ctx.fillRect(x, top + wallHeight * 0.24, colW + 1.2, wallHeight * 0.16);
      ctx.fillStyle = `rgba(34, 46, 48, ${clamp(0.34 - corrected * 0.016, 0.08, 0.24)})`;
      ctx.fillRect(x, top + wallHeight * 0.24, colW + 1.2, 1.5);
      ctx.fillRect(x, top + wallHeight * 0.4, colW + 1.2, 1.5);
    }
    return;
  }

  const ribAlpha = clamp(0.5 - corrected * 0.032, 0.08, 0.32);
  if (columnIndex % 3 === 0) {
    ctx.fillStyle = `rgba(18, 25, 24, ${ribAlpha})`;
    ctx.fillRect(x, top, 1.5, wallHeight);
  }
  if (columnIndex % 9 === 0) {
    ctx.fillStyle = material.light;
    ctx.fillRect(x, top + wallHeight * 0.1, colW + 1.2, Math.max(2, wallHeight * 0.018));
    ctx.fillRect(x, top + wallHeight * 0.86, colW + 1.2, Math.max(2, wallHeight * 0.018));
  }
  ctx.fillStyle = material.dark;
  ctx.fillRect(x, top + wallHeight * 0.76, colW + 1.2, wallHeight * 0.24);
}

function drawViewport(viewer, viewport, now) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
  ctx.clip();

  const horizon = viewport.y + viewport.h * 0.48;
  drawSkyAndFloor(viewer, viewport, horizon, now);

  const density = app.visualQuality === "high" ? 1.55 : 2.45;
  const columns = Math.max(180, Math.floor(viewport.w / density));
  const colW = viewport.w / columns;
  const zBuffer = new Array(columns);

  for (let i = 0; i < columns; i += 1) {
    const camera = i / columns - 0.5;
    const rayAngle = normalizeAngle(viewer.angle + camera * FOV);
    const hit = raycast(viewer.x, viewer.y, rayAngle);
    const corrected = Math.max(0.02, hit.dist * Math.cos(rayAngle - viewer.angle));
    zBuffer[i] = corrected;

    const wallHeight = Math.min(viewport.h * 1.9, viewport.h / (corrected * 0.78));
    const top = horizon - wallHeight * 0.53;
    const x = viewport.x + i * colW;
    const distanceShade = clamp(1.3 - corrected / MAX_VIEW_DIST, 0.46, 1.08);
    const sideShade = hit.side === 0 ? 1 : 0.86;
    const material = getWallMaterial(hit);
    const shadeAmount = material.kind === "brick"
      ? clamp(1.38 - corrected / (MAX_VIEW_DIST * 1.35), 0.64, 1.12) * sideShade
      : distanceShade * sideShade;

    ctx.fillStyle = shadeColor(material.base, shadeAmount);
    ctx.fillRect(x, top, colW + 1.2, wallHeight);
    drawWallMaterialDetails(material, x, top, colW, wallHeight, corrected, i);
  }

  drawSprites(viewer, viewport, zBuffer);
  drawWorldEffects(viewer, viewport, zBuffer, now);
  drawWeapon(viewer, viewport, now);
  drawCrosshair(viewport, viewer, now);
  drawHud(viewer, viewport, now);

  if (viewer.flashedUntil > now) {
    const remaining = viewer.flashedUntil - now;
    const alpha = clamp(remaining / 1500, 0, 0.96);
    ctx.fillStyle = `rgba(255, 252, 225, ${alpha})`;
    ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
  }

  if (!viewer.alive) {
    ctx.fillStyle = "rgba(10, 8, 6, 0.72)";
    ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
    drawCenteredText("ELIMINATED", viewport.x + viewport.w / 2, viewport.y + viewport.h * 0.48, 24, "#d9c494");
  }

  ctx.restore();

  ctx.strokeStyle = viewer.team === TEAM_BLUE ? "#64c7d4" : "#ee6b61";
  ctx.lineWidth = 2;
  ctx.strokeRect(viewport.x + 1, viewport.y + 1, viewport.w - 2, viewport.h - 2);
}

function drawSkyAndFloor(viewer, viewport, horizon, now) {
  const ceiling = ctx.createLinearGradient(0, viewport.y, 0, horizon);
  ceiling.addColorStop(0, "#6f818a");
  ceiling.addColorStop(0.52, "#a9b1b3");
  ceiling.addColorStop(1, "#d8d1bf");
  ctx.fillStyle = ceiling;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, horizon - viewport.y);

  ctx.fillStyle = "rgba(226, 214, 176, 0.28)";
  ctx.beginPath();
  ctx.arc(viewport.x + viewport.w * 0.14, viewport.y + viewport.h * 0.14, clamp(viewport.w * 0.045, 24, 44), 0, Math.PI * 2);
  ctx.fill();

  const facadeH = viewport.h * 0.2;
  const facadeY = horizon - facadeH;
  ctx.fillStyle = "rgba(134, 73, 62, 0.9)";
  ctx.fillRect(viewport.x, facadeY, viewport.w, facadeH);
  ctx.fillStyle = "rgba(72, 37, 32, 0.32)";
  for (let y = facadeY + 12; y < horizon; y += 18) {
    ctx.fillRect(viewport.x, y, viewport.w, 1.5);
  }
  const windowW = clamp(viewport.w * 0.05, 32, 54);
  const gap = clamp(viewport.w * 0.08, 52, 82);
  for (let x = viewport.x + 24; x < viewport.x + viewport.w; x += gap) {
    ctx.fillStyle = "rgba(136, 167, 171, 0.58)";
    ctx.fillRect(x, facadeY + facadeH * 0.24, windowW, facadeH * 0.32);
    ctx.fillStyle = "rgba(32, 44, 47, 0.5)";
    ctx.fillRect(x, facadeY + facadeH * 0.24, windowW, 2);
    ctx.fillRect(x + windowW * 0.48, facadeY + facadeH * 0.24, 2, facadeH * 0.32);
  }

  const floor = ctx.createLinearGradient(0, horizon, 0, viewport.y + viewport.h);
  floor.addColorStop(0, "#b8b5aa");
  floor.addColorStop(0.45, "#8c8f87");
  floor.addColorStop(1, "#5a5f5b");
  ctx.fillStyle = floor;
  ctx.fillRect(viewport.x, horizon, viewport.w, viewport.y + viewport.h - horizon);

  ctx.save();
  ctx.globalAlpha = 0.38;
  const stride = app.visualQuality === "high" ? 14 : 24;
  for (let y = horizon + 8; y < viewport.y + viewport.h; y += stride) {
    const depth = (y - horizon) / (viewport.h - horizon + viewport.y);
    const lineY = y + depth * depth * 22;
    ctx.strokeStyle = `rgba(52, 55, 53, ${clamp(0.34 - depth * 0.17, 0.06, 0.25)})`;
    ctx.beginPath();
    ctx.moveTo(viewport.x, lineY);
    ctx.lineTo(viewport.x + viewport.w, lineY);
    ctx.stroke();
  }

  const vanishingX = viewport.x + viewport.w * (0.5 - Math.sin(viewer.angle) * 0.12);
  for (let i = -5; i <= 5; i += 1) {
    const startX = viewport.x + viewport.w * (i + 5) / 10;
    ctx.strokeStyle = "rgba(42, 45, 43, 0.25)";
    ctx.beginPath();
    ctx.moveTo(startX, viewport.y + viewport.h);
    ctx.lineTo(vanishingX, horizon + 4);
    ctx.stroke();
  }
  ctx.restore();

  const pulse = 0.15 + Math.sin(now * 0.002) * 0.04;
  ctx.fillStyle = `rgba(255, 232, 160, ${pulse + 0.12})`;
  ctx.fillRect(viewport.x, horizon - 2, viewport.w, 3);
}

function entityVisibilitySamples(viewer, entity) {
  const sideAngle = angleTo(viewer.x, viewer.y, entity.x, entity.y) + Math.PI / 2;
  const sx = Math.cos(sideAngle) * ENTITY_VISIBILITY_SAMPLE_RADIUS;
  const sy = Math.sin(sideAngle) * ENTITY_VISIBILITY_SAMPLE_RADIUS;
  return [
    { id: "center", x: entity.x, y: entity.y },
    { id: "edgeA", x: entity.x - sx, y: entity.y - sy },
    { id: "edgeB", x: entity.x + sx, y: entity.y + sy },
  ];
}

function getEntityVisibility(viewer, entity) {
  const samples = entityVisibilitySamples(viewer, entity).map((point) => ({
    ...point,
    visible: hasLineOfSight(viewer.x, viewer.y, point.x, point.y),
    rel: normalizeAngle(angleTo(viewer.x, viewer.y, point.x, point.y) - viewer.angle),
  }));
  const visibleSamples = samples.filter((point) => point.visible);
  return {
    visible: visibleSamples.length > 0,
    centerVisible: Boolean(samples.find((point) => point.id === "center")?.visible),
    visibleSamples,
  };
}

function getSpriteVisibilityClip(viewport, zBuffer, left, right, dist) {
  const columnW = viewport.w / zBuffer.length;
  const start = clamp(Math.floor((left - viewport.x) / columnW), 0, zBuffer.length - 1);
  const end = clamp(Math.ceil((right - viewport.x) / columnW), 0, zBuffer.length - 1);
  let visibleLeft = Infinity;
  let visibleRight = -Infinity;

  for (let column = start; column <= end; column += 1) {
    if (dist > zBuffer[column] + ENTITY_CORNER_OCCLUSION_MARGIN) continue;
    const x = viewport.x + column * columnW;
    visibleLeft = Math.min(visibleLeft, x);
    visibleRight = Math.max(visibleRight, x + columnW);
  }

  if (!Number.isFinite(visibleLeft)) return null;

  const clippedLeft = clamp(visibleLeft, viewport.x, viewport.x + viewport.w);
  const clippedRight = clamp(visibleRight, viewport.x, viewport.x + viewport.w);
  const width = clippedRight - clippedLeft;
  if (width < Math.max(6, (right - left) * 0.08)) return null;
  return { x: clippedLeft, w: width };
}

function intersectSpriteClip(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  if (right <= left) return null;
  return { x: left, w: right - left };
}

function getCornerPeekClip(viewport, visibility, bodyW) {
  if (visibility.centerVisible) return { x: viewport.x, w: viewport.w };
  const xs = visibility.visibleSamples.map((point) => {
    const projected = Math.tan(point.rel) / Math.tan(FOV / 2);
    return viewport.x + viewport.w * (0.5 + projected * 0.5);
  });
  if (!xs.length) return null;
  const pad = Math.max(5, bodyW * 0.22);
  const left = clamp(Math.min(...xs) - pad, viewport.x, viewport.x + viewport.w);
  const right = clamp(Math.max(...xs) + pad, viewport.x, viewport.x + viewport.w);
  if (right <= left) return null;
  return { x: left, w: right - left };
}

function drawSprites(viewer, viewport, zBuffer) {
  const visible = game.entities
    .filter((entity) => entity !== viewer && entity.alive)
    .map((entity) => {
      const dist = distance(viewer.x, viewer.y, entity.x, entity.y);
      const rel = normalizeAngle(angleTo(viewer.x, viewer.y, entity.x, entity.y) - viewer.angle);
      const visibility = getEntityVisibility(viewer, entity);
      return { entity, dist, rel, visibility };
    })
    .filter((item) => Math.abs(item.rel) < ENTITY_FOV_LIMIT && item.dist < ENTITY_VIEW_DIST)
    .filter((item) => item.visibility.visible)
    .sort((a, b) => b.dist - a.dist);

  for (const item of visible) {
    const projected = Math.tan(item.rel) / Math.tan(FOV / 2);
    const sx = viewport.x + viewport.w * (0.5 + projected * 0.5);
    const depth = Math.max(0.02, item.dist * Math.cos(item.rel));
    const size = clamp(viewport.h / (depth * 1.02), 22, viewport.h * 0.78);
    const bodyW = size * 0.36;
    const bodyH = size * 0.68;
    const footY = viewport.y + viewport.h * 0.57 + size * 0.5;
    const bodyX = sx - bodyW / 2;
    const bodyY = footY - bodyH;
    const spriteLeft = bodyX - bodyW * 0.2;
    const spriteRight = bodyX + bodyW * 1.45;
    const depthClip = getSpriteVisibilityClip(viewport, zBuffer, spriteLeft, spriteRight, depth);
    if (!depthClip) continue;
    const peekClip = getCornerPeekClip(viewport, item.visibility, bodyW);
    if (!peekClip) continue;
    const visibilityClip = intersectSpriteClip(depthClip, peekClip);
    if (!visibilityClip) continue;

    const teamColor = item.entity.team === TEAM_BLUE ? "#55c8d4" : "#ee6b61";
    const vestColor = item.entity.team === TEAM_BLUE ? "#2b6570" : "#7e312c";
    const isFriendly = item.entity.team === viewer.team;

    ctx.save();
    ctx.beginPath();
    ctx.rect(visibilityClip.x, viewport.y, visibilityClip.w, viewport.h);
    ctx.clip();

    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(sx, footY + size * 0.035, bodyW * 0.78, size * 0.082, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
    bodyGradient.addColorStop(0, shadeCss(vestColor, 0.62));
    bodyGradient.addColorStop(0.55, vestColor);
    bodyGradient.addColorStop(1, shadeCss(vestColor, 1.28));
    ctx.fillStyle = bodyGradient;
    roundRect(bodyX, bodyY, bodyW, bodyH, 4);
    ctx.fill();

    ctx.fillStyle = teamColor;
    ctx.fillRect(bodyX + bodyW * 0.14, bodyY + bodyH * 0.08, bodyW * 0.72, bodyH * 0.24);
    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    ctx.fillRect(bodyX + bodyW * 0.54, bodyY + bodyH * 0.12, bodyW * 0.09, bodyH * 0.76);

    ctx.fillStyle = "#d0b58a";
    ctx.beginPath();
    ctx.arc(sx, bodyY - size * 0.08, size * 0.118, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(17, 20, 23, 0.78)";
    ctx.fillRect(sx - size * 0.11, bodyY - size * 0.13, size * 0.22, size * 0.045);

    ctx.fillStyle = "#202226";
    ctx.fillRect(bodyX + bodyW * 0.78, bodyY + bodyH * 0.45, bodyW * 0.58, Math.max(3, size * 0.035));

    ctx.strokeStyle = isFriendly ? "rgba(235, 226, 185, 0.74)" : "rgba(34, 20, 14, 0.78)";
    ctx.lineWidth = Math.max(1.5, size * 0.018);
    ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);

    const tagY = bodyY - size * 0.28;
    ctx.font = `${clamp(size * 0.09, 8, 13)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isFriendly ? "#e5d9a9" : "#f1b0a6";
    ctx.fillText(item.entity.name, sx, tagY);

    ctx.restore();
  }
}

function projectWorldPoint(viewer, viewport, zBuffer, x, y, height = 0.36) {
  const dist = distance(viewer.x, viewer.y, x, y);
  if (dist < 0.08 || dist > MAX_VIEW_DIST) return null;
  const rel = normalizeAngle(angleTo(viewer.x, viewer.y, x, y) - viewer.angle);
  if (Math.abs(rel) > FOV * 0.7) return null;
  const depth = Math.max(0.02, dist * Math.cos(rel));
  const projected = Math.tan(rel) / Math.tan(FOV / 2);
  const sx = viewport.x + viewport.w * (0.5 + projected * 0.5);
  const column = clamp(Math.floor((sx - viewport.x) / (viewport.w / zBuffer.length)), 0, zBuffer.length - 1);
  if (depth > zBuffer[column] + 0.35) return null;
  const horizon = viewport.y + viewport.h * 0.48;
  const size = viewport.h / (depth * 1.05);
  const sy = horizon + viewport.h * 0.12 - height * size + viewer.jumpHeight * 20;
  return { x: sx, y: sy, dist, depth, size };
}

function drawWorldEffects(viewer, viewport, zBuffer, now) {
  for (const projectile of game.projectiles) {
    if (projectile.type === "bullet") {
      const trailLen = Math.min(0.95, projectile.traveled);
      const tailX = projectile.x - Math.cos(projectile.angle) * trailLen;
      const tailY = projectile.y - Math.sin(projectile.angle) * trailLen;
      const a = projectWorldPoint(viewer, viewport, zBuffer, tailX, tailY, 0.38);
      const b = projectWorldPoint(viewer, viewport, zBuffer, projectile.x, projectile.y, 0.38);
      if (!b) continue;
      const tail = a || b;
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = projectile.color;
      ctx.strokeStyle = projectile.color;
      ctx.shadowBlur = 24;
      ctx.lineWidth = clamp(34 / Math.max(1, b.dist), 4, 12);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 245, 0.95)";
      ctx.shadowBlur = 12;
      ctx.lineWidth = clamp(14 / Math.max(1, b.dist), 1.8, 5);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#fffef2";
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(b.x, b.y, clamp(15 / Math.max(1, b.dist), 2.4, 7), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    const point = projectWorldPoint(viewer, viewport, zBuffer, projectile.x, projectile.y, 0.44);
    if (!point) continue;
    const r = clamp(point.size * 0.045, 4, 13);
    ctx.save();
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const blast of game.blasts) {
    const point = projectWorldPoint(viewer, viewport, zBuffer, blast.x, blast.y, 0.22);
    if (!point) continue;
    const t = clamp((now - blast.createdAt) / blast.duration, 0, 1);
    const radius = clamp(point.size * blast.radius * (0.18 + t * 0.42), 8, 170);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = blast.color;
    ctx.fillStyle = blast.type === "flash" ? "rgba(255, 246, 186, 0.18)" : "rgba(255, 118, 62, 0.18)";
    ctx.shadowColor = blast.color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = blast.type === "spark" ? 3 : 5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (blast.type === "spark") {
      ctx.fillStyle = "#fff7e6";
      ctx.beginPath();
      ctx.arc(point.x, point.y, clamp(radius * 0.42, 2, 26), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function shadeCss(hex, amount) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return shadeColor([r, g, b], amount);
}

function drawAk47Viewmodel(skin, weapon, now, muzzleFlashUntil) {
  const metal = ctx.createLinearGradient(-72, 0, 340, 0);
  metal.addColorStop(0, "#15181b");
  metal.addColorStop(0.32, "#30363b");
  metal.addColorStop(0.62, "#1c2024");
  metal.addColorStop(1, "#080a0c");

  const wood = ctx.createLinearGradient(-70, 18, 190, 90);
  wood.addColorStop(0, "#7b3519");
  wood.addColorStop(0.38, "#d06a28");
  wood.addColorStop(0.72, "#9a431f");
  wood.addColorStop(1, "#4f2111");

  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath();
  ctx.ellipse(115, 92, 186, 26, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(-112, 23);
  ctx.lineTo(-42, 9);
  ctx.lineTo(31, 25);
  ctx.lineTo(19, 59);
  ctx.lineTo(-69, 80);
  ctx.lineTo(-123, 59);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(225, 205, 176, 0.75)";
  ctx.beginPath();
  ctx.moveTo(-124, 49);
  ctx.lineTo(-109, 24);
  ctx.lineTo(-97, 28);
  ctx.lineTo(-112, 64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 210, 128, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-92, 40);
  ctx.quadraticCurveTo(-42, 22, 18, 34);
  ctx.moveTo(-78, 58);
  ctx.quadraticCurveTo(-30, 43, 14, 47);
  ctx.moveTo(-102, 53);
  ctx.quadraticCurveTo(-68, 64, -22, 55);
  ctx.stroke();

  ctx.fillStyle = "#111417";
  roundRect(14, 8, 122, 38, 4);
  ctx.fill();
  ctx.fillStyle = metal;
  roundRect(22, 1, 118, 32, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.stroke();

  ctx.fillStyle = "#0b0d0f";
  roundRect(44, -8, 78, 11, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(62, 8, 42, 3);
  ctx.fillStyle = "#090b0d";
  ctx.beginPath();
  ctx.moveTo(112, 11);
  ctx.lineTo(134, 15);
  ctx.lineTo(130, 20);
  ctx.lineTo(108, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = skin.accent;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(34, 32, 80, 5);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#b9c0c3";
  for (const [rx, ry] of [[34, 13], [52, 24], [96, 12], [118, 24]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(224, 233, 236, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(132, 7);
  ctx.quadraticCurveTo(154, 20, 139, 43);
  ctx.stroke();

  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(124, 22);
  ctx.lineTo(208, 14);
  ctx.lineTo(228, 34);
  ctx.lineTo(207, 60);
  ctx.lineTo(124, 55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 214, 151, 0.18)";
  ctx.beginPath();
  ctx.moveTo(137, 33);
  ctx.lineTo(208, 27);
  ctx.moveTo(137, 45);
  ctx.lineTo(203, 47);
  ctx.moveTo(150, 24);
  ctx.quadraticCurveTo(180, 34, 215, 30);
  ctx.stroke();

  ctx.fillStyle = "#101317";
  ctx.fillRect(132, 10, 172, 8);
  ctx.fillStyle = "#22282d";
  ctx.fillRect(146, 0, 150, 7);
  ctx.fillStyle = "#3a4147";
  ctx.fillRect(160, -8, 94, 6);
  ctx.fillStyle = "#0c0e10";
  ctx.fillRect(166, -13, 16, 6);
  ctx.fillRect(242, -13, 16, 6);
  ctx.fillStyle = "#090b0d";
  ctx.fillRect(293, 6, 34, 14);
  ctx.fillRect(326, 9, 22, 8);
  ctx.strokeStyle = "#13171a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(322, -1);
  ctx.lineTo(336, -16);
  ctx.lineTo(349, -12);
  ctx.stroke();
  ctx.fillStyle = "#c4ccd0";
  ctx.fillRect(340, 6, 15, 16);

  ctx.fillStyle = "#171b1f";
  ctx.beginPath();
  ctx.moveTo(270, -8);
  ctx.lineTo(286, -8);
  ctx.lineTo(291, 25);
  ctx.lineTo(281, 25);
  ctx.lineTo(279, 4);
  ctx.lineTo(270, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0e1012";
  ctx.beginPath();
  ctx.moveTo(35, 44);
  ctx.lineTo(66, 49);
  ctx.lineTo(52, 112);
  ctx.quadraticCurveTo(31, 110, 16, 98);
  ctx.lineTo(25, 55);
  ctx.closePath();
  ctx.fill();

  const magazine = ctx.createLinearGradient(68, 40, 126, 124);
  magazine.addColorStop(0, "#3a525e");
  magazine.addColorStop(0.44, "#15212a");
  magazine.addColorStop(1, "#0a0c0e");
  ctx.fillStyle = magazine;
  ctx.beginPath();
  ctx.moveTo(69, 39);
  ctx.quadraticCurveTo(111, 49, 134, 84);
  ctx.quadraticCurveTo(123, 119, 88, 139);
  ctx.quadraticCurveTo(80, 88, 53, 47);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
  ctx.fillRect(76, 59, 24, 3);
  ctx.fillRect(82, 78, 27, 3);
  ctx.fillRect(88, 97, 22, 3);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(68, 44);
  ctx.quadraticCurveTo(102, 65, 119, 110);
  ctx.stroke();

  ctx.strokeStyle = "#0a0c0e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(62, 54, 18, 0.14, Math.PI * 0.82);
  ctx.stroke();
  ctx.fillStyle = "#090b0d";
  ctx.fillRect(72, 49, 13, 6);

  if (muzzleFlashUntil > now) {
    ctx.save();
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = 28;
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(388, 14, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7da";
    ctx.beginPath();
    ctx.moveTo(346, 14);
    ctx.lineTo(470, -24);
    ctx.lineTo(404, 14);
    ctx.lineTo(470, 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(388, 14, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255, 244, 220, 0.72)";
  ctx.fillText(weapon.short, 38, -14);
}

// Paints a skin's motif across a bounding box. Expected to run inside an
// active clip (the gun frame) so the pattern only shows on the weapon body.
// Placement is deterministic so the motif holds still frame to frame.
function drawSkinPattern(pattern, x0, y0, x1, y1) {
  if (!pattern) return;
  const cols = pattern.colors;
  const h = y1 - y0;
  ctx.save();
  switch (pattern.type) {
    case "stripes": {
      ctx.fillStyle = cols[0];
      ctx.globalAlpha = 0.9;
      for (let x = x0 - h; x < x1; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x + 6, y0);
        ctx.lineTo(x + 6 - h, y1);
        ctx.lineTo(x - h, y1);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "lattice": {
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = cols[0];
      for (let x = x0 - h; x < x1; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x + h, y1);
        ctx.stroke();
      }
      ctx.strokeStyle = cols[1] || cols[0];
      for (let x = x0; x < x1 + h; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x - h, y1);
        ctx.stroke();
      }
      break;
    }
    case "studs": {
      for (let gy = y0; gy < y1; gy += 12) {
        for (let gx = x0; gx < x1; gx += 12) {
          ctx.fillStyle = cols[0];
          ctx.beginPath();
          ctx.arc(gx, gy, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = cols[1] || cols[0];
          ctx.beginPath();
          ctx.arc(gx + 0.7, gy + 0.7, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    default: {
      // Scattered motifs: dots, leaves, graffiti.
      const step = pattern.type === "graffiti" ? 24 : 15;
      let i = 0;
      for (let gy = y0; gy < y1; gy += step) {
        for (let gx = x0; gx < x1; gx += step) {
          const px = gx + step / 2 + Math.sin(i * 12.9898) * step * 0.3;
          const py = gy + step / 2 + Math.cos(i * 4.1414) * step * 0.3;
          ctx.fillStyle = cols[i % cols.length];
          if (pattern.type === "graffiti") {
            ctx.globalAlpha = 0.78;
            ctx.beginPath();
            ctx.ellipse(px, py, step * 0.42, step * 0.3, i, 0, Math.PI * 2);
            ctx.fill();
          } else if (pattern.type === "leaves") {
            ctx.beginPath();
            ctx.ellipse(px, py, 6, 3.2, i * 0.7, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          i++;
        }
      }
    }
  }
  ctx.restore();
}

function drawCenteredRifleViewmodel(skin, weapon, now, muzzleFlashUntil) {
  const metal = ctx.createLinearGradient(-46, -150, 46, 34);
  metal.addColorStop(0, "#3b4248");
  metal.addColorStop(0.45, "#15191d");
  metal.addColorStop(1, "#07090b");

  const wood = ctx.createLinearGradient(-96, -74, 96, 26);
  wood.addColorStop(0, "#6a2f18");
  wood.addColorStop(0.46, "#c06028");
  wood.addColorStop(1, "#5a2815");

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 28, 158, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(198, 150, 108, 0.92)";
  ctx.beginPath();
  ctx.ellipse(-82, 12, 42, 20, -0.42, 0, Math.PI * 2);
  ctx.ellipse(82, 12, 42, 20, 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(-92, -52);
  ctx.lineTo(-34, -74);
  ctx.lineTo(-24, 8);
  ctx.lineTo(-78, 30);
  ctx.closePath();
  ctx.moveTo(92, -52);
  ctx.lineTo(34, -74);
  ctx.lineTo(24, 8);
  ctx.lineTo(78, 30);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 214, 151, 0.18)";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 42, -58);
    ctx.lineTo(side * 78, -42);
    ctx.moveTo(side * 36, -30);
    ctx.lineTo(side * 66, -14);
    ctx.stroke();
  }

  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.moveTo(-36, 36);
  ctx.lineTo(-25, -112);
  ctx.lineTo(-13, -152);
  ctx.lineTo(13, -152);
  ctx.lineTo(25, -112);
  ctx.lineTo(36, 36);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 234, 214, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = skin.accent;
  ctx.globalAlpha = 0.84;
  ctx.fillRect(-22, -74, 44, 8);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#090b0d";
  roundRect(-14, -198, 28, 102, 5);
  ctx.fill();
  ctx.fillStyle = "#252b30";
  roundRect(-7, -202, 14, 118, 5);
  ctx.fill();
  ctx.fillStyle = "#050607";
  roundRect(-21, -207, 42, 16, 5);
  ctx.fill();

  ctx.strokeStyle = "#0a0c0e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-33, -122);
  ctx.lineTo(-12, -140);
  ctx.moveTo(33, -122);
  ctx.lineTo(12, -140);
  ctx.stroke();

  ctx.fillStyle = "#161a1e";
  ctx.beginPath();
  ctx.moveTo(-28, 18);
  ctx.lineTo(28, 18);
  ctx.lineTo(18, 118);
  ctx.lineTo(-18, 118);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 244, 220, 0.72)";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(weapon.short, 0, -44);

  if (muzzleFlashUntil > now) {
    ctx.save();
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = 34;
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(0, -214, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7da";
    ctx.beginPath();
    ctx.moveTo(0, -252);
    ctx.lineTo(16, -218);
    ctx.lineTo(46, -214);
    ctx.lineTo(16, -204);
    ctx.lineTo(0, -170);
    ctx.lineTo(-16, -204);
    ctx.lineTo(-46, -214);
    ctx.lineTo(-16, -218);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCenteredPistolViewmodel(skin, weapon, now, muzzleFlashUntil) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 50, 96, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGradient = ctx.createLinearGradient(-34, -138, 34, 32);
  bodyGradient.addColorStop(0, shadeCss(skin.main, 1.18));
  bodyGradient.addColorStop(0.48, skin.main);
  bodyGradient.addColorStop(1, shadeCss(skin.main, 0.55));

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(-30, 28);
  ctx.lineTo(-22, -88);
  ctx.lineTo(-12, -136);
  ctx.lineTo(12, -136);
  ctx.lineTo(22, -88);
  ctx.lineTo(30, 28);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  drawSkinPattern(skin.pattern, -30, -136, 30, 30);
  ctx.restore();

  ctx.fillStyle = skin.grip;
  ctx.beginPath();
  ctx.moveTo(-24, 16);
  ctx.lineTo(24, 16);
  ctx.lineTo(34, 96);
  ctx.lineTo(-34, 96);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0b0d0f";
  roundRect(-11, -166, 22, 64, 4);
  ctx.fill();
  ctx.fillStyle = skin.accent;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(-18, -58, 36, 7);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255, 244, 220, 0.38)";
  ctx.lineWidth = 2;
  roundRect(-22, -96, 44, 16, 4);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 244, 220, 0.72)";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(weapon.short, 0, -26);

  if (muzzleFlashUntil > now) {
    ctx.save();
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = 26;
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(0, -174, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7da";
    ctx.beginPath();
    ctx.moveTo(0, -208);
    ctx.lineTo(18, -176);
    ctx.lineTo(0, -150);
    ctx.lineTo(-18, -176);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawWeapon(viewer, viewport, now) {
  if (!viewer.alive) return;
  const skin = getSkin(viewer.skinId);
  const weapon = getWeapon(viewer);
  const isPistol = viewer.activeWeapon === "pistol";
  const kick = viewer.weaponKickUntil > now ? 1 : 0;
  const scale = clamp(viewport.w / 720, 0.7, 1.18) * (isPistol ? 0.72 : 0.78);
  const baseX = viewport.x + viewport.w * 0.5;
  const baseY = viewport.y + viewport.h * (isPistol ? 0.84 : 0.86) + viewport.h * kick * 0.018 + viewer.jumpHeight * 8;

  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.scale(scale, scale);

  if (!isPistol) {
    drawCenteredRifleViewmodel(skin, weapon, now, viewer.muzzleFlashUntil);
    ctx.restore();
    return;
  }

  drawCenteredPistolViewmodel(skin, weapon, now, viewer.muzzleFlashUntil);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCrosshair(viewport, viewer, now) {
  const cx = viewport.x + viewport.w / 2;
  const cy = viewport.y + viewport.h / 2;
  const hit = viewer.hitMarkerUntil > now;
  ctx.save();
  ctx.strokeStyle = hit ? "#f2d16b" : "rgba(246, 239, 206, 0.86)";
  ctx.lineWidth = hit ? 2.4 : 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.moveTo(cx + 5, cy);
  ctx.lineTo(cx + 15, cy);
  ctx.moveTo(cx, cy - 15);
  ctx.lineTo(cx, cy - 5);
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy + 15);
  ctx.stroke();
  ctx.fillStyle = hit ? "#f2d16b" : "rgba(246, 239, 206, 0.9)";
  ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);

  if (hit && viewer.lastDamageText) {
    drawCenteredText(viewer.lastDamageText, cx, cy + 34, 13, "#f2d16b");
  }
  ctx.restore();
}

function drawHud(viewer, viewport, now) {
  const pad = 12;
  const panelW = Math.min(282, viewport.w - pad * 2);
  const panelH = 96;
  const panelX = viewport.x + pad;
  const panelY = viewport.y + 68;

  ctx.fillStyle = "rgba(34, 45, 49, 0.78)";
  roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 246, 218, 0.36)";
  ctx.stroke();

  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = viewer.team === TEAM_BLUE ? "#9bd5ed" : "#f0aaa0";
  ctx.fillText(viewer.name, panelX + 10, panelY + 8);

  drawBar(panelX + 10, panelY + 35, 88, 9, viewer.hp / 100, "#862e2b", "#78b268");
  drawBar(panelX + 10, panelY + 58, 88, 8, viewer.stamina / STAMINA_MAX, "#4f4324", "#e0b35d");

  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#e4d7ad";
  const weapon = getWeapon(viewer);
  const ammo = viewer.reloadingUntil > now ? "RLD" : `${getAmmo(viewer)}/${weapon.maxAmmo}`;
  ctx.fillText(`HP ${Math.round(viewer.hp)}`, panelX + 108, panelY + 30);
  ctx.fillText(`${weapon.short} ${ammo}`, panelX + 162, panelY + 30);
  ctx.fillText(`STA ${Math.round(viewer.stamina)}`, panelX + 108, panelY + 53);

  const flashLabel = viewer.flashCharges > 0 ? "FLS 1" : "FLS 0";
  const lethalLabel = viewer.lethalCharges > 0 ? "LTH 1" : "LTH 0";
  ctx.fillStyle = viewer.lethalCharges > 0 ? "#ff9b45" : "#867a5b";
  ctx.fillText(lethalLabel, panelX + 108, panelY + 10);
  ctx.fillStyle = viewer.flashCharges > 0 ? "#f2d16b" : "#867a5b";
  ctx.fillText(flashLabel, panelX + 168, panelY + 10);

  if (viewer.isSprinting) {
    ctx.fillStyle = "#e0b35d";
    ctx.fillText("RUN", panelX + 220, panelY + 53);
  } else if (viewer.jumpHeight > 0) {
    ctx.fillStyle = "#9bd5ed";
    ctx.fillText("AIR", panelX + 220, panelY + 53);
  }

  if (viewer.hurtUntil > now) {
    ctx.fillStyle = "rgba(190, 60, 48, 0.22)";
    ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
  }
}

function drawBar(x, y, w, h, value, empty, fill) {
  ctx.fillStyle = empty;
  roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w * clamp(value, 0, 1), h);
  ctx.clip();
  ctx.fillStyle = fill;
  roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.restore();
}

function drawCenteredText(text, x, y, size, color) {
  ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawTopHud(now) {
  const w = Math.min(500, screen.w - 112);
  const h = 46;
  const x = screen.w / 2 - w / 2;
  const y = 12;
  const timeLeft = game.active ? Math.max(0, app.roundLengthMs - (now - game.roundStartedAt)) : 0;
  const seconds = Math.ceil(timeLeft / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  ctx.fillStyle = "rgba(10, 12, 14, 0.78)";
  roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(217, 196, 148, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "800 16px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e5d9a9";
  ctx.fillText(`${mm}:${ss}`, screen.w / 2, y + h / 2);

  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#9bd5ed";
  ctx.fillText(`BLUE ${game.scores[TEAM_BLUE]}`, x + 18, y + h / 2);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f0aaa0";
  ctx.fillText(`RED ${game.scores[TEAM_RED]}`, x + w - 18, y + h / 2);

  ctx.textAlign = "center";
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#a9996f";
  ctx.fillText(`ROUND ${game.round}`, screen.w / 2, y + h - 9);
}

function drawMiniMap() {
  const scale = clamp(Math.min(screen.w, screen.h) / 116, 4, 6);
  const mapW = RAW_MAP[0].length * scale;
  const mapH = RAW_MAP.length * scale;
  const x = 18;
  const y = screen.h - mapH - 18;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(255, 247, 219, 0.8)";
  roundRect(x - 7, y - 7, mapW + 14, mapH + 14, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(51, 74, 71, 0.55)";
  ctx.stroke();

  for (let row = 0; row < RAW_MAP.length; row += 1) {
    for (let col = 0; col < RAW_MAP[row].length; col += 1) {
      ctx.fillStyle = RAW_MAP[row][col] === "#" ? "#c5ac7d" : "#81b98a";
      ctx.fillRect(x + col * scale, y + row * scale, scale - 0.5, scale - 0.5);
    }
  }

  for (const entity of game.entities) {
    if (!entity.alive) continue;
    ctx.fillStyle = entity.team === TEAM_BLUE ? "#71c4e8" : "#ea7c6f";
    ctx.beginPath();
    ctx.arc(x + entity.x * scale, y + entity.y * scale, entity.kind === "human" ? 3.4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoundOverlay(now) {
  if (game.active) return;
  const timeSinceEnd = now - game.roundEndedAt;
  const nextIn = Math.max(0, Math.ceil((ROUND_PAUSE_MS - timeSinceEnd) / 1000));
  ctx.fillStyle = "rgba(8, 7, 5, 0.58)";
  ctx.fillRect(0, 0, screen.w, screen.h);

  const color = game.winner === TEAM_BLUE ? "#9bd5ed" : game.winner === TEAM_RED ? "#f0aaa0" : "#e5d9a9";
  drawCenteredText(game.message || "READY", screen.w / 2, screen.h * 0.44, clamp(screen.w / 26, 28, 48), color);
  drawCenteredText(`NEXT ROUND ${nextIn}`, screen.w / 2, screen.h * 0.52, 18, "#e5d9a9");
}

function draw(now) {
  if (app.view !== "match") return;
  ctx.clearRect(0, 0, screen.w, screen.h);

  if (game.humans.length === 1) {
    drawViewport(game.humans[0], { x: 0, y: 0, w: screen.w, h: screen.h }, now);
  } else if (game.humans.length === 2) {
    const gap = 8;
    const halfW = (screen.w - gap) / 2;
    const viewports = [
      { x: 0, y: 0, w: halfW, h: screen.h },
      { x: halfW + gap, y: 0, w: halfW, h: screen.h },
    ];
    drawViewport(game.humans[0], viewports[0], now);
    drawViewport(game.humans[1], viewports[1], now);
    ctx.fillStyle = "#0b0c0a";
    ctx.fillRect(halfW, 0, gap, screen.h);
  } else {
    ctx.fillStyle = "#10110f";
    ctx.fillRect(0, 0, screen.w, screen.h);
  }

  drawTopHud(now);
  drawMiniMap();
  drawRoundOverlay(now);
}

function wireUi() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.screen));
  });
  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.goto));
  });
  document.querySelectorAll('[data-action="quick-play"]').forEach((button) => {
    button.addEventListener("click", quickPlay);
  });
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.mode));
  });
  document.querySelectorAll(".map-card").forEach((button) => {
    button.addEventListener("click", () => selectMap(button.dataset.map));
  });
  document.querySelectorAll(".agent-card").forEach((button) => {
    button.addEventListener("click", () => selectAgent(button.dataset.agent));
  });
  document.querySelectorAll(".weapon-card").forEach((button) => {
    button.addEventListener("click", () => selectPrimary(button.dataset.weapon));
  });
  document.querySelectorAll(".contract-card").forEach((button) => {
    button.addEventListener("click", () => selectContract(button.dataset.contract));
  });
  callsignInput.addEventListener("input", syncIdentityFromInputs);
  squadMottoInput.addEventListener("input", syncIdentityFromInputs);
  seasonToneSelect.addEventListener("change", syncIdentityFromInputs);
  startMatchButton.addEventListener("click", () => startMatch(app.selectedMode));
  exitMatchButton.addEventListener("click", showClient);
  roundLengthSelect.addEventListener("change", () => {
    app.roundLengthMs = Number(roundLengthSelect.value);
    updateClientSummary();
  });
  botDifficultySelect.addEventListener("change", () => {
    app.botDifficulty = botDifficultySelect.value;
  });
  visualQualitySelect.addEventListener("change", () => {
    app.visualQuality = visualQualitySelect.value;
  });
}

window.AngleRoom = {
  snapshot() {
    return {
      view: app.view,
      page: app.page,
      selectedMode: app.selectedMode,
      selectedMap: app.selectedMap,
      selectedAgent: app.selectedAgent,
      selectedPrimary: app.selectedPrimary,
      selectedContract: app.selectedContract,
      selectedSkin: app.selectedSkin,
      callsign: getCallsign(),
      round: game.round,
      active: game.active,
      message: game.message,
      scores: { ...game.scores },
      entities: game.entities.map((entity) => ({
        id: entity.id,
        team: entity.team,
        kind: entity.kind,
        x: Number(entity.x.toFixed(3)),
        y: Number(entity.y.toFixed(3)),
        angle: Number(entity.angle.toFixed(3)),
        hp: Math.round(entity.hp),
        weapon: entity.activeWeapon,
        ammo: getAmmo(entity),
        stamina: Math.round(entity.stamina),
        alive: entity.alive,
        flashed: entity.flashedUntil > performance.now(),
      })),
      projectiles: game.projectiles.length,
      blasts: game.blasts.length,
    };
  },
  startMatch,
  showClient,
};

function loop(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  update(now, dt);
  // Discard any mouse delta updateHuman didn't consume (player dead, round
  // paused) so the camera doesn't snap when control resumes.
  mouse.dx = 0;
  draw(now);
  requestAnimationFrame(loop);
}

wireUi();
renderSkins();
selectMode(app.selectedMode);
selectMap(app.selectedMap);
selectAgent(app.selectedAgent);
selectPrimary(app.selectedPrimary);
selectContract(app.selectedContract);
syncIdentityFromInputs();
updateStatsUi();
setView("loading");
startLoading();
requestAnimationFrame(loop);
