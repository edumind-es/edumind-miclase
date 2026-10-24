import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

import PuertaMigracion from './components/PuertaMigracion'
import BarreraErrores from './components/BarreraErrores'
import { asegurarContador } from './db/ids'
import { maxIdLocal } from './db/queries'

// Pedir almacenamiento persistente: evita que el navegador borre IndexedDB
// (datos de aula y evidencias fotográficas) si escasea el espacio
navigator.storage?.persist?.().catch(() => {})

// El contador de ids vive en localStorage, que se puede borrar sin que se
// borre IndexedDB. Si eso pasa, volvería a repartir ids que ya están en uso y
// las claves foráneas se cruzarían. Se recoloca antes de crear nada. Es la
// primera consulta a la base, así que espera a que la puerta de migración
// la deje abrir: abrirla antes dispararía el upgrade sin copia previa.
const recolocarIds = () => { maxIdLocal().then(asegurarContador).catch(() => {}) }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BarreraErrores>
      <BrowserRouter>
        <PuertaMigracion alAbrir={recolocarIds}>
          <App />
        </PuertaMigracion>
      </BrowserRouter>
    </BarreraErrores>
  </StrictMode>
)
