/* The exhibit layer: one living halftone stage that changes colour per world,
   smooth scroll, a fly-through the colon, chapters, and scroll-driven motion. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  const G = window.gsap, ST = window.ScrollTrigger;
  const hasG = !!(G && ST);
  if (hasG) G.registerPlugin(ST);

  /* ---------------- colour tokens → rgb (tokens stay the source of truth) ---------------- */
  const probe = document.createElement('canvas'); probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const rootStyle = getComputedStyle(html);
  function rgb(name) {
    pctx.clearRect(0, 0, 1, 1); pctx.fillStyle = '#000';
    pctx.fillStyle = rootStyle.getPropertyValue(name).trim(); pctx.fillRect(0, 0, 1, 1);
    const d = pctx.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255];
  }
  const WORLDS = ['paper', 'red', 'ink', 'sr', 'lg', 'sl'];
  const pal = {};
  WORLDS.forEach(w => { pal[w] = { bg: rgb(`--w-${w}-bg`), dot: rgb(`--w-${w}-dot`), tint: rgb(`--w-${w}-tint`) }; });

  /* ---------------- the stage ---------------- */
  const STAGE = (() => {
    const canvas = $('#stage');
    const col = { bg: pal.paper.bg.slice(), dot: pal.paper.dot.slice(), tint: pal.paper.tint.slice() };
    let current = 'paper', lenis = null, kick = () => {};
    html.dataset.world = 'paper';
    function world(name, instant) {
      if (!pal[name]) return;
      if (name === current && !instant) return;
      current = name; html.dataset.world = name;
      ['bg', 'dot', 'tint'].forEach(k => {
        const to = pal[name][k];
        if (instant || !hasG || reduce) { col[k][0] = to[0]; col[k][1] = to[1]; col[k][2] = to[2]; }
        else G.to(col[k], { 0: to[0], 1: to[1], 2: to[2], duration: 0.9, ease: 'power2.inOut', overwrite: true });
      });
      kick();
    }
    function lock(on) { if (lenis) { if (on) lenis.stop(); else lenis.start(); } }
    const api = { world, lock, get current() { return current; }, set lenis(l) { lenis = l; } };

    const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) { if (canvas) canvas.remove(); return api; }
    html.classList.add('has-stage');
    const mobile = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    // pass 1 works per halftone cell (a tiny texture), pass 2 only draws dots from it
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fsField = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec2 m;uniform float sc;uniform float cell;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.07+vec2(3.1,1.7);a*=.5;}return v;}
void main(){
  vec2 c=gl_FragCoord.xy*cell;vec2 uv=c/r;vec2 p=c/r.y;
  vec2 dir=vec2(.8,.6);
  float f=fbm(vec2(dot(p,dir)*1.1,dot(p,vec2(-dir.y,dir.x))*2.4)+vec2(t*.03,-t*.012)+vec2(0.,sc*.45));
  float band=smoothstep(.40,.80,f);
  vec2 q=(uv-.5)*vec2(r.x/r.y,1.);
  float edge=smoothstep(.22,.95,length(q*vec2(.8,1.2)));
  vec2 mm=(m-.5*r)/r.y;float near=exp(-pow(length((c-.5*r)/r.y-mm),2.)*14.);
  float amt=clamp(band*(.3+edge*.95)+near*.4,0.,1.);
  gl_FragColor=vec4(amt,clamp(band*edge*.5+near*.08,0.,1.),0.,1.);
}`;
    const fsDots = `precision mediump float;
