// Every sound in NOIR is synthesised — a low room tone, soft ticks and a few restrained cues.
let ctx = null;
let master = null;
let drone = null;
let enabled = false;

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
}

function startDrone() {
  if (drone) return;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const oscs = [55, 55.4, 82.5, 110.3].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i < 2 ? 'sine' : 'triangle';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = i < 2 ? 0.5 : 0.08;
    o.connect(og).connect(lp);
    o.start();
    return o;
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 120;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start();
  lp.connect(g).connect(master);
  drone = { oscs, lfo, g };
}

export const sound = {
  get enabled() {
    return enabled;
  },
  set(on) {
    enabled = on;
    if (on) {
      init();
      ctx.resume();
      startDrone();
    }
    if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.4);
  },
  tick(freq = 2400, vol = 0.05) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.05);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.08);
  },
  whoosh(dur = 1.4, vol = 0.07) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
  },
  chime() {
    if (!enabled) return;
    const t = ctx.currentTime;
    [659.25, 987.77, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 1.6);
      o.connect(g).connect(master);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 1.7);
    });
  },
  low(vol = 0.12) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 1.8);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 2.1);
  },
  silence(on) {
    if (!ctx || !drone) return;
    drone.g.gain.setTargetAtTime(on ? 0 : 0.05, ctx.currentTime, on ? 0.08 : 1.2);
  },
};
