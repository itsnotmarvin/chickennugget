// Angle Protocol — client shell. Lobby flow, customization, progression, and
// online matchmaking/private-room wiring.

import {
  WEAPONS, AGENTS, SKINS, CROSSHAIR_COLORS, TITLES, CONTRACTS, MODES, MAP_INFO,
  BOT_TUNING, XP_RULES, rankForLevel,
} from "./data.js";
import {
  state, save, resetProgress, levelInfo, rankName, titleName, contractTier,
  isUnlocked, unlockRuleLabel, unlockSnapshot, diffUnlocks, recordMatch,
} from "./state.js";
import { REGION_ENDPOINTS } from "./config.js";
import { sfx, unlockAudio, applyVolume } from "./audio.js";
import { startMatch, startOnlineMatch, isMatchActive } from "./engine.js";
import * as net from "./net.js";

const $ = (id) => document.getElementById(id);

const CONSENT_KEY = "angleConsent_v1";
const DEFAULT_CALLSIGN = "Aegis";
const DEFAULT_MOTTO = "Hold the angle. Break the round.";
const LOBBY_MODES = Object.freeze({
  random_duel: {
    id: "random_duel",
    name: "Random 1v1",
    playLabel: "PLAY",
    status: "Queue into the 1v1 ladder. First to 4 rounds.",
    kind: "queue",
    queueMode: "duel",
  },
  random_squad: {
    id: "random_squad",
    name: "Random 2v2",
    playLabel: "PLAY",
    status: "Queue into a live 2v2. First to 4 rounds.",
    kind: "queue",
    queueMode: "squad",
  },
  bot_squad: {
    id: "bot_squad",
    name: "2v2 vs Bots",
    playLabel: "PLAY",
    status: "Launch the existing local Bot Strike 2v2.",
    kind: "offline",
    offlineMode: "botstrike",
  },
  private_room: {
    id: "private_room",
    name: "Private Room",
    playLabel: "CREATE PRIVATE ROOM",
    status: "Create a room or join one by invite code.",
    kind: "private",
  },
  practice: {
    id: "practice",
    name: "Practice",
    playLabel: "PLAY",
    status: "Run the offline Training Range.",
    kind: "offline",
    offlineMode: "range",
  },
});

let selectedMode = "random_duel";
let selectedRegion = state.onlineRegion || "auto";
const subtabState = {
  loadout: "overview",
  profile: "overview",
};

const onlineState = {
  pendingAction: null,
  queueMode: null,
  queueNeeded: 0,
  queueWaiting: 0,
  queueStartedAt: 0,
  roomState: null,
  roomRoster: [],
  selfId: null,
  matchBooting: false,
  toastTimer: 0,
  botOfferCountdownId: 0,
  botOfferEndsAt: 0,
  roomCode: "",
  inviteRegion: "uswest",
  autoJoinInvite: null,
};

/* ------------------------------------------------------------ boot ------- */

export function boot() {
  wireGlobalUiSounds();
  wireNavigation();
  wireSubtabs();
  wireLoadout();
  wireProfile();
  wireContracts();
  wirePlay();
  wireSettings();
  wireQuickSettings();
  wireResultsButtons();
  wireConsentModal();
  wireOnlineFlow();
  hydrateInviteFromUrl();
  refreshAll();
  runLoadingSequence();
}

function runLoadingSequence() {
  const fill = $("loadingFill");
  const text = $("loadingText");
  const steps = [
    [12, "Calibrating renderer"],
    [34, "Casting Foundry geometry"],
    [58, "Waking bot squad"],
    [76, "Syncing profile"],
    [100, "Protocol ready"],
  ];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) {
      setTimeout(showClient, 260);
      return;
    }
    const [pct, label] = steps[i];
    fill.style.width = `${pct}%`;
    text.textContent = `${label} ${pct}%`;
    i += 1;
    setTimeout(tick, 170 + Math.random() * 160);
  };
  tick();
}

function showClient() {
  $("loading").classList.remove("is-active");
  document.body.classList.add("is-client");
  document.body.classList.remove("is-match");
  showPage("play");
  if (!state.onboarded) {
    $("onboarding").classList.add("is-active");
    return;
  }
  resumeInviteJoinIfReady();
}

/* --------------------------------------------------------- navigation ---- */

function showPage(page) {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === page);
  });
  document.querySelectorAll(".client-page").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.page === page);
  });
  refreshAll();
}

function setSubtab(group, name) {
  subtabState[group] = name;
  document.querySelectorAll(`[data-subtab-group='${group}']`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.subtab === name);
  });
  document.querySelectorAll(`[data-subtab-panel^='${group}:']`).forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.subtabPanel === `${group}:${name}`);
  });
}

function wireNavigation() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      sfx.uiClick();
      showPage(button.dataset.screen);
    });
  });

  $("onboardingStart").addEventListener("click", () => {
    sfx.uiConfirm();
    state.onboarded = true;
    save();
    $("onboarding").classList.remove("is-active");
    selectedMode = "practice";
    refreshPlay();
    launchOfflineMode("range");
  });

  $("onboardingSkip").addEventListener("click", () => {
    sfx.uiClick();
    state.onboarded = true;
    save();
    $("onboarding").classList.remove("is-active");
    resumeInviteJoinIfReady();
  });
}

function wireSubtabs() {
  document.querySelectorAll("[data-subtab-group]").forEach((button) => {
    button.addEventListener("click", () => {
      sfx.uiClick();
      setSubtab(button.dataset.subtabGroup, button.dataset.subtab);
    });
  });
}

function wireGlobalUiSounds() {
  document.body.addEventListener("pointerdown", unlockAudio, { once: true });
  document.body.addEventListener("keydown", unlockAudio, { once: true });
  document.body.addEventListener("mouseover", (event) => {
    if (document.body.classList.contains("is-match")) return;
    if (event.target.closest("button")) sfx.uiHover();
  });
}

