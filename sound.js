/* Sound for the intro, synthesised live with Web Audio: no files to download.
   The score is laid out on the film's own cue times, so every cut lands on a hit. */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const pref = {
    get() { try { return localStorage.getItem('gori-sound') !== '0'; } catch (e) { return true; } },
    set(v) { try { localStorage.setItem('gori-sound', v ? '1' : '0'); } catch (e) { /* private mode */ } }
  };
  let ctx = null, out = null, verbIn = null, noise = null, bus = null, sources = [];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function boot() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
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
  function unlock() {
    if (!boot()) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(() => ctx.state === 'running').catch(() => false);
  }
  const live = () => !!ctx && ctx.state === 'running';

  // one bus per run: music goes through a filter so it can be "tape-stopped"
  function newBus() {
    const dry = ctx.createGain(), wet = ctx.createGain(), mus = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 18000;
    mus.connect(lp); lp.connect(dry); dry.connect(out); wet.connect(verbIn);
    return { dry, wet, mus, lp };
  }
  function kill(b, fade = 0.4) {
    if (!b || !ctx) return;
    const T = ctx.currentTime;
    [b.dry, b.wet].forEach(g => { g.gain.cancelScheduledValues(T); g.gain.setValueAtTime(g.gain.value, T); g.gain.linearRampToValueAtTime(0, T + fade); });
    const list = sources; sources = [];
    setTimeout(() => { list.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } }); try { b.dry.disconnect(); b.wet.disconnect(); } catch (e) { /* gone */ } }, fade * 1000 + 80);
  }

  /* ---------------- voices ---------------- */
  function amp(T, peak, a, d, { to = 'dry', wet = 0 } = {}) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(peak, T + a); g.gain.exponentialRampToValueAtTime(0.0001, T + a + d);
    g.connect(to === 'mus' ? bus.mus : bus.dry);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(bus.wet); }
    return g;
  }
  function osc(type, f, T, dur, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, T); o.detune.value = detune;
    o.start(T); o.stop(T + dur + 0.05); sources.push(o); return o;
  }
  function hiss(T, dur) {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    n.start(T, Math.random() * 1.5); n.stop(T + dur + 0.05); sources.push(n); return n;
  }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  const V = {
    kick(T, v = 1) {
      const o = osc('sine', 150, T, 0.5); o.frequency.exponentialRampToValueAtTime(44, T + 0.13);
      o.connect(amp(T, 0.9 * v, 0.003, 0.42, { to: 'mus' }));
      const n = hiss(T, 0.02), hp = filt('highpass', 2800); n.connect(hp); hp.connect(amp(T, 0.12 * v, 0.001, 0.015, { to: 'mus' }));
    },
    boom(T, v = 1) {
      const o = osc('sine', 62, T, 1.8); o.frequency.exponentialRampToValueAtTime(34, T + 1.2);
      o.connect(amp(T, 0.85 * v, 0.006, 1.6));
      V.kick(T, v * 0.9);
      const n = hiss(T, 1.6), hp = filt('highpass', 5200); n.connect(hp); hp.connect(amp(T, 0.07 * v, 0.004, 1.4, { wet: 0.6 }));
    },
    clap(T, v = 1) {
      [0, 0.011, 0.023].forEach((d, i) => {
        const n = hiss(T + d, 0.08), bp = filt('bandpass', 1350, 0.9);
        n.connect(bp); bp.connect(amp(T + d, (i === 2 ? 0.34 : 0.22) * v, 0.001, i === 2 ? 0.16 : 0.03, { to: 'mus', wet: 0.45 }));
      });
    },
    hat(T, v = 1, open = false) {
      const n = hiss(T, open ? 0.3 : 0.06), hp = filt('highpass', 7600);
      n.connect(hp); hp.connect(amp(T, 0.1 * v, 0.001, open ? 0.22 : 0.035, { to: 'mus' }));
    },
    tick(T, v = 1, f = 2600) {
      const o = osc('triangle', f, T, 0.05); o.connect(amp(T, 0.12 * v, 0.001, 0.035, { wet: 0.2 }));
      const n = hiss(T, 0.02), hp = filt('highpass', 4000); n.connect(hp); hp.connect(amp(T, 0.06 * v, 0.001, 0.012));
    },
    pluck(T, f, v = 1, wet = 0.4, to = 'mus') {
      const lp = filt('lowpass', 3200, 2); lp.frequency.setValueAtTime(3200, T); lp.frequency.exponentialRampToValueAtTime(500, T + 0.5);
      const g = amp(T, 0.16 * v, 0.004, 0.75, { to, wet });
      lp.connect(g);
      osc('triangle', f, T, 0.8).connect(lp);
      osc('sine', f * 2, T, 0.5).connect(amp(T, 0.04 * v, 0.003, 0.3, { to }));
    },
    bass(T, f, dur = 0.22, v = 1) {
      const lp = filt('lowpass', 900, 4); lp.frequency.setValueAtTime(1100, T); lp.frequency.exponentialRampToValueAtTime(170, T + dur);
      lp.connect(amp(T, 0.26 * v, 0.004, dur, { to: 'mus' }));
      osc('sawtooth', f, T, dur).connect(lp);
      osc('square', f / 2, T, dur).connect(amp(T, 0.12 * v, 0.004, dur, { to: 'mus' }));
    },
    stab(T, notes, v = 1, len = 0.55) {
      const lp = filt('lowpass', 2800, 1.2); lp.frequency.setValueAtTime(3200, T); lp.frequency.exponentialRampToValueAtTime(700, T + len);
      lp.connect(amp(T, 0.075 * v, 0.004, len, { to: 'mus', wet: 0.5 }));
      notes.forEach(m => { osc('sawtooth', hz(m), T, len, -8).connect(lp); osc('sawtooth', hz(m), T, len, 8).connect(lp); });
    },
    pad(T, notes, dur, v = 1, to = 'mus') {
      const g = ctx.createGain(), att = Math.min(1.2, dur * 0.35), rel = Math.min(1.4, dur * 0.4);
      g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(0.045 * v, T + att);
      g.gain.setValueAtTime(0.045 * v, T + dur - rel); g.gain.linearRampToValueAtTime(0, T + dur);
      const lp = filt('lowpass', 1100, 0.6); lp.connect(g);
      g.connect(to === 'mus' ? bus.mus : bus.dry);
      const s = ctx.createGain(); s.gain.value = 0.7; g.connect(s); s.connect(bus.wet);
      notes.forEach((m, i) => { osc('sawtooth', hz(m), T, dur, -9 + i).connect(lp); osc('sawtooth', hz(m), T, dur, 9 - i).connect(lp); osc('sine', hz(m) / 2, T, dur).connect(lp); });
    },
    whoosh(T, dur, v = 1, rise = true) {
      const n = hiss(T, dur), bp = filt('bandpass', rise ? 300 : 4000, 1.1);
      bp.frequency.setValueAtTime(rise ? 300 : 4200, T); bp.frequency.exponentialRampToValueAtTime(rise ? 4200 : 260, T + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, T);
      g.gain.exponentialRampToValueAtTime(0.26 * v, T + dur * (rise ? 0.9 : 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
      n.connect(bp); bp.connect(g); g.connect(bus.dry);
      const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(bus.wet);
    },
    riser(T, dur, v = 1) {
      V.whoosh(T, dur, v * 0.8);
      const o = osc('sawtooth', 180, T, dur); o.frequency.exponentialRampToValueAtTime(1400, T + dur);
      const lp = filt('lowpass', 900, 3); lp.frequency.setValueAtTime(600, T); lp.frequency.exponentialRampToValueAtTime(5200, T + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.05 * v, T + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, T + dur + 0.02);
      o.connect(lp); lp.connect(g); g.connect(bus.dry);
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
        const lp = filt('lowpass', 240); o.connect(lp); lp.connect(amp(T + d, (i ? 0.55 : 0.8) * v, 0.004, 0.26));
      });
    },
    chime(T, v = 1) {
      [[76, 1], [83, 0.6], [88, 0.4], [95, 0.18]].forEach(([m, k], i) => {
        osc('sine', hz(m), T + i * 0.035, 2.4).connect(amp(T + i * 0.035, 0.09 * v * k, 0.004, 2.2, { wet: 0.7 }));
      });
    },
    // "wah wah wahhh", quietly
    womp(T, v = 1) {
      [[67, 0, 0.26], [66, 0.3, 0.26], [65, 0.6, 0.7]].forEach(([m, d, len]) => {
        const lp = filt('lowpass', 500, 6); lp.frequency.setValueAtTime(400, T + d); lp.frequency.linearRampToValueAtTime(1300, T + d + 0.12); lp.frequency.linearRampToValueAtTime(420, T + d + len);
        lp.connect(amp(T + d, 0.13 * v, 0.02, len, { wet: 0.3 }));
        const o = osc('sawtooth', hz(m - 12), T + d, len);
        if (len > 0.5) { const l = osc('sine', 5.5, T + d, len), lg = ctx.createGain(); lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency); }
        o.connect(lp);
      });
    },
    // the music runs down like a stopped tape
    tapeStop(T, dur = 0.45) {
      bus.lp.frequency.setValueAtTime(18000, T); bus.lp.frequency.exponentialRampToValueAtTime(160, T + dur);
      bus.mus.gain.setValueAtTime(1, T); bus.mus.gain.linearRampToValueAtTime(0, T + dur);
      const o = osc('sawtooth', 220, T, dur); o.frequency.exponentialRampToValueAtTime(28, T + dur);
      const lp = filt('lowpass', 900); o.connect(lp); lp.connect(amp(T, 0.12, 0.005, dur));
    }
  };

  /* ---------------- the score ---------------- */
  const CH = { am: [57, 60, 64, 69], f: [53, 57, 60, 65], c: [55, 60, 64, 67], g: [55, 59, 62, 67], e: [56, 59, 64, 68] };
  const ROOT = { am: 33, f: 29, c: 36, g: 31, e: 28 };
  const PENTA = [69, 72, 74, 76, 79, 81, 84];

  function score(c, at) {
    // 1 · the mark draws in pencil, the colon's heartbeat, tiles pop
    at(0, T => V.pad(T, [45, 52, 59, 60, 67], 4.6, 0.8));
    at(c.draw, T => V.scratch(T, 1.45, 1));
    at(c.colon, T => V.heart(T, 1));
    at(c.shrink, T => V.whoosh(T, 0.6, 0.6, false));
    c.tiles.forEach((t, i) => at(t, T => V.pluck(T, hz(PENTA[i % PENTA.length]), 0.7, 0.5, 'dry')));
    at(c.dive - 0.9, T => V.riser(T, 1.6, 0.9));
    at(c.dive, T => V.whoosh(T, 0.5, 0.8));
    // 2 · the reel: a bar per shot, every cut on the downbeat
    at(c.reel, T => V.boom(T, 1));
    const bars = ['am', 'f', 'c', 'g', 'am', 'f'];
    bars.forEach((ch, b) => {
      const B = c.reel + b * c.bar, beat = c.bar / 4;
      if (b) at(B - 0.32, T => V.whoosh(T, 0.32, 0.55));
      at(B, T => V.stab(T, CH[ch], 1));
      at(B + beat * 2.5, T => V.stab(T, CH[ch], 0.55, 0.3));
      for (let k = 0; k < 4; k++) {
        at(B + beat * k, T => V.kick(T, k ? 0.85 : 1));
        at(B + beat * (k + 0.5), T => V.hat(T, 0.9, k === 3 && b % 2 === 1));
        if (b >= 2) at(B + beat * (k + 0.25), T => V.hat(T, 0.35));
        if (k % 2 === 1) at(B + beat * k, T => V.clap(T, 0.9));
      }
      for (let e = 0; e < 8; e++) at(B + beat * e / 2, T => V.bass(T, hz(ROOT[ch] + (e % 2 ? 12 : 0)), 0.2, e % 2 ? 0.7 : 1));
      if (b >= 2) CH[ch].concat(CH[ch].slice(1).reverse()).forEach((m, i) => at(B + beat * (i * 0.5 + 0.25), T => V.pluck(T, hz(m + 12), 0.45)));
    });
    // shot accents
    at(c.reel + c.bar * 2 + 0.5, T => V.tick(T, 0.9, 3300));
    at(c.reel + c.bar * 2 + 0.95, T => V.tick(T, 0.9, 3600));
    at(c.reel + c.bar * 2 + 1.4, T => V.tick(T, 0.9, 3900));
    at(c.slam, T => { V.boom(T, 0.9); V.clap(T, 1); });
    // 3 · the burst: words stutter faster and faster, then one big hit
    at(c.burst, T => V.riser(T, c.next - c.burst, 1.1));
    c.ticks.forEach((t, i) => at(t, T => { V.tick(T, 0.8 + i / c.ticks.length, 2200 + i * 110); if (i % 2 === 0) V.kick(T, 0.5 + i / c.ticks.length * 0.4); }));
    at(c.next, T => { V.boom(T, 1.1); V.stab(T, [57, 64, 69, 72, 76], 1.2, 1.1); V.hat(T, 1, true); });
    // 4 · the Earth: air, a question typed out, answers land
    at(c.earth, T => V.pad(T, [53, 57, 60, 64, 72], c.a2 - c.earth + 0.4, 1));
    at(c.earth, T => V.whoosh(T, 1.1, 0.6, false));
    c.type1.forEach(t => at(t, T => V.tick(T, 0.5, 3000 + Math.random() * 600)));
    at(c.a1, T => { V.boom(T, 0.75); V.pluck(T, hz(65), 0.9, 0.6); V.pluck(T, hz(72), 0.6, 0.6); });
    c.type2.forEach(t => at(t, T => V.tick(T, 0.5, 3000 + Math.random() * 600)));
    at(c.a2, T => { V.boom(T, 0.85); V.stab(T, [57, 64, 69, 71, 76], 0.9, 0.9); });
    at(c.a2, T => V.pad(T, [57, 60, 64, 71], c.ask - c.a2 + 0.3, 0.9));
    at(c.fold - 0.05, T => V.whoosh(T, 0.6, 0.7));
    at(c.fold + 0.55, T => { V.tick(T, 1, 1800); V.kick(T, 0.6); });
    // 5 · "Wait." The tape stops. Then the heartbeat from the language question returns
    at(c.ask, T => V.heart(T, 0.9));
    at(c.wait, T => V.tapeStop(T, 0.5));
    at(c.see, T => V.tick(T, 0.6, 2000));
    at(c.head, T => V.pad(T, [48, 55, 59, 62, 64], 7, 0.9, 'dry'));
    for (let k = 0; k < 5; k++) at(c.head + k * 1.25, T => V.heart(T, 0.85 - k * 0.12));
    at(c.btns, T => V.pluck(T, hz(76), 0.6, 0.6, 'dry'));
  }

  function play(cues, offset = 0) {
    if (!pref.get() || !live()) return false;
    stop(0.05);
    bus = newBus();
    const T0 = ctx.currentTime + 0.06 - offset;
    score(cues, (t, fn) => { if (t >= offset - 0.01) fn(T0 + t); });
    return true;
  }
  function stop(fade = 0.5) { if (bus) { kill(bus, fade); bus = null; } }
  function fx(name) {
    if (!pref.get() || !live()) return;
    if (!bus) bus = newBus();
    const T = ctx.currentTime + 0.02;
    if (name === 'yes') { V.chime(T, 1); V.heart(T + 0.05, 1); }
    else if (name === 'no') V.womp(T, 1);
    else if (name === 'pick') V.heart(T, 0.9);
  }
  // a soft note when an arc lands on a city (the globe calls this live)
  function ping() {
    if (!bus || !live()) return;
    V.pluck(ctx.currentTime + 0.01, hz(PENTA[(Math.random() * PENTA.length) | 0] + 12), 0.28, 0.7, 'dry');
  }

  window.GORI_SOUND = { unlock, play, stop, fx, ping, live, get enabled() { return pref.get(); }, set enabled(v) { pref.set(v); if (!v) stop(0.3); }, supported: !!AC };
})();
