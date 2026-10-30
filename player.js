/* The site's own radio: a fixed playlist that plays quietly while people look around.
   It starts after the intro (the language click already unlocked sound), remembers
   where it stopped, steps aside for videos with sound, and draws its own covers. */
(() => {
  'use strict';
  const root = document.getElementById('player');
  if (!root || !window.Audio) return;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));

  // order here is the order on the site
  const TRACKS = [
    { file: 'both-eyes-closed', title: 'Both Eyes Closed', artist: 'A$AP Rocky', bg: '--color-intro-ink', dot: '--color-red', ink: '--color-cream' },
    { file: 'shroom-clouds', title: 'Shroom Clouds', artist: 'A$AP Rocky feat. reggie & Jeremih', bg: '--color-sr-indigo', dot: '--color-sr-coral', ink: '--color-sr-cream' },
    { file: 'bound-1', title: 'Bound 1', artist: 'Kanye West feat. Charlie Wilson & John Legend', bg: '--color-paper', dot: '--color-red', ink: '--color-paper-ink' },
    { file: 'life-of-the-party', title: 'Life Of The Party', artist: 'Kanye West & André 3000', bg: '--color-red', dot: '--color-intro-ink', ink: '--color-on-red' },
    { file: 'heart-pt-6', title: 'heart pt. 6', artist: 'Kendrick Lamar', bg: '--color-lg-ground', dot: '--color-lg-key', ink: '--color-cream' },
    { file: 'safari', title: 'SAFARI', artist: 'Tyler, The Creator', bg: '--color-sl-ground', dot: '--color-sl-pill', ink: '--color-sl-pill' }
  ];
  const src = t => `music/${t.file}.mp3`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const audio = new Audio();
  audio.preload = 'none';
  const pre = new Audio(); pre.preload = 'none';
  let idx = 0, level = 0.6, fadeRaf = 0, armed = false, ducked = false, waiting = null;
  const saved = (() => { try { return JSON.parse(store.get('gori-music-at') || 'null'); } catch (e) { return null; } })();
  if (saved && saved.i >= 0 && saved.i < TRACKS.length) idx = saved.i;
  const vol = parseFloat(store.get('gori-music-vol'));
  if (vol >= 0 && vol <= 1) level = vol;

  /* ---------- covers: drawn once per track, in the site's colours ---------- */
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#111';
  function cover(t, n) {
    const c = document.createElement('canvas'), S = 256; c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = tok(t.bg); g.fillRect(0, 0, S, S);
    // halftone falling off from the lower right corner
    g.fillStyle = tok(t.dot);
    const step = 12;
    for (let y = step / 2; y < S; y += step) for (let x = step / 2; x < S; x += step) {
      const d = Math.hypot(S - x, S - y) / (S * 1.15), r = (1 - d) * step * 0.52;
      if (r > 0.6) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }
    // the colon
    g.beginPath(); g.arc(30, 30, 9, 0, Math.PI * 2); g.arc(30, 58, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = tok(t.ink);
    g.font = '600 15px ui-monospace, "SF Mono", Menlo, monospace';
    g.textAlign = 'right'; g.fillText(String(n + 1).padStart(2, '0'), S - 18, 32);
    g.textAlign = 'left';
    g.font = '700 30px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'sans-serif');
    // wrap the title onto at most three lines
    const words = t.title.split(' '), lines = [];
    let line = '';
    words.forEach(w => { const next = line ? line + ' ' + w : w; if (g.measureText(next).width > S - 36 && line) { lines.push(line); line = w; } else line = next; });
    lines.push(line);
    lines.slice(-3).forEach((l, i, a) => g.fillText(l, 18, S - 20 - (a.length - 1 - i) * 32));
    return c.toDataURL('image/png');
  }
  let arts = [];
  const drawArts = () => { arts = TRACKS.map(cover); };

  /* ---------- list ---------- */
  const list = $('.player__list');
  TRACKS.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'player__item';
    b.innerHTML = `<img class="player__art" alt="" width="36" height="36"><span class="player__meta"><span class="player__title"></span><span class="player__artist"></span></span><span class="player__eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
    $('.player__title', b).textContent = t.title;
    $('.player__artist', b).textContent = t.artist;
    b.addEventListener('click', () => { load(i); play(true); });
    li.append(b); list.append(li);
  });

  const fmt = s => { if (!isFinite(s)) return '0:00'; s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paint() {
    const t = TRACKS[idx];
    $$('.player__pill .player__title, .player__now .player__title').forEach(el => { el.textContent = t.title; });
    $$('.player__pill .player__artist, .player__now .player__artist').forEach(el => { el.textContent = t.artist; });
    $$('.player__pill .player__art, .player__now .player__art').forEach(el => { if (arts[idx]) el.src = arts[idx]; });
    $$('.player__item').forEach((b, i) => {
      b.classList.toggle('is-current', i === idx);
      if (i === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      const img = $('.player__art', b); if (arts[i] && img.src !== arts[i]) img.src = arts[i];
    });
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'GORI: radio', artwork: arts[idx] ? [{ src: arts[idx], sizes: '256x256', type: 'image/png' }] : [] });
    }
  }
  function state() {
    const on = !audio.paused;
    root.classList.toggle('is-playing', on);
    $$('.player__play').forEach(b => b.setAttribute('aria-pressed', String(on)));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }

  /* ---------- playback ---------- */
  function load(i, at = 0) {
    idx = (i + TRACKS.length) % TRACKS.length;
    audio.src = src(TRACKS[idx]);
    if (at) audio.addEventListener('loadedmetadata', () => { if (at < audio.duration - 5) audio.currentTime = at; }, { once: true });
    pre.removeAttribute('src');
    paint(); save();
  }
  // volume ramps; iOS ignores element volume, so there it simply starts and stops
  function ramp(to, dur, done) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume, t0 = performance.now(), ms = reduce ? 0 : dur * 1000;
    const step = now => {
      const k = ms ? Math.min(1, (now - t0) / ms) : 1;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step); else if (done) done();
    };
    fadeRaf = requestAnimationFrame(step);
  }
  function play(byUser, fade = 0.35) {
    if (byUser) { store.set('gori-music', '1'); stopWaiting(); }
    if (!audio.src) load(idx);
    audio.volume = 0;
    const p = audio.play();
    const ok = () => { ramp(level, fade); state(); };
    if (p && p.then) return p.then(() => { ok(); return true; }).catch(() => { state(); return false; });
    ok(); return Promise.resolve(true);
  }
  function pause(byUser, fade = 0.3) {
    if (byUser) store.set('gori-music', '0');
    stopWaiting();
    if (audio.paused) { state(); return; }
    ramp(0, fade, () => { audio.pause(); state(); });
  }
  function save() { store.set('gori-music-at', JSON.stringify({ i: idx, t: Math.floor(audio.currentTime || 0) })); }

  audio.addEventListener('ended', () => { load(idx + 1); play(false, 0.01); });
  audio.addEventListener('play', state);
  audio.addEventListener('pause', () => { state(); save(); });
  let lastSave = 0;
  const seek = $('.player__seek'), t0 = $('.player__t0'), t1 = $('.player__t1');
  let scrubbing = false;
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration, c = audio.currentTime;
    const p = d ? c / d : 0;
    root.style.setProperty('--p', p.toFixed(4));
    if (!scrubbing) seek.value = Math.round(p * 1000);
    t0.textContent = fmt(c); t1.textContent = fmt(d);
    if (c - lastSave > 5 || c < lastSave) { lastSave = c; save(); }
    // warm up the next track near the end so the change is instant
    if (d && d - c < 25 && !pre.getAttribute('src')) { pre.src = src(TRACKS[(idx + 1) % TRACKS.length]); pre.preload = 'auto'; pre.load(); }
  });
  audio.addEventListener('loadedmetadata', () => { t1.textContent = fmt(audio.duration); });
  window.addEventListener('pagehide', save);

  seek.addEventListener('input', () => { scrubbing = true; if (audio.duration) t0.textContent = fmt(seek.value / 1000 * audio.duration); });
  seek.addEventListener('change', () => { scrubbing = false; if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration; });

  // iOS keeps element volume at 1: there the hardware buttons are the only volume
  const settable = (() => { const t = new Audio(); t.volume = 0.5; return t.volume === 0.5; })();
  const vols = $$('.player__vol input');
  if (!settable) $$('.player__vol').forEach(l => { l.hidden = true; });
  vols.forEach(v => {
    v.value = Math.round(level * 100);
    v.addEventListener('input', () => {
      level = v.value / 100; cancelAnimationFrame(fadeRaf); audio.volume = level; store.set('gori-music-vol', String(level));
      vols.forEach(o => { if (o !== v) o.value = v.value; });
      root.style.setProperty('--v', level.toFixed(2));
    });
  });
  root.style.setProperty('--v', level.toFixed(2));

  $$('.player__play').forEach(b => b.addEventListener('click', () => { if (audio.paused) play(true); else pause(true); }));
  $$('.player__next').forEach(b => b.addEventListener('click', () => { load(idx + 1); play(true, 0.15); }));
  $('.player__prev').addEventListener('click', () => {
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    load(idx - 1); play(true, 0.15);
  });

  /* ---------- panel ---------- */
  const panel = $('.player__panel'), opener = $('.player__open');
  function openPanel(on) {
    panel.hidden = !on;
    opener.setAttribute('aria-expanded', String(on));
    root.classList.toggle('is-open', on);
    if (on && window.gsap && !reduce) window.gsap.fromTo(panel, { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'expo.out', clearProps: 'all' });
  }
  opener.addEventListener('click', () => openPanel(panel.hidden));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { openPanel(false); opener.focus(); } });
  document.addEventListener('pointerdown', e => { if (!panel.hidden && !root.contains(e.target)) openPanel(false); });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession, set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
    set('play', () => play(true)); set('pause', () => pause(true));
    set('nexttrack', () => { load(idx + 1); play(true, 0.1); });
    set('previoustrack', () => { load(idx - 1); play(true, 0.1); });
    set('seekto', d => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  }

  /* ---------- videos with sound take the floor ---------- */
  document.addEventListener('play', e => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || v.muted || audio.paused) return;
    ducked = true; pause(false, 0.5);
    const back = () => { v.removeEventListener('pause', back); v.removeEventListener('ended', back); if (ducked) { ducked = false; play(false, 1.2); } };
    v.addEventListener('pause', back); v.addEventListener('ended', back);
  }, true);

  /* ---------- starting ---------- */
  // the visitor's last word wins; until they say anything, follow the intro's sound switch
  function wanted() {
    const m = store.get('gori-music');
    if (m) return m === '1';
    return store.get('gori-sound') !== '0';
  }
  function stopWaiting() {
    if (!waiting) return;
    ['pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, waiting, true));
    waiting = null;
  }
  // browsers allow sound only after a gesture: if the first try is refused, start on the next one
  function waitForGesture() {
    if (waiting) return;
    waiting = e => {
      if (root.contains(e.target) || document.documentElement.classList.contains('is-intro')) return;
      stopWaiting(); if (wanted()) play(false, 1.6);
    };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, waiting, true));
  }
  // called when the site proper is on screen
  function arm() {
    root.hidden = false;
    if (!arts.length) { drawArts(); paint(); }
    if (window.gsap && !reduce && !armed) window.gsap.fromTo(root, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.4, ease: 'expo.out', clearProps: 'opacity,transform' });
    armed = true;
    if (!audio.src) load(idx, saved && saved.i === idx ? saved.t : 0);
    if (!wanted() || !audio.paused) return;
    play(false, 2.4).then(ok => { if (!ok) waitForGesture(); });
  }
  // the intro has its own score: the radio waits
  function hush() { stopWaiting(); if (!audio.paused) { cancelAnimationFrame(fadeRaf); audio.pause(); state(); } }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawArts(); paint(); });
  window.GORI_MUSIC = { arm, hush, play: () => play(true), pause: () => pause(true), get playing() { return !audio.paused; } };
})();