uniform vec2 r;uniform vec2 g;uniform float cell;uniform sampler2D f;
uniform vec3 bg;uniform vec3 dt;uniform vec3 tn;
void main(){
  vec2 fc=gl_FragCoord.xy;vec2 id=floor(fc/cell);
  vec4 s=texture2D(f,(id+.5)/g);
  float rad=cell*.48*s.r;
  float d=length(fc-(id+.5)*cell);
  float a=1.-smoothstep(rad-1.,rad+.35,d);
  gl_FragColor=vec4(mix(mix(bg,tn,s.g),dt,a*.9),1.);
}`;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const link = fs => { const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null; };
    const pField = link(fsField), pDots = link(fsDots);
    if (!pField || !pDots) { canvas.remove(); html.classList.remove('has-stage'); return api; }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uf = {}, ud = {};
    ['r', 't', 'm', 'sc', 'cell'].forEach(k => { uf[k] = gl.getUniformLocation(pField, k); });
    ['r', 'g', 'cell', 'f', 'bg', 'dt', 'tn'].forEach(k => { ud[k] = gl.getUniformLocation(pDots, k); });
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    const fbo = gl.createFramebuffer();
    let w = 0, hgt = 0, k = 1, cell = 9, gw = 1, gh = 1, mx = -9999, my = -9999, tx = -9999, ty = -9999, raf = 0, last = 0;
    const start = performance.now(), step = mobile ? 42 : 33;
    function size() {
      k = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);
      w = Math.max(2, Math.round(window.innerWidth * k)); hgt = Math.max(2, Math.round(window.innerHeight * k));
      canvas.width = w; canvas.height = hgt;
      cell = (mobile ? 7 : 9) * k;
      gw = Math.ceil(w / cell); gh = Math.ceil(hgt / cell);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function draw(now) {
      mx += (tx - mx) * 0.1; my += (ty - my) * 0.1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, gw, gh); gl.useProgram(pField);
      gl.uniform2f(uf.r, w, hgt); gl.uniform1f(uf.t, reduce ? 12 : (now - start) / 1000);
      gl.uniform2f(uf.m, mx, my); gl.uniform1f(uf.sc, window.scrollY / Math.max(1, window.innerHeight)); gl.uniform1f(uf.cell, cell);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, hgt); gl.useProgram(pDots);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(ud.r, w, hgt); gl.uniform2f(ud.g, gw, gh); gl.uniform1f(ud.cell, cell); gl.uniform1i(ud.f, 0);
      gl.uniform3fv(ud.bg, col.bg); gl.uniform3fv(ud.dt, col.dot); gl.uniform3fv(ud.tn, col.tint);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      raf = 0;
      if (document.hidden) return;
      if (now - last >= step) { draw(now); last = now; }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    kick = () => { if (reduce) { requestAnimationFrame(draw); return; } if (!raf) raf = requestAnimationFrame(frame); };
    size(); kick();
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { size(); kick(); }, 120); });
    if (!mobile) window.addEventListener('pointermove', e => { tx = e.clientX * k; ty = (window.innerHeight - e.clientY) * k; }, { passive: true });
    document.addEventListener('visibilitychange', kick);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; canvas.remove(); html.classList.remove('has-stage'); });
    if (reduce) window.addEventListener('scroll', kick, { passive: true });
    return api;
  })();
  window.GORI_STAGE = STAGE;

  /* ---------------- word splitting ---------------- */
  function split(el) {
    if (el.querySelector('.w')) return;
    const walk = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const wv = document.createElement('span'); wv.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
            wv.appendChild(wi); frag.appendChild(wv);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.classList.contains('w') && !n.classList.contains('sr-only')) walk(n);
      });
    };
    walk(el);
  }

  /* ---------------- set-up once the page scripts have run ---------------- */
  let ready = false;
  const scrubs = [];
  function makeScrubs() {
    scrubs.splice(0).forEach(tw => { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); });
    $$('.scrub').forEach(p => {
      split(p);
      const ws = $$('.w', p);
      ws.forEach((wv, i) => wv.style.setProperty('--i', i));
      p.style.setProperty('--n', ws.length);
      scrubs.push(G.fromTo(p, { '--fill': 0 }, { '--fill': 1, ease: 'none', scrollTrigger: { trigger: p, start: 'top 86%', end: 'bottom 55%', scrub: true } }));
    });
  }

  function setup() {
    ready = true;
    if (!hasG || reduce) {
      // still switch worlds and labels, without motion
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { STAGE.world(e.target.dataset.world); } }), { rootMargin: '-50% 0px -49% 0px' });
      $$('[data-world]').forEach(s => io.observe(s));
      return;
    }

    ST.config({ ignoreMobileResize: true, limitCallbacks: true });
    /* pause looping CSS motion that is off screen */
    const offIo = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '120px 0px' });
    $$('.hero, main > section, .foot').forEach(s => offIo.observe(s));
    /* smooth scroll */
    if (window.Lenis) {
      const lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
      STAGE.lenis = lenis; window.GORI_LENIS = lenis;
      lenis.on('scroll', ST.update);
      G.ticker.add(time => lenis.raf(time * 1000)); G.ticker.lagSmoothing(0);
      if (html.classList.contains('is-intro')) lenis.stop();
      document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]'); if (!a) return;
        const id = a.getAttribute('href'); if (id.length < 2) return;
        const el = document.querySelector(id); if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: id === '#top' ? 0 : -8, duration: 1.4 });
      });
    }

    /* hero: fly through the colon */
    const tiles = $$('.htile');
    const heroTl = G.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=95%', scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true } });
    const toRgb = name => 'rgb(' + rgb(name).map(v => Math.round(v * 255)).join(',') + ')';
    const hero = $('.hero'), inner = $('.hero__inner'), wrap = $('.hero__markwrap');
    const dive = document.createElement('div'); dive.className = 'hero__dive'; dive.setAttribute('aria-hidden', 'true'); hero.appendChild(dive);
    const geo = { cx: 0, cy: 0, d: 20 }, proxy = { r: 0 };
    const measure = () => {
      const hr = hero.getBoundingClientRect(), ir = inner.getBoundingClientRect();
      geo.cx = ir.left - hr.left + wrap.offsetLeft + wrap.offsetWidth * 0.91585;
      geo.cy = ir.top - hr.top + wrap.offsetTop + wrap.offsetHeight * 0.3951;
      geo.d = wrap.offsetWidth * 64.9 / 1760;
    };
    const paintDive = () => { dive.style.clipPath = `circle(${proxy.r.toFixed(1)}px at ${geo.cx.toFixed(1)}px ${geo.cy.toFixed(1)}px)`; };
    measure(); paintDive();
    ST.addEventListener('refreshInit', () => { G.set(wrap, { scale: 1 }); });
    ST.addEventListener('refresh', () => { measure(); paintDive(); });
    heroTl.to('.hero__inner > :not(.hero__markwrap)', { opacity: 0, y: -70, stagger: 0.03, duration: 0.3, ease: 'power1.in' }, 0)
      .to('.hero__scroll', { opacity: 0, duration: 0.12 }, 0)
      .to(tiles, { x: (i, el) => (parseFloat(el.style.getPropertyValue('--x')) - 50) * 14, y: (i, el) => (parseFloat(el.style.getPropertyValue('--y')) - 50) * 10, scale: 1.8, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0)
      .to(wrap, { scale: 10, transformOrigin: '91.585% 39.51%', duration: 0.5, ease: 'power3.in' }, 0.06)
      .fromTo(proxy, { r: 0 }, { r: () => Math.hypot(window.innerWidth, window.innerHeight) * 1.05, duration: 0.34, ease: "power3.in", onUpdate: paintDive, immediateRender: false }, 0.5)
      .fromTo(dive, { backgroundColor: toRgb('--color-red') }, { backgroundColor: toRgb('--w-paper-bg'), duration: 0.14, ease: 'none' }, 0.86);
    // the tile layer leans away from the pointer
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const qx = G.quickTo('.hero__tiles', 'x', { duration: 0.9, ease: 'power3' }), qy = G.quickTo('.hero__tiles', 'y', { duration: 0.9, ease: 'power3' });
      window.addEventListener('pointermove', e => { qx((e.clientX / window.innerWidth - 0.5) * -28); qy((e.clientY / window.innerHeight - 0.5) * -20); }, { passive: true });
    }

    /* chapters: words stack up, then the next world wipes in from the colon */
    $$('.chapter').forEach(ch => {
      const pin = $('.chapter__pin', ch), wipe = $('.chapter__wipe', ch), kick = $('.chapter__kick', ch);
      const next = ch.nextElementSibling && ch.nextElementSibling.dataset.world;
      const placeWipe = () => {
        const pr = pin.getBoundingClientRect(), kr = kick.getBoundingClientRect();
        wipe.style.left = (kr.left - pr.left + 2) + 'px'; wipe.style.top = (kr.top - pr.top + kr.height / 2) + 'px';
      };
      const tl = G.timeline({ scrollTrigger: {
        trigger: ch, start: 'top top', end: '+=150%', scrub: 0.5, pin: pin, anticipatePin: 1, onRefresh: placeWipe,
        onUpdate: s => { if (!s.isActive || html.classList.contains('is-intro')) return; STAGE.world(s.progress > 0.9 && next ? next : 'red'); }
      } });
      tl.fromTo(kick, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.08 }, 0)
        .fromTo($$('.chapter__w > span', ch), { yPercent: 108 }, { yPercent: 0, duration: 0.16, stagger: 0.1, ease: 'power3.out' }, 0.04)
        .fromTo($('.chapter__rule', ch), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power2.inOut' }, 0.1)
        .fromTo($('.chapter__ghost', ch), { opacity: 0, x: 80 }, { opacity: 0.55, x: 0, duration: 0.5 }, 0.05)
        .to($$('.chapter__w > span', ch), { yPercent: -108, duration: 0.12, stagger: 0.05, ease: 'power2.in' }, 0.7)
        .to([kick, $('.chapter__rule', ch)], { opacity: 0, duration: 0.08 }, 0.72)
        .fromTo(wipe, { scale: 0 }, { scale: 1, duration: 0.24, ease: 'power2.in' }, 0.76);
    });

    /* worlds and labels */
    $$('[data-world]').forEach(sec => ST.create({
      trigger: sec, start: sec.classList.contains('chapter') ? 'top 18%' : 'top 55%', end: 'bottom 55%',
      onToggle: s => { if (s.isActive && !html.classList.contains('is-intro')) { STAGE.world(sec.dataset.world); } }
    }));

    /* headings rise word by word */
    $$('main .h2, .foot .h2').forEach(h => {
      split(h);
      const inner = $$('.wi', h);
      G.set(inner, { yPercent: 110 });
      ST.create({ trigger: h, start: 'top 88%', once: true, onEnter: () => G.to(inner, { yPercent: 0, duration: 1.05, stagger: 0.035, ease: 'expo.out' }) });
    });
    $$('.h3').forEach(h => G.from(h, { opacity: 0, y: 30, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 88%', once: true } }));

    /* ledes fill in as you read */
    makeScrubs();

    /* panels arrive tilted and land flat */
    $$('[data-tilt]').forEach(el => G.fromTo(el, { rotationX: 22, y: 90, scale: 0.94, transformPerspective: 1400 }, {
      rotationX: 0, y: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 100%', end: 'top 42%', scrub: 0.6 }
    }));

    /* index rows slide in from alternating sides */
    $$('.row').forEach((row, i) => G.fromTo(row, { xPercent: i % 2 ? 7 : -7, opacity: 0.15 }, {
      xPercent: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: row, start: 'top 98%', end: 'top 62%', scrub: 0.5 }
    }));

    /* film stills and screens drift at their own depth */
    $$('.screen--tip, .sloi__diploma, .formats__item--v').forEach(el => G.fromTo(el, { y: 60 }, {
      y: -40, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
    }));

    /* numbers count up */
    $$('.proof__v, .formats__num').forEach(box => {
      const nums = [];
      const walk = node => Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3 && /\d/.test(n.textContent)) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\d+(?:[.,]\d+)?)/).forEach(part => {
            if (/^\d+(?:[.,]\d+)?$/.test(part)) {
              const s = document.createElement('span'); s.textContent = part; s.dataset.v = part; nums.push(s); frag.appendChild(s);
            } else if (part) frag.appendChild(document.createTextNode(part));
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'SMALL') walk(n);
      });
      walk(box);
      ST.create({ trigger: box, start: 'top 88%', once: true, onEnter: () => nums.forEach(s => {
        const raw = s.dataset.v, dec = (raw.split(/[.,]/)[1] || '').length, sep = raw.includes(',') ? ',' : '.';
        const o = { v: 0 };
        G.to(o, { v: parseFloat(raw.replace(',', '.')), duration: 1.4, ease: 'power3.out', onUpdate: () => { s.textContent = o.v.toFixed(dec).replace('.', sep); } });
      }) });
    });

    /* OS wires draw from the hub to what it holds */
    const wires = $$('.os__wires path');
    wires.forEach(p => p.setAttribute('pathLength', '1'));
    if (wires.length) G.fromTo(wires, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, stagger: 0.25, ease: 'power2.inOut', scrollTrigger: { trigger: '.os__board', start: 'top 62%', once: true } });

    /* experience: a red line follows you down the jobs */
    const jobs = $('.jobs');
    if (jobs) G.fromTo(jobs, { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { trigger: jobs, start: 'top 72%', end: 'bottom 72%', scrub: true } });

    /* tool levels fill dot by dot */
    const dots = $$('.lvl i.f');
    if (dots.length) {
      G.set(dots, { scale: 0 });
      ST.create({ trigger: '.tools', start: 'top 80%', once: true, onEnter: () => G.to(dots, { scale: 1, duration: 0.5, stagger: 0.025, ease: 'back.out(3)' }) });
    }

    /* footer mark: a slow push in */
    G.fromTo('.foot__mark', { scale: 0.9, y: 40 }, { scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: '.foot__mark', start: 'top bottom', end: 'top 55%', scrub: true } });

    ST.refresh();
  }

  document.addEventListener('gori:lang', () => {
    if (!ready || !hasG || reduce) return;
    // new copy arrived: keep heads visible, rebuild the reading scrub
    $$('main .h2, .foot .h2').forEach(h => split(h));
    makeScrubs();
    ST.refresh();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setTimeout(setup, 0);
})();
