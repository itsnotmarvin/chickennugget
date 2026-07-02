// Angle Protocol — 3D match engine.
// First-person Three.js renderer, grid-based arena, hitscan combat, utility,
// agent abilities, and bot AI. The client (client.js) starts matches and
// receives a report when they end.

import * as THREE from "three";
import {
  WEAPONS, UTILITY, AGENTS, SKINS, CROSSHAIR_COLORS, BOT_TUNING, BOT_NAMES,
  MODES, MAP_GRID, CELL_SIZE,
} from "./data.js";
import { state } from "./state.js";
import { sfx, startAmbient, stopAmbient, applyVolume } from "./audio.js";
import { isBackstab, KNIFE_STATS, withinFacingCone } from "../shared/combat.js";
import { MODE_DEFS } from "../shared/protocol.js";

/* ------------------------------------------------------------------ DOM -- */

const canvas = document.getElementById("game");
const hud = {
  root: document.getElementById("hud"),
  health: document.getElementById("hudHealthFill"),
  healthNum: document.getElementById("hudHealthNum"),
  shield: document.getElementById("hudShieldFill"),
  shieldWrap: document.getElementById("hudShield"),
  ammo: document.getElementById("hudAmmo"),
  reserve: document.getElementById("hudReserve"),
  weapon: document.getElementById("hudWeaponName"),
  frag: document.getElementById("hudFrag"),
  flash: document.getElementById("hudFlash"),
  abilityName: document.getElementById("hudAbilityName"),
  abilityIcon: document.getElementById("hudAbilityIcon"),
  timer: document.getElementById("hudTimer"),
  scoreBlue: document.getElementById("hudScoreBlue"),
  scoreRed: document.getElementById("hudScoreRed"),
  killFeed: document.getElementById("killFeed"),
  banner: document.getElementById("roundBanner"),
  bannerTitle: document.getElementById("bannerTitle"),
  bannerSub: document.getElementById("bannerSub"),
  hitmarker: document.getElementById("hitmarker"),
  crosshair: document.getElementById("crosshair"),
  flashOverlay: document.getElementById("flashOverlay"),
  vignette: document.getElementById("damageVignette"),
  damageDir: document.getElementById("damageDir"),
  radar: document.getElementById("radarCanvas"),
  spectate: document.getElementById("spectateLabel"),
  objective: document.getElementById("hudObjective"),
  hint: document.getElementById("hudHint"),
  reloadNote: document.getElementById("reloadNote"),
};
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseVolume = document.getElementById("pauseVolume");
const pauseSens = document.getElementById("pauseSens");
const pauseMute = document.getElementById("pauseMute");

/* -------------------------------------------------------------- helpers -- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const GRID_H = MAP_GRID.length;
const GRID_W = MAP_GRID[0].length;
const WORLD_W = GRID_W * CELL_SIZE;
const WORLD_H = GRID_H * CELL_SIZE;

const CELL_HEIGHTS = { "#": 4, P: 4, B: 2.2, o: 1.2, c: 1.1 };
const baseHeight = [];
for (let r = 0; r < GRID_H; r += 1) {
  baseHeight.push([]);
  for (let c = 0; c < GRID_W; c += 1) {
    baseHeight[r].push(CELL_HEIGHTS[MAP_GRID[r][c]] || 0);
  }
}
// Temporary overrides (Aegis barrier) — key "r,c" -> { top, until }
const cellOverrides = new Map();

function cellOf(x, z) {
  return {
    c: Math.floor(x / CELL_SIZE + GRID_W / 2),
    r: Math.floor(z / CELL_SIZE + GRID_H / 2),
  };
}
function cellCenter(r, c) {
  return {
    x: (c - GRID_W / 2 + 0.5) * CELL_SIZE,
    z: (r - GRID_H / 2 + 0.5) * CELL_SIZE,
  };
}
function heightAt(r, c) {
  if (r < 0 || c < 0 || r >= GRID_H || c >= GRID_W) return 4;
  const ov = cellOverrides.get(`${r},${c}`);
  if (ov && ov.until > nowMs()) return Math.max(baseHeight[r][c], ov.top);
  return baseHeight[r][c];
}
function heightAtPos(x, z) {
  const { r, c } = cellOf(x, z);
  return heightAt(r, c);
}
function walkableCell(r, c) {
  return heightAt(r, c) === 0;
}

let clockMs = 0;
const nowMs = () => clockMs;

/* -------------------------------------------------- collision & LOS ------ */

const BODY_RADIUS = 0.36;
const STEP_HEIGHT = 0.55;

function collides(x, z, feetY) {
  const minC = Math.floor((x - BODY_RADIUS) / CELL_SIZE + GRID_W / 2);
  const maxC = Math.floor((x + BODY_RADIUS) / CELL_SIZE + GRID_W / 2);
  const minR = Math.floor((z - BODY_RADIUS) / CELL_SIZE + GRID_H / 2);
  const maxR = Math.floor((z + BODY_RADIUS) / CELL_SIZE + GRID_H / 2);
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (heightAt(r, c) > feetY + STEP_HEIGHT) return true;
    }
  }
  return false;
}

function groundAt(x, z, feetY) {
  const minC = Math.floor((x - BODY_RADIUS * 0.8) / CELL_SIZE + GRID_W / 2);
  const maxC = Math.floor((x + BODY_RADIUS * 0.8) / CELL_SIZE + GRID_W / 2);
  const minR = Math.floor((z - BODY_RADIUS * 0.8) / CELL_SIZE + GRID_H / 2);
  const maxR = Math.floor((z + BODY_RADIUS * 0.8) / CELL_SIZE + GRID_H / 2);
  let ground = 0;
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      const h = heightAt(r, c);
      if (h > 0 && h <= feetY + STEP_HEIGHT && h > ground) ground = h;
    }
  }
  return ground;
}

// March a ray through the height grid. Returns distance to the wall hit, or
// Infinity. Cheap and exact enough for a grid arena.
function wallRay(ox, oy, oz, dx, dy, dz, maxDist) {
  const step = 0.14;
  for (let d = step; d <= maxDist; d += step) {
    const x = ox + dx * d;
    const y = oy + dy * d;
    const z = oz + dz * d;
    if (y <= 0.02) return d;
    if (y < heightAtPos(x, z)) return d;
  }
  return Infinity;
}

function hasLos(ax, ay, az, bx, by, bz) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  return wallRay(ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.1) === Infinity;
}

/* ------------------------------------------------------------ A* paths --- */

function findPath(fromR, fromC, toR, toC) {
  if (!walkableCell(toR, toC)) {
    // Retarget to nearest walkable neighbour.
    let best = null;
    for (let r = toR - 2; r <= toR + 2; r += 1) {
      for (let c = toC - 2; c <= toC + 2; c += 1) {
        if (walkableCell(r, c)) {
          const d = Math.abs(r - toR) + Math.abs(c - toC);
          if (!best || d < best.d) best = { r, c, d };
        }
      }
    }
    if (!best) return null;
    toR = best.r; toC = best.c;
  }
  const key = (r, c) => r * GRID_W + c;
  const open = [{ r: fromR, c: fromC, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[key(fromR, fromC), 0]]);
  const closed = new Set();
  const h = (r, c) => Math.abs(r - toR) + Math.abs(c - toC);
  let guard = 0;
  while (open.length && guard < 2600) {
    guard += 1;
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.r, cur.c);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.r === toR && cur.c === toC) {
      const path = [];
      let k = ck;
      while (came.has(k)) {
        path.unshift({ r: Math.floor(k / GRID_W), c: k % GRID_W });
        k = came.get(k);
      }
      return path;
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr; const nc = cur.c + dc;
      if (!walkableCell(nr, nc)) continue;
      const nk = key(nr, nc);
      const ng = cur.g + 1;
      if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
      gScore.set(nk, ng);
      came.set(nk, ck);
      open.push({ r: nr, c: nc, g: ng, f: ng + h(nr, nc) });
    }
  }
  return null;
}

function walkClear(ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(dist / 0.4);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (heightAtPos(lerp(ax, bx, t), lerp(az, bz, t)) > 0) return false;
  }
  return true;
}

function smoothPath(points) {
  if (!points || points.length < 3) return points;
  const out = [points[0]];
  let anchor = points[0];
  for (let i = 2; i < points.length; i += 1) {
    if (!walkClear(anchor.x, anchor.z, points[i].x, points[i].z)) {
      out.push(points[i - 1]);
      anchor = points[i - 1];
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/* -------------------------------------------------------- three.js core -- */

let renderer = null;
let scene = null;
let camera = null;
let viewmodel = null;
const disposables = [];

function track(obj) { disposables.push(obj); return obj; }

function makeCanvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const cnv = document.createElement("canvas");
  cnv.width = size; cnv.height = size;
  draw(cnv.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return track(tex);
}

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  window.addEventListener("resize", onResize);
}

function applyQuality() {
  const high = state.settings.quality !== "fast";
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  renderer.shadowMap.enabled = high;
  if (scene) {
    scene.traverse((o) => {
      if (o.userData.qualityShadow) {
        o.castShadow = high;
      }
    });
    if (scene.fog) scene.fog.far = high ? 105 : 78;
  }
  onResize();
}

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------- map build - */

const TEAM_COLORS = { blue: 0x3bd0c2, red: 0xf05f51 };
let barrierMesh = null;
let radarBase = null; // offscreen top-down map image for the radar

function buildTextSign(text, sub, color) {
  const cnv = document.createElement("canvas");
  cnv.width = 512; cnv.height = 256;
  const g = cnv.getContext("2d");
  g.fillStyle = "#141719";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(12, 12, 488, 232);
  g.fillStyle = color;
  g.font = "900 92px Inter, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, sub ? 100 : 128);
  if (sub) {
    g.fillStyle = "#b9ad91";
    g.font = "700 44px Inter, sans-serif";
    g.fillText(sub, 256, 188);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  track(tex);
  const mat = track(new THREE.MeshBasicMaterial({ map: tex }));
  const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 1.7)), mat);
  return mesh;
}

