// Aplica el tema guardado antes de pintar la página para evitar el
// destello claro al abrirla en modo oscuro. La lógica está en theme.js.
// Es el script que AulaMap lleva dentro de index.html, sacado a un fichero
// porque la CSP de MiClase no deja ejecutar scripts en línea
// (modificación MiClase, 2026-11-08).
(function () {
  try {
    var saved = localStorage.getItem('classe-theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {}
})();
