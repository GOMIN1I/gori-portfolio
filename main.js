(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const I = window.GORI_I18N;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /* ---------------- i18n ---------------- */
  const en = {};
  $$('[data-i18n]').forEach(el => { en[el.dataset.i18n] = el.innerHTML; });
  const enAttr = new Map();
  $$('[data-i18n-attr]').forEach(el => {
    const [attr] = el.dataset.i18nAttr.split(':');
    enAttr.set(el, el.getAttribute(attr) || '');
  });
  let lang = 'en';
  const t = (k) => (I.ui[lang] && I.ui[lang][k]) || I.ui.en[k] || k;

  function swapMedia() {
    $$('source[data-srcset-en]').forEach(el => el.setAttribute('srcset', el.dataset['srcset' + (lang === 'ru' ? 'Ru' : 'En')]));
    $$('a[data-href-en]').forEach(a => a.setAttribute('href', a.dataset['href' + (lang === 'ru' ? 'Ru' : 'En')]));
    $$('img[data-src-en]').forEach(img => {
      const next = img.dataset['src' + (lang === 'ru' ? 'Ru' : 'En')];
      if (next && img.getAttribute('src') !== next) img.setAttribute('src', next);
    });
    $$('video[data-src-en]').forEach(v => {
      const key = lang === 'ru' ? 'Ru' : 'En';
      const src = v.dataset['src' + key];
      const poster = v.dataset['poster' + key];
      if (poster) v.setAttribute('poster', poster);
      if (!v.dataset.loaded) return;
      if (v.currentSrc.endsWith(src)) return;
      const time = v.currentTime, wasPlaying = !v.paused;
      v.src = src;
      v.addEventListener('loadedmetadata', () => { v.currentTime = time; if (wasPlaying) v.play().catch(() => {}); }, { once: true });
    });
  }

  function applyLang(next, { save = true } = {}) {
    lang = next === 'ru' ? 'ru' : 'en';
    const dict = lang === 'ru' ? I.ru : en;
    $$('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      const v = dict[k] != null ? dict[k] : en[k];
      if (v != null && el.innerHTML !== v) el.innerHTML = v;
    });
    $$('[data-i18n-attr]').forEach(el => {
      const [attr, k] = el.dataset.i18nAttr.split(':');
      el.setAttribute(attr, lang === 'ru' && I.ru[k] ? I.ru[k] : enAttr.get(el));
    });
    document.documentElement.lang = lang;
    document.title = I.meta[lang].title;
    const md = $('meta[name="description"]'); if (md) md.setAttribute('content', I.meta[lang].description);
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    swapMedia();
    verbIndex = 0; setVerb(0, false);
    if (demo) demo.reset();
    document.dispatchEvent(new CustomEvent('gori:lang', { detail: lang }));
    if (save) {
      store.set('gori-lang', lang);
      const url = new URL(location.href);
      if (lang === 'ru') url.searchParams.set('lang', 'ru'); else url.searchParams.delete('lang');
      history.replaceState(null, '', url);
    }
  }
  $$('.lang button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));

  /* ---------------- toast ---------------- */
  const toastEl = $('.toast'); let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
  }

  /* ---------------- nav ---------------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('.nav__burger'), menu = $('#menu');
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open)); menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  });
  menu.addEventListener('click', e => { if (e.target.closest('a')) { burger.setAttribute('aria-expanded', 'false'); menu.hidden = true; document.body.style.overflow = ''; } });
  const navLinks = $$('.nav__links a');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      navLinks.forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + en.target.id)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['work', 'saidright', 'gomini', 'about', 'faq'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });

  /* ---------------- reveal (one style) ---------------- */
  const rvTargets = $$('.sr-facts, .cues, .formats, .steps .h3, .step, .sr-proof, .rf-steps, .ledger__side, .marks__side, .os__notes, .give, .job, .tools, .faq__list, .foot__cols');
  if (!reduce && 'IntersectionObserver' in window) {
    rvTargets.forEach(el => el.classList.add('rv'));
    const rio = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rvTargets.forEach(el => rio.observe(el));
  }

  /* ---------------- hero verbs ---------------- */
  const verbEl = $('.hero__verb');
  let verbIndex = 0, verbTimer = null, heroVisible = true;
  function setVerb(i, animate = true) {
    const list = I.verbs[lang];
    const text = list[i % list.length];
    if (!animate || reduce || !window.gsap) { verbEl.textContent = text; return; }
    gsap.to(verbEl, { yPercent: -110, opacity: 0, duration: 0.42, ease: 'power3.in', onComplete: () => {
      verbEl.textContent = text;
      gsap.fromTo(verbEl, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'expo.out' });
    } });
  }
  function startVerbs() {
    if (reduce || verbTimer) return;
    verbTimer = setInterval(() => { if (heroVisible && !document.hidden) { verbIndex++; setVerb(verbIndex); } }, 2600);
  }

  /* ---------------- index peek ---------------- */
  (() => {
    const peek = $('.peek'); if (!peek || !finePointer) return;
    const img = $('img', peek);
    let px = 0, py = 0, x = 0, y = 0, raf = 0, on = false;
    const loop = () => {
      x += (px - x) * 0.18; y += (py - y) * 0.18;
      peek.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${on ? 1 : 0.85}) rotate(${on ? -3 : -6}deg)`;
      raf = on || Math.abs(px - x) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    $$('.row').forEach(row => {
      row.addEventListener('pointerenter', e => {
        img.src = row.dataset.peek; peek.classList.toggle('is-icon', row.dataset.peekKind === 'icon');
        px = x = e.clientX + 170; py = y = e.clientY; on = true; peek.classList.add('is-on'); if (!raf) raf = requestAnimationFrame(loop);
      });
      row.addEventListener('pointermove', e => { px = e.clientX + 170; py = e.clientY; });
      row.addEventListener('pointerleave', () => { on = false; peek.classList.remove('is-on'); });
    });
  })();

  /* ---------------- videos ---------------- */
  function loadVideo(v) {
    if (v.dataset.loaded) return;
    if (v.dataset.srcEn) v.src = v.dataset['src' + (lang === 'ru' ? 'Ru' : 'En')];
    v.dataset.loaded = '1';
  }
  const autoVids = $$('video[data-autoplay]');
  const vio = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && !reduce) { loadVideo(v); v.play().catch(() => {}); }
    else if (!e.isIntersecting && !v.paused) v.pause();
  }), { threshold: 0.25 });
  autoVids.forEach(v => vio.observe(v));

  const film = $('#film'), filmPlay = $('#film-play');
  const cueBtns = $$('#cues button');
  function playFilm(at) {
    if (!film.dataset.loaded) { film.src = film.dataset['src' + (lang === 'ru' ? 'Ru' : 'En')]; film.dataset.loaded = '1'; }
    filmPlay.hidden = true; film.controls = true;
    const go = () => { if (at != null) film.currentTime = at; film.play().catch(() => {}); };
    if (film.readyState >= 1) go(); else film.addEventListener('loadedmetadata', go, { once: true });
  }
  filmPlay.addEventListener('click', () => playFilm());
  film.addEventListener('play', () => { filmPlay.hidden = true; film.controls = true; });
  cueBtns.forEach(b => b.addEventListener('click', () => playFilm(parseFloat(b.dataset.t))));
  film.addEventListener('timeupdate', () => {
    const now = film.currentTime; let idx = -1;
    cueBtns.forEach((b, i) => { if (now >= parseFloat(b.dataset.t) - 0.05) idx = i; });
    cueBtns.forEach((b, i) => b.classList.toggle('is-now', i === idx));
  });

  /* ---------------- Saidright demo ---------------- */
  const demo = (() => {
    const box = $('#demo'); if (!box) return null;
    const go = $('#demo-go'), text = $('#demo-text'), card = $('#demo-card');
    const statusB = $('.demo__status b'), statusS = $('.demo__status span');
    let timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const status = (a, b) => { statusB.textContent = a; statusS.textContent = b; };
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      box.classList.remove('is-listening', 'is-done'); card.hidden = true; go.disabled = false;
      text.innerHTML = '<span class="caret"></span>';
      go.textContent = lang === 'ru' ? I.ru['sr.demo.go'] : en['sr.demo.go'];
      status(lang === 'ru' ? I.ru['sr.demo.idle'] : en['sr.demo.idle'], lang === 'ru' ? I.ru['sr.demo.idle2'] : en['sr.demo.idle2']);
    }
    function type(full, done) {
      const i0 = full.indexOf('I am agree'), i1 = i0 + 'I am agree'.length;
      let i = 0;
      const step = () => {
        i = reduce ? full.length : i + 2;
        const s = full.slice(0, i);
        const a = s.slice(0, Math.min(i, i0)), b = i > i0 ? s.slice(i0, Math.min(i, i1)) : '', c = i > i1 ? s.slice(i1) : '';
        text.innerHTML = a + (b ? '<mark>' + b + '</mark>' : '') + c + '<span class="caret"></span>';
        if (i < full.length) later(step, 28); else done();
      };
      step();
    }
    go.addEventListener('click', () => {
      reset(); go.disabled = true;
      box.classList.add('is-listening'); status(t('demoListen'), t('demoListen2'));
      later(() => { box.classList.remove('is-listening'); status(t('demoWork'), t('demoWork2')); }, reduce ? 10 : 1500);
      later(() => {
        box.classList.add('is-done'); status(t('demoDone'), t('demoDone2'));
        type(t('demoText'), () => later(() => { card.hidden = false; go.disabled = false; go.textContent = t('demoAgain'); }, 450));
      }, reduce ? 20 : 2300);
    });
    $('#demo-fix').addEventListener('click', () => {
      text.innerHTML = t('demoTextFixed').replace('I agree', '<mark class="is-fixed">I agree</mark>');
      card.hidden = true; status(t('demoFixed'), t('demoFixed2'));
    });
    $('#demo-ok').addEventListener('click', () => { card.hidden = true; });
    return { reset };
  })();

  /* ---------------- refund ledger ---------------- */
  (() => {
    const root = $('#ledger'); if (!root) return;
    const log = $('#ledger-log');
    const st = { cap: 1000, ref: 300, conf: 0, res: 0 };
    const avail = () => st.cap - st.ref - st.conf - st.res;
    const fmt = n => n.toLocaleString('ru-RU').replace(/ /g, ' ');
    function render(flash) {
      const map = { confirmed: st.conf, reserved: st.res, available: avail() };
      Object.entries(map).forEach(([k, v]) => {
        const el = $(`[data-f="${k}"]`, root); el.textContent = fmt(v);
        if (flash && flash.includes(k)) { el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 700); }
      });
    }
    function say(msg, cls) {
      const li = document.createElement('li'); li.className = cls; li.textContent = msg;
      log.prepend(li); while (log.children.length > 4) log.lastChild.remove();
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'reserve') {
        if (avail() >= 200) { st.res += 200; render(['reserved', 'available']); say(t('lgReserve').replace('{a}', fmt(avail())), 'ok'); }
        else say(t('lgReserveNo').replace('{a}', fmt(avail())), 'no');
      } else if (a === 'confirm') {
        if (st.res > 0) { st.conf += st.res; st.res = 0; render(['confirmed', 'reserved']); say(t('lgConfirm'), 'ok'); }
        else say(t('lgConfirmNo'), 'info');
      } else if (a === 'repeat') {
        say(t('lgRepeat'), 'info');
      } else if (a === 'race') {
        if (avail() < 500) { say(t('lgRaceNo'), 'info'); return; }
        st.res += 500; render(['reserved', 'available']); say(t('lgRaceA'), 'ok');
        setTimeout(() => say(t('lgRaceB'), 'no'), reduce ? 0 : 405);
      } else if (a === 'reset') {
        st.conf = 0; st.res = 0; render(['confirmed', 'reserved', 'available']); log.innerHTML = ''; say(t('lgReset'), 'info');
      }
    });
  })();

  /* ---------------- GOMINI marks ---------------- */
  (() => {
    const stage = $('#marks-stage'); if (!stage) return;
    const tabs = $$('.seg [data-show]');
    const items = $$('[data-mark]', stage);
    const notes = $$('[data-show-note]');
    function show(name) {
      tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.show === name)));
      items.forEach(i => i.classList.toggle('on', i.dataset.mark === name));
      notes.forEach(n => { n.hidden = n.dataset.showNote !== name; });
    }
    tabs.forEach(b => b.addEventListener('click', () => show(b.dataset.show)));
    $('.seg').addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const i = tabs.findIndex(b => b.getAttribute('aria-selected') === 'true');
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); show(n.dataset.show);
    });
    if (finePointer && !reduce) {
      stage.addEventListener('pointermove', e => {
        const r = stage.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -7, ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
        items.forEach(i => { if (i.classList.contains('on')) i.style.transform = `translate(-50%, -50%) rotateX(${rx}deg) rotateY(${ry}deg)`; });
      });
      stage.addEventListener('pointerleave', () => items.forEach(i => { i.style.transform = ''; }));
    }
  })();

  /* ---------------- OS board ---------------- */
  (() => {
    const tabs = $$('.os__tabs [data-os]'); if (!tabs.length) return;
    const cards = $$('[data-os-card]'), notes = $$('[data-os-note]');
    function show(name) {
      tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.os === name)));
      cards.forEach(c => c.classList.toggle('is-front', c.dataset.osCard === name));
      notes.forEach(n => n.classList.toggle('is-on', n.dataset.osNote === name));
    }
    tabs.forEach(b => b.addEventListener('click', () => show(b.dataset.os)));
    cards.forEach(c => c.addEventListener('click', () => show(c.dataset.osCard)));
    show('hubs');
  })();

  /* ---------------- SLOI giving ---------------- */
  (() => {
    const r = $('#give-sum'); if (!r) return;
    const cb = $('#give-round');
    const fmt = n => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
    const upd = () => {
      const s = +r.value, brand = Math.round(s * 0.05), you = cb.checked ? (Math.ceil(s / 1000) * 1000 - s) : 0;
      $('#give-sum-out').textContent = fmt(s); $('#give-brand').textContent = fmt(brand);
      $('#give-you').textContent = fmt(you); $('#give-total').textContent = fmt(brand + you);
    };
    r.addEventListener('input', upd); cb.addEventListener('change', upd); upd();
  })();

  /* ---------------- SLOI: the real site, loaded on demand ---------------- */
  const sloiSrc = () => lang === 'ru' ? 'sloi-site/index.html' : 'sloi-site/index.en.html';
  (() => {
    const box = $('#sloi-live'); if (!box) return;
    const run = $('#sloi-run'), close = $('#sloi-close');
    let frame = null, ro = null;
    const fit = () => box.style.setProperty('--s', (window.innerWidth <= 700 ? 1 : box.clientWidth / 1280).toFixed(4));
    run.addEventListener('click', () => {
      frame = document.createElement('iframe');
      frame.src = sloiSrc();
      frame.title = lang === 'ru' ? 'Живой сайт SLOI' : 'SLOI live site';
      box.appendChild(frame); box.classList.add('is-live'); close.hidden = false;
      fit(); ro = new ResizeObserver(fit); ro.observe(box); close.focus();
    });
    document.addEventListener('gori:lang', () => {
      if (frame) { frame.src = sloiSrc(); frame.title = lang === 'ru' ? 'Живой сайт SLOI' : 'SLOI live site'; }
    });
    close.addEventListener('click', () => {
      if (frame) frame.remove(); frame = null; if (ro) ro.disconnect();
      box.classList.remove('is-live'); close.hidden = true; run.focus();
    });
  })();

  /* ---------------- toolkit ---------------- */
  $$('.lvl').forEach(el => {
    const l = +el.dataset.l;
    el.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < l ? 'f' : ''}"></i>`).join('');
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${l}/5`);
  });
  (() => {
    const box = $('.orbit-box'); if (!box) return;
    new IntersectionObserver(([e]) => box.classList.toggle('is-paused', !e.isIntersecting)).observe(box);
  })();

  /* ---------------- footer signature ---------------- */
  (() => {
    const mark = $('.foot__mark'); if (!mark) return;
    const parts = $$('.sign', mark);
    parts.forEach((p, i) => { p.setAttribute('pathLength', '1'); p.style.transitionDelay = (i * 0.32) + 's'; });
    $('.foot__colon', mark).style.transitionDelay = (parts.length * 0.32 + 0.2) + 's';
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { mark.classList.add('is-signed'); o.disconnect(); } }, { threshold: 0.4 }).observe(mark);
  })();

  /* ---------------- FAQ: one open at a time ---------------- */
  const qas = $$('.qa');
  qas.forEach(d => d.addEventListener('toggle', () => { if (d.open) qas.forEach(o => { if (o !== d) o.open = false; }); }));

  /* ---------------- copy, lightbox ---------------- */
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast(t('copied')); }
    catch (e) { toast(t('copyFail')); }
  }));
  const lb = $('#lightbox'), lbImg = $('img', lb), lbClose = $('.lightbox__close', lb);
  let lbReturn = null;
  $$('[data-lightbox]').forEach(b => b.addEventListener('click', () => {
    lbReturn = b; lbImg.src = b.dataset.lightbox; lb.hidden = false; document.body.style.overflow = 'hidden'; lbClose.focus();
  }));
  const closeLb = () => { lb.hidden = true; document.body.style.overflow = ''; if (lbReturn) lbReturn.focus(); };
  lbClose.addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });

  /* ---------------- intro: a promo film in six scenes ---------------- */
  const intro = $('#intro');
  const html = document.documentElement;
  const stage = () => window.GORI_STAGE || { world() {}, lock() {} };
  let introTl = null, introDone = true;
  function heroIn() {
    gsap.fromTo('.hero__mark', { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity,transform' });
    gsap.fromTo('.hero__title, .hero__lede, .hero__actions, .hero__status', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, delay: 0.15, ease: 'expo.out', clearProps: 'opacity,transform' });
    gsap.fromTo('.htile', { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.9, stagger: 0.06, delay: 0.25, ease: 'back.out(1.8)', clearProps: 'opacity,scale' });
  }
  function endIntro(kind) {
    if (introDone) return;
    introDone = true;
    store.sset('gori-intro-seen', '1');
    if (asking) { asking.stop(); asking = null; }
    const finish = () => {
      if (introTl) introTl.kill();
      intro.classList.remove('is-asking');
      intro.classList.remove('is-playing'); intro.setAttribute('aria-hidden', 'true');
      html.classList.remove('is-intro'); document.body.style.overflow = '';
      stage().lock(false); stage().world('paper', true);
      if (!reduce) heroIn(); startVerbs();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      const target = $('.hero__actions a'); if (target && kind !== 'auto') target.focus({ preventScroll: true });
    };
    if (kind === 'no') {
      gsap.timeline().to('.iask__btns', { opacity: 0, duration: 0.25 }).to('.iask__notyet', { opacity: 1, duration: 0.3 }).to(intro, { opacity: 0, duration: 0.6, delay: 1.2, onComplete: finish });
    } else {
      gsap.to(intro, { opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: finish });
    }
  }
  /* scene 0 · "what's your love language?" asked in both languages; the film waits for the answer */
  let asking = null;
  function splitWords(line) {
    const walk = node => Array.from(node.childNodes).forEach(n => {
      if (n.nodeType === 1) { walk(n); return; }
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(' '); return; }
        const w = document.createElement('span'); w.className = 'ilang__w';
        Array.from(part).forEach(ch => { const c = document.createElement('span'); c.className = 'ilang__c'; c.textContent = ch; w.append(c); });
        frag.append(w);
      });
      n.replaceWith(frag);
    });
    if (!line.dataset.split) { walk(line); line.dataset.split = '1'; }
    return $$('.ilang__c', line);
  }
  function askLanguage(onPick) {
    const scene = $('.iscene--lang', intro);
    const lines = $$('.ilang__line', scene);
    const opts = $$('[data-pick-lang]', scene);
    const guess = lang === 'ru' || /^(ru|be|uk|kk)\b/i.test(navigator.language || '') ? 'ru' : 'en';
    opts.forEach(b => { b.classList.toggle('is-guess', b.dataset.pickLang === guess); b.classList.remove('is-picked'); });
    intro.classList.add('is-asking');
    $$('.ichrome__scene', intro).forEach(s => { s.style.opacity = s.dataset.scene === '0' ? 1 : 0; });
    gsap.set(scene, { autoAlpha: 1, y: 0, filter: 'none' });
    scene.classList.add('is-live');
    const chars = lines.map(splitWords);
    const tls = [];
    if (reduce) {
      gsap.set(lines, { opacity: 0 }); gsap.set(lines[guess === 'ru' ? 1 : 0], { opacity: 1 });
      gsap.set('.ilang__beat, .ilang__hint, .ilang__opt', { opacity: 1, y: 0 });
    } else {
      gsap.set(lines, { opacity: 1 });
      gsap.set(chars.flat(), { yPercent: 110, opacity: 0, rotationX: -70 });
      // the colon beats like a heart: lub-dub, rest
      tls.push(gsap.timeline({ repeat: -1, repeatDelay: 0.55 })
        .to('.ilang__beat i', { scale: 1.3, duration: 0.14, ease: 'power2.out', stagger: 0.06 })
        .to('.ilang__beat i', { scale: 1, duration: 0.22, ease: 'power2.in', stagger: 0.06 })
        .to('.ilang__beat i', { scale: 1.18, duration: 0.12, ease: 'power2.out', stagger: 0.06 })
        .to('.ilang__beat i', { scale: 1, duration: 0.3, ease: 'power2.inOut', stagger: 0.06 }));
      // the question rolls between the two languages, letter by letter
      const order = guess === 'ru' ? [1, 0] : [0, 1];
      const roll = gsap.timeline({ repeat: -1 });
      order.forEach(i => {
        roll.to(chars[i], { yPercent: 0, opacity: 1, rotationX: 0, duration: 0.7, stagger: 0.022, ease: 'expo.out' })
          .to(chars[i], { yPercent: -110, opacity: 0, rotationX: 70, duration: 0.45, stagger: 0.012, ease: 'power2.in' }, '+=2.1')
          .set(chars[i], { yPercent: 110, rotationX: -70 });
      });
      tls.push(roll);
      tls.push(gsap.timeline()
        .fromTo('.ilang__beat', { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(2.4)' }, 0)
        .fromTo('.ilang__hint', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6)
        .fromTo('.ilang__opt', { opacity: 0, y: 70, rotationX: 40, filter: 'blur(6px)' }, { opacity: 1, y: 0, rotationX: 0, filter: 'blur(0px)', duration: 1, stagger: 0.12, ease: 'expo.out', clearProps: 'filter' }, 0.75));
    }
    // plaques lean toward the cursor
    const tilt = e => {
      const b = e.currentTarget, r = b.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(b, { rotationY: x * 14, rotationX: -y * 14, x: x * 8, y: y * 6, duration: 0.5, ease: 'power3.out' });
    };
    const untilt = e => gsap.to(e.currentTarget, { rotationY: 0, rotationX: 0, x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
    const keys = e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const i = opts.indexOf(document.activeElement);
      opts[(i + 1) % opts.length].focus();
    };
    let picked = false;
    const pick = e => {
      if (picked) return;
      picked = true;
      const btn = e.currentTarget, next = btn.dataset.pickLang;
      btn.classList.add('is-picked');
      applyLang(next);
      stop();
      if (reduce) { gsap.set(scene, { autoAlpha: 0 }); onPick(); return; }
      const other = opts.filter(o => o !== btn);
      gsap.timeline({ onComplete: () => { gsap.set(scene, { autoAlpha: 0 }); onPick(); } })
        .to(btn, { scale: 1.06, duration: 0.18, ease: 'power2.out' }, 0)
        .to(btn, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 0.18)
        .to(other, { opacity: 0, y: 30, scale: 0.94, duration: 0.4, ease: 'power2.in' }, 0)
        .to('.ilang__beat i', { scale: 1.6, duration: 0.25, ease: 'power2.out' }, 0.1)
        .to(scene.querySelectorAll('.ilang__q, .ilang__hint'), { opacity: 0, y: -40, filter: 'blur(8px)', duration: 0.5, ease: 'power2.in' }, 0.25)
        .to(btn, { opacity: 0, y: -24, scale: 0.9, filter: 'blur(6px)', duration: 0.45, ease: 'power2.in' }, 0.6)
        .to('.ilang__beat', { opacity: 0, scale: 0.2, duration: 0.4, ease: 'power2.in' }, 0.6)
        .set(scene.querySelectorAll('.ilang__q, .ilang__hint, .ilang__opt, .ilang__beat, .ilang__beat i'), { clearProps: 'all' }, 1.1);
    };
    const on = [['pointermove', tilt], ['pointerleave', untilt], ['keydown', keys], ['click', pick]];
    opts.forEach(b => on.forEach(([ev, fn]) => { if (finePointer || !ev.startsWith('pointer')) b.addEventListener(ev, fn); }));
    function stop() {
      tls.forEach(t => t.kill());
      opts.forEach(b => on.forEach(([ev, fn]) => b.removeEventListener(ev, fn)));
      intro.classList.remove('is-asking');
      scene.classList.remove('is-live');
      $$('.ichrome__scene', intro).forEach(s => { s.style.opacity = ''; });
    }
    const first = opts.find(b => b.dataset.pickLang === guess);
    setTimeout(() => { if (!picked) first.focus({ preventScroll: true }); }, reduce ? 0 : 900);
    return { stop() { stop(); gsap.set(scene, { autoAlpha: 0 }); } };
  }

  function playIntro({ askLang = true } = {}) {
    if (!window.gsap) { startVerbs(); return; }
    if (reduce && !askLang) { startVerbs(); return; }
    introDone = false;
    window.scrollTo(0, 0);
    html.classList.add('is-intro'); stage().lock(true); stage().world('paper', true);
    intro.style.opacity = 1; intro.classList.add('is-playing'); intro.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const scenes = $$('.iscene', intro);
    gsap.set(scenes, { autoAlpha: 0, y: 0 });
    gsap.set('.ichrome__scene', { opacity: 0 });
    if (!askLang) { playFilm(); return; }
    asking = askLanguage(() => {
      asking = null;
      if (introDone) return;
      if (reduce) endIntro('skip'); else playFilm();
    });
  }
  function playFilm() {
    const vw = window.innerWidth / 100, vh = window.innerHeight / 100;
    const scenes = $$('.iscene:not(.iscene--lang)', intro);
    const [sMeet, sFlip, sWork, sWorlds, sAsk] = scenes;
    const outline = $$('.imark__outline path', intro), ghost = $$('.ighost path', intro);
    [...outline, ...ghost].forEach(p => p.setAttribute('pathLength', '1'));
    gsap.set(scenes, { autoAlpha: 0, y: 0 });
    gsap.set('.iscene--meet .ihead, .iscene--meet .ikick', { scale: 1 });
    gsap.set([...outline, ...ghost], { strokeDasharray: 1, strokeDashoffset: 1, opacity: 1 });
    gsap.set('.imark', { scale: 1, y: 0, opacity: 1 });
    gsap.set('.imark__fill', { opacity: 0 });
    gsap.set('.imark__colon', { scale: 0 });
    gsap.set('.ihead__l, .ikick, .istack span, .iscene__head > *, .iscene--worlds .ihead, .iask__mark, .iask__btns', { opacity: 0 });
    gsap.set('.iscene__head, .ipanel', { opacity: 1 });
    gsap.set('.irule', { scaleX: 0 });
    gsap.set('.iwipe', { scale: 0 });
    gsap.set('.iask__cue span, .iask__notyet, .ichrome__scene', { opacity: 0 });
    gsap.set('.ipanel__rows li', { opacity: 0 });
    $$('.ipanel__rows li').forEach(li => li.classList.remove('is-hot'));
    sAsk.classList.remove('is-live');
    const tiles = $$('.itile', intro).map(el => {
      const cs = getComputedStyle(el);
      const x = parseFloat(cs.getPropertyValue('--tx')) * vw, y = parseFloat(cs.getPropertyValue('--ty')) * vh, r = parseFloat(cs.getPropertyValue('--r'));
      gsap.set(el, { x: 0, y: 0, rotation: 0, scale: 0, opacity: 1, transform: 'none' });
      return { el, x, y, r };
    });
    const label = n => () => $$('.ichrome__scene', intro).forEach(s => gsap.to(s, { opacity: +s.dataset.scene === n ? 1 : 0, duration: 0.3 }));
    const world = (w, instant) => () => stage().world(w, instant);
    const rise = { opacity: 0, y: 46, filter: 'blur(6px)' }, risen = { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'expo.out' };

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    introTl = tl; if (window.GORI_DEBUG) window.__introTl = tl;
    // 1 · the mark draws as an outline, fills, the colon lands, the headline rises with the tiles
    tl.set(sMeet, { autoAlpha: 1 }, 0).call(label(1), null, 0)
      .to(outline, { strokeDashoffset: 0, duration: 1.3, stagger: 0.12, ease: 'power2.inOut' }, 0.1)
      .to('.imark__fill', { opacity: 1, duration: 0.45 }, 1.35)
      .to(outline, { opacity: 0, duration: 0.4 }, 1.6)
      .to('.imark__colon', { scale: 1, duration: 0.5, ease: 'back.out(3)' }, 1.55)
      .to('.imark', { scale: 0.3, y: -26 * vh, duration: 0.8, ease: 'expo.inOut' }, 2.05)
      .fromTo('.iscene--meet .ihead__l', rise, { ...risen, stagger: 0.12 }, 2.4)
      .fromTo('.iscene--meet .ikick', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 2.9);
    tiles.forEach((tt, i) => {
      tl.to(tt.el, { x: tt.x, y: tt.y, rotation: tt.r, scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, 2.5 + i * 0.07)
        .to(tt.el, { y: tt.y - 14, duration: 1.2, ease: 'sine.inOut' }, 3.4 + i * 0.07);
    });
    // 2 · red flip: the colon takes the screen, three verbs stack up
    tl.call(world('red'), null, 4.3)
      .to('.iscene--meet .ihead, .iscene--meet .ikick, .imark', { opacity: 0, scale: 1.06, duration: 0.35, ease: 'power2.in' }, 4.2);
    tiles.forEach(tt => tl.to(tt.el, { x: tt.x * 1.7, y: tt.y * 1.7, opacity: 0, duration: 0.45, ease: 'power2.in' }, 4.2));
    tl.set(sFlip, { autoAlpha: 1 }, 4.45).call(label(2), null, 4.45)
      .fromTo('.ikick--flip', { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.4 }, 4.5)
      .fromTo('.istack span', { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.65, stagger: 0.32, ease: 'expo.out' }, 4.6)
      .to('.irule', { scaleX: 1, duration: 1, ease: 'power2.inOut' }, 4.8)
      .to(ghost, { strokeDashoffset: 0, duration: 1.8, stagger: 0.1, ease: 'power1.inOut' }, 4.5);
    // 3 · the work: a tilted panel lands flat, a highlight walks the rows
    tl.call(world('paper'), null, 6.75)
      .to(sFlip, { autoAlpha: 0, y: -30, duration: 0.35, ease: 'power2.in' }, 6.6)
      .set(sWork, { autoAlpha: 1 }, 6.8).call(label(3), null, 6.8)
      .fromTo('.iscene__head > *', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out' }, 6.85)
      .fromTo('.ipanel', { opacity: 0, rotationX: 42, y: 160, scale: 0.9 }, { opacity: 1, rotationX: 0, y: 0, scale: 1, duration: 1.15, ease: 'expo.out' }, 7.0)
      .fromTo('.ipanel__rows li', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'expo.out' }, 7.35);
    const rows = $$('.ipanel__rows li');
    [0, 1, 2, 3].forEach((n, i) => tl.call(() => rows.forEach((r, k) => r.classList.toggle('is-hot', k === n)), null, 8.0 + i * 0.4));
    // 4 · four worlds deal in over rings, then a paper circle wipes them away
    tl.call(world('ink'), null, 9.75)
      .to('.ipanel', { opacity: 0, y: -40, rotationX: -12, duration: 0.4, ease: 'power2.in' }, 9.6)
      .to('.iscene__head', { opacity: 0, duration: 0.3 }, 9.6)
      .set(sWork, { autoAlpha: 0 }, 10.0)
      .set(sWorlds, { autoAlpha: 1 }, 9.8).call(label(4), null, 9.8)
      .fromTo('.iscene--worlds .ikick, .iscene--worlds .ihead', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out' }, 9.85)
      .fromTo('.irings', { opacity: 0, scale: 0.8 }, { opacity: 0.7, scale: 1, duration: 1.6, ease: 'expo.out' }, 9.8)
      .fromTo('.icard', { opacity: 0, rotationY: -70, z: -400, y: 80, scale: 1 }, { opacity: 1, rotationY: 0, z: 0, y: 0, scale: 1, duration: 0.9, stagger: 0.12, ease: 'expo.out' }, 10.0)
      .to('.icard', { y: -10, duration: 0.6, stagger: 0.08, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 10.9)
      .to('.icard', { scale: 0.6, opacity: 0, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, 11.6)
      .to('.iwipe', { scale: 1, duration: 0.85, ease: 'expo.inOut' }, 11.75)
      .call(world('paper', true), null, 12.55)
      .set(sWorlds, { autoAlpha: 0 }, 12.6);
    // 5 · the question, set like an end card
    tl.set(sAsk, { autoAlpha: 1 }, 12.6).call(label(5), null, 12.6)
      .fromTo('.iask__mark', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' }, 12.65)
      .to('.iask__c1', { opacity: 1, duration: 0.2 }, 12.8).to('.iask__c1', { opacity: 0, duration: 0.2 }, 13.45)
      .to('.iask__c2', { opacity: 1, duration: 0.2 }, 13.55).to('.iask__c2', { opacity: 0, duration: 0.2 }, 14.25)
      .fromTo('.iscene--ask .ihead__l', rise, { ...risen, stagger: 0.18 }, 14.3)
      .fromTo('.iask__btns', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', onStart: () => sAsk.classList.add('is-live') }, 14.9)
      .add(() => endIntro('auto'), 21);
  }
  $$('[data-intro-end]').forEach(b => b.addEventListener('click', () => endIntro(b.dataset.introEnd)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!introDone) endIntro('skip'); else if (!lb.hidden) closeLb(); }
  });
  $('#replay').addEventListener('click', () => { window.scrollTo(0, 0); playIntro({ askLang: false }); });

  /* ---------------- boot ---------------- */
  const params = new URLSearchParams(location.search);
  if (params.has('debug')) window.GORI_DEBUG = 1;
  const initial = params.get('lang') || store.get('gori-lang') || 'en';
  applyLang(initial, { save: initial !== 'en' || params.has('lang') });
  const forceIntro = params.has('intro');
  // a link with ?lang= already answers the language question
  if (!store.sget('gori-intro-seen') || forceIntro) playIntro({ askLang: !params.has('lang') }); else startVerbs();
})();