/* ------------------------------------------------------------ helpers ---- */

function clearNode(node) {
  while (node.firstChild) node.firstChild.remove();
}

function createEl(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
  }
  return node;
}

function currentCallsign() {
  return (state.callsign || DEFAULT_CALLSIGN).trim() || DEFAULT_CALLSIGN;
}

function validOnlineCallsign() {
  const name = currentCallsign();
  return name.length >= 3 && name.length <= 16;
}

function selectedLobbyMode() {
  return LOBBY_MODES[selectedMode] || LOBBY_MODES.random_duel;
}

function regionValueForMatchmaking() {
  const entry = REGION_ENDPOINTS[selectedRegion] || REGION_ENDPOINTS.auto;
  return entry.target || entry.id;
}

function hasOnlineConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.version === 1;
  } catch {
    return false;
  }
}

function saveOnlineConsent() {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({
    version: 1,
    acceptedAt: Date.now(),
  }));
}

function setLobbyStatus(text) {
  $("lobbyStatus").textContent = text;
}

function showToast(text) {
  const toast = $("lobbyToast");
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(onlineState.toastTimer);
  onlineState.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function setModalVisible(id, visible) {
  $(id).classList.toggle("is-active", visible);
}

function dismissOnlineOverlays() {
  setModalVisible("queueOverlay", false);
  setModalVisible("botOfferModal", false);
  setModalVisible("roomLobbyModal", false);
  stopBotOfferCountdown();
}

function updateInviteUrl(code = "", region = "") {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  if (region) url.searchParams.set("region", region);
  else url.searchParams.delete("region");
  window.history.replaceState({}, "", url);
}

function hydrateInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = (params.get("room") || "").trim().toUpperCase();
  const region = (params.get("region") || "uswest").trim();
  if (!room) return;
  selectedMode = "private_room";
  onlineState.roomCode = room;
  onlineState.inviteRegion = REGION_ENDPOINTS[region] ? region : "uswest";
  selectedRegion = onlineState.inviteRegion;
  onlineState.autoJoinInvite = {
    code: room,
    region: onlineState.inviteRegion,
  };
}

function resumeInviteJoinIfReady() {
  if (!onlineState.autoJoinInvite || isMatchActive()) return;
  if (!validOnlineCallsign()) return;
  attemptOnlineAction(() => joinPrivateRoom(onlineState.autoJoinInvite.code, onlineState.autoJoinInvite.region));
}

function startPendingOnlineAction() {
  const action = onlineState.pendingAction;
  onlineState.pendingAction = null;
  if (action) action();
}

/* -------------------------------------------------------------- profile -- */

function wireProfile() {
  document.querySelectorAll(".agent-card").forEach((card) => {
    card.addEventListener("click", () => {
      sfx.uiClick();
      state.agent = card.dataset.agent;
      save();
      refreshAll();
    });
  });

  $("callsignInput").addEventListener("input", (event) => {
    state.callsign = event.target.value.trim() || DEFAULT_CALLSIGN;
    save();
    refreshIdentity();
    resumeInviteJoinIfReady();
  });

  $("squadMotto").addEventListener("input", (event) => {
    state.motto = event.target.value.trim() || DEFAULT_MOTTO;
    save();
    refreshIdentity();
  });

  $("seasonTone").addEventListener("change", (event) => {
    state.tone = event.target.value;
    save();
    refreshIdentity();
  });
}

/* ------------------------------------------------------------- loadout --- */

function wireLoadout() {
  document.querySelectorAll(".weapon-card").forEach((card) => {
    card.addEventListener("click", () => {
      sfx.uiClick();
      state.primary = card.dataset.weapon;
      save();
      refreshAll();
    });
  });

  $("skinGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-skin]");
    if (!card) return;
    if (card.classList.contains("is-locked")) {
      sfx.uiDeny();
      return;
    }
    sfx.uiClick();
    state.skin = card.dataset.skin;
    save();
    refreshAll();
  });

  $("crosshairGrid").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-crosshair]");
    if (!chip) return;
    if (chip.classList.contains("is-locked")) {
      sfx.uiDeny();
      return;
    }
    sfx.uiClick();
    state.crosshairColor = chip.dataset.crosshair;
    save();
    refreshCollection();
  });

  $("titleGrid").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-title]");
    if (!chip) return;
    if (chip.classList.contains("is-locked")) {
      sfx.uiDeny();
      return;
    }
    sfx.uiClick();
    state.title = chip.dataset.title;
    save();
    refreshAll();
  });
}

/* ----------------------------------------------------------- contracts --- */

function wireContracts() {
  document.querySelectorAll(".contract-card").forEach((card) => {
    card.addEventListener("click", () => {
      sfx.uiClick();
      state.contract = card.dataset.contract;
      save();
      refreshAll();
    });
  });
}

/* ---------------------------------------------------------------- play --- */

