// Angle Protocol — client shell. Screen routing, customization, contracts,
// collection, settings, onboarding, and the post-match results → rewards flow.

import {
  WEAPONS, AGENTS, SKINS, CROSSHAIR_COLORS, TITLES, CONTRACTS, MODES, MAP_INFO,
  BOT_TUNING, XP_RULES, rankForLevel,
} from "./data.js";
import {
  state, save, resetProgress, levelInfo, rankName, titleName, contractTier,
  isUnlocked, unlockRuleLabel, unlockSnapshot, diffUnlocks, recordMatch,
} from "./state.js";
import { sfx, unlockAudio, applyVolume } from "./audio.js";
import { startMatch, isMatchActive } from "./engine.js";

const $ = (id) => document.getElementById(id);

let selectedMode = "botstrike";

/* ------------------------------------------------------------ boot ------- */

export function boot() {
  wireGlobalUiSounds();
  wireNavigation();
  wireSquad();
  wireLoadout();
  wireContracts();
  wirePlay();
  wireCollection();
  wireSettings();
  wireResultsButtons();
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
  if (!state.onboarded) {
    $("onboarding").classList.add("is-active");
  }
}

/* --------------------------------------------------------- navigation ---- */

function showPage(page) {
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.screen === page));
  document.querySelectorAll(".client-page").forEach((p) => p.classList.toggle("is-active", p.dataset.page === page));
  refreshAll();
}

function wireNavigation() {
  document.querySelectorAll(".nav-tab").forEach((b) => {
    b.addEventListener("click", () => { sfx.uiClick(); showPage(b.dataset.screen); });
  });
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => { sfx.uiClick(); showPage(b.dataset.goto); });
  });
  document.querySelectorAll("[data-action='quick-play']").forEach((b) => {
    b.addEventListener("click", () => { sfx.uiConfirm(); launchMatch(); });
  });
  $("onboardingStart").addEventListener("click", () => {
    sfx.uiConfirm();
    state.onboarded = true;
    save();
    $("onboarding").classList.remove("is-active");
    selectedMode = "range";
    launchMatch();
  });
  $("onboardingSkip").addEventListener("click", () => {
    sfx.uiClick();
    state.onboarded = true;
    save();
    $("onboarding").classList.remove("is-active");
  });
}

function wireGlobalUiSounds() {
  document.body.addEventListener("pointerdown", unlockAudio, { once: true });
  document.body.addEventListener("keydown", unlockAudio, { once: true });
  document.body.addEventListener("mouseover", (e) => {
    if (document.body.classList.contains("is-match")) return;
    if (e.target.closest("button")) sfx.uiHover();
  });
}

/* -------------------------------------------------------------- squad ---- */

function wireSquad() {
  document.querySelectorAll(".agent-card").forEach((card) => {
    card.addEventListener("click", () => {
      sfx.uiClick();
      state.agent = card.dataset.agent;
      save();
      refreshAll();
    });
  });
  $("callsignInput").addEventListener("input", (e) => {
    state.callsign = e.target.value.trim() || "Aegis";
    save();
    refreshIdentity();
  });
  $("squadMotto").addEventListener("input", (e) => {
    state.motto = e.target.value.trim() || "Hold the angle. Break the round.";
    save();
    refreshIdentity();
  });
  $("seasonTone").addEventListener("change", (e) => {
    state.tone = e.target.value;
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
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      sfx.uiClick();
      selectedMode = card.dataset.mode;
      refreshPlay();
    });
  });
  $("startMatch").addEventListener("click", () => { sfx.uiConfirm(); launchMatch(); });
}

function launchMatch() {
  if (isMatchActive()) return;
  unlockAudio();
  document.querySelectorAll(".results-layer").forEach((el) => el.classList.remove("is-active"));
  startMatch({ modeId: selectedMode, onEnd: handleMatchEnd });
}

/* ---------------------------------------------------------- collection --- */

