// Puente entre AulaMap y EDUmind MiClase (añadido por MiClase, 2026-11-08).
// Forma parte de la copia de AulaMap y va bajo su misma licencia, AGPL v3.
//
// Cuando AulaMap se abre dentro de MiClase (un iframe del mismo origen), la
// ventana de MiClase deja en `window.MiClaseAulaMap` el plano del grupo y
// cómo guardarlo. Este fichero lo pone a mano de app.js como
// `window.MiClasePuente`, y app.js lo usa en vez de localStorage. Abierto
// suelto, sin MiClase alrededor, no hace nada y AulaMap funciona como siempre.
//
// En modo «vista» el plano no se edita: tocar a un alumno sentado le pide a
// MiClase que abra su evaluación rápida.
(function () {
  var anfitrion = null;
  try {
    if (window.parent !== window) anfitrion = window.parent.MiClaseAulaMap || null;
  } catch (e) {
    anfitrion = null; // otro origen: no es MiClase
  }
  if (!anfitrion) return;

  var modo = anfitrion.modo === 'vista' ? 'vista' : 'editar';
  document.documentElement.classList.add('miclase', 'miclase-' + modo);

  var copia = function (x) { return x == null ? null : JSON.parse(JSON.stringify(x)); };
  var ultima = null;

  window.MiClasePuente = {
    modo: modo,
    cargar: function () {
      ultima = copia(anfitrion.cargar());
      return copia(ultima);
    },
    guardar: function (clase) {
      ultima = copia(clase);
      anfitrion.guardar(copia(clase));
    },
  };

  if (modo !== 'vista') return;

  // Nada de arrastrar, girar ni borrar: el lienzo solo escucha el toque.
  var enLienzo = function (e) { return e.target && e.target.closest && e.target.closest('#canvas'); };
  var bloquear = function (e) { if (enLienzo(e)) { e.stopImmediatePropagation(); } };
  window.addEventListener('pointerdown', bloquear, true);
  window.addEventListener('dblclick', bloquear, true);
  window.addEventListener('contextmenu', function (e) {
    if (enLienzo(e)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener('keydown', function (e) { e.stopImmediatePropagation(); }, true);

  window.addEventListener('click', function (e) {
    if (!ultima || !enLienzo(e)) return;
    // El nombre se dibuja encima del puesto, fuera de su grupo: se busca el
    // puesto que hay bajo el dedo.
    var puesto = e.target.closest('[data-seat]');
    if (!puesto) {
      var todos = document.querySelectorAll('#room-svg [data-seat]');
      for (var i = 0; i < todos.length && !puesto; i++) {
        var r = todos[i].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) puesto = todos[i];
      }
    }
    if (!puesto) return;
    var obj = (ultima.objects || []).find(function (o) { return o.id === puesto.getAttribute('data-obj'); });
    var id = obj && obj.seats ? obj.seats[Number(puesto.getAttribute('data-seat'))] : null;
    if (id && typeof anfitrion.abrirAlumno === 'function') anfitrion.abrirAlumno(id);
  }, true);
})();
