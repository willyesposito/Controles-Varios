// main.js — El portero de la app
//
// Este archivo hace tres cosas:
//   1. Verifica que las librerías externas (SheetJS y Dexie) cargaron bien
//   2. Configura el banner de privacidad
//   3. Escucha los cambios de URL (navegación) y muestra la pantalla correcta
//
// La navegación usa el "hash" de la URL (lo que viene después del #):
//   #/                      → lista de clientes
//   #/client/:id/groupers   → editor de agrupadores
//   #/wizard/:clientId      → wizard de validación
//   #/results/:sessionId    → pantalla de resultados

import { renderClientsList } from './ui/clientsList.js';
import { renderGrouperEditor } from './ui/grouperEditor.js';
import { renderWizard }        from './ui/wizard.js';
import { renderResultsView }   from './ui/resultsView.js';

const APP_VERSION = '1.0.0-alpha';
const root = document.getElementById('js-app-root');

// ── Toast (notificaciones flotantes) ──────────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

export function showToast(message, type = 'info', durationMs = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

// ── Banner de privacidad ──────────────────────────────────────────────────────
function setupPrivacyBanner() {
  const banner  = document.getElementById('js-privacy-banner');
  const closeBtn = document.getElementById('js-banner-close');
  if (!banner || !closeBtn) return;

  // Si el usuario ya cerró el banner en esta sesión de navegador, no lo mostramos
  if (sessionStorage.getItem('privacy-banner-dismissed')) {
    banner.style.display = 'none';
  }

  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    sessionStorage.setItem('privacy-banner-dismissed', '1');
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
// Cada vez que cambia el hash de la URL (ej: el usuario hace clic en un link),
// esta función decide qué pantalla mostrar.
async function handleRoute() {
  const hash  = window.location.hash || '#/';
  const parts = hash.replace('#/', '').split('/').filter(Boolean);

  updateHeaderNav(hash);

  try {
    if (parts.length === 0) {
      // #/ → lista de clientes
      await renderClientsList(root);
    } else if (parts[0] === 'client' && parts[2] === 'groupers') {
      // #/client/:id/groupers → editor de agrupadores
      await renderGrouperEditor(root, Number(parts[1]));
    } else if (parts[0] === 'wizard' && parts[1]) {
      // #/wizard/:clientId → wizard de validación
      await renderWizard(root, Number(parts[1]));
    } else if (parts[0] === 'results' && parts[1]) {
      // #/results/:sessionId → resultados
      await renderResultsView(root, Number(parts[1]));
    } else {
      // Ruta desconocida → volvemos al inicio
      window.location.hash = '#/';
    }
  } catch (err) {
    console.error('[main] Error al renderizar pantalla:', err);
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          ❌ Ocurrió un error inesperado: ${escHtml(err.message)}
          <br><br>
          <a href="#/">← Volver al inicio</a>
        </div>
      </div>
    `;
  }
}

// Muestra/oculta botones de navegación en el header según la pantalla actual
function updateHeaderNav(hash) {
  const nav = document.getElementById('js-header-nav');
  if (!nav) return;

  if (hash === '#/' || hash === '') {
    nav.innerHTML = ''; // en el inicio no hay navegación extra
  } else {
    nav.innerHTML = `<a href="#/" class="btn btn--ghost btn--sm">🏠 Inicio</a>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  console.log(`[Controles Nómina] v${APP_VERSION} — iniciando`);

  // Verificamos que las librerías CDN cargaron correctamente
  /* global XLSX, Dexie */
  if (typeof XLSX === 'undefined') {
    console.warn('[main] SheetJS no está disponible. El parsing de Excel no funcionará.');
    showToast('No se pudo cargar SheetJS. Verificá tu conexión a internet.', 'danger', 8000);
  }
  if (typeof Dexie === 'undefined') {
    console.error('[main] Dexie.js no está disponible. La base de datos no funcionará.');
    showToast('No se pudo cargar Dexie.js. Verificá tu conexión a internet.', 'danger', 8000);
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          ❌ <strong>La app no puede funcionar sin la librería de base de datos (Dexie.js).</strong><br>
          Verificá que tenés conexión a internet (se necesita para descargar las librerías la primera vez).
        </div>
      </div>
    `;
    return;
  }

  setupPrivacyBanner();

  // Escuchar cambios de URL (clicks en links con href="#/...")
  window.addEventListener('hashchange', handleRoute);

  // Renderizar la pantalla inicial
  await handleRoute();

  console.log('[Controles Nómina] Listo.');
}

// Arrancamos cuando el HTML termina de cargarse
document.addEventListener('DOMContentLoaded', init);

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