function wirePlay() {
  document.querySelectorAll(".mode-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      sfx.uiClick();
      selectedMode = chip.dataset.mode;
      refreshPlay();
      if (selectedMode !== "private_room") {
        onlineState.autoJoinInvite = null;
        onlineState.roomCode = "";
        $("privateRoomCode").value = "";
        $("copyInviteButton").hidden = true;
        updateInviteUrl("", "");
      }
    });
  });

  document.querySelectorAll("[data-region-option]").forEach((chip) => {
    chip.addEventListener("click", () => {
      sfx.uiClick();
      selectedRegion = chip.dataset.regionOption;
      state.onlineRegion = selectedRegion;
      save();
      refreshPlay();
    });
  });

  $("privateRoomCode").addEventListener("input", (event) => {
    const cleaned = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
    event.target.value = cleaned;
    onlineState.roomCode = cleaned;
  });

  $("startMatch").addEventListener("click", () => {
    sfx.uiConfirm();
    handlePrimaryPlay();
  });

  $("createPrivateRoom").addEventListener("click", () => {
    sfx.uiConfirm();
    attemptOnlineAction(createPrivateRoom);
  });

  $("joinPrivateRoom").addEventListener("click", () => {
    sfx.uiConfirm();
    attemptOnlineAction(() => joinPrivateRoom($("privateRoomCode").value.trim().toUpperCase(), regionValueForMatchmaking()));
  });

  $("copyInviteButton").addEventListener("click", async () => {
    sfx.uiClick();
    await copyInviteLink();
  });

  $("roomLobbyCopy").addEventListener("click", async () => {
    sfx.uiClick();
    await copyInviteLink();
  });

  $("roomLobbyLeave").addEventListener("click", async () => {
    sfx.uiClick();
    await leaveOnlineFlow();
    dismissOnlineOverlays();
    setLobbyStatus(selectedLobbyMode().status);
  });

  $("queueCancelButton").addEventListener("click", async () => {
    sfx.uiClick();
    await leaveQueueAndReset();
  });

  $("botOfferPlay").addEventListener("click", async () => {
    sfx.uiConfirm();
    await leaveQueueAndReset(true);
    launchOfflineMode(onlineState.queueMode === "squad" ? "botstrike" : "duelbot");
  });

  $("botOfferWait").addEventListener("click", () => {
    sfx.uiClick();
    setModalVisible("botOfferModal", false);
    stopBotOfferCountdown();
    net.sendKeepWaiting();
    setLobbyStatus("Keeping the queue alive...");
  });

  $("botOfferCancel").addEventListener("click", async () => {
    sfx.uiClick();
    await leaveQueueAndReset();
  });
}

function handlePrimaryPlay() {
  if (isMatchActive()) return;
  unlockAudio();
  const mode = selectedLobbyMode();
  if (mode.kind === "offline") {
    launchOfflineMode(mode.offlineMode);
    return;
  }
  if (mode.kind === "private") {
    attemptOnlineAction(createPrivateRoom);
    return;
  }
  attemptOnlineAction(() => joinQueue(mode.queueMode));
}

function launchOfflineMode(modeId) {
  document.querySelectorAll(".results-layer").forEach((layer) => layer.classList.remove("is-active"));
  dismissOnlineOverlays();
  startMatch({ modeId, onEnd: handleMatchEnd });
}

function attemptOnlineAction(action) {
  if (!validOnlineCallsign()) {
    showToast("Callsign must be 3-16 characters for online play.");
    return;
  }
  if (hasOnlineConsent()) {
    action();
    return;
  }
  onlineState.pendingAction = action;
  setModalVisible("onlineConsent", true);
}

async function joinQueue(queueMode) {
  await leaveOnlineFlow();
  dismissOnlineOverlays();
  onlineState.queueMode = queueMode;
  onlineState.queueStartedAt = Date.now();
  onlineState.queueNeeded = queueMode === "squad" ? 4 : 2;
  onlineState.queueWaiting = 1;
  setModalVisible("queueOverlay", true);
  renderQueueStatus();
  setLobbyStatus(queueMode === "squad" ? "Finding a 2v2 lobby..." : "Finding a duel...");
  try {
    await net.joinQueue(regionValueForMatchmaking(), queueMode, currentCallsign());
  } catch (error) {
    setModalVisible("queueOverlay", false);
    showToast(`Queue failed: ${error.message}`);
    setLobbyStatus(selectedLobbyMode().status);
  }
}

async function createPrivateRoom() {
  await leaveOnlineFlow();
  dismissOnlineOverlays();
  setLobbyStatus("Creating private room...");
  try {
    const room = await net.createRoom({
      region: regionValueForMatchmaking(),
      mode: "duel",
      name: currentCallsign(),
    });
    onlineState.roomCode = room.code;
    onlineState.inviteRegion = room.region;
    updateInviteUrl(room.code, room.region);
    $("privateRoomCode").value = room.code;
    $("copyInviteButton").hidden = false;
    await net.joinRoom(room.code, {
      name: currentCallsign(),
      region: room.region,
    });
    setLobbyStatus(`Private room ${room.code} created.`);
  } catch (error) {
    showToast(`Room create failed: ${error.message}`);
    setLobbyStatus(selectedLobbyMode().status);
  }
}

async function joinPrivateRoom(code, region) {
  if (!code || code.length !== 6) {
    showToast("Enter a valid 6-character room code.");
    return;
  }
  await leaveOnlineFlow();
  dismissOnlineOverlays();
  setLobbyStatus(`Joining room ${code}...`);
  try {
    onlineState.roomCode = code;
    onlineState.inviteRegion = region;
    updateInviteUrl(code, region);
    await net.joinRoom(code, {
      name: currentCallsign(),
      region,
    });
  } catch (error) {
    showToast(`Room join failed: ${error.message}`);
    setLobbyStatus(selectedLobbyMode().status);
  }
}

async function copyInviteLink() {
  const code = onlineState.roomCode || $("privateRoomCode").value.trim().toUpperCase();
  if (!code) return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  url.searchParams.set("region", onlineState.inviteRegion || regionValueForMatchmaking());
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("Invite link copied.");
  } catch {
    showToast("Clipboard unavailable. Copy the URL from the address bar.");
  }
}

function renderQueueStatus() {
  const elapsed = Math.max(0, Math.round((Date.now() - onlineState.queueStartedAt) / 1000));
  $("queueOverlayStatus").textContent = `Finding opponents… ${onlineState.queueWaiting}/${onlineState.queueNeeded} · ${elapsed}s`;
}

async function leaveQueueAndReset(playBots = false) {
  await net.leaveQueue();
  setModalVisible("queueOverlay", false);
  setModalVisible("botOfferModal", false);
  stopBotOfferCountdown();
  onlineState.queueMode = null;
  setLobbyStatus(playBots ? "Launching bot match..." : selectedLobbyMode().status);
}

