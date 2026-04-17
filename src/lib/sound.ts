/**
 * Tiny Web Audio–only SFX pack. No assets, no network. Each function synthesises
 * its waveform on demand and is cheap enough to call freely during a game.
 *
 * Disabled by default unless the user toggles sound on (persisted in
 * localStorage under `risk-sound-enabled`). The module is safe to import in
 * SSR-ish contexts — the AudioContext is created lazily on first use.
 */

const KEY = "risk-sound-enabled";

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const W = window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext };
    const C = W.AudioContext || W.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  if (on) getCtx(); // warm up AudioContext behind a user gesture
}

function playTone(
  freq: number,
  durationMs: number,
  type: OscillatorType = "triangle",
  volume = 0.12,
  attackMs = 4,
  releaseMs = 60
) {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  const a = attackMs / 1000;
  const r = releaseMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + a);
  gain.gain.setValueAtTime(volume, now + durationMs / 1000);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000 + r);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + r + 0.02);
}

function playNoise(durationMs: number, volume = 0.08, filterHz = 1800) {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const bufferSize = Math.max(1, Math.floor((c.sampleRate * durationMs) / 1000));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterHz;
  filter.Q.value = 1.1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
  src.stop(now + durationMs / 1000);
}

export const SFX = {
  diceRoll() {
    // short "tumble" of filtered noise
    playNoise(220, 0.1, 1200 + Math.random() * 800);
    setTimeout(() => playNoise(160, 0.08, 800 + Math.random() * 600), 110);
  },
  diceLand() {
    playTone(240, 60, "square", 0.09);
  },
  battleHit() {
    playTone(160, 90, "sawtooth", 0.12);
    setTimeout(() => playNoise(120, 0.08, 600), 10);
  },
  conquer() {
    // triumphant 3-note fanfare
    playTone(523, 120, "triangle", 0.14);
    setTimeout(() => playTone(659, 120, "triangle", 0.14), 130);
    setTimeout(() => playTone(784, 220, "triangle", 0.16), 260);
  },
  defeat() {
    playTone(200, 220, "sawtooth", 0.14);
    setTimeout(() => playTone(140, 260, "sawtooth", 0.14), 230);
  },
  victory() {
    playTone(523, 150, "triangle", 0.16);
    setTimeout(() => playTone(659, 150, "triangle", 0.16), 160);
    setTimeout(() => playTone(784, 150, "triangle", 0.16), 320);
    setTimeout(() => playTone(1046, 380, "triangle", 0.18), 480);
  },
  place() {
    playTone(320, 40, "triangle", 0.07);
  },
  phaseChange() {
    playTone(440, 80, "sine", 0.08);
    setTimeout(() => playTone(660, 100, "sine", 0.08), 80);
  },
};
