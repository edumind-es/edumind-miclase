# AulaMap dentro de EDUmind MiClase

Esta carpeta es una copia de **AulaMap**, la aplicación para dibujar el plano
del aula y repartir en él al alumnado, de **Juan José de Haro (jjdeharo)**.

- Web: <https://aulamap.github.io>
- Código original: <https://github.com/aulamap/aulamap.github.io>
- Copia tomada del commit `84f3d4a0f09105a73b7ec26b24f846a8a31660a1` (17/09/2026)
- © 2026 Juan José de Haro — <https://bilateria.org>

## Licencia

El código de esta carpeta está bajo la **GNU Affero General Public License v3**
(texto completo en [`LICENSE`](LICENSE)), y los contenidos de AulaMap bajo
**CC BY-SA 4.0**, como el original. **Esta carpeta NO se acoge a la EUPL-1.2**
que MiClase ofrece como alternativa para el resto de su código: va solo bajo
AGPL v3.

Juan José de Haro autorizó a Luis Vilela, el 8 de noviembre de 2026, a
integrar AulaMap en MiClase con dos condiciones: que esta parte mantenga la
licencia AGPL y que AulaMap aparezca en los créditos con su enlace
(<https://aulamap.github.io>). La cita va a la vista dentro del propio plano
de clase de MiClase («Plano basado en AulaMap, de Juan José de Haro
(jjdeharo)»), además de en `NOTICE` y en el pie de AulaMap, que se conserva.

## Qué se ha cambiado (para MiClase, 08/11/2026)

AGPL v3, sección 5: estos son los cambios respecto al original.

1. **`app.js`**: dos ganchos. `loadState()` toma el plano de
   `window.MiClasePuente` si existe, y `saveState()` lo guarda ahí en vez de
   en `localStorage`. Sin MiClase alrededor, AulaMap funciona igual que el
   original. Aviso de modificación al principio del fichero.
2. **`index.html`**: el script del tema, que iba dentro de la página, pasa
   a `tema-inicial.js` (la CSP de MiClase no deja ejecutar scripts en línea),
   y se cargan `miclase-puente.css` y `miclase-puente.js`.
3. **Ficheros nuevos**: `miclase-puente.js` (el puente con MiClase y el modo
   «vista», en el que tocar a un alumno abre su evaluación),
   `miclase-puente.css` (dentro de MiClase esconde lo que allí no tiene sentido:
   el selector de clases, exportar, importar, compartir y la edición de la
   lista del alumnado, que viene de MiClase), `tema-inicial.js` y este fichero.
4. **No se copian** `presentacion.html`, `locales/presentacion.js`, `img/` ni
   las capturas: MiClase no las usa.

El resto (`style.css`, `i18n.js`, `theme.js`, `team-engine.js`, `locales/`,
iconos) va tal cual. Para actualizar a una versión nueva de AulaMap: copiar
sus ficheros encima y volver a aplicar los puntos 1 y 2.

## Cómo encaja

MiClase abre `aulamap/index.html` en un iframe del mismo origen
(`frontend/src/components/PlanoClase.tsx`). La traducción entre un grupo de
MiClase y una clase de AulaMap vive en `frontend/src/db/planoAulaMap.ts`, y el
plano se guarda, sin nombres del alumnado, en el registro `planos` del grupo
(campo `aulamap`). Nada sale del aparato: no se carga ningún script de fuera y
AulaMap no llama a ningún servidor.
