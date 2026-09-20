// Subtle WebAudio click — no assets needed, extremely quiet.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = ac.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export const sound = {
  turn() {
    blip(520, 0.06, 0.035, 'triangle');
  },
  scramble() {
    blip(340, 0.07, 0.03, 'triangle');
  },
  solve() {
    const ac = getCtx();
    if (!enabled || !ac) return;
    blip(660, 0.09, 0.04, 'sine');
    setTimeout(() => blip(880, 0.12, 0.04, 'sine'), 90);
  },
  click() {
    blip(700, 0.04, 0.02, 'sine');
  },
};
