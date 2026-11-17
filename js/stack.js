// Tecnologías como esferas con física 2D: caen al entrar en pantalla, chocan entre sí,
// se pueden arrastrar y lanzar, y el cursor las empuja. Sin librerías.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.getElementById('stackStage');
const canvas = document.getElementById('stackCanvas');
const items = [...document.querySelectorAll('#stackList li')].map((li) => ({ label: li.textContent.trim(), g: li.dataset.g }));

if (!reduceMotion && canvas && items.length) {
  const ctx = canvas.getContext('2d');
  const COLORS = {   // [centro, borde, brillo del contorno]
    lang: ['#A78BFA', '#6D28D9', 'rgba(139,92,246,.55)'],
    web:  ['#7DD3FC', '#0369A1', 'rgba(56,189,248,.55)'],
    back: ['#334155', '#0F172A', 'rgba(56,189,248,.35)'],
    data: ['#334155', '#0F172A', 'rgba(139,92,246,.35)'],
    ai:   ['#C4B5FD', '#0EA5E9', 'rgba(167,139,250,.6)'],
    game: ['#475569', '#1E293B', 'rgba(248,250,252,.25)'],
    tool: ['#475569', '#1E293B', 'rgba(248,250,252,.25)'],
  };
  let W = 0, H = 0, dpr = 1, balls = [], started = false, visible = false, last = 0;
  const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, inside: false, t: 0 };
  let drag = null;

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // radio según el área disponible, para que todas quepan con holgura
    const base = Math.sqrt((W * H * 0.42) / (items.length * Math.PI));
    balls.forEach((b) => { b.r = base * b.k; b.x = Math.min(Math.max(b.x, b.r), W - b.r); b.y = Math.min(b.y, H - b.r); });
    return base;
  }

  function spawn() {
    const base = resize();
    balls = items.map((it, i) => {
      const k = 0.82 + ((i * 37) % 10) / 30;          // tamaños variados pero estables
      const r = base * k;
      return {
        ...it, k, r,
        x: r + Math.random() * (W - 2 * r),
        y: -r - i * (H * 0.09) - Math.random() * 60,  // caen escalonadas desde arriba
        vx: (Math.random() - 0.5) * 120, vy: 0,
      };
    });
  }

  const G = 2200, REST = 0.45, AIR = 0.995, FLOOR_F = 0.985;
  function step(dt) {
    for (const b of balls) {
      if (b === drag?.ball) continue;
      b.vy += G * dt;
      b.vx *= AIR; b.vy *= AIR;
      // el cursor empuja las esferas cercanas en la dirección en que se mueve
      if (pointer.inside && !drag) {
        const dx = b.x - pointer.x, dy = b.y - pointer.y, d = Math.hypot(dx, dy), reach = b.r + 40;
        if (d < reach && d > 0.01) {
          const f = (1 - d / reach);
          b.vx += (dx / d) * 900 * f * dt * 60 * 0.05 + pointer.vx * f * 0.08;
          b.vy += (dy / d) * 900 * f * dt * 60 * 0.05 + pointer.vy * f * 0.08;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // paredes y piso
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * REST; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * REST; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * REST; b.vx *= FLOOR_F; if (Math.abs(b.vy) < 30) b.vy = 0; }
    }
    // choques entre esferas (separación por masa + rebote)
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = min - d;
        const ma = a === drag?.ball ? 1e6 : a.r * a.r, mb = b === drag?.ball ? 1e6 : b.r * b.r, mt = ma + mb;
        a.x -= nx * over * (mb / mt); a.y -= ny * over * (mb / mt);
        b.x += nx * over * (ma / mt); b.y += ny * over * (ma / mt);
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = (-(1 + REST) * rv) / (1 / ma + 1 / mb);
          a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny;
          b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny;
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const b of balls) {
      const [c1, c2, glow] = COLORS[b.g] || COLORS.tool;
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = b === drag?.ball ? 36 : 22;
      const grad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // contorno de cristal y reflejo
      ctx.strokeStyle = 'rgba(248,250,252,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.ellipse(b.x - b.r * 0.32, b.y - b.r * 0.45, b.r * 0.38, b.r * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
      // nombre
      const size = Math.min(b.r * 0.42, (b.r * 1.6) / Math.max(4, b.label.length * 0.62));
      ctx.font = `700 ${size}px "Space Grotesk", Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#F8FAFC';
      ctx.shadowColor = 'rgba(2,6,23,.55)'; ctx.shadowBlur = 6;
      ctx.fillText(b.label, b.x, b.y + 1);
      ctx.shadowBlur = 0;
    }
  }

  function loop(t) {
    if (!visible) { last = 0; return; }
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016);
    last = t;
    for (let k = 0; k < 3; k++) step(dt / 3);   // subpasos para choques estables
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- interacción ----------
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e), now = performance.now(), dt = Math.max(1, now - pointer.t) / 1000;
    pointer.vx = (p.x - pointer.x) / dt; pointer.vy = (p.y - pointer.y) / dt;
    pointer.vx = Math.max(-2500, Math.min(2500, pointer.vx)); pointer.vy = Math.max(-2500, Math.min(2500, pointer.vy));
    pointer.x = p.x; pointer.y = p.y; pointer.t = now; pointer.inside = true;
    if (drag) {
      const b = drag.ball;
      b.vx = (p.x - drag.ox - b.x) / dt; b.vy = (p.y - drag.oy - b.y) / dt;   // al soltar conserva la velocidad
      b.x = p.x - drag.ox; b.y = p.y - drag.oy;                               // respeta el punto donde se agarró
    }
  });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    const b = balls.slice().reverse().find((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r);
    if (!b) return;
    drag = { ball: b, ox: p.x - b.x, oy: p.y - b.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  const endDrag = () => {
    if (!drag) return;
    const b = drag.ball;
    b.vx = Math.max(-2200, Math.min(2200, b.vx)); b.vy = Math.max(-2200, Math.min(2200, b.vy));
    drag = null; canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- arranque al entrar en pantalla ----------
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !started) { started = true; spawn(); }
    if (visible && !was) requestAnimationFrame(loop);
  }, { threshold: 0.25 }).observe(stage);
  addEventListener('resize', () => { if (started) resize(); });
  document.fonts?.ready.then(() => { if (started) draw(); });
}

// los datos de contacto pendientes no deben quedar como enlaces rotos
document.querySelectorAll('a[data-pendiente]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