function wireCollection() {
  // Grids are rebuilt on refresh; click handlers are delegated.
  $("skinGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-skin]");
    if (!card) return;
    if (card.classList.contains("is-locked")) { sfx.uiDeny(); return; }
    sfx.uiClick();
    state.skin = card.dataset.skin;
    save();
    refreshAll();
  });
  $("crosshairGrid").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-crosshair]");
    if (!chip) return;
    if (chip.classList.contains("is-locked")) { sfx.uiDeny(); return; }
    sfx.uiClick();
    state.crosshairColor = chip.dataset.crosshair;
    save();
    refreshCollection();
  });
  $("titleGrid").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-title]");
    if (!chip) return;
    if (chip.classList.contains("is-locked")) { sfx.uiDeny(); return; }
    sfx.uiClick();
    state.title = chip.dataset.title;
    save();
    refreshAll();
  });
}

/* ------------------------------------------------------------ settings --- */

function wireSettings() {
  const vol = $("settingVolume");
  vol.addEventListener("input", () => {
    state.settings.volume = Number(vol.value) / 100;
    applyVolume();
    save();
  });
  $("settingMute").addEventListener("change", (e) => {
    state.settings.muted = e.target.checked;
    applyVolume();
    save();
  });
  const sens = $("settingSens");
  sens.addEventListener("input", () => {
    state.settings.sensitivity = Number(sens.value);
    $("settingSensLabel").textContent = `${Number(sens.value).toFixed(2)}x`;
    save();
  });
  const ch = $("settingCrosshairSize");
  ch.addEventListener("input", () => {
    state.settings.crosshairSize = Number(ch.value);
    $("settingCrosshairLabel").textContent = `${Number(ch.value).toFixed(2)}x`;
    save();
  });
  $("visualQuality").addEventListener("change", (e) => {
    state.settings.quality = e.target.value;
    save();
  });
  $("botDifficulty").addEventListener("change", (e) => {
    state.settings.botDifficulty = e.target.value;
    save();
    refreshPlay();
  });
  $("fullscreenToggle").addEventListener("click", () => {
    sfx.uiClick();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  $("resetProgress").addEventListener("click", () => {
    if ($("resetProgress").dataset.armed === "1") {
      resetProgress();
      sfx.uiConfirm();
      $("resetProgress").dataset.armed = "0";
      $("resetProgress").textContent = "Reset Progress";
      refreshAll();
    } else {
      sfx.uiDeny();
      $("resetProgress").dataset.armed = "1";
      $("resetProgress").textContent = "Click again to wipe everything";
      setTimeout(() => {
        $("resetProgress").dataset.armed = "0";
        $("resetProgress").textContent = "Reset Progress";
      }, 3200);
    }
  });
}

/* -------------------------------------------------------- match results -- */

function handleMatchEnd(report) {
  document.body.classList.add("is-client");
  if (report.mode === "botstrike" && report.aborted) {
    // Left from pause menu — no rewards, straight back to client.
    refreshAll();
    return;
  }
  const rewards = applyRewards(report);
  showResults(report, rewards);
}

// Turns a match report into XP, stat updates, contract progress, and unlocks.
function applyRewards(report) {
  const before = unlockSnapshot();
  const levelBefore = levelInfo().level;
  const tiersBefore = CONTRACTS.map((c) => contractTier(c.id));

  const lines = [];
  let xp = 0;
  if (report.mode === "botstrike") {
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
      mode: "Bot Strike",
      result: report.result === "win" ? "Victory" : "Defeat",
      score: `${report.scoreBlue}–${report.scoreRed}`,
      detail: `${report.kills}K ${report.deaths}D · ${report.damage} dmg`,
      date: Date.now(),
    });
  } else {
    xp = report.targets ? Math.max(Math.round(report.targets * (XP_RULES.rangeTargetsPer10 / 10)), 10) : 0;
    if (report.targets) lines.push([`Targets down ×${report.targets}`, xp]);
    state.stats.rangeTargets += report.targets;
    if (report.targets > 0) {
      recordMatch({
        mode: "Training Range",
        result: "Session",
        score: `${report.targets} targets`,
        detail: `${report.accuracy}% accuracy`,
        date: Date.now(),
      });
    }
  }

  // Contract tier completion bonuses.
  CONTRACTS.forEach((c, i) => {
    const nowTier = contractTier(c.id);
    if (nowTier > tiersBefore[i]) {
      const gained = (nowTier - tiersBefore[i]) * c.tierXp;
      lines.push([`${c.name} tier ${nowTier} complete`, gained]);
      xp += gained;
    }
  });

  state.xp += xp;
  const levelAfter = levelInfo().level;
  const newUnlocks = diffUnlocks(before);
  save();

  return { xp, lines, levelBefore, levelAfter, leveledUp: levelAfter > levelBefore, newUnlocks };
}

