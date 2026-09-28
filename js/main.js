/* DigiGlass | interactions (no build step, works from file://) */
(() => {
  const d = document;
  const root = d.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const hasGSAP = !!(gsap && ST);
  if (hasGSAP) gsap.registerPlugin(ST);

  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => [...c.querySelectorAll(s)];
  const onView = (el, cb, opts = {}) => {
    const io = new IntersectionObserver(([e]) => cb(e.isIntersecting, e), opts);
    io.observe(el);
    return io;
  };

  /* ---------------- loader ---------------- */
  const ready = () => {
    if (root.classList.contains('is-loaded')) return;
    root.classList.add('is-loaded');
    window.__dgReady = true;
    d.dispatchEvent(new Event('dg:ready'));
    setTimeout(() => $('#loader')?.remove(), 1500);
  };
  (() => {
    const num = $('#loadNum');
    if (reduce || !num) return ready();
    const t0 = performance.now();
    const MIN = 1700;
    let loaded = d.readyState === 'complete';
    addEventListener('load', () => (loaded = true));
    const tick = (t) => {
      const lin = Math.min(1, (t - t0) / MIN);
      const eased = 1 - Math.pow(1 - lin, 3);
      const cap = loaded || t - t0 > 4000 ? 100 : 90;
      const v = Math.min(cap, Math.round(eased * 100));
      num.textContent = v;
      if (v >= 100) return setTimeout(ready, 180);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  /* ---------------- smooth scroll ---------------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    if (hasGSAP) {
      lenis.on('scroll', ST.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  const scrollToEl = (el) => {
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };

  /* ---------------- nav + menu ---------------- */
  const nav = $('#nav');
  const menu = $('#menu');
  const menuBtn = $('#menuBtn');
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });

  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id.length < 2) return;
    const el = $(id);
    if (!el) return;
    setMenu(false);
    scrollToEl(el);
  }));

  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('is-hidden', y > lastY && y > 240 && !menu.classList.contains('is-open'));
    lastY = y;
  }, { passive: true });

  /* ---------------- word-split reveals ---------------- */
  const splitWords = (el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(d.createTextNode(' ')); return; }
            const w = d.createElement('span');
            const s = d.createElement('span');
            w.className = 'w';
            s.textContent = p;
            s.style.setProperty('--i', i++);
            w.appendChild(s);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.hasAttribute('aria-hidden')) {
          walk(n);
        }
      });
    };
    walk(el);
  };
  if (!reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }), { threshold: 0.25, rootMargin: '0px 0px -6% 0px' });
    $$('[data-split]').forEach((el) => { splitWords(el); io.observe(el); });
  }

  /* ---------------- hero HUD ticker ---------------- */
  const eps = $('#eps');
  if (eps && !reduce) {
    setInterval(() => {
      eps.textContent = (18000 + Math.round((Math.random() - 0.5) * 760)).toLocaleString('en-US');
    }, 1100);
  }

  /* ---------------- pixel mosaic canvases ---------------- */
  const mosaic = (cv) => {
    const ctx = cv.getContext('2d');
    const mode = cv.dataset.mosaic;
    const dpr = Math.min(2, devicePixelRatio || 1);
    let w = 0, h = 0, size = 64, cells = [], visible = false, last = 0;
    const build = () => {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = w < 700 ? 38 : 64;
      cells = [];
      const hexR = size * 0.55;
      const dx = hexR * Math.sqrt(3);
      const dy = hexR * 1.5;
      const cols = Math.ceil(w / dx) + 1, rows = Math.ceil(h / dy) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const cx = i * dx + (j % 2 ? dx / 2 : 0);
          const cy = j * dy;
          const u = cx / w, v = cy / h;
          let base = 0, warm = true;
          if (mode === 'center') {
            const dnx = (u - 0.5) * 1.5, dny = v - 0.62;
            base = Math.max(0, 0.5 - Math.hypot(dnx, dny)) * 1.6;
          } else if (mode === 'bottom') {
            base = Math.max(0, v - 0.45) * 1.5 * (0.35 + Math.abs(u - 0.5) * 1.3);
          } else {
            const l = Math.max(0, 1 - u / 0.3), rr = Math.max(0, 1 - (1 - u) / 0.26);
            base = Math.max(l, rr) ** 1.3;
            warm = u < 0.5;
          }
          if (base > 0.02) cells.push({ x: cx, y: cy, base: base * (0.55 + Math.random() * 0.45), warm, ph: Math.random() * 6.28, sp: 0.4 + Math.random() });
        }
      }
      draw(performance.now(), true);
    };
    const drawHex = (x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
    };
    const draw = (t, force) => {
      if (!force && t - last < 60) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      const r = size * 0.5;
      for (const c of cells) {
        const a = c.base * (0.6 + 0.4 * Math.sin(t * 0.0012 * c.sp + c.ph));
        ctx.fillStyle = c.warm ? `rgba(201,160,99,${(a * 0.34).toFixed(3)})` : `rgba(64,84,128,${(a * 0.42).toFixed(3)})`;
        drawHex(c.x, c.y, r);
      }
    };
    const loop = (t) => { if (!visible) return; draw(t); requestAnimationFrame(loop); };
    new ResizeObserver(build).observe(cv);
    onView(cv, (v) => { visible = v; if (v && !reduce) requestAnimationFrame(loop); });
  };
  $$('canvas.mosaic').forEach(mosaic);

  /* ---------------- stats rows: scroll-scrubbed marquee ---------------- */
  $$('.stat-row__track').forEach((tr, i) => {
    const originals = [...tr.children];
    for (let n = 0; n < 2; n++) originals.forEach((el) => { const c = el.cloneNode(true); c.setAttribute('aria-hidden', 'true'); tr.appendChild(c); });
    if (!hasGSAP || reduce) return;
    const left = i % 2 === 0;
    gsap.fromTo(tr, { xPercent: left ? 0 : -24 }, {
      xPercent: left ? -24 : 0, ease: 'none',
      scrollTrigger: { trigger: tr.parentElement, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    });
  });

  /* ---------------- proposition: the operating gap closes ---------------- */
  const gap = $('#gap');
  const prop = $('#why');
  if (gap && hasGSAP && !reduce) {
    const title = $('#propTitle');
    const fs = () => parseFloat(getComputedStyle(title).fontSize);
    gsap.fromTo(gap, { width: () => fs() * 1.9 }, {
      width: () => fs() * 0.55, ease: 'none',
      scrollTrigger: {
        trigger: title, start: 'top 78%', end: 'top 32%', scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: (s) => prop.classList.toggle('is-closed', s.progress > 0.98),
      },
    });
  } else if (prop) {
    prop.classList.add('is-closed');
    if (gap) gap.style.width = '.55em';
  }

  /* ---------------- operating model tabs ---------------- */
  const model = $('#model');
  if (model) {
    const tabs = $$('.mtab', model);
    const panels = $$('.mpanel', model);
    const DUR = 7000;
    let step = 0, timer = null, inView = false;
    model.style.setProperty('--dur', DUR + 'ms');
    const schedule = () => {
      clearTimeout(timer);
      if (!inView || reduce || model.classList.contains('is-manual')) return;
      timer = setTimeout(() => setStep(step + 1), DUR);
    };
    const setStep = (i, user = false) => {
      step = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        const on = k === step;
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      void model.offsetWidth; // restart progress-bar animation
      tabs[step].classList.add('is-active');
      panels.forEach((p, k) => p.classList.toggle('is-active', k === step));
      model.dataset.step = step;
      d.dispatchEvent(new CustomEvent('dg:step', { detail: step }));
      if (user) model.classList.add('is-manual');
      schedule();
    };
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => setStep(k, true));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        setStep(step + (e.key === 'ArrowRight' ? 1 : -1), true);
        tabs[step].focus();
      });
    });
    onView(model, (v) => {
      inView = v;
      model.classList.toggle('in-view', v);
      if (v) setStep(step); else clearTimeout(timer);
    }, { threshold: 0.35 });
  }

  /* ---------------- impact estimator ---------------- */
  const calc = $('#calc');
  if (calc) {
    const rev = $('#rev'), revOut = $('#revOut'), ind = $('#ind');
    const out = $('#calcOut'), range = $('#calcRange'), gauge = $('#gaugeVal');
    // PLACEHOLDER benchmark model (USD millions). Replace BASE with the
    // IBM Cost of a Data Breach 2026 figures before this goes live.
    const BASE = { bfsi: 6.1, health: 7.4, auto: 4.5, digital: 4.9, realestate: 4.1, ot: 5.3 };
    const EXPO = { low: 0.8, moderate: 1, high: 1.35 };
    const PREP = { early: 1.28, developing: 1, mature: 0.74 };
    const revenue = (v) => Math.exp(Math.log(10) + (Math.log(5000) - Math.log(10)) * v / 100); // $10M to $5B
    const money = (m) => m >= 1000 ? `$${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}B` : m >= 1 ? `$${m.toFixed(m >= 100 ? 0 : 1)}M` : `$${Math.round(m * 1000)}K`;
    let shown = 0, raf = 0;
    const animateTo = (target) => {
      cancelAnimationFrame(raf);
      const from = shown, t0 = performance.now(), dur = reduce ? 1 : 900;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        shown = from + (target - from) * (1 - Math.pow(1 - p, 3));
        out.textContent = money(shown);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const compute = () => {
      const r = revenue(+rev.value);
      rev.style.setProperty('--p', rev.value + '%');
      revOut.textContent = money(r);
      const expo = calc.querySelector('input[name="expo"]:checked').value;
      const prep = calc.querySelector('input[name="prep"]:checked').value;
      const size = Math.min(2.6, Math.max(0.32, Math.pow(r / 1000, 0.3)));
      const est = BASE[ind.value] * size * EXPO[expo] * PREP[prep];
      animateTo(est);
      range.textContent = `Likely range ${money(est * 0.78)} to ${money(est * 1.24)}`;
      gauge.style.strokeDashoffset = String(100 - Math.min(100, (est / 22) * 100));
    };
    calc.addEventListener('input', compute);
    calc.addEventListener('change', compute);
    let started = false;
    onView(calc, (v) => { if (v && !started) { started = true; compute(); } }, { threshold: 0.3 });
    rev.style.setProperty('--p', rev.value + '%');
    revOut.textContent = money(revenue(+rev.value));
  }

  /* ---------------- technology lens rail ---------------- */
  // Tools drift right-to-left. The part of each logo that has crossed the lens'
  // scan line is painted gold, so every tool visibly "joins" the operation.
  const prail = $('#prail');
  if (prail) {
    const vp = $('.prail__viewport', prail);
    const track = $('.prail__track', prail);
    const readout = $('.prail__readout');
    const idxEl = $('#prIdx'), nameEl = $('#prName'), tagEl = $('#prTag');
    [...track.children].forEach((el) => track.appendChild(el.cloneNode(true)));

    const items = $$('.pr-item', track).map((el) => ({ el, x: 0, w: 0, p: -1, hot: false, past: false }));

    // Logos render at their own image size; the whole track is scaled by one factor (--k).
    // pos, x and w are in unscaled track pixels; k converts them to screen pixels.
    let k = 1, setW = 1, vpW = 1, pos = 0, speed = 0, visible = false, hover = false, current = -1;
    const BASE = reduce ? 0 : innerWidth < 700 ? 42 : 64; // px per second
    const measure = () => {
      vpW = vp.clientWidth;
      k = parseFloat(getComputedStyle(prail).getPropertyValue('--k')) || 1;
      setW = track.offsetWidth / 2;
      items.forEach((it) => { it.x = it.el.offsetLeft; it.w = it.el.offsetWidth; });
    };
    new ResizeObserver(measure).observe(vp);
    d.fonts?.ready.then(measure);
    $$('img', track).forEach((img) => img.complete || img.addEventListener('load', measure, { once: true }));

    const paint = () => {
      pos = ((pos % setW) + setW) % setW;
      track.style.transform = `translate3d(${-pos * k}px,0,0) scale(${k})`;
      const cx = vpW / 2, lens = $('.prail__lens', prail).offsetWidth;
      let best = null, bestD = Infinity;
      for (const it of items) {
        const left = (it.x - pos) * k, w = it.w * k;
        if (left > vpW + 40 || left + w < -40) continue;
        const p = Math.min(1, Math.max(0, (cx - left) / w));
        const mid = left + w / 2, dist = Math.abs(mid - cx);
        const near = Math.max(0, 1 - dist / (lens * 0.9));
        it.el.style.transform = near ? `scale(${1 + near * 0.14})` : '';
        if (Math.abs(p - it.p) > 0.001) {
          it.p = p;
          const cross = p > 0 && p < 1;
          it.el.style.setProperty('--p', (p * 100).toFixed(2) + '%');
          it.el.style.setProperty('--e', cross ? '1.6%' : '0%');
        }
        const hot = near > 0.35;
        if (hot !== it.hot) { it.hot = hot; it.el.classList.toggle('is-hot', hot); }
        const past = p >= 0.5;
        if (past !== it.past) { it.past = past; it.el.classList.toggle('is-past', past); }
        if (dist < bestD) { bestD = dist; best = it; }
      }
      const i = best ? +best.el.dataset.i : -1;
      if (i !== current && best && bestD < lens) {
        current = i;
        idxEl.textContent = String(i + 1).padStart(2, '0');
        nameEl.textContent = best.el.dataset.name;
        tagEl.innerHTML = best.el.dataset.tag;
        readout.classList.remove('is-swap'); prail.classList.remove('is-pulse');
        void readout.offsetWidth;
        readout.classList.add('is-swap'); prail.classList.add('is-pulse');
      }
    };

    // drag / swipe with inertia
    let drag = null, fling = 0;
    prail.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, pos, t: performance.now(), v: 0, locked: false };
      fling = 0;
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.locked) {
        if (Math.abs(e.clientY - drag.y) > Math.abs(dx) + 4 && e.pointerType !== 'mouse') { drag = null; return; }
        if (Math.abs(dx) < 4) return;
        drag.locked = true;
        prail.classList.add('is-drag');
      }
      const now = performance.now();
      const next = drag.pos - dx / k;
      drag.v = (next - pos) / Math.max(1, now - drag.t) * 1000;
      drag.t = now;
      pos = next;
      if (!visible) paint();
    }, { passive: true });
    const release = () => {
      if (!drag) return;
      if (drag.locked) fling = Math.max(-2600, Math.min(2600, drag.v * k));
      drag = null;
      prail.classList.remove('is-drag');
    };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    prail.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    prail.addEventListener('pointerleave', () => (hover = false));

    // page scroll speeds the rail up
    let lastY = scrollY, boost = 0;
    let raf = 0, last = 0;
    const loop = (t) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000);
      last = t;
      if (!reduce) {
        const dy = Math.abs(scrollY - lastY);
        boost = Math.max(boost * Math.pow(0.02, dt), Math.min(900, dy / Math.max(dt, 0.001) * 0.6));
      }
      lastY = scrollY;
      if (!drag) {
        const target = (hover ? BASE * 0.3 : BASE) + boost;
        speed += (target - speed) * (1 - Math.exp(-4 * dt));
        fling *= Math.pow(0.04, dt);
        pos += ((speed + fling) * dt) / k;
      }
      paint();
      raf = requestAnimationFrame(loop);
    };
    onView(prail, (v) => {
      visible = v;
      if (v && !raf) { last = 0; lastY = scrollY; raf = requestAnimationFrame(loop); }
    });
    measure();
    pos = setW * 0.35;
    paint();
  }

  /* ---------------- isometric vector illustrations ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const isoDraw = (svg, boxes, { s = 13, cx = 160, cy = 150, links = [], clouds = [] } = {}) => {
    const P = (x, y, z) => [cx + (x - y) * s * 0.866, cy + (x + y) * s * 0.5 - z * s];
    const pts = (...a) => a.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const poly = (cls, ...a) => {
      const p = d.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', 'M' + pts(...a).split(' ').join('L') + 'Z');
      return p;
    };

    boxes
      .map((b, i) => ({ z: 0, ...b, i }))
      .sort((a, b) => {
        const la = a.layer || 0, lb = b.layer || 0;
        if (la !== lb) return la - lb;
        const ca = (a.type === 'cylinder') ? (a.x + a.y) : (a.x + (a.w || 0) / 2 + a.y + (a.d || 0) / 2);
        const cb = (b.type === 'cylinder') ? (b.x + b.y) : (b.x + (b.w || 0) / 2 + b.y + (b.d || 0) / 2);
        return ca - cb || (a.z || 0) - (b.z || 0);
      })
      .forEach((b, n) => {
        const { x, y, z, cls = '' } = b;
        const g = d.createElementNS(NS, 'g');
        g.setAttribute('class', 'iso-box ' + cls);
        g.style.setProperty('--d', n);

        if (b.type === 'cylinder') {
          const { r, h, rows } = b;
          const [bx, by] = P(x, y, z);
          const [tx, ty] = P(x, y, z + h);
          const rx = r * s * 1.22474487;
          const ry = r * s * 0.70710678;

          const pL = d.createElementNS(NS, 'path');
          pL.setAttribute('class', 'iso-l');
          pL.setAttribute('d', `M${(bx - rx).toFixed(1)},${by.toFixed(1)} L${(tx - rx).toFixed(1)},${ty.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${tx.toFixed(1)},${(ty + ry).toFixed(1)} L${bx.toFixed(1)},${(by + ry).toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${(bx - rx).toFixed(1)},${by.toFixed(1)}Z`);
          g.appendChild(pL);

          const pR = d.createElementNS(NS, 'path');
          pR.setAttribute('class', 'iso-r');
          pR.setAttribute('d', `M${tx.toFixed(1)},${(ty + ry).toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${(tx + rx).toFixed(1)},${ty.toFixed(1)} L${(bx + rx).toFixed(1)},${by.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${bx.toFixed(1)},${(by + ry).toFixed(1)}Z`);
          g.appendChild(pR);

          const elTop = d.createElementNS(NS, 'ellipse');
          elTop.setAttribute('class', 'iso-top');
          elTop.setAttribute('cx', tx.toFixed(1));
          elTop.setAttribute('cy', ty.toFixed(1));
          elTop.setAttribute('rx', rx.toFixed(1));
          elTop.setAttribute('ry', ry.toFixed(1));
          g.appendChild(elTop);

          if (rows) {
            for (let k = 1; k < rows; k++) {
              const yk = by - (h * k / rows) * s;
              const l = d.createElementNS(NS, 'path');
              l.setAttribute('class', 'iso-row');
              l.setAttribute('d', `M${(bx - rx).toFixed(1)},${yk.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${(bx + rx).toFixed(1)},${yk.toFixed(1)}`);
              g.appendChild(l);
            }
          }
        } else if (b.type === 'wedge') {
          const { w, d: dd, h, dir = '-x', rows } = b;
          const p_bl = P(x, y, z), p_br = P(x + w, y, z), p_fr = P(x + w, y + dd, z), p_fl = P(x, y + dd, z);
          if (dir === '-x') {
            const p_tbr = P(x + w, y, z + h), p_tfr = P(x + w, y + dd, z + h);
            g.appendChild(poly('iso-r', p_br, p_fr, p_tfr, p_tbr));
            g.appendChild(poly('iso-l', p_fl, p_fr, p_tfr));
            g.appendChild(poly('iso-top', p_bl, p_tbr, p_tfr, p_fl));
            if (rows) {
              for (let k = 1; k < rows; k++) {
                const zk = z + (h * k) / rows;
                const a1 = P(x + w, y, zk), a2 = P(x + w, y + dd, zk);
                const l = d.createElementNS(NS, 'path');
                l.setAttribute('class', 'iso-row');
                l.setAttribute('d', `M${a1}L${a2}`);
                g.appendChild(l);
              }
            }
          } else if (dir === 'x') {
            const p_tbl = P(x, y, z + h), p_tfl = P(x, y + dd, z + h);
            g.appendChild(poly('iso-l', p_fl, p_fr, p_tfl));
            g.appendChild(poly('iso-top', p_tbl, p_br, p_fr, p_tfl));
          }
        } else {
          const { w, d: dd, h } = b;
          g.appendChild(poly('iso-l', P(x, y + dd, z), P(x + w, y + dd, z), P(x + w, y + dd, z + h), P(x, y + dd, z + h)));
          g.appendChild(poly('iso-r', P(x + w, y, z), P(x + w, y + dd, z), P(x + w, y + dd, z + h), P(x + w, y, z + h)));
          g.appendChild(poly('iso-top', P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + dd, z + h), P(x, y + dd, z + h)));
          if (b.rows) {
            for (let k = 1; k < b.rows; k++) {
              const zk = z + (h * k) / b.rows;
              const l = d.createElementNS(NS, 'path');
              l.setAttribute('class', 'iso-row');
              const a1 = P(x, y + dd, zk), a2 = P(x + w, y + dd, zk), a3 = P(x + w, y, zk);
              l.setAttribute('d', `M${a1}L${a2}L${a3}`);
              g.appendChild(l);
            }
          }
        }
        svg.appendChild(g);
      });

    (clouds || []).forEach((c, idx) => {
      const { cx: ccx = 160, cy: ccy = 78, s: cs = 1.15, dx = 14, dy = 8 } = c;
      const f = (x, y) => `${(ccx + x * cs).toFixed(1)},${(ccy + y * cs).toFixed(1)}`;
      const b = (x, y) => `${(ccx + x * cs - dx).toFixed(1)},${(ccy + y * cs - dy).toFixed(1)}`;

      const frontPath = `M ${f(-30, 18)} ` +
        `L ${f(30, 18)} ` +
        `C ${f(44, 18)} ${f(56, 8)} ${f(56, -4)} ` +
        `C ${f(56, -16)} ${f(44, -24)} ${f(32, -24)} ` +
        `C ${f(30, -38)} ${f(16, -46)} ${f(-2, -46)} ` +
        `C ${f(-18, -46)} ${f(-30, -38)} ${f(-34, -26)} ` +
        `C ${f(-46, -26)} ${f(-56, -14)} ${f(-56, 0)} ` +
        `C ${f(-56, 12)} ${f(-46, 18)} ${f(-30, 18)} Z`;

      const backPath = `M ${b(-30, 18)} ` +
        `L ${b(30, 18)} ` +
        `C ${b(44, 18)} ${b(56, 8)} ${b(56, -4)} ` +
        `C ${b(56, -16)} ${b(44, -24)} ${b(32, -24)} ` +
        `C ${b(30, -38)} ${b(16, -46)} ${b(-2, -46)} ` +
        `C ${b(-18, -46)} ${b(-30, -38)} ${b(-34, -26)} ` +
        `C ${b(-46, -26)} ${b(-56, -14)} ${b(-56, 0)} ` +
        `C ${b(-56, 12)} ${b(-46, 18)} ${b(-30, 18)} Z`;

      const facets = [
        `M ${b(-30, 18)} L ${b(30, 18)} L ${f(30, 18)} L ${f(-30, 18)} Z`,
        `M ${b(30, 18)} C ${b(44, 18)} ${b(56, 8)} ${b(56, -4)} L ${f(56, -4)} C ${f(56, 8)} ${f(44, 18)} ${f(30, 18)} Z`,
        `M ${b(56, -4)} C ${b(56, -16)} ${b(44, -24)} ${b(32, -24)} L ${f(32, -24)} C ${f(44, -24)} ${f(56, -16)} ${f(56, -4)} Z`,
        `M ${b(32, -24)} C ${b(30, -38)} ${b(16, -46)} ${b(-2, -46)} L ${f(-2, -46)} C ${f(16, -46)} ${f(30, -38)} ${f(32, -24)} Z`,
        `M ${b(-2, -46)} C ${b(-18, -46)} ${b(-30, -38)} ${b(-34, -26)} L ${f(-34, -26)} C ${f(-30, -38)} ${f(-18, -46)} ${f(-2, -46)} Z`,
        `M ${b(-34, -26)} C ${b(-46, -26)} ${b(-56, -14)} ${b(-56, 0)} L ${f(-56, 0)} C ${f(-56, -14)} ${f(-46, -26)} ${f(-34, -26)} Z`,
        `M ${b(-56, 0)} C ${b(-56, 12)} ${b(-46, 18)} ${b(-30, 18)} L ${f(-30, 18)} C ${f(-46, 18)} ${f(-56, 12)} ${f(-56, 0)} Z`
      ];

      const g = d.createElementNS(NS, 'g');
      g.setAttribute('class', 'iso-box iso-cloud');
      g.style.setProperty('--d', boxes.length + idx);

      const pBack = d.createElementNS(NS, 'path');
      pBack.setAttribute('class', 'cloud-back');
      pBack.setAttribute('d', backPath);
      g.appendChild(pBack);

      facets.forEach((fct) => {
        const pF = d.createElementNS(NS, 'path');
        pF.setAttribute('class', 'cloud-facet');
        pF.setAttribute('d', fct);
        g.appendChild(pF);
      });

      const pFront = d.createElementNS(NS, 'path');
      pFront.setAttribute('class', 'cloud-front');
      pFront.setAttribute('d', frontPath);
      g.appendChild(pFront);

      const addNode = (nx, ny, r, col) => {
        const cEl = d.createElementNS(NS, 'circle');
        cEl.setAttribute('cx', nx.toFixed(1));
        cEl.setAttribute('cy', ny.toFixed(1));
        cEl.setAttribute('r', r);
        cEl.setAttribute('fill', col);
        g.appendChild(cEl);
      };
      const addLine = (x1, y1, x2, y2) => {
        const lEl = d.createElementNS(NS, 'line');
        lEl.setAttribute('x1', x1.toFixed(1));
        lEl.setAttribute('y1', y1.toFixed(1));
        lEl.setAttribute('x2', x2.toFixed(1));
        lEl.setAttribute('y2', y2.toFixed(1));
        lEl.setAttribute('stroke', '#F2D59C');
        lEl.setAttribute('stroke-width', '1');
        lEl.setAttribute('stroke-dasharray', '2 2');
        g.appendChild(lEl);
      };

      addNode(ccx, ccy - 8, 4, '#F2D59C');
      addNode(ccx - 22, ccy + 2, 3, '#C9A063');
      addNode(ccx + 22, ccy + 2, 3, '#C9A063');
      addLine(ccx - 22, ccy + 2, ccx, ccy - 8);
      addLine(ccx + 22, ccy + 2, ccx, ccy - 8);

      svg.appendChild(g);
    });

    links.forEach(([a, b, lcls]) => {
      const l = d.createElementNS(NS, 'path');
      const p1 = (Array.isArray(a) && a.length === 2) ? a : P(...a);
      const p2 = (Array.isArray(b) && b.length === 2) ? b : P(...b);
      if (lcls && lcls.includes('pipe')) {
        l.setAttribute('d', `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} L${p2[0].toFixed(1)},${p2[1].toFixed(1)}`);
      } else {
        const mx = (p1[0] + p2[0]) / 2, my = Math.min(p1[1], p2[1]) - 18;
        l.setAttribute('d', `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`);
      }
      l.setAttribute('class', 'map-link ' + (lcls || ''));
      svg.appendChild(l);
    });
  };

  const plate = { x: -4, y: -4, w: 8, d: 8, h: 0.3, cls: 'plate' };
  const ART = {
    bfsi: [
      { x: -3.4, y: -3.4, w: 6.8, d: 6.8, h: 0.5 },
      { x: -2.8, y: 1.8, z: 0.5, w: 0.8, d: 0.8, h: 3.4 },
      { x: -0.4, y: 1.8, z: 0.5, w: 0.8, d: 0.8, h: 3.4 },
      { x: 1.8, y: 1.8, z: 0.5, w: 0.8, d: 0.8, h: 3.4 },
      { x: 1.8, y: -0.4, z: 0.5, w: 0.8, d: 0.8, h: 3.4 },
      { x: 1.8, y: -2.8, z: 0.5, w: 0.8, d: 0.8, h: 3.4 },
      { x: -3.6, y: -3.6, z: 3.9, w: 7.2, d: 7.2, h: 0.6, layer: 1 },
      { x: -2.4, y: -2.4, z: 4.5, w: 4.8, d: 4.8, h: 0.7, cls: 'hot', layer: 2 },
    ],
    health: [
      plate,
      { x: -1, y: -3, z: 0.3, w: 2, d: 2, h: 2.6 },
      { x: -3, y: -1, z: 0.3, w: 2, d: 2, h: 2.6 },
      { x: -1, y: -1, z: 0.3, w: 2, d: 2, h: 2.6, cls: 'hot' },
      { x: 1, y: -1, z: 0.3, w: 2, d: 2, h: 2.6 },
      { x: -1, y: 1, z: 0.3, w: 2, d: 2, h: 2.6 },
    ],
    auto: {
      boxes: [
        plate,
        // Distribution Loading Dock & Staging Bay
        { x: -3.6, y: -3.6, z: 0.3, w: 5.4, d: 3.2, h: 0.5 },
        // Distribution Shipping Container 1 (corrugated freight)
        { x: -3.2, y: -3.2, z: 0.8, w: 3.0, d: 1.6, h: 1.6, rows: 4, layer: 1 },
        // Distribution Shipping Container 2 (stacked, gold accent)
        { x: -2.7, y: -3.0, z: 2.4, w: 2.3, d: 1.4, h: 1.4, rows: 2, cls: 'hot', layer: 2 },
        // Staged Cargo Pallet & Goods
        { x: 0.4, y: -3.1, z: 0.8, w: 1.2, d: 1.2, h: 0.9, rows: 2, layer: 1 },
        { x: 0.6, y: -1.6, z: 0.8, w: 0.8, d: 0.8, h: 0.6, layer: 1 },
        
        // Automotive Delivery Transport Truck Chassis
        { x: -3.0, y: 0.7, z: 0.5, w: 5.3, d: 1.8, h: 0.35, layer: 1 },
        // Truck Wheels (visible flank)
        { x: 1.4, y: 2.35, z: 0.15, w: 0.75, d: 0.25, h: 0.65, cls: 'wheel', layer: 2 },
        { x: -2.7, y: 2.35, z: 0.15, w: 0.75, d: 0.25, h: 0.65, cls: 'wheel', layer: 2 },
        { x: -1.7, y: 2.35, z: 0.15, w: 0.75, d: 0.25, h: 0.65, cls: 'wheel', layer: 2 },
        // Transport Freight Trailer / Container
        { x: -3.0, y: 0.7, z: 0.85, w: 3.6, d: 1.8, h: 2.4, rows: 5, layer: 2 },
        // Driver Cabin Base & Hood
        { x: 1.7, y: 0.7, z: 0.85, w: 0.6, d: 1.8, h: 0.8, rows: 2, layer: 2 },
        // Driver Cockpit Glass (glowing gold)
        { x: 0.7, y: 0.7, z: 0.85, w: 1.0, d: 1.8, h: 1.9, cls: 'hot', layer: 2 },
        // Aerodynamic Cab Roof Deflector
        { x: 0.5, y: 0.7, z: 2.75, w: 1.2, d: 1.8, h: 0.35, layer: 3 },
        // Chrome Bumper / Headlights
        { x: 2.3, y: 0.8, z: 0.5, w: 0.15, d: 1.6, h: 0.4, cls: 'hot', layer: 3 },
        // Truck Exhaust Stack
        { x: 0.45, y: 0.75, z: 0.85, w: 0.2, d: 0.2, h: 2.3, cls: 'hot', layer: 3 }
      ]
    },
    digital: {
      boxes: [
        plate,
        // Microservice Server Cluster - Worker Node 1
        { x: -2.8, y: 0.8, z: 0.3, w: 1.5, d: 1.5, h: 2.2, rows: 4 },
        // Microservice Server Cluster - Core DB Node 2
        { x: 1.3, y: -2.7, z: 0.3, w: 1.6, d: 1.6, h: 2.4, rows: 5 },
        // Edge API Gateway Pod
        { x: 1.2, y: 1.2, z: 0.3, w: 1.4, d: 1.4, h: 1.7, rows: 3 },
        // Central Orchestrator / Cluster Master Pod
        { x: -0.9, y: -0.9, z: 0.3, w: 1.8, d: 1.8, h: 2.0, rows: 3 },

        // Floating Container Microservices / API Pods in mid-air
        { x: -2.3, y: -1.7, z: 3.0, w: 0.8, d: 0.8, h: 0.8, cls: 'hot', layer: 1 },
        { x: 1.9, y: -0.7, z: 3.1, w: 0.8, d: 0.8, h: 0.8, cls: 'hot', layer: 1 },
        { x: -0.5, y: 2.1, z: 2.7, w: 0.7, d: 0.7, h: 0.7, cls: 'hot', layer: 1 }
      ],
      clouds: [
        { cx: 160, cy: 78, s: 1.15, dx: 14, dy: 8 }
      ],
      links: [
        // Luminous streaming data links from the cloud base to server clusters
        [[160, 98], [-2.05, 1.55, 2.5], 'data-flow'],
        [[160, 98], [2.1, -1.9, 2.7], 'data-flow'],
        [[160, 98], [1.9, 1.9, 2.0], 'data-flow'],
        [[160, 98], [0, 0, 2.3], 'data-flow'],
        [[-1.9, -1.3, 3.4], [1.5, -0.3, 3.5], 'data-flow']
      ]
    },
    realestate: {
      boxes: [
        plate,
        // Hotel Tower Main Body (9 floors of suites & balconies)
        { x: -0.6, y: -3.4, z: 0.3, w: 2.8, d: 2.6, h: 5.6, rows: 9 },
        // Rooftop Resort Sky Terrace & Infinity Pool Deck (gold)
        { x: -0.6, y: -3.4, z: 5.9, w: 2.8, d: 2.6, h: 0.35, cls: 'hot', layer: 1 },
        // Upper Penthouse Suites
        { x: -0.2, y: -3.0, z: 6.25, w: 2.0, d: 1.8, h: 1.8, rows: 3, layer: 2 },
        // Architectural Crown Canopy
        { x: 0.0, y: -2.8, z: 8.05, w: 1.6, d: 1.4, h: 0.4, cls: 'hot', layer: 3 },

        // Two-story Grand Hotel Lobby & Glass Atrium
        { x: 0.8, y: -2.0, z: 0.3, w: 1.8, d: 2.2, h: 1.8, rows: 2 },
        // Hospitality Porte-Cochère Canopy (Valet drop-off)
        { x: 1.8, y: -1.6, z: 1.3, w: 1.3, d: 1.8, h: 0.25, cls: 'hot', layer: 1 },
        // Porte-Cochère Support Pillars
        { x: 2.9, y: -1.5, z: 0.3, w: 0.2, d: 0.2, h: 1.0, layer: 1 },
        { x: 2.9, y: -0.1, z: 0.3, w: 0.2, d: 0.2, h: 1.0, layer: 1 },
        // Entrance Walkway & Steps
        { x: 1.6, y: -1.8, z: 0.3, w: 1.6, d: 2.0, h: 0.25 },

        // Adjoining Luxury Resort Wing (5 guest levels)
        { x: -3.4, y: -1.8, z: 0.3, w: 2.2, d: 2.4, h: 3.4, rows: 5 },
        // Resort Wing Rooftop Garden Terrace
        { x: -3.2, y: -1.6, z: 3.7, w: 1.8, d: 2.0, h: 0.7, cls: 'hot', layer: 1 },

        // Courtyard Garden Villa / Pool Cabana
        { x: -3.0, y: 1.2, z: 0.3, w: 2.2, d: 1.8, h: 1.2 },
        // Cabana Pergola Sun Shade
        { x: -2.8, y: 1.4, z: 1.5, w: 1.8, d: 1.4, h: 0.2, cls: 'hot', layer: 1 },
        // Resort Swimming Pool
        { x: -0.4, y: 0.8, z: 0.3, w: 2.2, d: 1.6, h: 0.15, cls: 'hot' }
      ]
    },
    ot: {
      boxes: [
        plate,
        // Factory Main Production Hall
        { x: -3.4, y: -1.0, z: 0.3, w: 4.8, d: 3.4, h: 2.2, rows: 2 },
        // Factory Sawtooth Roof Ridge 1 (iconic industrial clerestory skylight)
        { type: 'wedge', x: -3.4, y: -1.0, z: 2.5, w: 1.6, d: 3.4, h: 1.1, dir: '-x', rows: 2, layer: 1 },
        // Factory Sawtooth Roof Ridge 2
        { type: 'wedge', x: -1.8, y: -1.0, z: 2.5, w: 1.6, d: 3.4, h: 1.1, dir: '-x', rows: 2, layer: 1 },
        // Factory Sawtooth Roof Ridge 3
        { type: 'wedge', x: -0.2, y: -1.0, z: 2.5, w: 1.6, d: 3.4, h: 1.1, dir: '-x', rows: 2, layer: 1 },

        // Large Industrial Processing Silo
        { type: 'cylinder', x: -2.2, y: -2.8, z: 0.3, r: 1.0, h: 4.2, rows: 4 },
        // Silo Dome Cap
        { type: 'cylinder', x: -2.2, y: -2.8, z: 4.5, r: 0.9, h: 0.6, cls: 'hot', layer: 1 },
        // Secondary Industrial Fluid Tank
        { type: 'cylinder', x: -0.2, y: -2.8, z: 0.3, r: 0.8, h: 3.0, rows: 3 },
        { type: 'cylinder', x: -0.2, y: -2.8, z: 3.3, r: 0.7, h: 0.5, layer: 1 },

        // Primary High Industrial Exhaust Stack / Chimney
        { type: 'cylinder', x: 2.2, y: -2.6, z: 0.3, r: 0.45, h: 7.0, rows: 5 },
        // Smokestack Gold Band / Emissions Monitor
        { type: 'cylinder', x: 2.2, y: -2.6, z: 7.3, r: 0.55, h: 0.5, cls: 'hot', layer: 1 },
        // Secondary Vent Stack
        { type: 'cylinder', x: 2.2, y: -1.0, z: 0.3, r: 0.35, h: 5.0, rows: 4 },

        // SCADA Industrial Automation & PLC Control Cabinet
        { x: 0.6, y: 1.2, z: 0.3, w: 1.4, d: 1.4, h: 1.4, cls: 'hot', rows: 3 },
        // Power Transformer / Grid Substation
        { x: -1.4, y: 1.6, z: 0.3, w: 1.2, d: 1.0, h: 0.9, rows: 2 }
      ],
      links: [
        // High-pressure industrial pipelines connecting silo to factory
        [[-2.2, -2.8, 3.8], [-2.2, -1.0, 2.5], 'pipe'],
        [[-0.2, -2.8, 2.6], [-0.2, -1.0, 2.5], 'pipe']
      ]
    }
  };
  $$('svg[data-iso]').forEach((svg) => {
    const data = ART[svg.dataset.iso] || [];
    const boxes = Array.isArray(data) ? data : (data.boxes || []);
    const opts = Array.isArray(data) ? {} : data;
    isoDraw(svg, boxes, opts);
  });

  /* ---------------- industries rail ---------------- */
  const rail = $('#indRail');
  if (rail) {
    const cards = [...rail.children];
    const now = $('#indNow');
    const prevBtn = $('#indPrev');
    const nextBtn = $('#indNext');
    const unit = () => (cards[0] ? cards[0].getBoundingClientRect().width + 16 : 300);
    const idx = () => Math.min(cards.length - 1, Math.max(0, Math.round(rail.scrollLeft / unit())));
    const go = (dir) => rail.scrollTo({ left: (idx() + dir) * unit(), behavior: reduce ? 'auto' : 'smooth' });

    if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => go(1));

    rail.addEventListener('scroll', () => {
      const i = idx();
      if (now) now.textContent = String(i + 1).padStart(2, '0');
      cards.forEach((c, k) => c.classList.toggle('is-current', k === i));
    }, { passive: true });

    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let isDragging = false;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;

    rail.addEventListener('pointerdown', (e) => {
      isDown = true;
      isDragging = false;
      startX = e.clientX;
      startScroll = rail.scrollLeft;
      lastX = e.clientX;
      lastTime = performance.now();
      velocity = 0;
    });

    addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!isDragging && Math.abs(dx) > 4) {
        isDragging = true;
        rail.classList.add('is-drag');
      }
      if (isDragging) {
        rail.scrollLeft = startScroll - dx;
        const nowTime = performance.now();
        const dt = nowTime - lastTime;
        if (dt > 8) {
          velocity = (e.clientX - lastX) / dt;
          lastX = e.clientX;
          lastTime = nowTime;
        }
      }
    });

    const finishDrag = () => {
      if (!isDown) return;
      isDown = false;
      if (isDragging) {
        rail.classList.remove('is-drag');
        const momentum = velocity * 160;
        const targetScroll = rail.scrollLeft - momentum;
        const targetIdx = Math.min(cards.length - 1, Math.max(0, Math.round(targetScroll / unit())));
        rail.scrollTo({ left: targetIdx * unit(), behavior: 'smooth' });
        setTimeout(() => { isDragging = false; }, 60);
      }
    };

    addEventListener('pointerup', finishDrag);
    addEventListener('pointercancel', finishDrag);

    rail.addEventListener('click', (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  /* ---------------- interactive stats ---------------- */
  $$('.stat').forEach(el => {
    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      // Calculate normalized distances from center (-1 to 1)
      const dx = (x - cx) / cx; 
      const dy = (y - cy) / cy; 
      el.style.setProperty('--mx', dx);
      el.style.setProperty('--my', dy);
    });
    el.addEventListener('mouseleave', () => {
      el.style.setProperty('--mx', 0);
      el.style.setProperty('--my', 0);
    });
  });

  addEventListener('load', () => hasGSAP && ST.refresh());
})();
