/* Sound for the intro: the music is one beat cut to the film (src/intro-bed.py makes the files),
   small synthesised accents sit on top of it, and the answer hands over to the radio. */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const pref = {
    get() { try { return localStorage.getItem('gori-sound') !== '0'; } catch (e) { return true; } },
    set(v) { try { localStorage.setItem('gori-sound', v ? '1' : '0'); } catch (e) { /* private mode */ } }
  };
  const FILES = { bed: 'assets/intro/bed.mp3', after: 'assets/intro/after.mp3' };
  // how long the music keeps going after the answer, and how long it takes to dissolve into the radio
  const HOLD = 5, DISSOLVE = 6;
  let ctx = null, out = null, verbIn = null, noise = null, bus = null, sources = [];
  const raw = {}, buf = {}, decoding = {};
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function boot() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
    out = ctx.createGain(); out.gain.value = 0.85;
    out.connect(comp); comp.connect(ctx.destination);
    // a generated room: decaying stereo noise
    const len = Math.round(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    verbIn = ctx.createGain(); verbIn.gain.value = 0.34;
    verbIn.connect(verb); verb.connect(out);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // the files are fetched as soon as an intro is coming; decoding needs the unlocked context
  function prepare() {
    Object.keys(FILES).forEach(k => { if (!raw[k]) raw[k] = fetch(FILES[k]).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null); });
    if (!ctx) return;
    Object.keys(FILES).forEach(k => {
      if (buf[k] || decoding[k]) return;
      decoding[k] = true;
      raw[k].then(a => (a ? ctx.decodeAudioData(a) : null)).then(b => { buf[k] = b; if (k === 'bed') startBed(); }).catch(() => {});
    });
  }
  function unlock() {
    if (!boot()) return Promise.resolve(false);
    prepare();
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(() => ctx.state === 'running').catch(() => false);
  }
  const live = () => !!ctx && ctx.state === 'running';

  function newBus() {
    const dry = ctx.createGain(), wet = ctx.createGain();
    dry.connect(out); wet.connect(verbIn);
    return { dry, wet, t0: null, bed: false };
  }
  function kill(b, fade = 0.4) {
    if (!b || !ctx) return;
    const T = ctx.currentTime;
    [b.dry, b.wet].forEach(g => { g.gain.cancelScheduledValues(T); g.gain.setValueAtTime(g.gain.value, T); g.gain.linearRampToValueAtTime(0, T + fade); });
    const list = sources; sources = [];
    setTimeout(() => { list.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } }); try { b.dry.disconnect(); b.wet.disconnect(); } catch (e) { /* gone */ } }, fade * 1000 + 80);
  }
  // the beat starts with the film; if it was still decoding, it joins at the right moment of the film
  function startBed() {
    if (!bus || bus.t0 === null || bus.bed || !buf.bed) return;
    const T = ctx.currentTime + 0.03, at = T - bus.t0;
    if (at >= buf.bed.duration) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf.bed; g.gain.value = 1.25;
    s.connect(g); g.connect(bus.dry); s.start(Math.max(T, bus.t0), Math.max(0, at)); sources.push(s);
    bus.bed = true;
  }

  /* ---------------- accents ---------------- */
  function amp(T, peak, a, d, { wet = 0 } = {}) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(peak, T + a); g.gain.exponentialRampToValueAtTime(0.0001, T + a + d);
    g.connect(bus.dry);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(bus.wet); }
    return g;
  }
  function osc(type, f, T, dur) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, T);
    o.start(T); o.stop(T + dur + 0.05); sources.push(o); return o;
  }
  function hiss(T, dur) {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    n.start(T, Math.random() * 1.5); n.stop(T + dur + 0.05); sources.push(n); return n;
  }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  const V = {
    // a felt upright: slightly stretched partials
    piano(T, m, v = 1, len = 1.6) {
      const f = hz(m), g = amp(T, 0.16 * v, 0.003, len, { wet: 0.3 }), lp = filt('lowpass', 2600, 0.5);
      lp.connect(g);
      [[1, 1], [2, 0.42], [3, 0.2]].forEach(([n, k]) => {
        const p = ctx.createGain(); p.gain.value = k;
        osc('sine', f * n * Math.sqrt(1 + 0.00035 * n * n), T, len).connect(p); p.connect(lp);
      });
    },
    vibes(T, m, v = 1, len = 1.6) {
      const f = hz(m);
      osc('sine', f, T, len).connect(amp(T, 0.11 * v, 0.002, len, { wet: 0.5 }));
      osc('sine', f * 4, T, 0.3).connect(amp(T, 0.022 * v, 0.001, 0.22, { wet: 0.4 }));
    },
    // a muted guitar with a wah
    guitar(T, m, v = 1, len = 0.2) {
      const bp = filt('bandpass', 650, 3.4); bp.frequency.setValueAtTime(600, T); bp.frequency.exponentialRampToValueAtTime(1900, T + len * 0.5); bp.frequency.exponentialRampToValueAtTime(650, T + len);
      bp.connect(amp(T, 0.22 * v, 0.002, len, { wet: 0.1 }));
      osc('sawtooth', hz(m), T, len).connect(bp);
    },
    sub(T, m, dur = 1.2, v = 1) { osc('sine', hz(m), T, dur).connect(amp(T, 0.3 * v, 0.008, dur)); },
    kick(T, v = 1) {
      const o = osc('sine', 135, T, 0.4); o.frequency.exponentialRampToValueAtTime(49, T + 0.075);
      o.connect(amp(T, 0.5 * v, 0.002, 0.3));
    },
    snare(T, v = 1) {
      const n = hiss(T, 0.2), bp = filt('bandpass', 1900, 0.55); n.connect(bp); bp.connect(amp(T, 0.16 * v, 0.001, 0.16, { wet: 0.25 }));
    },
    hat(T, v = 1) {
      const n = hiss(T, 0.07), hp = filt('highpass', 7400); n.connect(hp); hp.connect(amp(T, 0.07 * v, 0.001, 0.04));
    },
    crash(T, v = 1) {
      const n = hiss(T, 1.7), hp = filt('highpass', 4200); n.connect(hp); hp.connect(amp(T, 0.11 * v, 0.002, 1.6, { wet: 0.35 }));
    },
    // air pulled backwards into a hit
    rev(T, dur, v = 1) {
      const n = hiss(T, dur), bp = filt('bandpass', 500, 0.8), g = ctx.createGain();
      bp.frequency.setValueAtTime(500, T); bp.frequency.exponentialRampToValueAtTime(6000, T + dur);
      g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.12 * v, T + dur - 0.01); g.gain.linearRampToValueAtTime(0, T + dur);
      n.connect(bp); bp.connect(g); g.connect(bus.dry);
      const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(bus.wet);
    },
    whoosh(T, dur, v = 1) {
      const n = hiss(T, dur), bp = filt('bandpass', 3400, 0.9), g = ctx.createGain();
      bp.frequency.setValueAtTime(3400, T); bp.frequency.exponentialRampToValueAtTime(260, T + dur);
      g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.08 * v, T + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
      n.connect(bp); bp.connect(g); g.connect(bus.dry);
    },
    // a needle landing on the record
    needle(T, v = 1) {
      const o = osc('sine', 70, T, 0.14); o.frequency.exponentialRampToValueAtTime(42, T + 0.1); o.connect(amp(T, 0.3 * v, 0.002, 0.11));
      const n = hiss(T, 0.03), hp = filt('highpass', 2200); n.connect(hp); hp.connect(amp(T, 0.08 * v, 0.001, 0.02));
    },
    // a film gate: the shutter rattling over the "shoots ads" shot
    projector(T, dur, v = 1) {
      const n = hiss(T, dur), bp = filt('bandpass', 2400, 1.2), g = ctx.createGain(), s = osc('square', 24, T, dur), sg = ctx.createGain();
      g.gain.setValueAtTime(0.0001, T); g.gain.linearRampToValueAtTime(0.03 * v, T + 0.05); g.gain.setValueAtTime(0.03 * v, T + dur - 0.1); g.gain.linearRampToValueAtTime(0, T + dur);
      sg.gain.value = 0.027 * v; s.connect(sg); sg.connect(g.gain);
      n.connect(bp); bp.connect(g); g.connect(bus.dry);
    },
    key(T, v = 1) {
      const n = hiss(T, 0.03), hp = filt('highpass', 2400); n.connect(hp); hp.connect(amp(T, 0.05 * v, 0.001, 0.016, { wet: 0.12 }));
      osc('sine', 210, T, 0.03).connect(amp(T, 0.05 * v, 0.001, 0.016));
    },
    // the refund case closes: a rubber stamp
    stamp(T, v = 1) {
      const o = osc('sine', 104, T, 0.16); o.frequency.exponentialRampToValueAtTime(62, T + 0.09); o.connect(amp(T, 0.4 * v, 0.001, 0.13));
      const n = hiss(T, 0.05), lp = filt('lowpass', 1500); n.connect(lp); lp.connect(amp(T, 0.2 * v, 0.001, 0.04, { wet: 0.12 }));
    },
    // a pencil on paper: band-limited noise with a nervous hand
    scratch(T, dur, v = 1) {
      const n = hiss(T, dur), bp = filt('bandpass', 2600, 2.4), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, T);
      for (let t = 0; t < dur; t += 0.035) g.gain.setValueAtTime((0.02 + Math.random() * 0.07) * v * (Math.random() < 0.18 ? 0.2 : 1), T + t);
      g.gain.setValueAtTime(0.0001, T + dur);
      n.connect(bp); bp.connect(g); g.connect(bus.dry);
    },
    // the colon's heartbeat: lub-dub
    heart(T, v = 1) {
      [0, 0.19].forEach((d, i) => {
        const o = osc('sine', 78, T + d, 0.35); o.frequency.exponentialRampToValueAtTime(44, T + d + 0.14);
        const lp = filt('lowpass', 240); o.connect(lp); lp.connect(amp(T + d, (i ? 0.5 : 0.7) * v, 0.004, 0.26));
      });
    }
  };

  /* ---------------- the accents, on the film's cue times ---------------- */
  // all in E, the key the beat is slowed down to
  const PING = [76, 78, 80, 83, 85, 88, 92];

  function score(c, at) {
    const shot = i => c.reel + i * c.bar;
    at(0, T => V.needle(T));
    at(c.draw, T => V.scratch(T, 1.45, 0.8));
    at(c.colon, T => V.heart(T, 1));
    at(c.shrink, T => V.whoosh(T, 0.6, 0.7));
    // each tile adds a note of the chord on its own instrument
    const TILE = [T => V.piano(T, 64, 0.7), T => V.vibes(T, 68, 0.8), T => V.guitar(T, 71, 0.7, 0.3), T => V.piano(T, 75, 0.7), T => V.vibes(T, 78, 0.8), T => V.piano(T, 83, 0.6)];
    c.tiles.forEach((t, i) => at(t, TILE[i % TILE.length]));
    at(c.dive - 0.9, T => V.rev(T, 1.8, 1));
    // the drop lands on the first shot
    at(c.reel, T => { V.crash(T, 0.7); V.sub(T, 40, 1.2, 0.7); });
    // "makes products": keys typing along with the voice
    [0.3, 0.42, 0.66, 0.92, 1.16, 1.42, 1.78, 1.9].forEach(d => at(shot(0) + d, T => V.key(T, 0.7)));
    // "shoots ads": the film gate
    at(shot(1), T => V.projector(T, c.bar, 1));
    // "draws brands": three flips of the mark, each with its own note
    [[0, 76], [0.5, 80], [0.95, 83], [1.4, 87]].forEach(([d, m]) => at(shot(2) + d, T => V.vibes(T, m, 1)));
    // "untangles processes": a guitar scans, the case closes on a stamp
    [0, 0.25, 0.4, 0.65, 0.75, 1.0].forEach((d, i) => at(shot(3) + d, T => V.guitar(T, [59, 62, 66, 62, 57, 64][i], 0.7, 0.13)));
    at(shot(3) + 1.35, T => { V.stamp(T, 1); V.vibes(T, 88, 0.6, 1); });
    // "builds systems": hubs, projects and tasks land one by one
    [[0, 69], [0.14, 73], [0.28, 76]].forEach(([d, m]) => at(shot(4) + d, T => V.piano(T, m, 0.8)));
    // "wins hackathons": a roll under the falling diploma, everything on the slam
    for (let i = 0; i < 7; i++) at(shot(5) + 0.75 + i * 0.125, T => V.snare(T, 0.3 + i * 0.1));
    at(c.slam, T => { V.kick(T, 1); V.crash(T, 0.9); V.sub(T, 35, 0.9, 0.9); });
    // the words are chopped in the beat itself; the hats only push them along
    c.ticks.forEach((t, i) => { if (i % 3 === 0) at(t, T => V.hat(T, 0.4 + i * 0.04)); });
    at(c.burst, T => V.rev(T, c.next - c.burst, 0.9));
    at(c.next, T => { V.kick(T, 0.8); V.sub(T, 40, 1.1, 0.6); V.crash(T, 1); });
    // the Earth: a question typed out, answers land
    at(c.earth, T => V.whoosh(T, 1.1, 0.6));
    c.type1.forEach(t => at(t, T => V.key(T, 0.8)));
    at(c.a1, T => { V.sub(T, 33, 1.3, 0.6); V.vibes(T, 80, 0.7); });
    c.type2.forEach(t => at(t, T => V.key(T, 0.8)));
    at(c.a2, T => { V.kick(T, 0.7); V.sub(T, 42, 1.5, 0.7); V.vibes(T, 85, 0.7); });
    at(c.fold - 0.1, T => V.rev(T, 0.65, 0.8));
    // "Wait." stops in the beat itself. The heartbeat from the language question stays
    at(c.ask, T => V.heart(T, 0.9));
    at(c.see, T => V.key(T, 1));
    for (let k = 0; k < 5; k++) at(c.head + k * 1.25, T => V.heart(T, 0.85 - k * 0.12));
    at(c.btns, T => V.vibes(T, 83, 0.6, 2));
  }

  function play(cues, offset = 0) {
    if (!pref.get() || !live()) return false;
    stop(0.05);
    bus = newBus();
    const T0 = ctx.currentTime + 0.06 - offset;
    bus.t0 = T0;
    score(cues, (t, fn) => { if (t >= offset - 0.01) fn(T0 + t); });
    startBed();
    return true;
  }
  function stop(fade = 0.5) { if (bus) { kill(bus, fade); bus = null; } }
  function fx(name) {
    if (!pref.get() || !live()) return;
    if (!bus) bus = newBus();
    if (name === 'pick') { const T = ctx.currentTime + 0.02; V.heart(T, 0.9); V.piano(T, 76, 0.5, 0.9); }
  }
  // the intro is over: the beat answers, keeps playing under the site and dissolves into the radio.
  // Returns how many seconds the radio should wait
  function handoff(kind) {
    if (!pref.get() || !live() || !buf.after) { stop(0.6); return 0; }
    stop(0.35);
    bus = newBus();
    const T = ctx.currentTime + 0.02, s = ctx.createBufferSource(), g = ctx.createGain(), lp = filt('lowpass', 18000, 0.5);
    s.buffer = buf.after; s.connect(lp); lp.connect(g); g.connect(bus.dry); s.start(T); sources.push(s);
    g.gain.setValueAtTime(1.15, T); g.gain.setValueCurveAtTime(Float32Array.from({ length: 33 }, (_, i) => 1.15 * Math.cos(i / 32 * Math.PI / 2)), T + HOLD, DISSOLVE);
    if (kind === 'yes') { V.kick(T, 1); V.crash(T, 1); V.sub(T, 40, 1.4, 0.9); }
    // "Not yet" gets the same music from behind a door, and the door opens anyway
    else if (kind === 'no') { lp.frequency.setValueAtTime(600, T); lp.frequency.setValueAtTime(600, T + 1.2); lp.frequency.exponentialRampToValueAtTime(18000, T + HOLD); V.piano(T, 64, 0.5, 1.8); }
    return HOLD;
  }
  // a soft note when an arc lands on a city (the globe calls this live)
  function ping() {
    if (!bus || !live()) return;
    V.vibes(ctx.currentTime + 0.01, PING[(Math.random() * PING.length) | 0], 0.3, 1);
  }

  window.GORI_SOUND = { prepare, unlock, play, stop, fx, handoff, ping, live, get enabled() { return pref.get(); }, set enabled(v) { pref.set(v); if (!v) stop(0.3); }, supported: !!AC, fade: DISSOLVE };
})();
