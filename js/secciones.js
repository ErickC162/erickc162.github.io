// Animaciones de las secciones: aparición al hacer scroll, línea de tiempo que se llena
// y proyectos que avanzan de lado mientras se baja (solo en pantallas anchas).
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- aparición ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ---------- contadores: los números suben desde 0 al aparecer ---------- */
const counters = document.querySelectorAll('[data-count]');
const countIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    countIO.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, suffix = el.dataset.suffix || '';
    const delay = 150 + [...counters].indexOf(el) * 120;     // uno tras otro
    const dur = 1400, ease = (t) => 1 - Math.pow(1 - t, 4);   // arranca rápido y frena suave
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(end * ease(t)) + (t === 1 ? suffix : '');
        if (t < 1) requestAnimationFrame(step);
        else el.classList.add('is-done');
      };
      requestAnimationFrame(step);
    }, delay);
  }
}, { threshold: 0.6 });
if (!reduceMotion) counters.forEach((el) => { el.textContent = '0'; countIO.observe(el); });

/* ---------- tarjetas que giran (giro 3D con canto iluminado y brillo) ---------- */
const FLIP_TIME = 1050;
document.querySelectorAll('.project.flip').forEach((card) => {
  const front = card.querySelector('.flip-front');
  const media = front.querySelector('.flip-media');
  const back = card.querySelector('.flip-back');
  const openBtn = card.querySelector('.flip-open');
  const closeBtn = card.querySelector('.flip-close');
  const img = media.querySelector('img');
  if (img) media.style.setProperty('--bg-img', `url("${img.src}")`);   // URL absoluta: la variable se usa desde el CSS

  let timer = 0;
  function setFlipped(flip) {
    if (card.classList.contains('is-flipped') === flip) return;
    // reinicia la animación de despegue aunque se pulse a mitad de un giro
    card.classList.remove('is-turning');
    void card.offsetWidth;
    card.classList.add('is-turning');
    card.classList.toggle('is-flipped', flip);
    openBtn.setAttribute('aria-expanded', String(flip));
    back.inert = !flip;
    front.inert = flip;
    clearTimeout(timer);
    timer = setTimeout(() => card.classList.remove('is-turning'), FLIP_TIME);
    (flip ? closeBtn : openBtn).focus({ preventScroll: true });
  }
  openBtn.addEventListener('click', () => setFlipped(true));
  closeBtn.addEventListener('click', () => setFlipped(false));
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFlipped(false); });

});

/* ---------- línea de tiempo ---------- */
const timeline = document.getElementById('timeline');
const fill = document.getElementById('timelineFill');

/* ---------- proyectos horizontales ---------- */
const work = document.getElementById('proyectos');
const track = document.getElementById('workTrack');
const index = document.getElementById('workIndex');
const cards = [...track.querySelectorAll('.project')];
let distance = 0, horizontal = false;

function layout() {
  horizontal = innerWidth > 760 && !reduceMotion;
  if (!horizontal) { work.style.height = ''; track.style.transform = ''; return; }
  distance = Math.max(0, track.scrollWidth - innerWidth);
  // la sección mide lo que hay que recorrer de lado + una pantalla
  work.style.height = `${distance + innerHeight}px`;
}

const nav = document.querySelector('.nav');
// el menú marca en qué sección estás (la que cruza la mitad de la pantalla)
const navLinks = [...document.querySelectorAll('.links a')];
const navTargets = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
function markActive() {
  const mid = innerHeight * 0.5;
  let active = -1;
  navTargets.forEach((sec, i) => {
    if (!sec) return;
    const r = sec.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) active = i;
  });
  navLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
}
function onScroll() {
  const vh = innerHeight;
  nav.classList.toggle('is-scrolled', scrollY > vh * 0.6);
  markActive();
  // línea de tiempo: se llena a medida que la sección cruza el centro de la pantalla
  const r = timeline.getBoundingClientRect();
  const p = clamp((vh * 0.55 - r.top) / r.height, 0, 1);
  fill.style.transform = `scaleY(${p})`;

  if (horizontal) {
    const top = work.getBoundingClientRect().top;
    const prog = clamp(-top / (work.offsetHeight - vh), 0, 1);
    track.style.transform = `translate3d(${-prog * distance}px, 0, 0)`;
    const i = Math.min(cards.length, Math.floor(prog * cards.length) + 1);
    index.textContent = String(i).padStart(2, '0');
  }
}

let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { onScroll(); ticking = false; });
}, { passive: true });
addEventListener('resize', () => { layout(); onScroll(); });
document.fonts?.ready.then(() => { layout(); onScroll(); });
layout(); onScroll();

/* ---------- imágenes de proyectos: se piden todas un poco antes de llegar a la sección ----------
   (con carga diferida pura, las tarjetas del final del carrusel horizontal podían aparecer vacías) */
new IntersectionObserver((entries, obs) => {
  if (!entries[0].isIntersecting) return;
  document.querySelectorAll('#proyectos img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  obs.disconnect();
}, { rootMargin: '150% 0px' }).observe(document.getElementById('proyectos'));
