(() => {
  const root = document.documentElement;
  const storageKey = 'portfolio-theme';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let changing = false;

  try {
    if (localStorage.getItem(storageKey) === 'light') root.dataset.theme = 'light';
  } catch {
    // El modo también funciona con el almacenamiento bloqueado.
  }

  document.addEventListener('readystatechange', () => {
    const button = document.querySelector('.theme-toggle');
    const themeColor = document.querySelector('meta[name="theme-color"]');

    function syncControl() {
      const light = root.dataset.theme === 'light';
      button.setAttribute('aria-pressed', String(light));
      button.title = light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
      const background = getComputedStyle(root).backgroundColor;
      if (background !== 'rgba(0, 0, 0, 0)') themeColor.content = background;
    }

    function applyTheme(theme) {
      root.dataset.theme = theme;
      syncControl();
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // Si no se puede guardar, se conserva la elección durante esta visita.
      }
    }

    // El velo también parte del botón en navegadores sin View Transitions.
    async function revealWithVeil(theme) {
      const veil = document.createElement('div');
      if (!veil.animate) {
        applyTheme(theme);
        return;
      }

      veil.className = 'theme-veil';
      veil.dataset.theme = theme;
      veil.setAttribute('aria-hidden', 'true');
      document.body.append(veil);

      try {
        const [reveal] = veil.getAnimations?.() ?? [];
        if (reveal) await reveal.finished;
        applyTheme(theme);
        await veil.animate({ opacity: [1, 0] }, { duration: 280, easing: 'ease-out', fill: 'forwards' }).finished;
      } finally {
        veil.remove();
      }
    }

    button.addEventListener('click', async () => {
      if (changing) return;
      const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      if (reducedMotion.matches) {
        applyTheme(theme);
        return;
      }

      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.style.setProperty('--theme-origin', `${x}px ${y}px`);
      root.style.setProperty('--theme-radius', `${Math.ceil(radius)}px`);
      changing = true;

      try {
        if (typeof document.startViewTransition === 'function') {
          await document.startViewTransition(() => applyTheme(theme)).finished;
        } else {
          await revealWithVeil(theme);
        }
      } catch {
        if (root.dataset.theme !== theme) applyTheme(theme);
      } finally {
        changing = false;
      }
    });

    syncControl();
    button.hidden = false;
  }, { once: true });
})();
