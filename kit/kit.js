// Game kit: the shared bits every small launcher game needs, so each game file can stay
// about the game itself. Loaded with <script src="../kit/kit.js"></script>.
// Gives: a letterboxed canvas in logical units, keyboard + gamepad + touch input,
// start / pause / game-over screens, best scores, tiny Web Audio sounds, particles.
(() => {
  'use strict';
  const K = (window.K = {});
  const css = `
  [hidden]{display:none!important}
  *{box-sizing:border-box;margin:0}
  html,body{height:100%;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  #kc{display:block;width:100%;height:100%}
  .k-screen{position:fixed;inset:0;display:grid;place-items:center;padding:16px;background:rgba(5,6,18,.62);backdrop-filter:blur(3px);z-index:10}
  .k-card{width:min(420px,100%);max-height:100%;overflow:auto;text-align:center;color:#eef0ff;background:rgba(18,20,42,.92);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:24px 20px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .k-card h1{font-size:clamp(28px,7vw,40px);font-weight:900;letter-spacing:.5px;color:var(--k-accent,#8ab4ff);text-shadow:0 0 24px color-mix(in srgb,var(--k-accent,#8ab4ff) 50%,transparent)}
  .k-card p{margin-top:10px;color:#c6c9e8;line-height:1.45;font-size:15px}
  .k-card .k-big{font-size:34px;font-weight:900;color:#fff;margin-top:6px}
  .k-card .k-best{color:#ffd166;font-weight:700}
  .k-card ul{list-style:none;padding:0;margin-top:12px;color:#9da3cc;font-size:13.5px;line-height:1.6}
  .k-btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:18px}
  .k-btn{font:inherit;font-weight:800;font-size:17px;min-height:48px;padding:10px 22px;border:0;border-radius:14px;cursor:pointer;color:#0b0c1c;background:var(--k-accent,#8ab4ff)}
  .k-btn.alt{background:rgba(255,255,255,.12);color:#eef0ff}
  .k-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
  .k-top{position:fixed;top:8px;right:8px;display:flex;gap:8px;z-index:9}
  .k-ib{width:40px;height:40px;border-radius:12px;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:18px;cursor:pointer;display:grid;place-items:center}
  .k-touch{position:fixed;inset:auto 0 0 0;height:0;z-index:8;pointer-events:none}
  .k-stick{position:fixed;left:18px;bottom:18px;width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.18);pointer-events:auto;touch-action:none}
  .k-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.3)}
  .k-stick.right{left:auto;right:18px}
  .k-pads{position:fixed;right:18px;bottom:22px;display:flex;gap:14px;align-items:flex-end;pointer-events:none}
  .k-pad{pointer-events:auto;touch-action:none;width:74px;height:74px;border-radius:50%;border:2px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;font:800 14px system-ui;display:grid;place-items:center}
  .k-pad.on{background:rgba(255,255,255,.32)}
  .k-pad.b{width:62px;height:62px;margin-bottom:40px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- helpers ----------
  K.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  K.randi = (a, b) => Math.floor(K.rand(a, b + 1));
  K.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  K.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  K.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  K.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- stage ----------
  // K.init({ id, W, H, bg, accent }) – logical playfield W x H, letterboxed to the window.
  let cv, ctx, scale = 1, ox = 0, oy = 0, dpr = 1, shakeAmt = 0;
  K.init = (o) => {
    Object.assign(K, { id: o.id, W: o.W, H: o.H, bg: o.bg || '#0b0c1c', accent: o.accent || '#8ab4ff', fit: o.fit || 'contain' });
    document.documentElement.style.setProperty('--k-accent', K.accent);
    document.body.style.background = K.bg;
    cv = document.createElement('canvas'); cv.id = 'kc'; document.body.prepend(cv);
    ctx = K.ctx = cv.getContext('2d'); K.cv = cv;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      if (K.fit === 'grow') {
        // Keep the short side, grow the long side to fill the screen (no letterbox).
        const s0 = Math.min(innerWidth / o.W, innerHeight / o.H);
        K.W = Math.max(o.W, innerWidth / s0); K.H = Math.max(o.H, innerHeight / s0);
      }
      scale = Math.min(innerWidth / K.W, innerHeight / K.H) * dpr;
      ox = (cv.width - K.W * scale) / 2; oy = (cv.height - K.H * scale) / 2;
      K.onResize && K.onResize();
    };
    addEventListener('resize', resize); resize();
    best = K.store.get(K.id + ':best', 0);
    buildTop();
    return K;
  };
  // Clears the whole canvas, then sets logical coordinates (with screen shake).
  K.begin = (bg) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = K.bg; ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = shakeAmt > .3 ? K.rand(-shakeAmt, shakeAmt) : 0, sy = shakeAmt > .3 ? K.rand(-shakeAmt, shakeAmt) : 0;
    ctx.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, K.W, K.H); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, K.W, K.H); ctx.clip();
  };
  K.end = () => { ctx.restore(); };
  K.shake = (n) => { shakeAmt = Math.max(shakeAmt, n); };
  K.toField = (e) => ({ x: (e.clientX * dpr - ox) / scale, y: (e.clientY * dpr - oy) / scale });

  // ---------- drawing helpers ----------
  K.text = (s, x, y, o = {}) => {
    ctx.font = `${o.weight || 700} ${o.size || 18}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 16; }
    ctx.fillStyle = o.color || '#fff'; ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  };
  K.rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  K.circle = (x, y, r, fill) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } };

  // ---------- particles ----------
  let parts = [];
  K.burst = (x, y, color, n = 12, sp = 4, life = 30, size = 3) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = Math.random() * sp; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (0.5 + Math.random() * 0.5), l: life, c: color, s: size }); }
  };
  K.float = (x, y, s, color = '#fff') => parts.push({ x, y, vx: 0, vy: -0.8, t: 50, l: 50, c: color, txt: s });
  K.clearParts = () => { parts = []; };
  function stepParts() { for (const p of parts) { p.x += p.vx; p.y += p.vy; if (!p.txt) { p.vx *= .96; p.vy *= .96; } p.t--; } parts = parts.filter((p) => p.t > 0); }
  K.drawParts = () => {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.t / p.l);
      if (p.txt) K.text(p.txt, p.x, p.y, { size: 18, weight: 800, color: p.c, align: 'center' });
      else { ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    ctx.globalAlpha = 1;
  };

  // ---------- sound ----------
  let ac = null, muted = K.store.get('kit:muted', false);
  const audio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; };
  // K.tone(freq, dur, type, vol, toFreq)
  K.tone = (f = 440, d = .1, type = 'square', v = .08, f2) => {
    if (muted) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
  };
  K.noise = (d = .2, v = .12) => {
    if (muted) return; const a = audio(); if (!a) return;
    const b = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = v; s.connect(g).connect(a.destination); s.start();
  };
  K.sfx = {
    blip: () => K.tone(660, .06, 'square', .05),
    coin: () => { K.tone(880, .07, 'square', .05); setTimeout(() => K.tone(1320, .1, 'square', .05), 60); },
    hit: () => K.tone(220, .12, 'sawtooth', .07, 80),
    boom: () => { K.noise(.35, .16); K.tone(120, .3, 'sine', .12, 40); },
    jump: () => K.tone(330, .12, 'square', .05, 660),
    good: () => { K.tone(523, .08, 'triangle', .08); setTimeout(() => K.tone(784, .14, 'triangle', .08), 80); },
    bad: () => K.tone(200, .25, 'triangle', .1, 90),
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => K.tone(f, .14, 'triangle', .08), i * 110)),
  };

  // ---------- input ----------
  const keys = new Set(); let prev = new Set(), now = new Set();
  const MAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ' ': 'a', Enter: 'a', z: 'a', Z: 'a', x: 'b', X: 'b', Shift: 'b', j: 'a', k: 'b' };
  addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key); if (MAP[e.key]) keys.add('@' + MAP[e.key]);
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { K.togglePause(); }
    else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && screenEl && !screenEl.hidden) { e.preventDefault(); screenAct && screenAct(); }
    else if (e.key === 'm' || e.key === 'M') K.toggleMute();
    K.onKey && !e.repeat && K.onKey(e.key, e);
  });
  addEventListener('keyup', (e) => { keys.delete(e.key); if (MAP[e.key]) keys.delete('@' + MAP[e.key]); });
  addEventListener('blur', () => { keys.clear(); if (K.state === 'play') K.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && K.state === 'play') K.pause(); });
  const touchBtn = { a: false, b: false }; const stick = { x: 0, y: 0 }; const stick2 = { x: 0, y: 0, on: false };
  let padPrev = [];
  function pollPads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    K.pad = { x: 0, y: 0, a: false, b: false, rx: 0, ry: 0 };
    for (const g of pads) {
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (Math.abs(ax) > .25) K.pad.x = ax; if (Math.abs(ay) > .25) K.pad.y = ay;
      if (Math.abs(g.axes[2] || 0) > .25) K.pad.rx = g.axes[2]; if (Math.abs(g.axes[3] || 0) > .25) K.pad.ry = g.axes[3];
      const b = (i) => !!g.buttons[i]?.pressed;
      if (b(14)) K.pad.x = -1; if (b(15)) K.pad.x = 1; if (b(12)) K.pad.y = -1; if (b(13)) K.pad.y = 1;
      if (b(0) || b(7)) K.pad.a = true; if (b(1) || b(2) || b(6)) K.pad.b = true;
      if (b(9) && !padPrev[9]) K.togglePause();
      if (b(0) && !padPrev[0] && screenEl && !screenEl.hidden) screenAct && screenAct();
      padPrev = g.buttons.map((x) => x.pressed);
    }
  }
  const held = (n) => {
    if (n === 'a') return keys.has('@a') || touchBtn.a || K.pad.a;
    if (n === 'b') return keys.has('@b') || touchBtn.b || K.pad.b;
    const ax = K.axis();
    if (n === 'left') return ax.x < -.4; if (n === 'right') return ax.x > .4; if (n === 'up') return ax.y < -.4; if (n === 'down') return ax.y > .4;
    return keys.has(n);
  };
  K.held = (n) => now.has(n);
  K.pressed = (n) => now.has(n) && !prev.has(n);
  K.released = (n) => !now.has(n) && prev.has(n);
  K.axis = () => {
    let x = (keys.has('@right') ? 1 : 0) - (keys.has('@left') ? 1 : 0), y = (keys.has('@down') ? 1 : 0) - (keys.has('@up') ? 1 : 0);
    if (K.pad.x) x = K.pad.x; if (K.pad.y) y = K.pad.y;
    if (stick.x || stick.y) { x = stick.x; y = stick.y; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y };
  };
  K.aim = () => (stick2.on ? { x: stick2.x, y: stick2.y } : (K.pad.rx || K.pad.ry) ? { x: K.pad.rx, y: K.pad.ry } : null);
  K.pad = { x: 0, y: 0, a: false, b: false, rx: 0, ry: 0 };
  function sampleInput() {
    pollPads(); prev = now; now = new Set();
    for (const n of ['a', 'b', 'left', 'right', 'up', 'down']) if (held(n)) now.add(n);
    for (const k of keys) now.add(k);
  }
  // Pointer events in field coords: K.onDown/onMove/onUp = (p, e) => {}
  let pointerDown = false;
  addEventListener('pointerdown', (e) => {
    audio();
    if (e.target !== cv) return; pointerDown = true; K.pointerHeld = true; K.pointer = K.toField(e); K.onDown && K.state !== 'paused' && K.onDown(K.pointer, e);
  });
  addEventListener('pointermove', (e) => { K.pointer = K.toField(e); K.pointerHeld = pointerDown; K.onMove && K.onMove(K.pointer, e); });
  addEventListener('pointerup', (e) => { if (!pointerDown) return; pointerDown = false; K.pointerHeld = false; K.pointer = K.toField(e); K.onUp && K.onUp(K.pointer, e); });
  addEventListener('pointercancel', () => { pointerDown = false; K.pointerHeld = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());

  // On-screen controls for touch devices: K.touch({ stick: true, aim: false, a: 'Jump', b: 'Fire' })
  K.touch = (o = {}) => {
    if (!K.isTouch) return;
    const wrap = document.createElement('div'); wrap.className = 'k-touch'; document.body.appendChild(wrap);
    const mkStick = (target, right) => {
      const el = document.createElement('div'); el.className = 'k-stick' + (right ? ' right' : ''); const nub = document.createElement('i'); el.appendChild(nub); wrap.appendChild(el);
      let id = null;
      const set = (e) => { const r = el.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } target.x = Math.abs(dx) > .15 ? dx : 0; target.y = Math.abs(dy) > .15 ? dy : 0; target.on = true; nub.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; };
      el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(e); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
      const up = (e) => { if (e.pointerId !== id) return; id = null; target.x = target.y = 0; target.on = false; nub.style.transform = ''; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    if (o.stick) mkStick(stick, false);
    if (o.aim) mkStick(stick2, true);
    if (o.a || o.b) {
      const pads = document.createElement('div'); pads.className = 'k-pads'; wrap.appendChild(pads);
      for (const n of ['b', 'a']) {
        if (!o[n]) continue;
        const el = document.createElement('div'); el.className = 'k-pad ' + n; el.textContent = o[n]; pads.appendChild(el);
        const on = (e) => { e.preventDefault(); touchBtn[n] = true; el.classList.add('on'); audio(); };
        const off = () => { touchBtn[n] = false; el.classList.remove('on'); };
        el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
      }
    }
    K.touchEl = wrap;
  };

  // ---------- screens & state ----------
  K.state = 'menu';
  let best = 0, screenEl = null, screenAct = null, topEl, pauseBtn, muteBtn;
  function buildTop() {
    topEl = document.createElement('div'); topEl.className = 'k-top';
    muteBtn = document.createElement('button'); muteBtn.className = 'k-ib'; muteBtn.type = 'button'; muteBtn.title = 'Sound (M)';
    pauseBtn = document.createElement('button'); pauseBtn.className = 'k-ib'; pauseBtn.type = 'button'; pauseBtn.title = 'Pause (P)'; pauseBtn.textContent = '❚❚';
    muteBtn.onclick = () => K.toggleMute(); pauseBtn.onclick = () => K.togglePause();
    topEl.append(muteBtn, pauseBtn); document.body.appendChild(topEl); syncTop();
  }
  function syncTop() { if (!muteBtn) return; muteBtn.textContent = muted ? '🔇' : '🔊'; pauseBtn.hidden = K.state !== 'play' || K.noPause; }
  K.toggleMute = () => { muted = !muted; K.store.set('kit:muted', muted); syncTop(); };
  K.getBest = () => best;
  // Saves a new best (higher is better unless K.lowBest). Returns true if it's a record.
  K.submit = (score) => {
    const better = K.lowBest ? (best === 0 || score < best) : score > best;
    if (better && (score > 0 || K.lowBest)) { best = score; K.store.set(K.id + ':best', best); return true; }
    return false;
  };
  // K.screen({ title, big, text, lines:[...], best:true, buttons:[{label, alt, act}] })
  K.screen = (o) => {
    if (!screenEl) { screenEl = document.createElement('div'); screenEl.className = 'k-screen'; document.body.appendChild(screenEl); }
    const card = document.createElement('div'); card.className = 'k-card';
    const h = document.createElement('h1'); h.textContent = o.title || ''; card.appendChild(h);
    if (o.big != null) { const b = document.createElement('div'); b.className = 'k-big'; b.textContent = o.big; card.appendChild(b); }
    if (o.text) { const p = document.createElement('p'); p.textContent = o.text; card.appendChild(p); }
    if (o.best && (best || K.lowBest && best)) { const p = document.createElement('p'); p.className = 'k-best'; p.textContent = (o.record ? 'New best! ' : 'Best: ') + (K.fmtBest ? K.fmtBest(best) : best.toLocaleString()); card.appendChild(p); }
    if (o.lines) { const ul = document.createElement('ul'); for (const l of o.lines) { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); } card.appendChild(ul); }
    const bw = document.createElement('div'); bw.className = 'k-btns'; card.appendChild(bw);
    const btns = o.buttons || [];
    btns.forEach((b, i) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'k-btn' + (b.alt ? ' alt' : ''); el.textContent = b.label; el.onclick = () => { audio(); b.act(); }; bw.appendChild(el); if (i === 0) setTimeout(() => el.focus({ preventScroll: true }), 30); });
    screenAct = btns[0] ? () => { audio(); btns[0].act(); } : null;
    screenEl.replaceChildren(card); screenEl.hidden = false;
    if (K.touchEl) K.touchEl.hidden = true;
    syncTop();
  };
  K.hideScreen = () => { if (screenEl) screenEl.hidden = true; screenAct = null; if (K.touchEl) K.touchEl.hidden = false; syncTop(); };
  K.play = () => { K.state = 'play'; K.hideScreen(); syncTop(); };
  K.pause = () => {
    if (K.state !== 'play' || K.noPause) return; K.state = 'paused';
    K.screen({ title: 'Paused', text: K.pauseText || '', buttons: [{ label: 'Resume', act: () => K.play() }, ...(K.onQuit ? [{ label: 'Quit', alt: true, act: () => K.onQuit() }] : [])] });
  };
  K.togglePause = () => { if (K.state === 'play') K.pause(); else if (K.state === 'paused') K.play(); };
  // Game over with a score: shows the score and best, and calls again() on Play again.
  K.over = (o) => {
    K.state = 'over';
    const rec = o.score != null ? K.submit(o.score) : false;
    if (rec) K.sfx.win();
    setTimeout(() => K.screen({ title: o.title || 'Game over', big: o.score != null ? (K.fmtBest ? K.fmtBest(o.score) : o.score.toLocaleString()) : null, text: o.text, best: o.score != null, record: rec, buttons: o.buttons || [{ label: 'Play again', act: o.again }, ...(o.menu ? [{ label: 'Menu', alt: true, act: o.menu }] : [])] }), o.delay ?? 500);
  };

  // ---------- loop ----------
  // K.run(update, draw): update runs 60 times a second while state is 'play' (and always if K.alwaysUpdate).
  K.run = (update, draw) => {
    let last = performance.now(), acc = 0;
    K.t = 0;
    const frame = (t) => {
      acc += Math.min(100, t - last); last = t;
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60; sampleInput();
        if (K.state === 'play' || K.alwaysUpdate) { update(1 / 60); K.t++; }
        if (K.state !== 'paused') stepParts();
        shakeAmt *= .86;
      }
      draw(ctx); K.end && 0;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
})();