async function leaveOnlineFlow() {
  onlineState.roomState = null;
  onlineState.roomRoster = [];
  onlineState.selfId = null;
  onlineState.matchBooting = false;
  await net.destroy();
}

function showBotOffer(countdownMs) {
  onlineState.botOfferEndsAt = Date.now() + countdownMs;
  setModalVisible("botOfferModal", true);
  updateBotOfferText();
  stopBotOfferCountdown();
  onlineState.botOfferCountdownId = window.setInterval(() => {
    updateBotOfferText();
  }, 250);
}

function stopBotOfferCountdown() {
  if (onlineState.botOfferCountdownId) {
    clearInterval(onlineState.botOfferCountdownId);
    onlineState.botOfferCountdownId = 0;
  }
}

function updateBotOfferText() {
  const seconds = Math.max(0, Math.ceil((onlineState.botOfferEndsAt - Date.now()) / 1000));
  $("botOfferBody").textContent = `A bot match starts in ${seconds}s. Keep waiting for real players, or jump in against bots now.`;
  if (seconds > 0) return;
  setModalVisible("botOfferModal", false);
  stopBotOfferCountdown();
  leaveQueueAndReset(true).then(() => {
    launchOfflineMode(onlineState.queueMode === "squad" ? "botstrike" : "duelbot");
  });
}

function renderRoomLobby() {
  const room = onlineState.roomState;
  if (!room || room.phase !== "lobby") return;
  $("roomLobbyCode").textContent = room.code || "------";
  $("roomLobbyStatus").textContent = room.mode === "squad"
    ? "Waiting for four operators."
    : "Waiting for opponent.";
  const list = $("roomLobbyPlayers");
  clearNode(list);
  room.players.forEach((player) => {
    const row = createEl("li");
    const name = createEl("strong", { text: player.name });
    const meta = createEl("span", {
      text: player.connected ? `${player.team} ready` : `${player.team} disconnected`,
    });
    row.append(name, meta);
    list.append(row);
  });
  setModalVisible("roomLobbyModal", true);
}

function maybeStartOnlineMatch(payload = onlineState.roomState) {
  // Broadcast room_state carries selfId=null (it is per-recipient on join only),
  // so resolve our id from the stored value or the welcome message instead.
  const selfId = payload?.selfId ?? onlineState.selfId ?? net.getWelcome()?.playerId ?? null;
  if (!payload || !selfId || payload.phase === "lobby" || isMatchActive() || onlineState.matchBooting) return;
  dismissOnlineOverlays();
  onlineState.matchBooting = true;
  startOnlineMatch({
    net,
    roster: payload.players,
    mode: payload.mode,
    localId: selfId,
    onEnd: handleMatchEnd,
  });
}

/* ------------------------------------------------------------- network --- */

function wireOnlineFlow() {
  net.on("queue_status", ({ waiting, needed, elapsedMs }) => {
    onlineState.queueWaiting = waiting;
    onlineState.queueNeeded = needed;
    onlineState.queueStartedAt = Date.now() - elapsedMs;
    renderQueueStatus();
  });

  net.on("bot_offer", ({ countdownMs }) => {
    showBotOffer(countdownMs);
  });

  net.on("match_found", async ({ roomId, ticket, region }) => {
    setModalVisible("botOfferModal", false);
    stopBotOfferCountdown();
    setLobbyStatus("Match found. Joining room...");
    try {
      await net.joinRoom(roomId, {
        name: currentCallsign(),
        ticket,
        region,
      });
    } catch (error) {
      showToast(`Match join failed: ${error.message}`);
      await leaveQueueAndReset();
    }
  });

  net.on("room_state", (payload) => {
    if (payload.selfId) onlineState.selfId = payload.selfId;
    onlineState.roomState = payload;
    onlineState.roomRoster = payload.players;
    onlineState.autoJoinInvite = null;
    if (payload.code) {
      onlineState.roomCode = payload.code;
      $("privateRoomCode").value = payload.code;
      $("copyInviteButton").hidden = false;
      updateInviteUrl(payload.code, payload.region);
    }
    if (payload.phase === "lobby") {
      setLobbyStatus(payload.code ? `Room ${payload.code} ready. Waiting for opponent...` : "Waiting for room to fill...");
      renderRoomLobby();
      return;
    }
    maybeStartOnlineMatch(payload);
  });

  net.on("player_joined", ({ player }) => {
    if (!onlineState.roomState?.players) return;
    const current = onlineState.roomState.players.filter((entry) => entry.id !== player.id);
    onlineState.roomState.players = [...current, player];
    if (onlineState.roomState.phase === "lobby") renderRoomLobby();
  });

  net.on("player_left", ({ playerId }) => {
    if (!onlineState.roomState?.players) return;
    onlineState.roomState.players = onlineState.roomState.players.map((entry) => {
      if (entry.id !== playerId) return entry;
      return {
        ...entry,
        connected: false,
        alive: false,
        hp: 0,
      };
    });
    if (onlineState.roomState.phase === "lobby") renderRoomLobby();
  });

  net.on("round_start", () => {
    maybeStartOnlineMatch();
  });

  net.on("error", async ({ code, detail }) => {
    const message = {
      room_full: "That room is already full.",
      room_not_found: "Room not found.",
      bad_ticket: "Match ticket rejected.",
      stale_invite: "Invite code expired.",
      name_invalid: "Callsign must be 3-16 characters.",
      name_taken: "That callsign is already connected in this room.",
      rate_limited: "Too many requests. Slow down.",
      timeout: "Connection timed out.",
      region_mismatch: "Invite region mismatch.",
      malformed: "Malformed request.",
    }[code] || `Online error: ${code}${detail ? ` (${detail})` : ""}`;
    showToast(message);
    setLobbyStatus(message);
    if (!isMatchActive()) {
      dismissOnlineOverlays();
      await leaveOnlineFlow();
    }
  });

  net.on("disconnected", async ({ expected }) => {
    if (isMatchActive()) return;
    dismissOnlineOverlays();
    if (!expected) {
      showToast("Disconnected from the match server.");
      setLobbyStatus("Disconnected from the match server.");
    }
    await leaveOnlineFlow();
  });
}