function showResults(report, rewards) {
  refreshAll();
  const layer = $("matchResults");
  layer.classList.add("is-active");

  if (report.mode === "botstrike") {
    $("resultsTitle").textContent = report.result === "win" ? "Victory" : "Defeat";
    $("resultsTitle").className = `results-title ${report.result === "win" ? "is-win" : "is-loss"}`;
    $("resultsScore").textContent = `${report.scoreBlue} — ${report.scoreRed}`;
    $("resultsMeta").textContent = `${MODES.botstrike.name} · ${MAP_INFO.name} · ${report.rounds} round${report.rounds === 1 ? "" : "s"} · ${Math.floor(report.durationMs / 60000)}m ${Math.round(report.durationMs / 1000) % 60}s`;
    $("resultsBoard").innerHTML = `
      <div class="board-row board-head"><span>Operator</span><span>K</span><span>D</span><span>DMG</span></div>
      ${report.board.map((row) => `
        <div class="board-row ${row.you ? "is-you" : ""} ${row.team === "blue" ? "is-blue" : "is-red"}">
          <span>${row.you ? `${escapeHtml(row.name)} (you)` : escapeHtml(row.name)}<em>${row.agent}</em></span>
          <span>${row.kills}</span><span>${row.deaths}</span><span>${row.damage}</span>
        </div>`).join("")}
    `;
  } else {
    $("resultsTitle").textContent = "Range Session";
    $("resultsTitle").className = "results-title is-win";
    $("resultsScore").textContent = `${report.targets}`;
    $("resultsMeta").textContent = `Targets down · ${report.accuracy}% accuracy · ${report.shots} shots`;
    $("resultsBoard").innerHTML = "";
  }
  window._pendingRewards = rewards;
}

function showRewards(rewards) {
  $("matchResults").classList.remove("is-active");
  const layer = $("matchRewards");
  layer.classList.add("is-active");

  $("rewardsXpTotal").textContent = `+${rewards.xp} XP`;
  $("rewardsLines").innerHTML = rewards.lines
    .map(([label, amount]) => `<div class="reward-line"><span>${label}</span><b>+${amount} XP</b></div>`)
    .join("") || `<div class="reward-line"><span>No XP earned this session</span><b>+0</b></div>`;

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

  const unlockable = rewards.newUnlocks.map((u) => {
    if (u.type === "skin") {
      const skin = SKINS.find((s) => s.id === u.id);
      return { label: skin ? skin.name : u.id, kind: "Sidearm skin" };
    }
    if (u.type === "crosshair") {
      const c = CROSSHAIR_COLORS.find((x) => x.id === u.id);
      return { label: c ? c.name : u.id, kind: "Crosshair color" };
    }
    const t = TITLES.find((x) => x.id === u.id);
    return { label: t ? t.name : u.id, kind: "Title" };
  });
  $("rewardsUnlocks").innerHTML = unlockable.length
    ? unlockable.map((u) => `<div class="unlock-card"><span>${u.kind}</span><b>${u.label}</b></div>`).join("")
    : "";
  $("rewardsUnlocksWrap").style.display = unlockable.length ? "block" : "none";
  if (unlockable.length) sfx.unlock();

  // Contract progress snapshot.
  const contract = CONTRACTS.find((c) => c.id === state.contract) || CONTRACTS[0];
  const tier = contractTier(contract.id);
  const nextTierAt = contract.tiers[Math.min(tier, contract.tiers.length - 1)];
  const prog = state.contracts[contract.id].progress;
  $("rewardsContract").innerHTML = `
    <span>${contract.name}</span>
    <b>${Math.min(prog, nextTierAt)} / ${nextTierAt} ${contract.metricLabel}</b>
    <em>Tier ${tier} / ${contract.tiers.length}</em>
  `;
}

