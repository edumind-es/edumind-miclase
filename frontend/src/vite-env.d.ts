/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Los tipos del cliente de Vite: declaran los `import` de CSS y de recursos,
// y `import.meta.env`. El proyecto vivía sin este fichero porque TypeScript 5
// no se quejaba de un `import './index.css'` sin declaración; TypeScript 7 sí
// (TS2882), y con razón: era una importación sin tipos que colaba por omisión.

// La versión de la app, puesta por Vite al compilar (vite.config.ts, `define`).
// Se usa solo desde src/version.ts.
declare const __VERSION__: string