function buildMap() {
  scene.background = new THREE.Color(0x1c2836);
  scene.fog = new THREE.Fog(0x2a3546, 30, 110);

  // Sky dome — dusk gradient.
  const skyTex = makeCanvasTexture(512, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, "#182740");
    grad.addColorStop(0.34, "#3a5570");
    grad.addColorStop(0.45, "#8a5c4a");
    grad.addColorStop(0.52, "#e8a45c");
    grad.addColorStop(0.6, "#f6cd84");
    grad.addColorStop(1, "#f6d18e");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(160, 24, 12)),
    track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })),
  );
  scene.add(sky);

  // Lights.
  scene.add(new THREE.HemisphereLight(0xc4d6ea, 0x54452f, 1.7));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-22, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.002;
  scene.add(sun);
  const fillA = new THREE.PointLight(0x3bd0c2, 60, 34);
  fillA.position.set(-WORLD_W / 2 + 6, 5, 0);
  scene.add(fillA);
  const fillB = new THREE.PointLight(0xf05f51, 60, 34);
  fillB.position.set(WORLD_W / 2 - 6, 5, 0);
  scene.add(fillB);
  const fillMid = new THREE.PointLight(0xf1c36e, 70, 30);
  fillMid.position.set(0, 6.5, 0);
  scene.add(fillMid);

  // Floor.
  const floorTex = makeCanvasTexture(1024, (g, s) => {
    g.fillStyle = "#33383c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i += 1) {
      g.fillStyle = `rgba(${20 + Math.random() * 40}, ${22 + Math.random() * 40}, ${24 + Math.random() * 40}, 0.16)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    g.strokeStyle = "rgba(12, 14, 16, 0.6)";
    g.lineWidth = 3;
    const cell = s / 8;
    for (let i = 0; i <= 8; i += 1) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(s, i * cell); g.stroke();
    }
  }, WORLD_W / 16, WORLD_H / 16);
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(WORLD_W, WORLD_H)),
    track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.94 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Team-colored spawn aprons + center emblem.
  const apron = (color, x) => {
    const m = new THREE.Mesh(
      track(new THREE.PlaneGeometry(7, 12)),
      track(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.2, emissive: color, emissiveIntensity: 0.55, roughness: 1 })),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, 0);
    scene.add(m);
  };
  apron(TEAM_COLORS.blue, -WORLD_W / 2 + 4.5);
  apron(TEAM_COLORS.red, WORLD_W / 2 - 4.5);
  const emblemTex = makeCanvasTexture(512, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = "rgba(241, 195, 110, 0.9)";
    g.lineWidth = 14;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2); g.stroke();
    g.save();
    g.translate(s / 2, s / 2); g.rotate(Math.PI / 4);
    g.strokeRect(-s * 0.18, -s * 0.18, s * 0.36, s * 0.36);
    g.restore();
    g.fillStyle = "rgba(241, 195, 110, 0.9)";
    g.font = "900 44px Inter, sans-serif";
    g.textAlign = "center";
    g.fillText("FOUNDRY", s / 2, s * 0.94);
  });
  const emblem = new THREE.Mesh(
    track(new THREE.PlaneGeometry(8, 8)),
    track(new THREE.MeshBasicMaterial({ map: emblemTex, transparent: true, depthWrite: false })),
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.02;
  scene.add(emblem);

  // Wall / prop instancing.
  const wallTex = makeCanvasTexture(256, (g, s) => {
    g.fillStyle = "#4a4f54";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#41464b";
    g.fillRect(0, s * 0.42, s, s * 0.16);
    g.strokeStyle = "rgba(20, 22, 24, 0.5)";
    g.lineWidth = 4;
    g.strokeRect(6, 6, s - 12, s - 12);
    g.fillStyle = "rgba(240, 200, 130, 0.08)";
    g.fillRect(0, 0, s, 10);
  });
  const wallMat = track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  const crateTex = makeCanvasTexture(256, (g, s) => {
    g.fillStyle = "#6e5330";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#4a3820";
    g.lineWidth = 10;
    g.strokeRect(8, 8, s - 16, s - 16);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
    g.beginPath(); g.moveTo(s - 8, 8); g.lineTo(8, s - 8); g.stroke();
  });
  const crateMat = track(new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 }));
  const stackMat = track(new THREE.MeshStandardMaterial({ color: 0x536070, roughness: 0.7, metalness: 0.25 }));
  const pillarMat = track(new THREE.MeshStandardMaterial({ color: 0x5a636c, roughness: 0.6, metalness: 0.35 }));
  const drumMat = track(new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.55, metalness: 0.3 }));

  const cellsByType = { "#": [], B: [], c: [], o: [], P: [] };
  for (let r = 0; r < GRID_H; r += 1) {
    for (let c = 0; c < GRID_W; c += 1) {
      const ch = MAP_GRID[r][c];
      if (cellsByType[ch]) cellsByType[ch].push({ r, c });
    }
  }

  const addInstances = (cells, geo, mat, yOf, shadow = true) => {
    if (!cells.length) return null;
    const mesh = new THREE.InstancedMesh(track(geo), mat, cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach((cell, i) => {
      const { x, z } = cellCenter(cell.r, cell.c);
      m4.makeTranslation(x, yOf, z);
      mesh.setMatrixAt(i, m4);
    });
    mesh.userData.qualityShadow = shadow;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  addInstances(cellsByType["#"], new THREE.BoxGeometry(CELL_SIZE, 4, CELL_SIZE), wallMat, 2, false);
  addInstances(cellsByType.B, new THREE.BoxGeometry(CELL_SIZE * 0.96, 2.2, CELL_SIZE * 0.96), stackMat, 1.1);
  addInstances(cellsByType.c, new THREE.BoxGeometry(CELL_SIZE * 0.92, 1.1, CELL_SIZE * 0.92), crateMat, 0.55);
  addInstances(cellsByType.o, new THREE.CylinderGeometry(0.82, 0.82, 1.2, 10), drumMat, 0.6);
  addInstances(cellsByType.P, new THREE.CylinderGeometry(0.72, 0.86, 4, 8), pillarMat, 2);

  // Wall trim strips (team orientation).
  const trim = (color, x) => {
    const geo = track(new THREE.BoxGeometry(0.12, 0.24, WORLD_H - 4));
    const mat = track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 2.6, 0);
    scene.add(mesh);
  };
  trim(TEAM_COLORS.blue, -WORLD_W / 2 + CELL_SIZE + 0.06);
  trim(TEAM_COLORS.red, WORLD_W / 2 - CELL_SIZE - 0.06);

  // Signs.
  const signs = [
    { text: "FOUNDRY", sub: "CASTING HALL 03", color: "#f1c36e", x: 0, y: 3.1, z: -WORLD_H / 2 + CELL_SIZE + 0.06, ry: 0 },
    { text: "FOUNDRY", sub: "CASTING HALL 03", color: "#f1c36e", x: 0, y: 3.1, z: WORLD_H / 2 - CELL_SIZE - 0.06, ry: Math.PI },
    { text: "WEST BAY", sub: "◀ COLD LINE", color: "#3bd0c2", x: -WORLD_W / 2 + CELL_SIZE + 0.06, y: 3.1, z: 0, ry: Math.PI / 2 },
    { text: "EAST BAY", sub: "HOT LINE ▶", color: "#f05f51", x: WORLD_W / 2 - CELL_SIZE - 0.06, y: 3.1, z: 0, ry: -Math.PI / 2 },
    { text: "MID", sub: "TWO DOORS", color: "#f4ead6", x: 0, y: 2.9, z: -5.1, ry: 0 },
    { text: "MID", sub: "TWO DOORS", color: "#f4ead6", x: 0, y: 2.9, z: 5.1, ry: Math.PI },
  ];
  for (const s of signs) {
    const mesh = buildTextSign(s.text, s.sub, s.color);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.ry;
    scene.add(mesh);
  }

  // Hanging light fixtures down the mid line.
  const fixtureGeo = track(new THREE.BoxGeometry(1.6, 0.18, 0.5));
  const fixtureMat = track(new THREE.MeshStandardMaterial({ color: 0x20242a, emissive: 0xffe6b8, emissiveIntensity: 1.6 }));
  for (const z of [-12, 0, 12]) {
    const f = new THREE.Mesh(fixtureGeo, fixtureMat);
    f.position.set(0, 4.6, z);
    scene.add(f);
    const rodGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4));
    const rod = new THREE.Mesh(rodGeo, pillarMat);
    rod.position.set(0, 5.9, z);
    scene.add(rod);
  }

  // Aegis barrier visual (hidden until deployed).
  barrierMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(CELL_SIZE * 3, 2.4, 0.24)),
    track(new THREE.MeshStandardMaterial({
      color: 0x3bd0c2, emissive: 0x3bd0c2, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false,
    })),
  );
  barrierMesh.visible = false;
  scene.add(barrierMesh);

  buildRadarBase();
}

function buildRadarBase() {
  radarBase = document.createElement("canvas");
  radarBase.width = GRID_W * 6;
  radarBase.height = GRID_H * 6;
  const g = radarBase.getContext("2d");
  g.fillStyle = "rgba(10, 14, 16, 0.92)";
  g.fillRect(0, 0, radarBase.width, radarBase.height);
  for (let r = 0; r < GRID_H; r += 1) {
    for (let c = 0; c < GRID_W; c += 1) {
      const h = baseHeight[r][c];
      if (h >= 4) g.fillStyle = "rgba(244, 234, 214, 0.85)";
      else if (h >= 2) g.fillStyle = "rgba(244, 234, 214, 0.5)";
      else if (h > 0) g.fillStyle = "rgba(244, 234, 214, 0.28)";
      else continue;
      g.fillRect(c * 6, r * 6, 6, 6);
    }
  }
}

/* -------------------------------------------------------- character rigs - */

function buildCharacterRig(teamColor) {
  const group = new THREE.Group();
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.8 }));
  const teamMat = track(new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.35, roughness: 0.6 }));
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xc9a985, roughness: 0.9 }));

  const torso = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.74, 0.34)), bodyMat);
  torso.position.y = 1.08;
  const chest = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.3, 0.38)), teamMat);
  chest.position.y = 1.26;
  const hips = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.28, 0.32)), bodyMat);
  hips.position.y = 0.66;
  const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.36, 0.34)), skinMat);
  head.position.y = 1.66;
  const visor = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.12, 0.1)), teamMat);
  visor.position.set(0, 1.7, 0.16);

  const legGeo = track(new THREE.BoxGeometry(0.2, 0.62, 0.24));
  const legL = new THREE.Mesh(legGeo, bodyMat); legL.position.set(-0.16, 0.31, 0);
  const legR = new THREE.Mesh(legGeo, bodyMat); legR.position.set(0.16, 0.31, 0);
  const armGeo = track(new THREE.BoxGeometry(0.16, 0.56, 0.2));
  const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.42, 1.12, 0.05);
  const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set(0.42, 1.12, 0.05);

  const gun = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 0.14, 0.78)), track(new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.5, metalness: 0.4 })));
  gun.position.set(0.24, 1.22, 0.42);

  group.add(torso, chest, hips, head, visor, legL, legR, armL, armR, gun);
  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.userData.qualityShadow = true; }
  });
  return { group, legL, legR, armL, armR, head, flashMats: [teamMat, bodyMat] };
}

/* ------------------------------------------------------------- viewmodel - */

function buildViewmodel() {
  viewmodel = new THREE.Group();
  camera.add(viewmodel);

  const dark = track(new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.45, metalness: 0.5 }));
  const mid = track(new THREE.MeshStandardMaterial({ color: 0x49525c, roughness: 0.55, metalness: 0.35 }));
  const wood = track(new THREE.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.8 }));

  const rigs = {};

  const makeRifle = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.11, 0.62)), dark);
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8)), mid);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.44);
    const guard = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.07, 0.24)), wood);
    guard.position.set(0, -0.02, -0.28);
    const mag = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.2, 0.09)), mid);
    mag.position.set(0, -0.14, -0.02); mag.rotation.x = 0.24;
    const stock = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.09, 0.2)), wood);
    stock.position.set(0, -0.01, 0.36);
    const sight = new THREE.Mesh(track(new THREE.BoxGeometry(0.02, 0.05, 0.06)), dark);
    sight.position.set(0, 0.08, -0.1);
    g.add(body, barrel, guard, mag, stock, sight);
    return { group: g, muzzle: new THREE.Vector3(0, 0.015, -0.6) };
  };
  const makeSmg = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.12, 0.4)), dark);
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 8)), mid);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.28);
    const shroud = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.036, 0.16, 8)), dark);
    shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.02, -0.24);
    const mag = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, 0.24, 0.08)), mid);
    mag.position.set(0, -0.16, -0.06);
    g.add(body, barrel, shroud, mag);
    return { group: g, muzzle: new THREE.Vector3(0, 0.02, -0.38) };
  };
  const makeDmr = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.065, 0.1, 0.78)), mid);
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8)), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.56);
    const scope = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8)), dark);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.09, -0.08);
    const stock = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.11, 0.24)), wood);
    stock.position.set(0, -0.02, 0.44);
    const mag = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.14, 0.08)), dark);
    mag.position.set(0, -0.11, 0.02);
    g.add(body, barrel, scope, stock, mag);
    return { group: g, muzzle: new THREE.Vector3(0, 0.02, -0.76) };
  };
  const makePistol = (skin) => {
    const g = new THREE.Group();
    const mainMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.main), roughness: 0.4, metalness: 0.3 }));
    const accentMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.accent), roughness: 0.5 }));
    const gripMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.grip), roughness: 0.8 }));
    const slide = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, 0.07, 0.26)), mainMat);
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.05, 0.22)), accentMat);
    frame.position.set(0, -0.05, 0.01);
    const grip = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, 0.14, 0.07)), gripMat);
    grip.position.set(0, -0.12, 0.08); grip.rotation.x = 0.28;
    const muzzleRing = new THREE.Mesh(track(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8)), accentMat);
    muzzleRing.rotation.x = Math.PI / 2; muzzleRing.position.set(0, 0, -0.15);
    g.add(slide, frame, grip, muzzleRing);
    return { group: g, muzzle: new THREE.Vector3(0, 0, -0.22) };
  };
  const makeKnife = () => {
    const g = new THREE.Group();
    const bladeMat = track(new THREE.MeshStandardMaterial({ color: 0xcbd4db, roughness: 0.24, metalness: 0.9 }));
    const edgeMat = track(new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.12, metalness: 0.92 }));
    const gripMat = track(new THREE.MeshStandardMaterial({ color: 0x121519, roughness: 0.78 }));
    const blade = new THREE.Mesh(track(new THREE.BoxGeometry(0.018, 0.045, 0.46)), bladeMat);
    blade.position.set(0, 0.018, -0.2);
    const edge = new THREE.Mesh(track(new THREE.BoxGeometry(0.008, 0.05, 0.26)), edgeMat);
    edge.position.set(0, 0.02, -0.32);
    const guard = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, 0.028, 0.02)), gripMat);
    guard.position.set(0, -0.02, 0.02);
    const handle = new THREE.Mesh(track(new THREE.BoxGeometry(0.036, 0.12, 0.12)), gripMat);
    handle.position.set(0, -0.08, 0.12);
    handle.rotation.x = 0.16;
    g.add(blade, edge, guard, handle);
    g.rotation.set(0.2, 0.6, 0.18);
    g.position.set(0.04, -0.04, 0.1);
    return { group: g, muzzle: new THREE.Vector3(0, 0, -0.46) };
  };

  const skin = SKINS.find((s) => s.id === state.skin) || SKINS[0];
  rigs.pike = makeRifle();
  rigs.wasp = makeSmg();
  rigs.longshot = makeDmr();
  rigs.backstop = makePistol(skin);
  rigs.knife = makeKnife();

  for (const key of Object.keys(rigs)) {
    rigs[key].group.visible = false;
    viewmodel.add(rigs[key].group);
  }
  viewmodel.scale.setScalar(0.5);
  viewmodel.rotation.y = 0.06;
  viewmodel.position.set(0.28, -0.25, -0.46);

  // Muzzle flash sprite + light shared across rigs.
  const flashTex = makeCanvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255, 240, 190, 1)");
    grad.addColorStop(0.4, "rgba(255, 190, 90, 0.85)");
    grad.addColorStop(1, "rgba(255, 140, 40, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  const flashMat = track(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const muzzleSprite = new THREE.Sprite(flashMat);
  muzzleSprite.scale.set(0.22, 0.22, 0.22);
  muzzleSprite.visible = false;
  viewmodel.add(muzzleSprite);
  const muzzleLight = new THREE.PointLight(0xffc873, 0, 7);
  camera.add(muzzleLight);
  muzzleLight.position.set(0.2, -0.15, -1);

  viewmodel.userData = { rigs, muzzleSprite, muzzleLight };
}

/* ------------------------------------------------------------ FX pools --- */

const tracers = [];
const particles = [];
let tracerMat = null;
let sparkGeo = null;

function initFx() {
  tracerMat = track(new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparkGeo = track(new THREE.BoxGeometry(0.045, 0.045, 0.045));
}

function spawnTracer(from, to, color = 0xffe2a8) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 0.4) return;
  const geo = new THREE.BoxGeometry(0.016, 0.016, len);
  const mat = tracerMat.clone();
  mat.color = new THREE.Color(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from).add(dir.multiplyScalar(0.5));
  mesh.lookAt(to);
  scene.add(mesh);
  tracers.push({ mesh, life: 0.07, geo });
}

function spawnSparks(pos, color, count = 8) {
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: rand(-2.4, 2.4), vy: rand(0.6, 3.4), vz: rand(-2.4, 2.4),
      life: rand(0.18, 0.4),
    });
  }
}

function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    const t = tracers[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      t.geo.dispose();
      t.mesh.material.dispose();
      tracers.splice(i, 1);
    }
  }
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.vy -= 9 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mat.opacity = clamp(p.life * 4, 0, 1);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mat.dispose();
      particles.splice(i, 1);
    }
  }
}

/* -------------------------------------------------------------- match ---- */

const FREEZE_MS = 3000;
const ROUND_END_MS = 3000;
const MATCH_END_MS = 3200;
const KNIFE_VIEWMODEL = {
  id: "knife",
  name: "Knife",
  short: "KNF",
  slot: "melee",
  kind: "melee",
  auto: false,
  mag: 0,
  reserve: 0,
  damage: KNIFE_STATS.slash.damage,
  headMult: 1,
  cooldownMs: KNIFE_STATS.slash.cooldownMs,
  reloadMs: 0,
  spread: 0,
  moveSpread: 0,
  recoil: 0,
  kick: 0,
  range: KNIFE_STATS.slash.range,
  speedMult: KNIFE_STATS.moveSpeedMult,
};

let match = null; // active match state
let player = null;
let combatants = [];
let grenades = [];
let animId = 0;
let lastFrame = 0;
let onEndCallback = null;

const keysDown = new Set();
let mouseDown = false;
let pointerLockWanted = false;

export function isMatchActive() {
  return !!match;
}

function weaponState(id) {
  if (id === "knife") {
    return { id, def: KNIFE_VIEWMODEL, mag: 0, reserve: 0, lastShot: -9999, reloadingUntil: 0 };
  }
  const def = WEAPONS[id];
  return { id, def, mag: def.mag, reserve: def.reserve, lastShot: -9999, reloadingUntil: 0 };
}

function makePlayer() {
  const agent = AGENTS.find((a) => a.id === state.agent) || AGENTS[0];
  return {
    isPlayer: true,
    team: "blue",
    name: state.callsign || "Aegis",
    agent,
    x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0,
    hp: 100, shield: 0, shieldDecay: 0,
    alive: true,
    weapons: { primary: weaponState(state.primary), sidearm: weaponState("backstop"), melee: weaponState("knife") },
    slot: "primary",
    frags: UTILITY.frag.perRound,
    flashes: UTILITY.flash.perRound,
    abilityReadyAt: 0,
    surgeUntil: 0,
    pulseUntil: 0,
    blindUntil: 0,
    kills: 0, deaths: 0, damage: 0, headshots: 0,
    stepAcc: 0,
    landedAt: -999,
    lastDamageAt: -999,
    id: null,
    online: false,
    connected: true,
    meleeUntil: 0,
    meleeAnimUntil: 0,
    meleeAnimKind: "slash",
    inspectUntil: 0,
  };
}

function makeBot({ team, name, agent, tuning }) {
  const rig = buildCharacterRig(TEAM_COLORS[team]);
  scene.add(rig.group);
  return {
    isPlayer: false,
    team, name, agent, tuning, rig,
    x: 0, z: 0, y: 0, yaw: 0,
    hp: 100, alive: true,
    weaponKind: team === "blue" ? "rifle" : "rifle",
    lastShot: -9999,
    burstUntil: 0, burstGapUntil: 0,
    reloadUntil: 0, shotsInMag: 24,
    state: "patrol",
    path: null, pathIdx: 0, pathTarget: null, repathAt: 0,
    lastSeenEnemy: null, lastSeenAt: -9999,
    noticedAt: null,
    blindUntil: 0, fleeFrom: null, fleeUntil: 0,
    coverUntil: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1, strafeFlipAt: 0,
    kills: 0, deaths: 0, damage: 0,
    animT: Math.random() * 10,
    deadFall: 0,
    lastFiredAt: -9999,
    stepAcc: 0,
  };
}

function makeRemotePlayer(entry, seat = 0) {
  const rig = buildCharacterRig(TEAM_COLORS[entry.team] || TEAM_COLORS.red);
  scene.add(rig.group);
  rig.group.visible = false;
  return {
    id: entry.id,
    isPlayer: false,
    isRemote: true,
    connected: entry.connected ?? true,
    team: entry.team,
    name: entry.name,
    agent: AGENTS[seat % AGENTS.length],
    rig,
    x: 0,
    z: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
    hp: entry.hp ?? 100,
    alive: entry.alive ?? true,
    weaponKind: "rifle",
    activeWeapon: entry.weapon || "pike",
    kills: entry.kills ?? 0,
    deaths: entry.deaths ?? 0,
    damage: 0,
    animT: Math.random() * 10,
    deadFall: 0,
    moving: false,
    lastFiredAt: -9999,
    stepAcc: 0,
  };
}

function isOnlineMatch() {
  return !!match?.online;
}

function phaseLabel(phase) {
  if (phase === "freeze") return "freeze";
  if (phase === "live") return "live";
  if (phase === "round_end") return "roundEnd";
  if (phase === "match_end") return "matchEnd";
  return phase || "lobby";
}

function spawnCells(ch) {
  const cells = [];
  for (let r = 0; r < GRID_H; r += 1) {
    for (let c = 0; c < GRID_W; c += 1) {
      if (MAP_GRID[r][c] === ch) cells.push({ r, c });
    }
  }
  return cells;
}

function placeAtSpawn(entity, cell, faceX) {
  const { x, z } = cellCenter(cell.r, cell.c);
  entity.x = x; entity.z = z; entity.y = 0;
  entity.vy = 0;
  entity.yaw = Math.atan2(faceX - x, 0 - z) - Math.PI; // face arena center-ish
  entity.yaw = Math.atan2(-(0 - x), -(0 - z));
  if (entity.isPlayer) entity.pitch = 0;
}

/* -------------------------------------------------- match orchestration -- */

export function startMatch({ modeId, onEnd }) {
  initRenderer();
  onEndCallback = onEnd;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);
  scene.add(camera);

  clockMs = 0;
  cellOverrides.clear();
  initFx();
  buildMap();
  buildViewmodel();
  applyQuality();
  onResize();
  applyVolume();

  const mode = MODES[modeId];
  const tuning = BOT_TUNING[state.settings.botDifficulty] || BOT_TUNING.normal;
  player = makePlayer();
  combatants = [player];
  grenades = [];

  match = {
    mode,
    scoreBlue: 0,
    scoreRed: 0,
    round: 0,
    phase: "freeze",
    phaseUntil: 0,
    roundEndsAt: 0,
    paused: false,
    startedAt: performance.now(),
    utilityHits: 0,
    feedTimer: 0,
    // Training range only:
    targets: [],
    targetsDown: 0,
    shotsFired: 0,
    shotsHit: 0,
    lastTick: -1,
    ended: false,
  };

  if (mode.id === "botstrike" || mode.id === "duelbot") {
    const allyAgent = AGENTS[(AGENTS.findIndex((a) => a.id === state.agent) + 1) % AGENTS.length];
    const enemyNames = [...BOT_NAMES.enemy].sort(() => Math.random() - 0.5);
    if (mode.id === "botstrike") {
      combatants.push(makeBot({ team: "blue", name: BOT_NAMES.ally[Math.floor(Math.random() * BOT_NAMES.ally.length)], agent: allyAgent, tuning }));
    }
    combatants.push(makeBot({ team: "red", name: enemyNames[0], agent: AGENTS[1], tuning }));
    if (mode.id === "botstrike") {
      combatants.push(makeBot({ team: "red", name: enemyNames[1], agent: AGENTS[3], tuning }));
    }
  } else {
    buildRangeTargets();
  }

  document.body.classList.remove("is-client");
  document.body.classList.add("is-match");
  hud.root.classList.add("is-active");
  hud.killFeed.innerHTML = "";
  pauseOverlay.classList.remove("is-active");
  updateScorePips();
  applyCrosshair();
  hud.objective.style.display = mode.id === "range" ? "flex" : "none";
  document.getElementById("hudMatchInfo").style.display = mode.id === "range" ? "none" : "flex";
  hud.hint.textContent = "WASD move · SHIFT sprint · SPACE jump · 1/2/3 weapons · 4/5 utility · Q ability · F inspect · R reload · ESC pause";
  hud.hint.classList.add("is-active");
  setTimeout(() => hud.hint.classList.remove("is-active"), 6500);

  startAmbient();
  bindMatchInput();
  refreshViewmodel();

  if (mode.id === "botstrike" || mode.id === "duelbot") {
    beginRound();
  } else {
    match.phase = "live";
    placeAtSpawn(player, spawnCells("1")[1], 0);
    requestLock();
    showBanner("TRAINING RANGE", "Free fire — pop the gold frames", 2600);
    sfx.roundStart();
  }

  lastFrame = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(frame);
}

function syncOnlineWeaponSlot(weaponId) {
  if (weaponId === "backstop") {
    player.slot = "sidearm";
    return;
  }
  if (weaponId === "knife") {
    player.slot = "melee";
    return;
  }
  player.slot = "primary";
}

function resetOnlineRoundState() {
  grenades.forEach((g) => scene.remove(g.mesh));
  grenades = [];
  cellOverrides.clear();
  barrierMesh.visible = false;
  hud.spectate.classList.remove("is-active");
  player.frags = 0;
  player.flashes = 0;
  player.shield = 0;
  player.shieldDecay = 0;
  player.abilityReadyAt = Infinity;
  player.meleeUntil = 0;
  player.meleeAnimUntil = 0;
  player.inspectUntil = 0;
}

function ensureOnlineCombatant(summary, seat = 0) {
  if (summary.id === player.id) return player;
  let unit = combatants.find((entry) => entry.id === summary.id);
  if (!unit) {
    unit = makeRemotePlayer(summary, seat);
    combatants.push(unit);
  }
  unit.name = summary.name;
  unit.team = summary.team;
  unit.connected = summary.connected;
  unit.activeWeapon = summary.weapon || unit.activeWeapon;
  unit.kills = summary.kills ?? unit.kills;
  unit.deaths = summary.deaths ?? unit.deaths;
  if (!summary.alive && unit.alive) {
    unit.deadFall = Math.max(unit.deadFall, 0.001);
  }
  unit.alive = summary.alive;
  unit.hp = summary.hp;
  unit.rig.group.visible = summary.connected !== false;
  return unit;
}

function syncOnlineRoster(playersSummary) {
  playersSummary.forEach((summary, index) => {
    const unit = ensureOnlineCombatant(summary, index);
    unit.name = summary.name;
    unit.team = summary.team;
    unit.connected = summary.connected;
    unit.alive = summary.alive;
    unit.hp = summary.hp;
    unit.kills = summary.kills;
    unit.deaths = summary.deaths;
    unit.activeWeapon = summary.weapon || unit.activeWeapon;
    if (summary.id === player.id) {
      player.connected = summary.connected;
      player.team = summary.team;
      player.alive = summary.alive;
      player.hp = summary.hp;
      player.kills = summary.kills;
      player.deaths = summary.deaths;
      syncOnlineWeaponSlot(summary.weapon || player.weapons[player.slot].id);
    }
  });
}

function findCombatantById(id) {
  return combatants.find((unit) => unit.id === id) || null;
}

function addKillFeedSafe(attackerId, victimId, head) {
  const attacker = findCombatantById(attackerId);
  const victim = findCombatantById(victimId);
  if (!attacker || !victim) return;
  addKillFeed(attacker, victim, head);
}

function syncOnlineSnapshot(sample) {
  if (!sample?.players?.length) return;
  for (const entry of sample.players) {
    const unit = findCombatantById(entry.id);
    if (!unit) continue;
    if (unit === player) {
      const error = Math.hypot(player.x - entry.x, player.y - entry.y, player.z - entry.z);
      if (error > 2) {
        player.x = entry.x;
        player.y = entry.y;
        player.z = entry.z;
        player.velX = entry.vx;
        player.velZ = entry.vz;
      }
      continue;
    }
    unit.x = entry.x;
    unit.y = entry.y;
    unit.z = entry.z;
    unit.yaw = entry.yaw;
    unit.pitch = entry.pitch;
    unit.activeWeapon = entry.weapon || unit.activeWeapon;
    unit.moving = Math.hypot(entry.vx, entry.vz) > 0.25;
    unit.rig.group.visible = unit.connected !== false;
  }
}

function wireOnlineEvents(net) {
  const unsubs = [];
  const bind = (type, handler) => {
    unsubs.push(net.on(type, handler));
  };

  bind("room_state", (payload) => {
    if (!match || !match.online) return;
    match.roomId = payload.roomId;
    match.roomCode = payload.code;
    match.roomMode = payload.mode;
    match.serverPhase = payload.phase;
    match.phase = phaseLabel(payload.phase);
    match.round = payload.round;
    match.scoreBlue = payload.scoreBlue;
    match.scoreRed = payload.scoreRed;
    match.phaseUntilServer = payload.phaseEndsAt;
    match.roundEndsAtServer = payload.roundEndsAt;
    syncOnlineRoster(payload.players);
    updateScorePips();
    if (payload.phase === "lobby") {
      showBanner("WAITING FOR OPPONENT", payload.code ? `Room ${payload.code}` : "Match setup", 1400);
    }
    if (payload.phase === "freeze") {
      resetOnlineRoundState();
    }
  });

  bind("hit", (payload) => {
    if (!match || !match.online) return;
    const attacker = findCombatantById(payload.attackerId);
    const victim = findCombatantById(payload.victimId);
    if (victim) {
      victim.hp = payload.hp;
      if (payload.hp <= 0) victim.alive = false;
    }
    if (attacker?.isPlayer) {
      player.damage += payload.damage;
      showHitmarker(payload.head, payload.hp <= 0);
      if (payload.head) sfx.headshot();
      else sfx.hit();
    }
    if (victim?.isPlayer && attacker) {
      player.lastDamageAt = nowMs();
      sfx.damaged();
      showDamageDirection(attacker);
    }
  });

  bind("kill", (payload) => {
    if (!match || !match.online) return;
    const attacker = findCombatantById(payload.attackerId);
    const victim = findCombatantById(payload.victimId);
    if (attacker) attacker.kills += 1;
    if (victim) {
      victim.alive = false;
      victim.hp = 0;
      victim.deaths += 1;
      if (victim.isPlayer) {
        hud.spectate.classList.add("is-active");
        hud.spectate.textContent = "DOWN";
      } else {
        victim.deadFall = Math.max(victim.deadFall, 0.001);
      }
    }
    if (attacker?.isPlayer) {
      if (payload.head) player.headshots += 1;
      sfx.kill();
    }
    addKillFeedSafe(payload.attackerId, payload.victimId, payload.head);
  });

  bind("round_start", (payload) => {
    if (!match || !match.online) return;
    match.phase = "freeze";
    match.serverPhase = "freeze";
    match.round = payload.round;
    match.scoreBlue = payload.scoreBlue;
    match.scoreRed = payload.scoreRed;
    match.phaseUntilServer = payload.freezeEndsAt;
    resetOnlineRoundState();
    updateScorePips();
    showBanner(`ROUND ${payload.round}`, `First to ${match.mode.scoreTarget} — ${payload.scoreBlue} : ${payload.scoreRed}`, FREEZE_MS - 200);
    sfx.roundStart();
  });

  bind("round_end", (payload) => {
    if (!match || !match.online) return;
    match.phase = "roundEnd";
    match.serverPhase = "round_end";
    match.scoreBlue = payload.scoreBlue;
    match.scoreRed = payload.scoreRed;
    updateScorePips();
    if (payload.winner === player.team) {
      showBanner("ROUND WON", `${payload.scoreBlue} : ${payload.scoreRed}`, ROUND_END_MS - 300, "win");
      sfx.roundWin();
    } else if (payload.winner && payload.winner !== "draw") {
      showBanner("ROUND LOST", `${payload.scoreBlue} : ${payload.scoreRed}`, ROUND_END_MS - 300, "loss");
      sfx.roundLose();
    } else {
      showBanner("ROUND SCRAPPED", "Timer expired — no score", ROUND_END_MS - 300);
      sfx.roundLose();
    }
  });

  bind("match_end", (payload) => {
    if (!match || !match.online || match.ended) return;
    match.phase = "matchEnd";
    match.serverPhase = "match_end";
    match.scoreBlue = payload.scoreBlue;
    match.scoreRed = payload.scoreRed;
    match.ended = true;
    const won = payload.winner === player.team;
    const draw = payload.winner === "draw";
    showBanner(draw ? "STALEMATE" : won ? "VICTORY" : "DEFEAT", `Final ${payload.scoreBlue} : ${payload.scoreRed}`, MATCH_END_MS - 300, won ? "win" : "loss");
    if (draw) sfx.matchLose();
    else if (won) sfx.matchWin();
    else sfx.matchLose();
    window.setTimeout(() => {
      if (match?.online) finishMatch();
    }, Math.min(MATCH_END_MS, 1300));
  });

  bind("player_left", ({ playerId }) => {
    const unit = findCombatantById(playerId);
    if (!unit) return;
    unit.connected = false;
    unit.alive = false;
    unit.hp = 0;
  });

  bind("player_joined", ({ player }) => {
    if (!match || !match.online) return;
    ensureOnlineCombatant(player, combatants.length);
    syncOnlineRoster([player]);
  });

  bind("disconnected", () => {
    if (!match || !match.online || match.ended) return;
    match.ended = true;
    window.setTimeout(() => {
      if (match?.online) finishMatch(true);
    }, 100);
  });

  bind("error", (payload) => {
    if (!match || !match.online) return;
    console.error("online room error", payload);
  });

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export function startOnlineMatch({ net, roster, mode, localId, onEnd }) {
  initRenderer();
  onEndCallback = onEnd;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);
  scene.add(camera);

  clockMs = 0;
  cellOverrides.clear();
  initFx();
  buildMap();
  buildViewmodel();
  applyQuality();
  onResize();
  applyVolume();

  player = makePlayer();
  player.id = localId;
  player.online = true;
  player.connected = true;
  player.weapons.primary = weaponState("pike");
  player.weapons.sidearm = weaponState("backstop");
  player.weapons.melee = weaponState("knife");
  player.slot = "primary";
  combatants = [player];
  grenades = [];

  const roomMode = MODE_DEFS[mode] || MODE_DEFS.duel;
  match = {
    online: true,
    net,
    roomMode: mode,
    mode: {
      id: "botstrike",
      name: mode === "squad" ? "Online Squad" : "Online Duel",
      scoreTarget: roomMode.scoreTarget,
      roundMs: roomMode.roundMs,
    },
    scoreBlue: 0,
    scoreRed: 0,
    round: 0,
    phase: "lobby",
    serverPhase: "lobby",
    phaseUntilServer: 0,
    roundEndsAtServer: 0,
    paused: false,
    startedAt: performance.now(),
    utilityHits: 0,
    feedTimer: 0,
    targets: [],
    targetsDown: 0,
    shotsFired: 0,
    shotsHit: 0,
    lastTick: -1,
    ended: false,
    cleanupOnline: null,
  };

  resetOnlineRoundState();
  syncOnlineRoster(roster);
  if (!player.team) {
    const me = roster.find((entry) => entry.id === localId);
    if (me) player.team = me.team;
  }
  match.cleanupOnline = wireOnlineEvents(net);

  document.body.classList.remove("is-client");
  document.body.classList.add("is-match");
  hud.root.classList.add("is-active");
  hud.killFeed.innerHTML = "";
  pauseOverlay.classList.remove("is-active");
  updateScorePips();
  applyCrosshair();
  hud.objective.style.display = "flex";
  document.getElementById("hudMatchInfo").style.display = "flex";
  hud.hint.textContent = "WASD move · SHIFT sprint · SPACE jump · 1/2/3 weapons · 4/5 utility · Q ability · F inspect · R reload · ESC pause";
  hud.hint.classList.add("is-active");
  setTimeout(() => hud.hint.classList.remove("is-active"), 6500);

  startAmbient();
  bindMatchInput();
  refreshViewmodel();
  requestLock();

  lastFrame = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(frame);
}

function beginRound() {
  match.round += 1;
  match.phase = "freeze";
  match.phaseUntil = nowMs() + FREEZE_MS;
  match.lastTick = -1;
  grenades.forEach((g) => scene.remove(g.mesh));
  grenades = [];
  cellOverrides.clear();
  barrierMesh.visible = false;
  hud.spectate.classList.remove("is-active");

  const blue = spawnCells("1");
  const red = spawnCells("2");
  let b = 0; let r = 0;
  for (const unit of combatants) {
    unit.alive = true;
    unit.hp = 100;
    if (unit.isPlayer) {
      unit.shield = 0;
      unit.weapons.primary = weaponState(state.primary);
      unit.weapons.sidearm = weaponState("backstop");
      unit.slot = "primary";
      unit.frags = UTILITY.frag.perRound;
      unit.flashes = UTILITY.flash.perRound;
      unit.abilityReadyAt = 0;
      unit.surgeUntil = 0;
      unit.pulseUntil = 0;
      unit.blindUntil = 0;
      unit.meleeUntil = 0;
      unit.meleeAnimUntil = 0;
      unit.inspectUntil = 0;
      placeAtSpawn(unit, blue[b], 0); b += 1;
    } else {
      unit.blindUntil = 0;
      unit.state = "patrol";
      unit.path = null;
      unit.lastSeenEnemy = null;
      unit.noticedAt = null;
      unit.shotsInMag = 24;
      unit.deadFall = 0;
      unit.rig.group.visible = true;
      unit.rig.group.rotation.z = 0;
      unit.rig.group.position.y = 0;
      placeAtSpawn(unit, unit.team === "blue" ? blue[b] : red[r], 0);
      if (unit.team === "blue") b += 1; else r += 1;
    }
  }
  match.roundEndsAt = nowMs() + FREEZE_MS + match.mode.roundMs;
  showBanner(`ROUND ${match.round}`, `First to ${match.mode.scoreTarget} — ${match.scoreBlue} : ${match.scoreRed}`, FREEZE_MS - 200);
  sfx.roundStart();
  requestLock();
}

function endRound(winner) {
  match.phase = "roundEnd";
  match.phaseUntil = nowMs() + ROUND_END_MS;
  if (winner === "blue") {
    match.scoreBlue += 1;
    showBanner("ROUND WON", `${match.scoreBlue} : ${match.scoreRed}`, ROUND_END_MS - 300, "win");
    sfx.roundWin();
  } else if (winner === "red") {
    match.scoreRed += 1;
    showBanner("ROUND LOST", `${match.scoreBlue} : ${match.scoreRed}`, ROUND_END_MS - 300, "loss");
    sfx.roundLose();
  } else {
    showBanner("ROUND SCRAPPED", "Timer expired — no score", ROUND_END_MS - 300);
    sfx.roundLose();
  }
  updateScorePips();
}

function endMatch() {
  const won = match.scoreBlue > match.scoreRed;
  const draw = match.scoreBlue === match.scoreRed;
  match.phase = "matchEnd";
  match.phaseUntil = nowMs() + MATCH_END_MS;
  const title = draw ? "STALEMATE" : won ? "VICTORY" : "DEFEAT";
  showBanner(title, `Final ${match.scoreBlue} : ${match.scoreRed}`, MATCH_END_MS - 300, won ? "win" : "loss");
  if (won) sfx.matchWin(); else sfx.matchLose();
}

function finishMatch(aborted = false) {
  const m = match;
  const report = m.online
    ? {
      mode: "botstrike",
      online: true,
      onlineMode: m.roomMode,
      aborted,
      result: m.scoreBlue === m.scoreRed ? "draw" : player.team === "blue"
        ? m.scoreBlue > m.scoreRed ? "win" : "loss"
        : m.scoreRed > m.scoreBlue ? "win" : "loss",
      scoreBlue: m.scoreBlue,
      scoreRed: m.scoreRed,
      rounds: m.round,
      kills: player.kills,
      deaths: player.deaths,
      headshots: player.headshots,
      damage: Math.round(player.damage),
      utilityHits: 0,
      durationMs: performance.now() - m.startedAt,
      board: combatants.map((u) => ({
        name: u.name,
        you: !!u.isPlayer,
        team: u.team,
        agent: u.agent ? u.agent.name : "",
        kills: u.kills,
        deaths: u.deaths,
        damage: Math.round(u.damage || 0),
      })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
    }
    : m.mode.id === "range"
    ? {
      mode: "range",
      targets: m.targetsDown,
      shots: m.shotsFired,
      hits: m.shotsHit,
      accuracy: m.shotsFired ? Math.round((m.shotsHit / m.shotsFired) * 100) : 0,
      durationMs: performance.now() - m.startedAt,
    }
    : {
      mode: "botstrike",
      offlineVariant: m.mode.id,
      aborted,
      result: m.scoreBlue > m.scoreRed ? "win" : "loss",
      scoreBlue: m.scoreBlue,
      scoreRed: m.scoreRed,
      rounds: m.round,
      kills: player.kills,
      deaths: player.deaths,
      headshots: player.headshots,
      damage: Math.round(player.damage),
      utilityHits: m.utilityHits,
      durationMs: performance.now() - m.startedAt,
      board: combatants.map((u) => ({
        name: u.name,
        you: !!u.isPlayer,
        team: u.team,
        agent: u.agent ? u.agent.name : "",
        kills: u.kills, deaths: u.deaths, damage: Math.round(u.damage),
      })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
    };
  teardown();
  if (onEndCallback) onEndCallback(report);
}

function teardown() {
  const currentMatch = match;
  cancelAnimationFrame(animId);
  unbindMatchInput();
  if (document.pointerLockElement) document.exitPointerLock();
  stopAmbient();
  hud.root.classList.remove("is-active");
  pauseOverlay.classList.remove("is-active");
  hud.flashOverlay.style.opacity = "0";
  hud.vignette.style.opacity = "0";
  document.body.classList.remove("is-match");
  currentMatch?.cleanupOnline?.();
  if (currentMatch?.online) currentMatch.net?.destroy?.();
  match = null;

  // Dispose scene resources.
  if (scene) {
    scene.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
  for (const d of disposables) { try { d.dispose(); } catch { /* fine */ } }
  disposables.length = 0;
  scene = null;
  camera = null;
  viewmodel = null;
  combatants = [];
  tracers.length = 0;
  particles.length = 0;
  if (renderer) renderer.clear();
}

/* ------------------------------------------------------ training targets - */

const RANGE_SPOTS = [
  { r: 3, c: 8 }, { r: 3, c: 22 }, { r: 5, c: 15 }, { r: 10, c: 5 },
  { r: 10, c: 24 }, { r: 15, c: 15 }, { r: 17, c: 8 }, { r: 17, c: 22 },
  { r: 8, c: 14 }, { r: 12, c: 15 },
];

function buildRangeTargets() {
  const plateMat = track(new THREE.MeshStandardMaterial({ color: 0xf1c36e, emissive: 0xf1c36e, emissiveIntensity: 0.7, roughness: 0.4 }));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.7 }));
  for (let i = 0; i < 6; i += 1) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6)), poleMat);
    pole.position.y = 0.65;
    const plate = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.9, 0.08)), plateMat);
    plate.position.y = 1.55;
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.1, 0.18, 16)), track(new THREE.MeshBasicMaterial({ color: 0x141719, side: THREE.DoubleSide })));
    ring.position.set(0, 1.62, 0.05);
    group.add(pole, plate, ring);
    scene.add(group);
    const target = {
      group, plate, alive: true, respawnAt: 0,
      moving: i >= 3, phase: Math.random() * Math.PI * 2, baseX: 0, baseZ: 0,
    };
    respawnTarget(target);
    match.targets.push(target);
  }
}

function respawnTarget(target) {
  const spot = RANGE_SPOTS[Math.floor(Math.random() * RANGE_SPOTS.length)];
  const { x, z } = cellCenter(spot.r, spot.c);
  target.baseX = x; target.baseZ = z;
  target.group.position.set(x, 0, z);
  target.group.visible = true;
  target.alive = true;
}

function updateTargets(dt) {
  for (const t of match.targets) {
    if (!t.alive) {
      if (nowMs() >= t.respawnAt) respawnTarget(t);
      continue;
    }
    if (t.moving) {
      t.phase += dt * 1.4;
      const off = Math.sin(t.phase) * 1.6;
      const nx = t.baseX + off;
      if (heightAtPos(nx, t.baseZ) === 0) t.group.position.x = nx;
    }
    t.group.lookAt(player.x, 1.3, player.z);
  }
}

/* --------------------------------------------------------------- input --- */

function requestLock() {
  pointerLockWanted = true;
  if (document.pointerLockElement !== canvas) {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
}

function onKeyDown(e) {
  if (!match) return;
  const key = e.key.toLowerCase();
  if (key === "escape") {
    // With pointer lock held the browser exits lock (pause opens via lockchange);
    // without lock (e.g. lock request failed), open pause directly.
    if (document.pointerLockElement !== canvas && !match.paused) openPause();
    return;
  }
  if (["w", "a", "s", "d", " ", "shift", "tab"].includes(key)) e.preventDefault();
  keysDown.add(key);
  if (match.paused) return;
  if (key === "r") tryReload();
  if (key === "1") switchSlot("primary");
  if (key === "2") switchSlot("sidearm");
  if (key === "3") switchSlot("melee");
  if (!isOnlineMatch() && key === "4") throwUtility("frag");
  if (!isOnlineMatch() && key === "5") throwUtility("flash");
  if (!isOnlineMatch() && key === "q") useAbility();
  if (key === "f" && activeWeapon()?.id === "knife") knifeInspect();
}

function onKeyUp(e) {
  keysDown.delete(e.key.toLowerCase());
}

function onMouseMove(e) {
  if (!match || match.paused || !player.alive) return;
  if (document.pointerLockElement !== canvas) return;
  const sens = 0.0023 * (state.settings.sensitivity || 1);
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
}

function onMouseDown(e) {
  if (!match) return;
  if (e.button === 0) {
    if (activeWeapon()?.id === "knife") {
      if (document.pointerLockElement !== canvas && !match.paused) requestLock();
      playerMelee("slash");
      return;
    }
    mouseDown = true;
    if (document.pointerLockElement !== canvas && !match.paused) requestLock();
    return;
  }
  if (e.button === 2 && activeWeapon()?.id === "knife") {
    e.preventDefault();
    if (document.pointerLockElement !== canvas && !match.paused) requestLock();
    playerMelee("stab");
  }
}

function onMouseUp(e) {
  if (e.button === 0) mouseDown = false;
}

function onLockChange() {
  if (!match) return;
  if (document.pointerLockElement !== canvas && pointerLockWanted && !match.paused && match.phase !== "matchEnd") {
    openPause();
  }
}

function bindMatchInput() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("contextmenu", blockContextMenu);
  document.addEventListener("pointerlockchange", onLockChange);
}

function unbindMatchInput() {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("contextmenu", blockContextMenu);
  document.removeEventListener("pointerlockchange", onLockChange);
  keysDown.clear();
  mouseDown = false;
  pointerLockWanted = false;
}

function blockContextMenu(event) {
  if (match) event.preventDefault();
}

/* --------------------------------------------------------------- pause --- */

export function openPause() {
  if (!match || match.paused) return;
  match.paused = true;
  pointerLockWanted = false;
  if (document.pointerLockElement) document.exitPointerLock();
  pauseVolume.value = String(Math.round(state.settings.volume * 100));
  pauseSens.value = String(state.settings.sensitivity);
  pauseMute.checked = state.settings.muted;
  pauseOverlay.classList.add("is-active");
}

export function closePause() {
  if (!match) return;
  match.paused = false;
  pauseOverlay.classList.remove("is-active");
  requestLock();
}

export function restartMatchFromPause() {
  if (!match) return;
  if (match.online) {
    exitMatchFromPause();
    return;
  }
  const modeId = match.mode.id;
  const end = onEndCallback;
  teardown();
  startMatch({ modeId, onEnd: end });
}

export function exitMatchFromPause() {
  if (!match) return;
  if (match.online) {
    finishMatch(true);
    return;
  }
  if (match.mode.id === "range") {
    finishMatch();
  } else {
    finishMatch(true);
  }
}

/* -------------------------------------------------------------- combat --- */

function activeWeapon() {
  return player.weapons[player.slot];
}

function switchSlot(slot) {
  if (player.slot === slot || !player.alive) return;
  player.slot = slot;
  player.inspectUntil = 0;
  const w = activeWeapon();
  w.reloadingUntil = 0;
  if (isOnlineMatch()) {
    match.net.sendSwitchWeapon(w.id);
  }
  sfx.uiClick();
  refreshViewmodel();
}

function refreshViewmodel() {
  const { rigs } = viewmodel.userData;
  for (const key of Object.keys(rigs)) rigs[key].group.visible = false;
  const rig = rigs[activeWeapon().id];
  if (rig) rig.group.visible = true;
}

function tryReload() {
  const w = activeWeapon();
  if (w.id === "knife") return;
  if (!player.alive || w.reloadingUntil > nowMs()) return;
  if (w.mag >= w.def.mag || w.reserve <= 0) return;
  w.reloadingUntil = nowMs() + w.def.reloadMs;
  if (isOnlineMatch()) match.net.sendReload();
  sfx.reload();
}

function finishReloadIfDue(w) {
  if (w.reloadingUntil && w.reloadingUntil <= nowMs()) {
    const need = w.def.mag - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    w.reloadingUntil = 0;
  }
}

function playerShoot() {
  const w = activeWeapon();
  if (isOnlineMatch() && w.id === "knife") return;
  finishReloadIfDue(w);
  if (w.reloadingUntil > nowMs()) return;
  if (nowMs() - w.lastShot < w.def.cooldownMs) return;
  if (!w.def.auto && player.shotHeld) return;
  if (w.mag <= 0) {
    if (!player.dryPlayed) { sfx.dryFire(); player.dryPlayed = true; }
    if (w.reserve > 0) tryReload();
    return;
  }
  player.dryPlayed = false;
  w.lastShot = nowMs();
  w.mag -= 1;
  match.shotsFired += 1;

  const moving = keysDown.has("w") || keysDown.has("a") || keysDown.has("s") || keysDown.has("d");
  const airborne = player.y > 0.05 && groundAt(player.x, player.z, player.y) < player.y - 0.05;
  let spread = w.def.spread + (moving ? w.def.moveSpread * 0.6 : 0) + (airborne ? 0.03 : 0);
  spread *= rand(0.6, 1.15);

  const eyeY = player.y + 1.62;
  // Build direction from yaw/pitch with random spread.
  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(player.pitch + rand(-spread, spread), player.yaw + rand(-spread, spread), 0, "YXZ"));

  if (isOnlineMatch()) {
    match.net.sendFire({
      ox: player.x,
      oy: eyeY,
      oz: player.z,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      weapon: w.id,
    });
    sfx.shot(w.def.kind);
    kickCamera(w.def);
    flashMuzzle();
    const wallDist = wallRay(player.x, eyeY, player.z, dir.x, dir.y, dir.z, w.def.range);
    const from = new THREE.Vector3(player.x + dir.x * 0.6, eyeY - 0.09 + dir.y * 0.6, player.z + dir.z * 0.6);
    const to = new THREE.Vector3(player.x + dir.x * wallDist, eyeY + dir.y * wallDist, player.z + dir.z * wallDist);
    spawnTracer(from, to);
    return;
  }

  const result = hitscan(player.x, eyeY, player.z, dir.x, dir.y, dir.z, w.def.range, player);

  // FX.
  sfx.shot(w.def.kind);
  kickCamera(w.def);
  flashMuzzle();
  const from = new THREE.Vector3(player.x + dir.x * 0.6, eyeY - 0.09 + dir.y * 0.6, player.z + dir.z * 0.6);
  const to = new THREE.Vector3(player.x + dir.x * result.dist, eyeY + dir.y * result.dist, player.z + dir.z * result.dist);
  spawnTracer(from, to);

  if (result.type === "wall") {
    spawnSparks(to, 0xd9c9a0, 6);
  } else if (result.type === "unit") {
    match.shotsHit += 1;
    const dmg = result.head ? w.def.damage * w.def.headMult : w.def.damage;
    dealDamage(player, result.unit, dmg, result.head);
    spawnSparks(to, 0xff6a55, 8);
    showHitmarker(result.head, result.unit.hp <= 0);
    if (result.head) sfx.headshot(); else sfx.hit();
  } else if (result.type === "target") {
    match.shotsHit += 1;
    popTarget(result.target);
  }
  return;
}

function knifeInspect() {
  if (!player.alive || activeWeapon().id !== "knife") return;
  player.inspectUntil = nowMs() + 720;
}

function playerMelee(kind) {
  if (!player.alive) return;
  if (activeWeapon().id !== "knife") return;
  const gateMs = kind === "stab" ? KNIFE_STATS.stab.cooldownMs : KNIFE_STATS.slash.cooldownMs;
  if (nowMs() < player.meleeUntil) return;
  player.meleeUntil = nowMs() + gateMs;
  player.inspectUntil = 0;
  player.meleeAnimKind = kind;
  player.meleeAnimUntil = nowMs() + gateMs;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, "YXZ"));
  if (isOnlineMatch()) {
    match.net.sendMelee(kind, {
      ox: player.x,
      oy: player.y + 1.62,
      oz: player.z,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
    });
    return;
  }

  const spec = KNIFE_STATS[kind];
  let best = null;
  for (const unit of combatants) {
    if (unit.isPlayer || !unit.alive || unit.team === player.team) continue;
    const dist = Math.hypot(unit.x - player.x, unit.z - player.z) - BODY_RADIUS;
    if (dist > spec.range) continue;
    if (!withinFacingCone(player, unit, spec.coneDeg)) continue;
    if (!hasLos(player.x, player.y + 1.62, player.z, unit.x, unit.y + 1.1, unit.z)) continue;
    if (!best || dist < best.dist) best = { unit, dist };
  }
  if (!best) return;
  let damage = spec.damage;
  if (kind === "stab" && isBackstab(player, best.unit)) {
    damage *= KNIFE_STATS.stab.backstabMultiplier;
  }
  dealDamage(player, best.unit, damage, false);
  showHitmarker(false, best.unit.hp <= 0);
  sfx.hit();
}

// One ray against walls, units, and range targets. Returns nearest hit.
function hitscan(ox, oy, oz, dx, dy, dz, range, shooter) {
  let best = { type: "none", dist: Math.min(range, wallRay(ox, oy, oz, dx, dy, dz, range)) };
  if (best.dist < range) best.type = "wall";

  for (const unit of combatants) {
    if (unit === shooter || !unit.alive) continue;
    // Head sphere.
    const headHit = raySphere(ox, oy, oz, dx, dy, dz, unit.x, unit.y + 1.62, unit.z, 0.27);
    if (headHit !== null && headHit < best.dist) {
      best = { type: "unit", unit, head: true, dist: headHit };
      continue;
    }
    // Body cylinder.
    const bodyHit = rayCylinder(ox, oy, oz, dx, dy, dz, unit.x, unit.z, 0.42, unit.y, unit.y + 1.5);
    if (bodyHit !== null && bodyHit < best.dist) {
      best = { type: "unit", unit, head: false, dist: bodyHit };
    }
  }

  if (match && match.targets.length) {
    for (const t of match.targets) {
      if (!t.alive) continue;
      const p = t.group.position;
      const hit = raySphere(ox, oy, oz, dx, dy, dz, p.x, 1.55, p.z, 0.5);
      if (hit !== null && hit < best.dist) {
        best = { type: "target", target: t, dist: hit };
      }
    }
  }
  return best;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox; const ly = cy - oy; const lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  if (t < 0) return null;
  const px = ox + dx * t - cx; const py = oy + dy * t - cy; const pz = oz + dz * t - cz;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return null;
  return Math.max(0.01, t - Math.sqrt(r * r - d2));
}

function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, yMin, yMax) {
  // 2D circle intersection in XZ, then check Y span.
  const fx = ox - cx; const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = oy + dy * t;
  if (y < yMin || y > yMax) return null;
  return t;
}

function dealDamage(attacker, victim, amount, head = false) {
  if (!victim.alive) return;
  let dmg = amount;
  if (!attacker.isPlayer && attacker.tuning) dmg *= attacker.tuning.damageScale;
  if (victim.isPlayer && victim.shield > 0) {
    const absorbed = Math.min(victim.shield, dmg);
    victim.shield -= absorbed;
    dmg -= absorbed;
  }
  const hpBefore = victim.hp;
  victim.hp -= dmg;
  if (attacker.team !== victim.team) attacker.damage += Math.min(dmg, hpBefore);
  if (victim.isPlayer) {
    victim.lastDamageAt = nowMs();
    sfx.damaged();
    showDamageDirection(attacker);
  } else {
    // brief hit flash on the rig
    victim.rig.flashMats.forEach((m) => {
      m.emissiveIntensity = 1.4;
      m.emissive = new THREE.Color(0xffffff);
    });
    setTimeout(() => victim.rig.flashMats.forEach((m, i) => {
      m.emissive = new THREE.Color(i === 0 ? TEAM_COLORS[victim.team] : 0x000000);
      m.emissiveIntensity = i === 0 ? 0.35 : 0;
    }), 70);
  }
  if (victim.hp <= 0) {
    killUnit(attacker, victim, head);
  }
}

function killUnit(attacker, victim, head) {
  victim.alive = false;
  victim.deaths += 1;
  attacker.kills += 1;
  if (attacker.isPlayer) {
    if (head) player.headshots += 1;
    sfx.kill();
  }
  if (victim.isPlayer) {
    if (document.pointerLockElement) { /* keep lock for spectate */ }
    hud.spectate.classList.add("is-active");
    const ally = combatants.find((u) => u.team === "blue" && !u.isPlayer);
    hud.spectate.textContent = ally && ally.alive ? `DOWN — spectating ${ally.name}` : "DOWN";
  } else {
    victim.deadFall = 0.001; // triggers fall animation
  }
  addKillFeed(attacker, victim, head);
  checkRoundEnd();
}

function checkRoundEnd() {
  if (!match || (match.mode.id !== "botstrike" && match.mode.id !== "duelbot") || match.phase !== "live") return;
  const blueAlive = combatants.some((u) => u.team === "blue" && u.alive);
  const redAlive = combatants.some((u) => u.team === "red" && u.alive);
  if (blueAlive && redAlive) return;
  hud.spectate.classList.remove("is-active");
  endRound(blueAlive ? "blue" : redAlive ? "red" : null);
}

function popTarget(target) {
  target.alive = false;
  target.group.visible = false;
  target.respawnAt = nowMs() + 1200;
  match.targetsDown += 1;
  spawnSparks(target.group.position.clone().setY(1.55), 0xf1c36e, 12);
  sfx.targetDown();
}

/* ------------------------------------------------------------- utility --- */

function throwUtility(kind) {
  if (isOnlineMatch()) return;
  if (!player.alive) return;
  const def = UTILITY[kind];
  const count = kind === "frag" ? player.frags : player.flashes;
  if (count <= 0) { sfx.uiDeny(); return; }
  if (kind === "frag") player.frags -= 1; else player.flashes -= 1;

  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, "YXZ"));
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 8),
    new THREE.MeshStandardMaterial({
      color: kind === "frag" ? 0x39424c : 0xf4ead6,
      emissive: kind === "frag" ? 0xf05f51 : 0x3bd0c2,
      emissiveIntensity: 0.8,
    }),
  );
  mesh.position.set(player.x + dir.x * 0.5, player.y + 1.5 + dir.y * 0.5, player.z + dir.z * 0.5);
  scene.add(mesh);
  grenades.push({
    kind, def, mesh, owner: player,
    x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
    vx: dir.x * def.throwSpeed, vy: dir.y * def.throwSpeed + 2.4, vz: dir.z * def.throwSpeed,
    detonateAt: nowMs() + def.fuseMs,
  });
  sfx.throwUtil();
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vy -= 12.5 * dt;
    let nx = g.x + g.vx * dt;
    let ny = g.y + g.vy * dt;
    let nz = g.z + g.vz * dt;
    // Bounce off walls/floor.
    if (ny < 0.11) { ny = 0.11; g.vy *= -0.42; g.vx *= 0.72; g.vz *= 0.72; }
    if (heightAtPos(nx, g.z) > ny) { g.vx *= -0.5; nx = g.x; }
    if (heightAtPos(g.x, nz) > ny) { g.vz *= -0.5; nz = g.z; }
    g.x = nx; g.y = ny; g.z = nz;
    g.mesh.position.set(nx, ny, nz);
    if (nowMs() >= g.detonateAt) {
      detonate(g);
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
      grenades.splice(i, 1);
    }
  }
}

function detonate(g) {
  if (g.kind === "frag") {
    sfx.explosion();
    spawnSparks(new THREE.Vector3(g.x, g.y + 0.2, g.z), 0xffa552, 26);
    const light = new THREE.PointLight(0xff9540, 60, 16);
    light.position.set(g.x, g.y + 0.6, g.z);
    scene.add(light);
    setTimeout(() => scene.remove(light), 130);
    for (const unit of combatants) {
      if (!unit.alive) continue;
      const d = Math.hypot(unit.x - g.x, unit.z - g.z);
      if (d > g.def.radius) continue;
      if (!hasLos(g.x, g.y + 0.3, g.z, unit.x, unit.y + 1.1, unit.z)) continue;
      const dmg = g.def.maxDamage * (1 - d / g.def.radius);
      if (unit !== g.owner && unit.team !== g.owner.team) {
        match.utilityHits += 1;
        dealDamage(g.owner, unit, dmg);
      } else if (unit === g.owner) {
        dealDamage(g.owner, unit, dmg * 0.5); // your own splinter still bites
      }
    }
    // Bots near the blast flinch even if unhurt.
    for (const unit of combatants) {
      if (unit.isPlayer || !unit.alive) continue;
      const d = Math.hypot(unit.x - g.x, unit.z - g.z);
      if (d < g.def.radius * 1.6) { unit.fleeFrom = { x: g.x, z: g.z }; unit.fleeUntil = nowMs() + 900; }
    }
  } else {
    sfx.flashPop();
    const light = new THREE.PointLight(0xffffff, 80, 22);
    light.position.set(g.x, g.y + 0.6, g.z);
    scene.add(light);
    setTimeout(() => scene.remove(light), 160);
    for (const unit of combatants) {
      if (!unit.alive) continue;
      const d = Math.hypot(unit.x - g.x, unit.z - g.z);
      if (d > g.def.radius) continue;
      if (!hasLos(g.x, g.y + 0.3, g.z, unit.x, unit.y + 1.6, unit.z)) continue;
      if (unit.isPlayer) {
        // Blind scales with how directly you're looking at it.
        const toG = Math.atan2(-(g.x - unit.x), -(g.z - unit.z));
        const facing = Math.abs(wrapAngle(toG - unit.yaw));
        const factor = facing < 1.2 ? 1 : facing < 2.2 ? 0.45 : 0.15;
        const dur = (2400 - d * 90) * factor;
        if (dur > 200) unit.blindUntil = Math.max(unit.blindUntil, nowMs() + dur);
      } else {
        const dur = 2600 - d * 110;
        if (dur > 300) {
          unit.blindUntil = Math.max(unit.blindUntil, nowMs() + dur);
          if (unit.team !== g.owner.team && g.owner.isPlayer) match.utilityHits += 1;
        }
      }
    }
  }
}

/* ------------------------------------------------------------ abilities -- */

function useAbility() {
  if (isOnlineMatch()) return;
  if (!player.alive || nowMs() < player.abilityReadyAt) { if (nowMs() < player.abilityReadyAt) sfx.uiDeny(); return; }
  const ability = player.agent.ability;
  player.abilityReadyAt = nowMs() + ability.cooldownMs;
  sfx.ability();

  if (ability.id === "bulwark") {
    // Claim 3 cells one cell ahead, perpendicular to facing.
    const fx = -Math.sin(player.yaw); const fz = -Math.cos(player.yaw);
    const px = player.x + fx * CELL_SIZE * 2.1;
    const pz = player.z + fz * CELL_SIZE * 2.1;
    const { r, c } = cellOf(px, pz);
    const horizontal = Math.abs(fx) < Math.abs(fz); // wall runs east-west if facing north/south
    const cells = horizontal
      ? [[r, c - 1], [r, c], [r, c + 1]]
      : [[r - 1, c], [r, c], [r + 1, c]];
    const until = nowMs() + ability.durationMs;
    let placed = 0;
    for (const [rr, cc] of cells) {
      if (rr <= 0 || cc <= 0 || rr >= GRID_H - 1 || cc >= GRID_W - 1) continue;
      if (baseHeight[rr][cc] > 0) continue;
      cellOverrides.set(`${rr},${cc}`, { top: 2.4, until });
      placed += 1;
    }
    if (placed) {
      const mid = cellCenter(r, c);
      barrierMesh.position.set(mid.x, 1.2, mid.z);
      barrierMesh.rotation.y = horizontal ? 0 : Math.PI / 2;
      barrierMesh.visible = true;
      barrierMesh.userData.until = until;
      // Bots must replan around it.
      combatants.forEach((u) => { if (!u.isPlayer) u.path = null; });
    }
  } else if (ability.id === "surge") {
    player.surgeUntil = nowMs() + ability.durationMs;
    for (const w of Object.values(player.weapons)) {
      const need = w.def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take; w.reserve -= take; w.reloadingUntil = 0;
    }
  } else if (ability.id === "pulse") {
    player.pulseUntil = nowMs() + ability.durationMs;
  } else if (ability.id === "ward") {
    player.shield = 50;
    player.shieldDecay = 50 / (ability.durationMs / 1000);
  }
}

/* ---------------------------------------------------------- player tick -- */

function updatePlayer(dt) {
  if (!player.alive) {
    viewmodel.visible = false;
    hud.crosshair.style.display = "none";
    updateSpectateCamera(dt);
    return;
  }
  viewmodel.visible = true;
  hud.crosshair.style.display = "block";
  const w = activeWeapon();
  finishReloadIfDue(w);

  const locked = document.pointerLockElement === canvas;
  const frozen = match.phase === "freeze" || match.phase === "roundEnd" || match.phase === "matchEnd";

  // Shield decay (Morrow ward).
  if (player.shield > 0 && player.shieldDecay) {
    player.shield = Math.max(0, player.shield - player.shieldDecay * dt);
  }

  // Movement intentionally works without pointer lock (lock can be denied);
  // only mouse look requires it.
  let ix = 0; let iz = 0;
  if (!frozen) {
    if (keysDown.has("w")) iz -= 1;
    if (keysDown.has("s")) iz += 1;
    if (keysDown.has("a")) ix -= 1;
    if (keysDown.has("d")) ix += 1;
  }
  const len = Math.hypot(ix, iz) || 1;
  ix /= len; iz /= len;
  const sprinting = keysDown.has("shift") && iz < 0;
  let speed = 5.1 * (sprinting ? 1.42 : 1) * w.def.speedMult;
  if (nowMs() < player.surgeUntil) speed *= 1.4;

  const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
  const wx = (ix * cos + iz * sin) * speed;
  const wz = (iz * cos - ix * sin) * speed;

  const grounded = player.y <= groundAt(player.x, player.z, player.y) + 0.02;
  const control = grounded ? 1 : 0.5;
  player.velX = lerp(player.velX || 0, wx, clamp(dt * 11 * control, 0, 1));
  player.velZ = lerp(player.velZ || 0, wz, clamp(dt * 11 * control, 0, 1));

  moveWithCollision(player, player.velX * dt, player.velZ * dt);

  // Vertical.
  const ground = groundAt(player.x, player.z, player.y);
  if (keysDown.has(" ") && grounded && !frozen) {
    player.vy = 5.7;
    sfx.jump();
  }
  player.vy -= 13.5 * dt;
  player.y += player.vy * dt;
  if (player.y <= ground) {
    if (player.vy < -5) sfx.land();
    player.y = ground;
    player.vy = 0;
  }

  // Footsteps.
  const moveMag = Math.hypot(player.velX, player.velZ);
  if (grounded && moveMag > 1.4) {
    player.stepAcc += dt * moveMag;
    if (player.stepAcc > 3.4) { player.stepAcc = 0; sfx.footstep(); }
  }

  // Shooting.
  if (mouseDown && !frozen && !match.paused) {
    playerShoot();
    player.shotHeld = true;
  } else {
    player.shotHeld = false;
    player.dryPlayed = false;
  }

  // Camera.
  camera.position.set(player.x, player.y + 1.62, player.z);
  camera.rotation.set(player.pitch + (player.kickPitch || 0), player.yaw, 0, "YXZ");
  updateViewmodel(dt, moveMag, grounded);
  decayKick(dt);

  if (isOnlineMatch()) {
    match.net.setInputState({
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: THREE.MathUtils.radToDeg(player.pitch),
      vx: player.velX || 0,
      vz: player.velZ || 0,
      anim: moveMag > 0.35 ? "run" : "idle",
    });
  }
}

function moveWithCollision(entity, dx, dz) {
  const feet = entity.y;
  if (!collides(entity.x + dx, entity.z, feet)) entity.x += dx;
  else if (!collides(entity.x + dx, entity.z, feet + STEP_HEIGHT)) entity.x += dx; // step assist
  if (!collides(entity.x, entity.z + dz, feet)) entity.z += dz;
  else if (!collides(entity.x, entity.z + dz, feet + STEP_HEIGHT)) entity.z += dz;
  // Also keep units apart (soft push).
  for (const other of combatants) {
    if (other === entity || !other.alive) continue;
    const d = Math.hypot(entity.x - other.x, entity.z - other.z);
    if (d < 0.7 && d > 0.001) {
      const push = (0.7 - d) * 0.5;
      entity.x += ((entity.x - other.x) / d) * push;
      entity.z += ((entity.z - other.z) / d) * push;
    }
  }
  entity.x = clamp(entity.x, -WORLD_W / 2 + CELL_SIZE + 0.4, WORLD_W / 2 - CELL_SIZE - 0.4);
  entity.z = clamp(entity.z, -WORLD_H / 2 + CELL_SIZE + 0.4, WORLD_H / 2 - CELL_SIZE - 0.4);
}

let vmT = 0;
function updateViewmodel(dt, moveMag, grounded) {
  vmT += dt * (2 + moveMag * 1.1);
  const w = activeWeapon();
  const reloading = w.reloadingUntil > nowMs();
  const bobX = Math.sin(vmT * 2.1) * 0.006 * (grounded ? moveMag * 0.25 : 0);
  const bobY = Math.abs(Math.cos(vmT * 2.1)) * -0.008 * (grounded ? moveMag * 0.25 : 0);
  viewmodel.position.x = 0.28 + bobX;
  viewmodel.position.y = -0.25 + bobY + (reloading ? -0.12 : 0) + (player.kickBack || 0) * 0.4;
  viewmodel.position.z = -0.46 + (player.kickBack || 0);
  viewmodel.rotation.x = reloading ? -0.5 : 0;
  viewmodel.rotation.z = bobX * 2;

  const {
    rigs,
    muzzleSprite,
    muzzleLight,
  } = viewmodel.userData;
  const knifeRig = rigs.knife?.group;
  if (knifeRig && w.id === "knife") {
    const stabProgress = player.meleeAnimKind === "stab" && player.meleeAnimUntil > nowMs()
      ? 1 - ((player.meleeAnimUntil - nowMs()) / KNIFE_STATS.stab.cooldownMs)
      : 0;
    const slashProgress = player.meleeAnimKind === "slash" && player.meleeAnimUntil > nowMs()
      ? 1 - ((player.meleeAnimUntil - nowMs()) / KNIFE_STATS.slash.cooldownMs)
      : 0;
    const inspectProgress = player.inspectUntil > nowMs()
      ? 1 - ((player.inspectUntil - nowMs()) / 720)
      : 0;
    const slashArc = slashProgress > 0 ? Math.sin(Math.min(1, slashProgress) * Math.PI) : 0;
    const stabArc = stabProgress > 0 ? Math.sin(Math.min(1, stabProgress) * Math.PI) : 0;
    const inspectSpin = inspectProgress > 0 ? Math.sin(inspectProgress * Math.PI) : 0;
    knifeRig.position.set(
      0.04 + slashArc * 0.12 + inspectSpin * 0.02,
      -0.04 - stabArc * 0.12,
      0.1 - stabArc * 0.26,
    );
    knifeRig.rotation.set(
      0.2 - slashArc * 0.48 - stabArc * 0.9,
      0.6 + slashArc * 1.25,
      0.18 + inspectSpin * Math.PI * 1.4 - slashArc * 0.2,
    );
    hud.reloadNote.classList.remove("is-active");
  } else {
    if (knifeRig) {
      knifeRig.position.set(0.04, -0.04, 0.1);
      knifeRig.rotation.set(0.2, 0.6, 0.18);
    }
    hud.reloadNote.classList.toggle("is-active", reloading);
  }

  if (muzzleSprite.visible) {
    muzzleSprite.userData.life -= dt;
    muzzleLight.intensity = Math.max(0, muzzleSprite.userData.life * 260);
    if (muzzleSprite.userData.life <= 0) {
      muzzleSprite.visible = false;
      muzzleLight.intensity = 0;
    }
  }
}

function flashMuzzle() {
  const { rigs, muzzleSprite, muzzleLight } = viewmodel.userData;
  const rig = rigs[activeWeapon().id];
  if (!rig) return;
  muzzleSprite.position.copy(rig.muzzle);
  muzzleSprite.visible = true;
  muzzleSprite.userData.life = 0.05;
  muzzleSprite.material.rotation = Math.random() * Math.PI;
  muzzleLight.intensity = 14;
}

function kickCamera(def) {
  player.kickPitch = (player.kickPitch || 0) + def.recoil;
  player.kickBack = Math.min((player.kickBack || 0) + def.kick, 0.12);
  player.pitch = clamp(player.pitch + def.recoil * 0.55, -1.45, 1.45);
}

function decayKick(dt) {
  player.kickPitch = (player.kickPitch || 0) * Math.max(0, 1 - dt * 14);
  player.kickBack = (player.kickBack || 0) * Math.max(0, 1 - dt * 10);
}

function updateSpectateCamera(dt) {
  const target = combatants.find((u) => !u.isPlayer && u.team === player.team && u.alive)
    || combatants.find((u) => !u.isPlayer && u.alive);
  if (!target) return;
  const behind = 2.6;
  const tx = target.x + Math.sin(target.yaw) * behind;
  const tz = target.z + Math.cos(target.yaw) * behind;
  camera.position.x = lerp(camera.position.x, tx, dt * 4);
  camera.position.y = lerp(camera.position.y, target.y + 2.2, dt * 4);
  camera.position.z = lerp(camera.position.z, tz, dt * 4);
  const targetYaw = target.yaw;
  camera.rotation.set(-0.18, targetYaw, 0, "YXZ");
}

/* --------------------------------------------------------------- bots ---- */

function visibleEnemyFor(bot) {
  let best = null;
  for (const unit of combatants) {
    if (unit.team === bot.team || !unit.alive) continue;
    const dx = unit.x - bot.x; const dz = unit.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bot.tuning.sightRange) continue;
    const dirTo = Math.atan2(-dx, -dz);
    if (Math.abs(wrapAngle(dirTo - bot.yaw)) > bot.tuning.fov / 2 && dist > 3.5) continue;
    if (!hasLos(bot.x, bot.y + 1.6, bot.z, unit.x, unit.y + 1.3, unit.z)) continue;
    if (!best || dist < best.dist) best = { unit, dist };
  }
  return best;
}

function botSetPathTo(bot, x, z) {
  const from = cellOf(bot.x, bot.z);
  const to = cellOf(x, z);
  const raw = findPath(from.r, from.c, to.r, to.c);
  if (!raw || !raw.length) { bot.path = null; return; }
  const pts = raw.map((n) => cellCenter(n.r, n.c)).map((p) => ({ x: p.x, z: p.z }));
  bot.path = smoothPath([{ x: bot.x, z: bot.z }, ...pts]);
  bot.pathIdx = 1;
}

function botFollowPath(bot, dt, speedScale = 1) {
  if (!bot.path || bot.pathIdx >= bot.path.length) return false;
  const node = bot.path[bot.pathIdx];
  const dx = node.x - bot.x; const dz = node.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) {
    bot.pathIdx += 1;
    return botFollowPath(bot, dt, speedScale);
  }
  const speed = bot.tuning.speed * speedScale;
  moveWithCollision(bot, (dx / dist) * speed * dt, (dz / dist) * speed * dt);
  const wantYaw = Math.atan2(-dx, -dz);
  bot.yaw += wrapAngle(wantYaw - bot.yaw) * clamp(dt * 8, 0, 1);
  bot.moving = true;
  return true;
}

function randomFreeCell(minR, maxR, minC, maxC) {
  for (let i = 0; i < 40; i += 1) {
    const r = Math.floor(rand(minR, maxR));
    const c = Math.floor(rand(minC, maxC));
    if (walkableCell(r, c)) return { r, c };
  }
  return { r: Math.floor(GRID_H / 2), c: Math.floor(GRID_W / 2) };
}

function botFireAt(bot, targetInfo, dt) {
  const { unit, dist } = targetInfo;
  const wantYaw = Math.atan2(-(unit.x - bot.x), -(unit.z - bot.z));
  bot.yaw += wrapAngle(wantYaw - bot.yaw) * clamp(dt * 10, 0, 1);

  if (nowMs() < bot.blindUntil) return;
  if (nowMs() < bot.reloadUntil) return;
  if (bot.shotsInMag <= 0) {
    bot.reloadUntil = nowMs() + 1700;
    bot.shotsInMag = 24;
    return;
  }
  // Reaction gate: bot must have noticed the target for reactionMs first.
  if (!bot.noticedAt) bot.noticedAt = nowMs() + bot.tuning.reactionMs + rand(0, bot.tuning.reactionJitterMs);
  if (nowMs() < bot.noticedAt) return;

  // Burst cadence.
  if (nowMs() > bot.burstUntil && nowMs() > bot.burstGapUntil) {
    bot.burstUntil = nowMs() + bot.tuning.burstMs;
    bot.burstGapUntil = bot.burstUntil + bot.tuning.burstGapMs;
  }
  if (nowMs() > bot.burstUntil) return;
  if (nowMs() - bot.lastShot < 132) return;
  bot.lastShot = nowMs();
  bot.lastFiredAt = nowMs();
  bot.shotsInMag -= 1;

  const err = bot.tuning.aimError * (1 + dist / 30) * (unit.isPlayer && Math.hypot(unit.velX || 0, unit.velZ || 0) > 4 ? 1.5 : 1);
  const ex = bot.x; const ey = bot.y + 1.55; const ez = bot.z;
  const ty = unit.y + (Math.random() < 0.16 ? 1.62 : 1.05);
  let dx = unit.x - ex; let dy = ty - ey; let dz = unit.z - ez;
  const len = Math.hypot(dx, dy, dz);
  dx = dx / len + rand(-err, err);
  dy = dy / len + rand(-err, err);
  dz = dz / len + rand(-err, err);
  const dlen = Math.hypot(dx, dy, dz);
  dx /= dlen; dy /= dlen; dz /= dlen;

  const result = hitscan(ex, ey, ez, dx, dy, dz, 60, bot);
  const to = new THREE.Vector3(ex + dx * result.dist, ey + dy * result.dist, ez + dz * result.dist);
  spawnTracer(new THREE.Vector3(ex, ey, ez), to, bot.team === "red" ? 0xff9c8a : 0x9ce8de);
  const vol = clamp(1 - Math.hypot(bot.x - player.x, bot.z - player.z) / 40, 0.1, 1);
  if (vol > 0.12) sfx.enemyShot();

  if (result.type === "wall") {
    spawnSparks(to, 0xd9c9a0, 3);
  } else if (result.type === "unit") {
    const dmg = result.head ? 21 * 2.2 : 21;
    dealDamage(bot, result.unit, dmg, result.head);
    spawnSparks(to, 0xff6a55, 5);
  }
}

function updateBot(bot, dt) {
  if (!bot.alive) {
    // Fall over and sink slightly.
    if (bot.deadFall < 1) {
      bot.deadFall = Math.min(1, bot.deadFall + dt * 3);
      bot.rig.group.rotation.z = bot.deadFall * (Math.PI / 2) * 0.96;
      bot.rig.group.position.y = -bot.deadFall * 0.18;
    }
    return;
  }
  bot.moving = false;
  const frozen = match.phase !== "live";
  if (!frozen) {
    const blinded = nowMs() < bot.blindUntil;
    const seen = blinded ? null : visibleEnemyFor(bot);

    if (seen) {
      bot.lastSeenEnemy = { x: seen.unit.x, z: seen.unit.z, unit: seen.unit };
      bot.lastSeenAt = nowMs();
      bot.state = bot.hp < 32 && nowMs() > bot.coverUntil ? "cover" : "engage";
    } else if (bot.noticedAt && nowMs() - bot.lastSeenAt > 400) {
      bot.noticedAt = null;
    }

    // Flee from grenades overrides everything briefly.
    if (bot.fleeFrom && nowMs() < bot.fleeUntil) {
      const dx = bot.x - bot.fleeFrom.x; const dz = bot.z - bot.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      moveWithCollision(bot, (dx / d) * bot.tuning.speed * 1.2 * dt, (dz / d) * bot.tuning.speed * 1.2 * dt);
      bot.moving = true;
    } else if (blinded) {
      // Stagger randomly while blind.
      if (Math.random() < dt * 3) bot.strafeDir *= -1;
      const sx = Math.sin(bot.yaw + Math.PI / 2) * bot.strafeDir;
      const sz = Math.cos(bot.yaw + Math.PI / 2) * bot.strafeDir;
      moveWithCollision(bot, sx * 1.4 * dt, sz * 1.4 * dt);
      bot.moving = true;
    } else if (bot.state === "engage" && seen) {
      botFireAt(bot, seen, dt);
      // Strafe around target, keep 6-14m.
      if (nowMs() > bot.strafeFlipAt) {
        bot.strafeDir *= Math.random() < 0.7 ? -1 : 1;
        bot.strafeFlipAt = nowMs() + rand(600, 1500);
      }
      const toward = seen.dist > 13 ? 1 : seen.dist < 5.5 ? -1 : 0;
      const fx = -Math.sin(bot.yaw); const fz = -Math.cos(bot.yaw);
      const sx = Math.sin(bot.yaw + Math.PI / 2) * bot.strafeDir;
      const sz = Math.cos(bot.yaw + Math.PI / 2) * bot.strafeDir;
      moveWithCollision(
        bot,
        (fx * toward * 0.8 + sx) * bot.tuning.speed * 0.62 * dt,
        (fz * toward * 0.8 + sz) * bot.tuning.speed * 0.62 * dt,
      );
      bot.moving = true;
    } else if (bot.state === "cover") {
      // Sprint to a cell out of the attacker's sight, wait, then re-engage.
      if (!bot.path || bot.pathIdx >= bot.path.length) {
        const threat = bot.lastSeenEnemy;
        let dest = null;
        for (let i = 0; i < 24 && !dest; i += 1) {
          const cell = randomFreeCell(1, GRID_H - 1, 1, GRID_W - 1);
          const p = cellCenter(cell.r, cell.c);
          const near = Math.hypot(p.x - bot.x, p.z - bot.z);
          if (near > 16 || near < 3) continue;
          if (threat && hasLos(threat.x, 1.6, threat.z, p.x, 1.3, p.z)) continue;
          dest = p;
        }
        if (dest) botSetPathTo(bot, dest.x, dest.z);
        bot.coverUntil = nowMs() + 2600;
        bot.state = "coverMove";
      }
    } else if (bot.state === "coverMove") {
      const going = botFollowPath(bot, dt, 1.15);
      if (!going) {
        if (bot.shotsInMag < 12) { bot.reloadUntil = nowMs() + 1500; bot.shotsInMag = 24; }
        if (nowMs() > bot.coverUntil) bot.state = bot.lastSeenEnemy ? "hunt" : "patrol";
      }
    } else if (bot.lastSeenEnemy && nowMs() - bot.lastSeenAt < 7000 && bot.state !== "patrol") {
      // Hunt last seen position.
      bot.state = "hunt";
      if (!bot.path || bot.pathIdx >= bot.path.length || nowMs() > bot.repathAt) {
        botSetPathTo(bot, bot.lastSeenEnemy.x, bot.lastSeenEnemy.z);
        bot.repathAt = nowMs() + 1200;
      }
      const going = botFollowPath(bot, dt);
      if (!going) { bot.lastSeenEnemy = null; bot.state = "patrol"; }
    } else {
      // Patrol / ally follow.
      bot.state = "patrol";
      if (bot.team === "blue") {
        const d = Math.hypot(player.x - bot.x, player.z - bot.z);
        if (player.alive && d > 6.5) {
          if (!bot.path || bot.pathIdx >= bot.path.length || nowMs() > bot.repathAt) {
            botSetPathTo(bot, player.x, player.z);
            bot.repathAt = nowMs() + 900;
          }
          botFollowPath(bot, dt);
        } else if (!player.alive) {
          if (!bot.path || bot.pathIdx >= bot.path.length) {
            const cell = randomFreeCell(1, GRID_H - 1, 1, GRID_W - 1);
            const p = cellCenter(cell.r, cell.c);
            botSetPathTo(bot, p.x, p.z);
          }
          botFollowPath(bot, dt);
        }
      } else {
        if (!bot.path || bot.pathIdx >= bot.path.length) {
          const cell = randomFreeCell(1, GRID_H - 1, 1, GRID_W - 1);
          const p = cellCenter(cell.r, cell.c);
          botSetPathTo(bot, p.x, p.z);
        }
        botFollowPath(bot, dt, 0.8);
      }
    }
  }

  // Rig pose.
  bot.rig.group.position.set(bot.x, bot.y + bot.rig.group.position.y * 0, bot.z);
  if (bot.alive) bot.rig.group.position.y = 0;
  bot.rig.group.rotation.y = bot.yaw + Math.PI;
  bot.animT += dt * (bot.moving ? 9 : 1.2);
  const swing = Math.sin(bot.animT) * (bot.moving ? 0.55 : 0.04);
  bot.rig.legL.rotation.x = swing;
  bot.rig.legR.rotation.x = -swing;
  bot.rig.armL.rotation.x = -swing * 0.6;

  // Footstep audio for nearby moving bots.
  if (bot.moving) {
    bot.stepAcc += dt * bot.tuning.speed;
    if (bot.stepAcc > 3.6) {
      bot.stepAcc = 0;
      const d = Math.hypot(bot.x - player.x, bot.z - player.z);
      if (d < 14 && player.alive) sfx.footstep();
    }
  }
}

function updateRemotePlayer(unit, dt) {
  if (!unit.rig) return;
  if (!unit.connected) {
    unit.rig.group.visible = false;
    return;
  }
  unit.rig.group.visible = true;
  if (!unit.alive) {
    if (unit.deadFall < 1) {
      unit.deadFall = Math.min(1, unit.deadFall + dt * 3);
      unit.rig.group.rotation.z = unit.deadFall * (Math.PI / 2) * 0.96;
      unit.rig.group.position.y = -unit.deadFall * 0.18;
    }
  } else {
    unit.deadFall = 0;
    unit.rig.group.position.y = 0;
    unit.rig.group.rotation.z = 0;
  }
  unit.rig.group.position.x = unit.x;
  unit.rig.group.position.z = unit.z;
  unit.rig.group.rotation.y = unit.yaw + Math.PI;
  unit.animT += dt * (unit.moving ? 9 : 1.2);
  const swing = Math.sin(unit.animT) * (unit.moving ? 0.55 : 0.04);
  unit.rig.legL.rotation.x = swing;
  unit.rig.legR.rotation.x = -swing;
  unit.rig.armL.rotation.x = -swing * 0.6;
}

/* ----------------------------------------------------------------- HUD --- */

function updateScorePips() {
  const target = match.mode.scoreTarget || 4;
  const build = (score, cls) => {
    let html = "";
    for (let i = 0; i < target; i += 1) {
      html += `<span class="${i < score ? `is-filled ${cls}` : ""}"></span>`;
    }
    return html;
  };
  hud.scoreBlue.innerHTML = build(match.scoreBlue, "pip-blue");
  hud.scoreRed.innerHTML = build(match.scoreRed, "pip-red");
}

function applyCrosshair() {
  const color = CROSSHAIR_COLORS.find((c) => c.id === state.crosshairColor) || CROSSHAIR_COLORS[0];
  hud.crosshair.style.setProperty("--ch-color", color.value);
  hud.crosshair.style.setProperty("--ch-scale", String(state.settings.crosshairSize || 1));
}

function showBanner(title, sub, ms, tone = "") {
  hud.bannerTitle.textContent = title;
  hud.bannerSub.textContent = sub;
  hud.banner.className = `round-banner is-active ${tone ? `is-${tone}` : ""}`;
  clearTimeout(hud.banner._t);
  hud.banner._t = setTimeout(() => hud.banner.classList.remove("is-active"), ms);
}

function showHitmarker(head, killed) {
  hud.hitmarker.className = `hitmarker is-active ${killed ? "is-kill" : head ? "is-head" : ""}`;
  clearTimeout(hud.hitmarker._t);
  hud.hitmarker._t = setTimeout(() => hud.hitmarker.classList.remove("is-active"), 90);
}

function addKillFeed(attacker, victim, head) {
  const row = document.createElement("div");
  row.className = "feed-row";
  const aCls = attacker.team === "blue" ? "feed-blue" : "feed-red";
  const vCls = victim.team === "blue" ? "feed-blue" : "feed-red";
  const aName = attacker.isPlayer ? "You" : attacker.name;
  const vName = victim.isPlayer ? "You" : victim.name;
  const attackerNode = document.createElement("b");
  attackerNode.className = aCls;
  attackerNode.textContent = aName;
  const markerNode = document.createElement("span");
  markerNode.textContent = head ? "⦿" : "▸";
  const victimNode = document.createElement("b");
  victimNode.className = vCls;
  victimNode.textContent = vName;
  row.append(attackerNode, markerNode, victimNode);
  hud.killFeed.prepend(row);
  while (hud.killFeed.children.length > 5) hud.killFeed.lastChild.remove();
  setTimeout(() => { row.classList.add("is-fading"); setTimeout(() => row.remove(), 500); }, 4200);
}

function showDamageDirection(attacker) {
  const toA = Math.atan2(-(attacker.x - player.x), -(attacker.z - player.z));
  const rel = wrapAngle(toA - player.yaw);
  hud.damageDir.style.transform = `translate(-50%, -50%) rotate(${-rel}rad)`;
  hud.damageDir.classList.add("is-active");
  clearTimeout(hud.damageDir._t);
  hud.damageDir._t = setTimeout(() => hud.damageDir.classList.remove("is-active"), 700);
}

function updateHud(dt) {
  const w = activeWeapon();
  hud.health.style.width = `${clamp(player.hp, 0, 100)}%`;
  hud.health.classList.toggle("is-low", player.hp <= 35);
  hud.healthNum.textContent = String(Math.max(0, Math.ceil(player.hp)));
  hud.shieldWrap.style.display = player.shield > 0 ? "block" : "none";
  hud.shield.style.width = `${clamp(player.shield * 2, 0, 100)}%`;

  hud.ammo.textContent = w.id === "knife" ? "--" : w.reloadingUntil > nowMs() ? "--" : String(w.mag);
  hud.reserve.textContent = w.id === "knife" ? "" : `/ ${w.reserve}`;
  hud.weapon.textContent = w.def.name;
  hud.frag.textContent = String(player.frags);
  hud.frag.parentElement.classList.toggle("is-empty", player.frags <= 0);
  hud.flash.textContent = String(player.flashes);
  hud.flash.parentElement.classList.toggle("is-empty", player.flashes <= 0);

  const ability = player.agent.ability;
  const cdLeft = Math.max(0, player.abilityReadyAt - nowMs());
  hud.abilityName.textContent = isOnlineMatch() ? "Online" : ability.name;
  hud.abilityIcon.style.setProperty("--cd", String(isOnlineMatch() ? 0 : 1 - cdLeft / ability.cooldownMs));
  hud.abilityIcon.classList.toggle("is-ready", !isOnlineMatch() && cdLeft <= 0);

  if (isOnlineMatch()) {
    let remain = 0;
    if (match.phase === "live") remain = Math.max(0, match.roundEndsAtServer - Date.now());
    else if (match.phase === "freeze") remain = Math.max(0, match.phaseUntilServer - Date.now());
    if (match.phase === "lobby") {
      hud.timer.textContent = "WAIT";
      hud.timer.classList.remove("is-low");
    } else {
      const s = Math.ceil(remain / 1000);
      hud.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      hud.timer.classList.toggle("is-low", match.phase === "live" && s <= 15);
    }
    hud.objective.textContent = match.roomCode
      ? `${match.mode.name} room ${match.roomCode}`
      : `${match.mode.name} server-auth`;
  } else if (match.mode.id === "botstrike" || match.mode.id === "duelbot") {
    let remain;
    if (match.phase === "live") remain = Math.max(0, match.roundEndsAt - nowMs());
    else if (match.phase === "freeze") remain = match.mode.roundMs;
    else remain = 0;
    const s = Math.ceil(remain / 1000);
    hud.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    hud.timer.classList.toggle("is-low", match.phase === "live" && s <= 15);
    hud.objective.textContent = "";
  } else {
    hud.objective.textContent = `${match.targetsDown} targets · ${match.shotsFired ? Math.round((match.shotsHit / match.shotsFired) * 100) : 0}% accuracy`;
  }

  // Freeze countdown ticks in the banner subtitle.
  if (match.phase === "freeze") {
    const left = Math.ceil((match.phaseUntil - nowMs()) / 1000);
    if (left !== match.lastTick && left > 0) {
      match.lastTick = left;
      hud.bannerSub.textContent = `Live in ${left}…`;
      sfx.countTick();
    }
  }

  // Flash blindness + damage vignette.
  const blindLeft = Math.max(0, player.blindUntil - nowMs());
  hud.flashOverlay.style.opacity = String(clamp(blindLeft / 1400, 0, 1));
  const hurtAge = nowMs() - player.lastDamageAt;
  const lowHp = player.alive && player.hp <= 30 ? 0.35 + Math.sin(nowMs() / 240) * 0.1 : 0;
  hud.vignette.style.opacity = String(clamp(Math.max(1 - hurtAge / 600, lowHp), 0, 0.85));

  updateRadar();
}

function updateRadar() {
  const ctx2 = hud.radar.getContext("2d");
  const size = hud.radar.width;
  const scale = 3.0; // radar px per world unit
  const basePxPerUnit = 6 / CELL_SIZE;
  ctx2.clearRect(0, 0, size, size);
  ctx2.save();
  ctx2.beginPath();
  ctx2.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx2.clip();
  ctx2.fillStyle = "rgba(8, 11, 13, 0.78)";
  ctx2.fillRect(0, 0, size, size);

  ctx2.translate(size / 2, size / 2);
  ctx2.rotate(player.yaw);
  const k = scale / basePxPerUnit;
  ctx2.scale(k, k);
  const px = (player.x / CELL_SIZE + GRID_W / 2) * 6;
  const pz = (player.z / CELL_SIZE + GRID_H / 2) * 6;
  ctx2.drawImage(radarBase, -px, -pz);
  ctx2.restore();

  ctx2.save();
  ctx2.beginPath();
  ctx2.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx2.clip();

  // Blips (drawn unscaled, rotated so "up" is where the player faces).
  const drawBlip = (x, z, color, r = 4) => {
    const dx = x - player.x; const dz = z - player.z;
    const cos = Math.cos(player.yaw); const sin = Math.sin(player.yaw);
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    const bx = size / 2 + rx * scale;
    const bz = size / 2 + rz * scale;
    if (Math.hypot(bx - size / 2, bz - size / 2) > size / 2 - 4) return;
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(bx, bz, r, 0, Math.PI * 2);
    ctx2.fill();
  };

  for (const unit of combatants) {
    if (unit.isPlayer || !unit.alive) continue;
    if (unit.team === player.team) {
      drawBlip(unit.x, unit.z, "#3bd0c2");
    } else {
      const pulsed = nowMs() < player.pulseUntil;
      const firedRecently = nowMs() - unit.lastFiredAt < 1800;
      const seen = hasLos(player.x, player.y + 1.6, player.z, unit.x, 1.3, unit.z)
        && Math.hypot(unit.x - player.x, unit.z - player.z) < 34;
      if (pulsed || firedRecently || seen) drawBlip(unit.x, unit.z, pulsed ? "#c9a6ff" : "#f05f51");
    }
  }
  if (match.targets.length) {
    for (const t of match.targets) {
      if (t.alive) drawBlip(t.group.position.x, t.group.position.z, "#f1c36e", 3);
    }
  }
  ctx2.restore();

  // You, always centered pointing up.
  ctx2.fillStyle = "#f4ead6";
  ctx2.beginPath();
  ctx2.moveTo(size / 2, size / 2 - 6);
  ctx2.lineTo(size / 2 - 4, size / 2 + 4);
  ctx2.lineTo(size / 2 + 4, size / 2 + 4);
  ctx2.fill();
}

/* ------------------------------------------------------------ main loop -- */

function frame(t) {
  if (!match) return;
  animId = requestAnimationFrame(frame);
  let dt = Math.min((t - lastFrame) / 1000, 0.05);
  lastFrame = t;
  if (match.paused) dt = 0;

  if (dt > 0) {
    clockMs += dt * 1000;

    // Phase transitions.
    if (!isOnlineMatch() && match.mode.id === "botstrike") {
      if (match.phase === "freeze" && nowMs() >= match.phaseUntil) {
        match.phase = "live";
        showBanner("LIVE", "", 700, "win");
      } else if (match.phase === "live" && nowMs() >= match.roundEndsAt) {
        // Timer expiry — most total HP wins, tie = no score.
        const hpBlue = combatants.filter((u) => u.team === "blue" && u.alive).reduce((a, u) => a + u.hp, 0);
        const hpRed = combatants.filter((u) => u.team === "red" && u.alive).reduce((a, u) => a + u.hp, 0);
        hud.spectate.classList.remove("is-active");
        endRound(hpBlue > hpRed ? "blue" : hpRed > hpBlue ? "red" : null);
      } else if (match.phase === "roundEnd" && nowMs() >= match.phaseUntil) {
        const target = match.mode.scoreTarget;
        if (match.scoreBlue >= target || match.scoreRed >= target || match.round >= target * 2 - 1) {
          endMatch();
        } else {
          beginRound();
        }
      } else if (match.phase === "matchEnd" && nowMs() >= match.phaseUntil) {
        finishMatch();
        return;
      }
    }

    // Barrier expiry.
    if (barrierMesh.visible && barrierMesh.userData.until <= nowMs()) {
      barrierMesh.visible = false;
      combatants.forEach((u) => { if (!u.isPlayer) u.path = null; });
    }

    updatePlayer(dt);
    if (isOnlineMatch()) {
      syncOnlineSnapshot(match.net.sampleSnapshots(performance.now()));
    }
    for (const unit of combatants) {
      if (unit.isRemote) updateRemotePlayer(unit, dt);
      else if (!unit.isPlayer) updateBot(unit, dt);
    }
    if (!isOnlineMatch()) updateGrenades(dt);
    if (match.targets.length) updateTargets(dt);
    updateFx(dt);
    updateHud(dt);
  }

  renderer.render(scene, camera);
}

/* --------------------------------------------- pause overlay wiring ------ */

document.getElementById("pauseResume").addEventListener("click", () => { sfx.uiClick(); closePause(); });
document.getElementById("pauseRestart").addEventListener("click", () => { sfx.uiConfirm(); restartMatchFromPause(); });
document.getElementById("pauseExit").addEventListener("click", () => { sfx.uiClick(); exitMatchFromPause(); });
pauseVolume.addEventListener("input", () => {
  state.settings.volume = Number(pauseVolume.value) / 100;
  applyVolume();
});
pauseSens.addEventListener("input", () => {
  state.settings.sensitivity = Number(pauseSens.value);
});
pauseMute.addEventListener("change", () => {
  state.settings.muted = pauseMute.checked;
  applyVolume();
});

// Dev/test hook, only when loaded with ?debug.
if (new URLSearchParams(window.location.search).has("debug")) {
  window.__ap = {
    getMatch: () => match,
    getPlayer: () => player,
    getCombatants: () => combatants,
    dealDamage,
  };
}