/* ------------------------------------------------------------ settings --- */

function wireSettings() {
  $("settingVolume").addEventListener("input", (event) => {
    state.settings.volume = Number(event.target.value) / 100;
    applyVolume();
    save();
    refreshSettings();
  });

  $("settingMute").addEventListener("change", (event) => {
    state.settings.muted = event.target.checked;
    applyVolume();
    save();
    refreshSettings();
  });

  $("settingSens").addEventListener("input", (event) => {
    state.settings.sensitivity = Number(event.target.value);
    save();
    refreshSettings();
  });

  $("settingCrosshairSize").addEventListener("input", (event) => {
    state.settings.crosshairSize = Number(event.target.value);
    save();
    refreshSettings();
  });

  $("visualQuality").addEventListener("change", (event) => {
    state.settings.quality = event.target.value;
    save();
  });

  $("botDifficulty").addEventListener("change", (event) => {
    state.settings.botDifficulty = event.target.value;
    save();
    refreshPlay();
  });

  $("fullscreenToggle").addEventListener("click", () => {
    sfx.uiClick();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  $("resetProgress").addEventListener("click", () => {
    const button = $("resetProgress");
    if (button.dataset.armed === "1") {
      resetProgress();
      sfx.uiConfirm();
      button.dataset.armed = "0";
      button.textContent = "Reset Progress";
      refreshAll();
      return;
    }
    sfx.uiDeny();
    button.dataset.armed = "1";
    button.textContent = "Click again to wipe everything";
    setTimeout(() => {
      button.dataset.armed = "0";
      button.textContent = "Reset Progress";
    }, 3200);
  });
}

function wireQuickSettings() {
  const toggle = $("quickSettingsToggle");
  const panel = $("quickSettingsPanel");

  toggle.addEventListener("click", () => {
    sfx.uiClick();
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("pointerdown", (event) => {
    if (panel.hidden) return;
    if (event.target === panel || panel.contains(event.target) || event.target === toggle) return;
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });

  $("quickSettingVolume").addEventListener("input", (event) => {
    state.settings.volume = Number(event.target.value) / 100;
    applyVolume();
    save();
    refreshSettings();
  });

  $("quickSettingMute").addEventListener("change", (event) => {
    state.settings.muted = event.target.checked;
    applyVolume();
    save();
    refreshSettings();
  });

  $("quickSettingSens").addEventListener("input", (event) => {
    state.settings.sensitivity = Number(event.target.value);
    save();
    refreshSettings();
  });
}

/* ------------------------------------------------------------- consent --- */

function wireConsentModal() {
  $("consentAccept").addEventListener("click", () => {
    sfx.uiConfirm();
    saveOnlineConsent();
    setModalVisible("onlineConsent", false);
    startPendingOnlineAction();
  });

  $("consentDecline").addEventListener("click", () => {
    sfx.uiClick();
    onlineState.pendingAction = null;
    setModalVisible("onlineConsent", false);
    setLobbyStatus(selectedLobbyMode().status);
  });
}

/* -------------------------------------------------------- match results -- */

function handleMatchEnd(report) {
  document.body.classList.add("is-client");
  onlineState.matchBooting = false;
  dismissOnlineOverlays();
  if (report.mode === "botstrike" && report.aborted) {
    refreshAll();
    showPage("play");
    return;
  }
  if (report.online && report.aborted) {
    refreshAll();
    showPage("play");
    return;
  }
  const rewards = applyRewards(report);
  showResults(report, rewards);
}

function applyRewards(report) {
  const before = unlockSnapshot();
  const levelBefore = levelInfo().level;
  const tiersBefore = CONTRACTS.map((contract) => contractTier(contract.id));

  const lines = [];
  let xp = 0;

  if (report.mode === "botstrike") {
    const modeLabel = report.online
      ? report.onlineMode === "squad" ? "Online 2v2" : "Online 1v1"
      : report.offlineVariant === "duelbot" ? "Bot Duel" : "2v2 vs Bots";
    const killXp = report.kills * XP_RULES.kill;
    const headXp = report.headshots * XP_RULES.headshotBonus;
    const dmgXp = Math.round(report.damage / 100) * XP_RULES.damagePer100;
    const roundXp = report.scoreBlue * XP_RULES.roundWin;
    const utilXp = report.utilityHits * XP_RULES.utilityHit;
    const resultXp = report.result === "win" ? XP_RULES.matchWin : XP_RULES.matchLoss;
    if (killXp) lines.push([`Eliminations ×${report.kills}`, killXp]);
    if (headXp) lines.push([`Headshots ×${report.headshots}`, headXp]);
    if (dmgXp) lines.push([`Damage dealt ${report.damage}`, dmgXp]);
    if (roundXp) lines.push([`Rounds won ×${report.scoreBlue}`, roundXp]);
    if (utilXp) lines.push([`Utility hits ×${report.utilityHits}`, utilXp]);
    lines.push([report.result === "win" ? "Match victory" : "Match completed", resultXp]);
    xp = killXp + headXp + dmgXp + roundXp + utilXp + resultXp;

    state.stats.kills += report.kills;
    state.stats.deaths += report.deaths;
    state.stats.headshots += report.headshots;
    state.stats.damage += report.damage;
    state.stats.roundWins += report.scoreBlue;
    state.stats.roundLosses += report.scoreRed;
    state.stats.utilityHits += report.utilityHits;
    state.stats.matches += 1;
    if (report.result === "win") state.stats.matchWins += 1;
    if (report.kills > state.stats.bestKillsInMatch) state.stats.bestKillsInMatch = report.kills;

    state.contracts.entry.progress += report.scoreBlue;
    state.contracts.anchor.progress += report.damage;
    state.contracts.utility.progress += report.utilityHits;

    recordMatch({
      mode: modeLabel,
      result: report.result === "win" ? "Victory" : report.result === "draw" ? "Draw" : "Defeat",
      score: `${report.scoreBlue}–${report.scoreRed}`,
      detail: `${report.kills}K ${report.deaths}D · ${report.damage} dmg`,
      date: Date.now(),
      online: !!report.online,
    });
  } else {
    xp = report.targets ? Math.max(Math.round(report.targets * (XP_RULES.rangeTargetsPer10 / 10)), 10) : 0;
    if (report.targets) lines.push([`Targets down ×${report.targets}`, xp]);
    state.stats.rangeTargets += report.targets;
    if (report.targets > 0) {
      recordMatch({
        mode: "Practice",
        result: "Session",
        score: `${report.targets} targets`,
        detail: `${report.accuracy}% accuracy`,
        date: Date.now(),
        online: false,
      });
    }
  }

  CONTRACTS.forEach((contract, index) => {
    const nowTier = contractTier(contract.id);
    if (nowTier > tiersBefore[index]) {
      const gained = (nowTier - tiersBefore[index]) * contract.tierXp;
      lines.push([`${contract.name} tier ${nowTier} complete`, gained]);
      xp += gained;
    }
  });

  state.xp += xp;
  const levelAfter = levelInfo().level;
  const newUnlocks = diffUnlocks(before);
  save();

  return {
    xp,
    lines,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    newUnlocks,
  };
}

function showResults(report, rewards) {
  refreshAll();
  setModalVisible("matchResults", true);

  if (report.mode === "botstrike") {
    const modeLabel = report.online
      ? report.onlineMode === "squad" ? "Online 2v2" : "Online 1v1"
      : report.offlineVariant === "duelbot" ? MODES.duelbot.name : MODES.botstrike.name;
    $("resultsTitle").textContent = report.result === "win" ? "Victory" : report.result === "draw" ? "Draw" : "Defeat";
    $("resultsTitle").className = `results-title ${report.result === "win" ? "is-win" : "is-loss"}`;
    $("resultsScore").textContent = `${report.scoreBlue} — ${report.scoreRed}`;
    $("resultsMeta").textContent = `${modeLabel} · ${MAP_INFO.name} · ${report.rounds} round${report.rounds === 1 ? "" : "s"} · ${Math.floor(report.durationMs / 60000)}m ${Math.round(report.durationMs / 1000) % 60}s`;
    renderResultsBoard(report.board);
  } else {
    $("resultsTitle").textContent = "Practice Session";
    $("resultsTitle").className = "results-title is-win";
    $("resultsScore").textContent = String(report.targets);
    $("resultsMeta").textContent = `Targets down · ${report.accuracy}% accuracy · ${report.shots} shots`;
    clearNode($("resultsBoard"));
  }

  window._pendingRewards = rewards;
}

function renderResultsBoard(board) {
  const root = $("resultsBoard");
  clearNode(root);

  const header = createEl("div", { className: "board-row board-head" });
  ["Operator", "K", "D", "DMG"].forEach((label) => {
    header.append(createEl("span", { text: label }));
  });
  root.append(header);

  board.forEach((row) => {
    const item = createEl("div", {
      className: `board-row ${row.you ? "is-you" : ""} ${row.team === "blue" ? "is-blue" : "is-red"}`,
    });
    const operator = createEl("span");
    operator.append(document.createTextNode(row.you ? `${row.name} (you)` : row.name));
    operator.append(createEl("em", { text: row.agent }));
    item.append(operator);
    item.append(createEl("span", { text: String(row.kills) }));
    item.append(createEl("span", { text: String(row.deaths) }));
    item.append(createEl("span", { text: String(row.damage) }));
    root.append(item);
  });
}

function showRewards(rewards) {
  setModalVisible("matchResults", false);
  setModalVisible("matchRewards", true);

  $("rewardsXpTotal").textContent = `+${rewards.xp} XP`;
  renderRewardLines(rewards.lines);

  const info = levelInfo();
  $("rewardsLevel").textContent = `Level ${info.level}`;
  $("rewardsRank").textContent = rankForLevel(info.level);
  $("rewardsXpBar").style.width = `${Math.round((info.into / info.next) * 100)}%`;
  $("rewardsXpBarLabel").textContent = `${info.into} / ${info.next} XP`;

  $("rewardsLevelUp").classList.toggle("is-active", rewards.leveledUp);
  if (rewards.leveledUp) {
    $("rewardsLevelUp").textContent = `LEVEL UP — ${rewards.levelBefore} → ${rewards.levelAfter}`;
    sfx.levelUp();
  }

  renderRewardUnlocks(rewards.newUnlocks);
  renderRewardContract();
}

function renderRewardLines(lines) {
  const root = $("rewardsLines");
  clearNode(root);
  if (!lines.length) {
    const empty = createEl("div", { className: "reward-line" });
    empty.append(createEl("span", { text: "No XP earned this session" }));
    empty.append(createEl("b", { text: "+0" }));
    root.append(empty);
    return;
  }
  lines.forEach(([label, amount]) => {
    const row = createEl("div", { className: "reward-line" });
    row.append(createEl("span", { text: label }));
    row.append(createEl("b", { text: `+${amount} XP` }));
    root.append(row);
  });
}

function renderRewardUnlocks(unlocks) {
  const root = $("rewardsUnlocks");
  clearNode(root);

  const unlockable = unlocks.map((unlock) => {
    if (unlock.type === "skin") {
      const skin = SKINS.find((entry) => entry.id === unlock.id);
      return { label: skin ? skin.name : unlock.id, kind: "Sidearm skin" };
    }
    if (unlock.type === "crosshair") {
      const crosshair = CROSSHAIR_COLORS.find((entry) => entry.id === unlock.id);
      return { label: crosshair ? crosshair.name : unlock.id, kind: "Crosshair color" };
    }
    const title = TITLES.find((entry) => entry.id === unlock.id);
    return { label: title ? title.name : unlock.id, kind: "Title" };
  });

  unlockable.forEach((unlock) => {
    const card = createEl("div", { className: "unlock-card" });
    card.append(createEl("span", { text: unlock.kind }));
    card.append(createEl("b", { text: unlock.label }));
    root.append(card);
  });

  $("rewardsUnlocksWrap").style.display = unlockable.length ? "block" : "none";
  if (unlockable.length) sfx.unlock();
}

function renderRewardContract() {
  const contract = CONTRACTS.find((entry) => entry.id === state.contract) || CONTRACTS[0];
  const tier = contractTier(contract.id);
  const nextTierAt = contract.tiers[Math.min(tier, contract.tiers.length - 1)];
  const progress = state.contracts[contract.id].progress;
  const root = $("rewardsContract");
  clearNode(root);
  root.append(createEl("span", { text: contract.name }));
  root.append(createEl("b", { text: `${Math.min(progress, nextTierAt)} / ${nextTierAt} ${contract.metricLabel}` }));
  root.append(createEl("em", { text: `Tier ${tier} / ${contract.tiers.length}` }));
}

function wireResultsButtons() {
  $("resultsContinue").addEventListener("click", () => {
    sfx.uiClick();
    showRewards(window._pendingRewards || {
      xp: 0,
      lines: [],
      newUnlocks: [],
      leveledUp: false,
    });
  });

  $("rewardsAgain").addEventListener("click", () => {
    sfx.uiConfirm();
    setModalVisible("matchRewards", false);
    handlePrimaryPlay();
  });

  $("rewardsLoadout").addEventListener("click", () => {
    sfx.uiClick();
    setModalVisible("matchRewards", false);
    showPage("loadout");
  });

  $("rewardsClose").addEventListener("click", () => {
    sfx.uiClick();
    setModalVisible("matchRewards", false);
    showPage("play");
  });
}

/* ------------------------------------------------------------- refresh --- */

function agentById(id) {
  return AGENTS.find((agent) => agent.id === id) || AGENTS[0];
}

function refreshAll() {
  refreshIdentity();
  refreshPlay();
  refreshSquad();
  refreshLoadout();
  refreshContracts();
  refreshProfile();
  refreshCollection();
  refreshSettings();
}

function refreshIdentity() {
  const callsign = currentCallsign();
  const agent = agentById(state.agent);
  $("callsignInput").value = callsign;
  $("profileTitle").textContent = callsign;
  $("profileBio").textContent = agent.profile;
  $("profileAvatar").textContent = callsign[0].toUpperCase();
  $("profileTitleTag").textContent = titleName();
  $("selectedAgentName").textContent = agent.name;
  $("selectedAgentBio").textContent = agent.bio;
  $("selectedAgentAbility").innerHTML = `<b>${agent.ability.name}</b> <span>[Q]</span> — ${agent.ability.blurb}`;
  $("lobbyRankChip").textContent = `${rankName()} · Lv ${levelInfo().level}`;
  const contract = CONTRACTS.find((entry) => entry.id === state.contract) || CONTRACTS[0];
  $("lobbyContractChip").textContent = contract.name;
  $("squadCallsignLabel").textContent = callsign;
  $("squadMotto").value = state.motto;
  $("seasonTone").value = state.tone;
}

function refreshPlay() {
  const mode = selectedLobbyMode();
  document.querySelectorAll(".mode-chip").forEach((chip) => {
    chip.classList.toggle("is-selected", chip.dataset.mode === selectedMode);
  });
  document.querySelectorAll("[data-region-option]").forEach((chip) => {
    chip.classList.toggle("is-selected", chip.dataset.regionOption === selectedRegion);
  });
  $("privateRoomRow").hidden = selectedMode !== "private_room";
  $("startMatch").textContent = mode.playLabel;
  $("selectedModeMap").textContent = MAP_INFO.name;
  $("selectedModeDifficulty").textContent = `Bots: ${BOT_TUNING[state.settings.botDifficulty].label}`;
  $("privateRoomCode").value = onlineState.roomCode || $("privateRoomCode").value;
  if (onlineState.roomState?.phase === "lobby") {
    setLobbyStatus(onlineState.roomCode ? `Room ${onlineState.roomCode} ready. Waiting for opponent...` : "Waiting for room to fill...");
  } else if (onlineState.queueMode) {
    setLobbyStatus(onlineState.queueMode === "squad" ? "Finding a 2v2 lobby..." : "Finding a duel...");
  } else {
    setLobbyStatus(mode.status);
  }
}

function refreshSquad() {
  document.querySelectorAll(".agent-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.agent === state.agent);
  });
}

function refreshLoadout() {
  const weapon = WEAPONS[state.primary];
  document.querySelectorAll(".weapon-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.weapon === state.primary);
  });
  $("selectedPrimaryName").textContent = weapon.name;
  $("selectedPrimaryBody").textContent = weapon.blurb;
  $("lobbyWeaponName").textContent = weapon.name;
  $("lobbyWeaponBody").textContent = weapon.blurb;
  $("loadoutStats").innerHTML = `
    <span>Damage ${weapon.damage}</span>
    <span>Mag ${weapon.mag}</span>
    <span>${weapon.auto ? "Full auto" : "Semi auto"}</span>
    <span>${Math.round(60000 / weapon.cooldownMs)} rpm</span>
  `;
  const skin = SKINS.find((entry) => entry.id === state.skin) || SKINS[0];
  $("loadoutSkinLabel").textContent = `Sidearm: Backstop · ${skin.name}`;
}

function refreshContracts() {
  const contract = CONTRACTS.find((entry) => entry.id === state.contract) || CONTRACTS[0];
  const progress = state.contracts[contract.id];
  const tier = contractTier(contract.id);
  document.querySelectorAll(".contract-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.contract === state.contract);
  });
  $("activeContractTitle").textContent = contract.name;
  $("activeContractBody").textContent = contract.body;
  const ladder = $("contractLadder");
  ladder.innerHTML = contract.tiers.map((threshold, index) => `
    <span class="${index < tier ? "is-filled" : ""}">
      <b>${threshold}</b>
      <em>${index < tier ? "done" : contract.metricLabel}</em>
    </span>
  `).join("");
  $("contractProgressLabel").textContent = `${progress.progress} ${contract.metricLabel} total · tier ${tier} of ${contract.tiers.length}`;
  document.querySelectorAll(".contract-card").forEach((card) => {
    const current = CONTRACTS.find((entry) => entry.id === card.dataset.contract);
    const currentTier = contractTier(current.id);
    card.querySelector("em").textContent = `Tier ${currentTier}/${current.tiers.length} · ${state.contracts[current.id].progress} ${current.metricLabel}`;
  });
}

function refreshProfile() {
  const info = levelInfo();
  const stats = state.stats;
  $("statRank").textContent = rankName();
  $("statLevel").textContent = `Lv ${info.level}`;
  $("statMatches").textContent = String(stats.matches);
  $("statWinsBig").textContent = String(stats.matchWins);
  $("statKills").textContent = String(stats.kills);
  $("statKd").textContent = stats.deaths ? (stats.kills / stats.deaths).toFixed(2) : String(stats.kills);
  $("statHeadshots").textContent = String(stats.headshots);
  $("statDamageBig").textContent = String(Math.round(stats.damage));
  $("profileXpBar").style.width = `${Math.round((info.into / info.next) * 100)}%`;
  $("profileXpLabel").textContent = `${info.into} / ${info.next} XP to level ${info.level + 1}`;

  const list = $("historyList");
  clearNode(list);
  if (!state.matchHistory.length) {
    const row = createEl("li");
    row.append(createEl("span", { text: "No matches yet — deploy through Play." }));
    row.append(createEl("strong", { text: "—" }));
    list.append(row);
    return;
  }

  state.matchHistory.forEach((entry) => {
    const row = createEl("li");
    const label = createEl("span", {
      text: `${entry.mode}${entry.online ? " · Online" : ""} · ${entry.score} · ${entry.detail}`,
    });
    const result = createEl("strong", {
      className: entry.result === "Victory" ? "is-win" : "",
      text: entry.result,
    });
    row.append(label, result);
    list.append(row);
  });
}

function refreshCollection() {
  const grid = $("skinGrid");
  grid.innerHTML = SKINS.map((skin) => {
    const unlocked = isUnlocked("skin", skin.id);
    const equipped = state.skin === skin.id;
    return `
      <button class="skin-card ${equipped ? "is-equipped" : ""} ${unlocked ? "" : "is-locked"}" data-skin="${skin.id}" type="button"
        style="--skin-bg: ${skin.bg}; --skin-pattern: ${skin.css};">
        <span class="skin-preview" aria-hidden="true"></span>
        <strong>${skin.name}</strong>
        <span>${unlocked ? skin.description : `Locked — ${unlockRuleLabel("skin", skin.id)}`}</span>
      </button>
    `;
  }).join("");
  const equipped = SKINS.find((skin) => skin.id === state.skin) || SKINS[0];
  $("equippedSkinLabel").textContent = `Equipped: ${equipped.name}`;

  $("crosshairGrid").innerHTML = CROSSHAIR_COLORS.map((crosshair) => {
    const unlocked = isUnlocked("crosshair", crosshair.id);
    return `
      <button class="chip ${state.crosshairColor === crosshair.id ? "is-equipped" : ""} ${unlocked ? "" : "is-locked"}"
        data-crosshair="${crosshair.id}" type="button" title="${unlocked ? crosshair.name : `Locked — ${unlockRuleLabel("crosshair", crosshair.id)}`}">
        <i style="background:${crosshair.value}"></i>${crosshair.name}
      </button>
    `;
  }).join("");

  $("titleGrid").innerHTML = TITLES.map((title) => {
    const unlocked = isUnlocked("title", title.id);
    return `
      <button class="chip ${state.title === title.id ? "is-equipped" : ""} ${unlocked ? "" : "is-locked"}"
        data-title="${title.id}" type="button" title="${unlocked ? title.name : `Locked — ${unlockRuleLabel("title", title.id)}`}">
        ${title.name}${unlocked ? "" : " LOCKED"}
      </button>
    `;
  }).join("");
}

function refreshSettings() {
  $("settingVolume").value = String(Math.round(state.settings.volume * 100));
  $("settingMute").checked = state.settings.muted;
  $("settingSens").value = String(state.settings.sensitivity);
  $("settingSensLabel").textContent = `${state.settings.sensitivity.toFixed(2)}x`;
  $("settingCrosshairSize").value = String(state.settings.crosshairSize);
  $("settingCrosshairLabel").textContent = `${state.settings.crosshairSize.toFixed(2)}x`;
  $("visualQuality").value = state.settings.quality;
  $("botDifficulty").value = state.settings.botDifficulty;

  $("quickSettingVolume").value = String(Math.round(state.settings.volume * 100));
  $("quickSettingMute").checked = state.settings.muted;
  $("quickSettingSens").value = String(state.settings.sensitivity);
  $("quickSettingSensLabel").textContent = `${state.settings.sensitivity.toFixed(2)}x`;
}
