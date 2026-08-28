# Cómo colaborar en EDUmind MiClase

Gracias por querer echar una mano. Este proyecto lo mantiene un maestro en
activo, así que se agradece tanto el código como el "esto en mi aula no
funciona".

Todo el proyecto —código, comentarios, commits e issues— está **en español**.

---

## Se puede colaborar sin programar

Si eres docente, esto es probablemente lo más útil que puedes aportar:

- **Currículum de tu comunidad autónoma.** En [`curriculum/`](curriculum/) hay
  un fichero por CCAA. Faltan varias. Abre un issue y te cuento el formato.
- **Probarlo en aula real** y contar qué se rompe, qué no se entiende o qué
  falta. Un issue describiendo tu flujo de trabajo vale mucho.
- **Traducir** a gallego, catalán, euskera o valenciano.
- **Revisar los informes**: si el boletín o el acta no encajan con lo que te
  pide tu centro, dilo con una foto o un PDF de lo que sí necesitas.

## Montar el entorno

Requiere **Node 18 o superior** (el CI usa Node 22).

```bash
git clone https://github.com/edumind-es/edumind-miclase.git
cd edumind-miclase

npm install
(cd backend && npm install)
(cd frontend && npm install)

cp backend/.env.example backend/.env   # pon tu propio JWT_SECRET
npm run seed                            # carga el currículo en SQLite
./start-dev.sh                          # :3270 backend · :5173 frontend
```

Hay **tres `package.json`** (raíz, `backend/` y `frontend/`) y no hay
workspaces: se instalan uno a uno.

## Pruebas

```bash
npm test              # tanda completa (~3 min)
npm run test:rapido   # sin interfaz
```

Las pruebas de interfaz usan Playwright: `npx playwright install chromium`.

**Antes de abrir un PR, `npm test` tiene que pasar.** Hay un gancho de
`pre-push` en [`.githooks/`](.githooks/) que lo corre solo; para activarlo:

```bash
git config core.hooksPath .githooks
```

El mismo conjunto corre en GitHub Actions con cada push y cada PR.

## Flujo de trabajo

1. Haz un fork y una rama descriptiva: `git checkout -b arreglo-escaner-ipad`.
2. Commits **en español**, en imperativo y con prefijo de tipo:
   `fix(sincronizacion): no perder evidencias que no caben en un sobre`.
   Tipos en uso: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
3. Cambios **incrementales**. Un PR que reescribe medio módulo es muy difícil
   de revisar; mejor varios pequeños.
4. Abre el PR contra `main` explicando **qué problema de aula resuelve**.

## Invariantes que no se deben romper

Estas reglas no son estilo: saltárselas corrompe datos de docentes reales. La
lista completa y razonada está en [CLAUDE.md](CLAUDE.md). Las críticas:

- **Ids por rango de dispositivo** (`db/ids.ts`). Nunca uses el autoincremento
  de Dexie. Toda alta pasa por `nuevo()` en `queries.ts`. Sin esto, dos
  dispositivos que sincronizan se pisan las claves foráneas.
- **Borrado lógico.** Se marca `deleted_at`, no se borra la fila. Un borrado
  físico es invisible para el merge y reaparecería en el siguiente sync. Toda
  lectura filtra con `vivos()`.
- **Las notas se ponderan en `calculo.ts`**, nunca en las pantallas.
- **Cambiar la programación no borra calificaciones.**
- **Toda llamada al API pasa por `api()`** de `src/api.ts`. Una ruta relativa
  fija funciona en la web, pero en el contenedor nativo apunta al propio
  contenedor.
- **`sync.ts` no hace `fetch`.** Habla con el exterior por la interfaz
  `Transporte`; meter un `fetch` dentro rompería el enlace directo entre
  dispositivos, que no tiene servidor al que llamar.
- **Los topes de tamaño salen de `db/limites.ts`.** No inventes cifras en otro
  fichero: ya pasó y dejó seis topes incoherentes.
- **Los iconos se generan** con `scripts/generar_iconos.py`, no se editan.

## La línea roja: datos personales

**Ningún dato identificable del alumnado puede llegar al servidor en claro.**
Es la promesa central del proyecto y está documentada en
[PRIVACIDAD.md](PRIVACIDAD.md).

En la práctica, un PR **no se acepta** si:

- Añade un endpoint que reciba nombres, notas, fotos o cualquier dato de aula
  sin cifrar en el cliente.
- Manda datos de alumnado a analítica, telemetría o servicios de terceros.
- Imprime datos personales en logs del servidor.
- Pone nombres reales de alumnado en códigos QR, pruebas o capturas.

Si tu funcionalidad parece necesitar romper esto, abre un issue antes de
escribir código: casi siempre hay otra forma.

## Nada de secretos en el repositorio

No subas `.env`, claves, tokens ni bases de datos. `JWT_SECRET` y
`AUTHENTIK_CLIENT_SECRET` viven en el entorno del servicio, nunca en el código.
El backend aborta el arranque si detecta el valor de ejemplo publicado.

## Licencia de lo que aportas

Al enviar un PR aceptas que tu contribución se publique bajo la licencia doble
del proyecto, **AGPL-3.0-or-later** *o* **EUPL-1.2** (ver [LICENSE](LICENSE)).

La marca EDUmind® y sus logotipos no se ceden con el código: ver
[TRADEMARKS.md](TRADEMARKS.md).

## Dudas

Abre un [issue](https://github.com/edumind-es/edumind-miclase/issues). Si es
una idea grande, pregunta antes de invertir horas: puede que choque con algún
invariante o que ya esté en el [ROADMAP.md](ROADMAP.md).
