// Procedural WebAudio sound for Angle Protocol. No audio files — every cue is
// synthesized so the game stays dependency-free and loads instantly.

import { state } from "./state.js";

let ctx = null;
let master = null;
let ambientNodes = null;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ensureContext();
}

export function applyVolume() {
  if (!master) return;
  const target = state.settings.muted ? 0 : state.settings.volume * 0.9;
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
}

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({ type = "sine", freq = 440, endFreq = null, peak = 0.2, attack = 0.004, decay = 0.12, delay = 0 }) {
  if (!ensureContext()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + attack + decay);
  env(gain, t0, peak, attack, decay);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

let noiseBuffer = null;
function getNoiseBuffer() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function noise({ peak = 0.2, attack = 0.002, decay = 0.1, filterFreq = 2000, filterType = "lowpass", q = 0.8, delay = 0 }) {
  if (!ensureContext()) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain, t0, peak, attack, decay);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + attack + decay + 0.05);
}

export const sfx = {
  uiHover() { tone({ type: "sine", freq: 700, peak: 0.03, decay: 0.04 }); },
  uiClick() { tone({ type: "triangle", freq: 520, endFreq: 760, peak: 0.09, decay: 0.07 }); },
  uiConfirm() {
    tone({ type: "triangle", freq: 440, peak: 0.1, decay: 0.09 });
    tone({ type: "triangle", freq: 660, peak: 0.1, decay: 0.12, delay: 0.07 });
  },
  uiDeny() { tone({ type: "square", freq: 180, endFreq: 120, peak: 0.07, decay: 0.14 }); },

  shot(kind) {
    if (kind === "dmr") {
      noise({ peak: 0.34, decay: 0.16, filterFreq: 1500, filterType: "bandpass", q: 0.6 });
      tone({ type: "sawtooth", freq: 190, endFreq: 60, peak: 0.24, decay: 0.16 });
    } else if (kind === "smg") {
      noise({ peak: 0.2, decay: 0.06, filterFreq: 2600, filterType: "bandpass", q: 0.7 });
      tone({ type: "square", freq: 250, endFreq: 110, peak: 0.1, decay: 0.05 });
    } else if (kind === "pistol") {
      noise({ peak: 0.24, decay: 0.09, filterFreq: 2100, filterType: "bandpass", q: 0.7 });
      tone({ type: "square", freq: 210, endFreq: 90, peak: 0.13, decay: 0.08 });
    } else {
      noise({ peak: 0.26, decay: 0.09, filterFreq: 1900, filterType: "bandpass", q: 0.7 });
      tone({ type: "sawtooth", freq: 170, endFreq: 75, peak: 0.16, decay: 0.09 });
    }
  },
  enemyShot() {
    noise({ peak: 0.1, decay: 0.08, filterFreq: 1200, filterType: "bandpass", q: 0.8 });
  },
  dryFire() { tone({ type: "square", freq: 320, peak: 0.05, decay: 0.03 }); },
  reload() {
    noise({ peak: 0.1, decay: 0.05, filterFreq: 3200, delay: 0 });
    tone({ type: "square", freq: 360, peak: 0.06, decay: 0.04, delay: 0.12 });
    tone({ type: "square", freq: 300, peak: 0.07, decay: 0.05, delay: 0.42 });
    tone({ type: "triangle", freq: 520, peak: 0.09, decay: 0.06, delay: 0.72 });
  },
  hit() { tone({ type: "triangle", freq: 880, endFreq: 660, peak: 0.11, decay: 0.05 }); },
  headshot() { tone({ type: "triangle", freq: 1250, endFreq: 900, peak: 0.14, decay: 0.07 }); },
  kill() {
    tone({ type: "triangle", freq: 620, peak: 0.12, decay: 0.07 });
    tone({ type: "triangle", freq: 930, peak: 0.13, decay: 0.13, delay: 0.06 });
  },
  damaged() {
    noise({ peak: 0.16, decay: 0.1, filterFreq: 600 });
    tone({ type: "sawtooth", freq: 130, endFreq: 80, peak: 0.1, decay: 0.12 });
  },
  footstep() { noise({ peak: 0.028, decay: 0.045, filterFreq: 480, q: 0.4 }); },
  jump() { noise({ peak: 0.05, decay: 0.07, filterFreq: 700 }); },
  land() { noise({ peak: 0.09, decay: 0.08, filterFreq: 380 }); },
  throwUtil() { noise({ peak: 0.07, decay: 0.09, filterFreq: 1400, filterType: "highpass" }); },
  explosion() {
    noise({ peak: 0.4, decay: 0.5, filterFreq: 320, q: 0.3 });
    tone({ type: "sine", freq: 90, endFreq: 34, peak: 0.32, decay: 0.5 });
  },
  flashPop() {
    noise({ peak: 0.24, decay: 0.3, filterFreq: 5200, filterType: "highpass" });
    tone({ type: "sine", freq: 1450, peak: 0.16, decay: 0.4 });
  },
  ability() {
    tone({ type: "sine", freq: 420, endFreq: 840, peak: 0.12, decay: 0.22 });
    tone({ type: "sine", freq: 630, endFreq: 1260, peak: 0.08, decay: 0.22, delay: 0.05 });
  },
  roundStart() {
    tone({ type: "triangle", freq: 392, peak: 0.12, decay: 0.12 });
    tone({ type: "triangle", freq: 523, peak: 0.13, decay: 0.2, delay: 0.14 });
  },
  countTick() { tone({ type: "sine", freq: 660, peak: 0.08, decay: 0.06 }); },
  roundWin() {
    [392, 494, 587].forEach((f, i) => tone({ type: "triangle", freq: f, peak: 0.12, decay: 0.16, delay: i * 0.09 }));
  },
  roundLose() {
    [330, 262, 208].forEach((f, i) => tone({ type: "triangle", freq: f, peak: 0.11, decay: 0.18, delay: i * 0.11 }));
  },
  matchWin() {
    [392, 494, 587, 784].forEach((f, i) => tone({ type: "triangle", freq: f, peak: 0.14, decay: 0.3, delay: i * 0.13 }));
  },
  matchLose() {
    [294, 262, 220, 175].forEach((f, i) => tone({ type: "sawtooth", freq: f, peak: 0.08, decay: 0.3, delay: i * 0.14 }));
  },
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: "triangle", freq: f, peak: 0.12, decay: 0.2, delay: i * 0.08 }));
  },
  unlock() {
    tone({ type: "triangle", freq: 740, peak: 0.1, decay: 0.1 });
    tone({ type: "triangle", freq: 1109, peak: 0.12, decay: 0.24, delay: 0.09 });
  },
  targetDown() { tone({ type: "square", freq: 480, endFreq: 720, peak: 0.09, decay: 0.09 }); },
};

export function startAmbient() {
  if (!ensureContext() || ambientNodes) return;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.045, ctx.currentTime, 1.2);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 52;
  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = 78.2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 9;
  lfo.connect(lfoGain).connect(oscB.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 240;

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(gain).connect(master);
  oscA.start();
  oscB.start();
  lfo.start();
  ambientNodes = { gain, stopAll: [oscA, oscB, lfo] };
}

export function stopAmbient() {
  if (!ambientNodes) return;
  const { gain, stopAll } = ambientNodes;
  gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  const nodes = stopAll;
  setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 1600);
  ambientNodes = null;
}
