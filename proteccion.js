// =============================================
// CLUB DEL ÁRBITRO CBiAB — Protección de contenido
// =============================================

(function () {

  // ── 1. Deshabilitar clic derecho ───────────
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });

  // ── 2. Deshabilitar teclas peligrosas ──────
  document.addEventListener('keydown', function (e) {
    const key  = e.key.toUpperCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+S, Ctrl+P, Ctrl+U (ver código fuente)
    if (ctrl && ['C','X','A','S','P','U'].includes(key)) {
      e.preventDefault(); return false;
    }

    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (DevTools)
    if (ctrl && e.shiftKey && ['I','J','C','K'].includes(key)) {
      e.preventDefault(); return false;
    }

    // F12 (DevTools), F5 no bloqueado (recarga normal ok)
    if (e.key === 'F12') {
      e.preventDefault(); return false;
    }

    // Ctrl+F (buscar en página)
    if (ctrl && key === 'F') {
      e.preventDefault(); return false;
    }
  });

  // ── 3. Deshabilitar copiar/cortar por evento ──
  document.addEventListener('copy',  function (e) { e.preventDefault(); });
  document.addEventListener('cut',   function (e) { e.preventDefault(); });

  // ── 4. Deshabilitar arrastrar texto ───────
  document.addEventListener('dragstart', function (e) { e.preventDefault(); });

  // ── 5. Deshabilitar selección de texto ────
  document.addEventListener('selectstart', function (e) { e.preventDefault(); });

  // ── 6. Deshabilitar impresión ─────────────
  window.addEventListener('beforeprint', function (e) {
    e.preventDefault();
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:1.2rem;color:#666">🔒 Contenido protegido — Club del Árbitro CBiAB</div>';
  });

  // ── 7. Detección de DevTools abiertos ─────
  let devtoolsAbiertos = false;
  const umbral = 160;

  setInterval(function () {
    const abierto = (
      window.outerWidth  - window.innerWidth  > umbral ||
      window.outerHeight - window.innerHeight > umbral
    );
    if (abierto && !devtoolsAbiertos) {
      devtoolsAbiertos = true;
      // Borramos el contenido visible si se abren las DevTools
      document.querySelectorAll('.question-text, .option-btn span:last-child, .review-item-q')
        .forEach(el => el.style.filter = 'blur(8px)');
    }
    if (!abierto && devtoolsAbiertos) {
      devtoolsAbiertos = false;
      document.querySelectorAll('.question-text, .option-btn span:last-child, .review-item-q')
        .forEach(el => el.style.filter = 'none');
    }
  }, 1000);

})();