function wireResultsButtons() {
  $("resultsContinue").addEventListener("click", () => {
    sfx.uiClick();
    showRewards(window._pendingRewards || { xp: 0, lines: [], newUnlocks: [], leveledUp: false });
  });
  $("rewardsAgain").addEventListener("click", () => {
    sfx.uiConfirm();
    $("matchRewards").classList.remove("is-active");
    launchMatch();
  });
  $("rewardsLoadout").addEventListener("click", () => {
    sfx.uiClick();
    $("matchRewards").classList.remove("is-active");
    showPage("loadout");
  });
  $("rewardsClose").addEventListener("click", () => {
    sfx.uiClick();
    $("matchRewards").classList.remove("is-active");
    showPage("home");
  });
}

/* ------------------------------------------------------------- refresh --- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function agentById(id) {
  return AGENTS.find((a) => a.id === id) || AGENTS[0];
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
  const callsign = state.callsign || "Aegis";
  const agent = agentById(state.agent);
  const info = levelInfo();
  $("profileInitial").textContent = callsign[0].toUpperCase();
  $("profileName").textContent = callsign;
  $("profileRank").textContent = `${rankName()} · Lv ${info.level}`;
  $("briefingMotto").textContent = state.motto;
  $("briefCallsign").textContent = `${callsign} online`;
  $("briefAgent").textContent = `Agent: ${agent.name}`;
  $("briefMap").textContent = `Map: ${MAP_INFO.name}`;
  $("briefTone").textContent = `Tone: ${state.tone}`;
  $("homeMode").textContent = MODES[selectedMode].name;
  $("homePrimary").textContent = WEAPONS[state.primary].name;
  const contract = CONTRACTS.find((c) => c.id === state.contract) || CONTRACTS[0];
  $("homeContract").textContent = contract.name;
}

function refreshPlay() {
  document.querySelectorAll(".mode-card").forEach((c) => c.classList.toggle("is-selected", c.dataset.mode === selectedMode));
  const mode = MODES[selectedMode];
  $("selectedModeTitle").textContent = mode.name;
  $("selectedModeBody").textContent = mode.body;
  $("selectedModePlayers").textContent = mode.players;
  $("selectedModeMap").textContent = MAP_INFO.name;
  $("selectedModeAgent").textContent = agentById(state.agent).name;
  $("roundLengthLabel").textContent = mode.id === "botstrike" ? "90s rounds · first to 4" : "No timer";
  $("selectedModeDifficulty").textContent = `Bots: ${BOT_TUNING[state.settings.botDifficulty].label}`;
}

function refreshSquad() {
  const agent = agentById(state.agent);
  document.querySelectorAll(".agent-card").forEach((c) => c.classList.toggle("is-selected", c.dataset.agent === state.agent));
  $("selectedAgentName").textContent = agent.name;
  $("selectedAgentBio").textContent = agent.bio;
  $("selectedAgentAbility").innerHTML = `<b>${agent.ability.name}</b> <span>[Q]</span> — ${agent.ability.blurb}`;
  $("callsignInput").value = state.callsign;
  $("squadMotto").value = state.motto;
  $("seasonTone").value = state.tone;
}

function refreshLoadout() {
  const weapon = WEAPONS[state.primary];
  document.querySelectorAll(".weapon-card").forEach((c) => c.classList.toggle("is-selected", c.dataset.weapon === state.primary));
  $("selectedPrimaryName").textContent = weapon.name;
  $("selectedPrimaryBody").textContent = weapon.blurb;
  $("loadoutStats").innerHTML = `
    <span>Damage ${weapon.damage}</span>
    <span>Mag ${weapon.mag}</span>
    <span>${weapon.auto ? "Full auto" : "Semi auto"}</span>
    <span>${Math.round(60000 / weapon.cooldownMs)} rpm</span>
  `;
  const skin = SKINS.find((s) => s.id === state.skin) || SKINS[0];
  $("loadoutSkinLabel").textContent = `Sidearm: Backstop · ${skin.name}`;
}

function refreshContracts() {
  const contract = CONTRACTS.find((c) => c.id === state.contract) || CONTRACTS[0];
  const prog = state.contracts[contract.id];
  const tier = contractTier(contract.id);
  document.querySelectorAll(".contract-card").forEach((c) => c.classList.toggle("is-selected", c.dataset.contract === state.contract));
  $("activeContractTitle").textContent = contract.name;
  $("activeContractBody").textContent = contract.body;
  const ladder = $("contractLadder");
  ladder.innerHTML = contract.tiers.map((threshold, i) => `
    <span class="${i < tier ? "is-filled" : ""}">
      <b>${threshold}</b>
      <em>${i < tier ? "done" : contract.metricLabel}</em>
    </span>
  `).join("");
  $("contractProgressLabel").textContent = `${prog.progress} ${contract.metricLabel} total · tier ${tier} of ${contract.tiers.length}`;
  document.querySelectorAll(".contract-card").forEach((card) => {
    const c = CONTRACTS.find((x) => x.id === card.dataset.contract);
    const t = contractTier(c.id);
    card.querySelector("em").textContent = `Tier ${t}/${c.tiers.length} · ${state.contracts[c.id].progress} ${c.metricLabel}`;
  });
}

function refreshProfile() {
  const info = levelInfo();
  const s = state.stats;
  $("profileTitle").textContent = state.callsign;
  $("profileBio").textContent = agentById(state.agent).profile;
  $("profileTitleTag").textContent = titleName();
  $("profileAvatar").textContent = (state.callsign || "A")[0].toUpperCase();
  $("statRank").textContent = rankName();
  $("statLevel").textContent = `Lv ${info.level}`;
  $("statMatches").textContent = String(s.matches);
  $("statWinsBig").textContent = String(s.matchWins);
  $("statKills").textContent = String(s.kills);
  $("statKd").textContent = s.deaths ? (s.kills / s.deaths).toFixed(2) : String(s.kills);
  $("statHeadshots").textContent = String(s.headshots);
  $("statDamageBig").textContent = String(Math.round(s.damage));
  $("profileXpBar").style.width = `${Math.round((info.into / info.next) * 100)}%`;
  $("profileXpLabel").textContent = `${info.into} / ${info.next} XP to level ${info.level + 1}`;

  const list = $("historyList");
  if (!state.matchHistory.length) {
    list.innerHTML = "<li><span>No matches yet — deploy through Play.</span><strong>—</strong></li>";
  } else {
    list.innerHTML = state.matchHistory.map((m) => `
      <li>
        <span>${m.mode} · ${m.score} · ${m.detail}</span>
        <strong class="${m.result === "Victory" ? "is-win" : ""}">${m.result}</strong>
      </li>
    `).join("");
  }
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
  const equippedSkin = SKINS.find((s) => s.id === state.skin) || SKINS[0];
  $("equippedSkinLabel").textContent = `Equipped: ${equippedSkin.name}`;

  $("crosshairGrid").innerHTML = CROSSHAIR_COLORS.map((c) => {
    const unlocked = isUnlocked("crosshair", c.id);
    return `
      <button class="chip ${state.crosshairColor === c.id ? "is-equipped" : ""} ${unlocked ? "" : "is-locked"}"
        data-crosshair="${c.id}" type="button" title="${unlocked ? c.name : `Locked — ${unlockRuleLabel("crosshair", c.id)}`}">
        <i style="background:${c.value}"></i>${c.name}
      </button>
    `;
  }).join("");

  $("titleGrid").innerHTML = TITLES.map((t) => {
    const unlocked = isUnlocked("title", t.id);
    return `
      <button class="chip ${state.title === t.id ? "is-equipped" : ""} ${unlocked ? "" : "is-locked"}"
        data-title="${t.id}" type="button" title="${unlocked ? t.name : `Locked — ${unlockRuleLabel("title", t.id)}`}">
        ${t.name}${unlocked ? "" : " 🔒"}
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
}
