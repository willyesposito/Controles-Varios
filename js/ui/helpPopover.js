// helpPopover.js — Botón "?" con popover de ayuda, reutilizable y accesible.
//
// Se usa para la ayuda "cómo ejecutar un control" que aparece junto al título
// en el home, el wizard de ejecución y la pantalla de resultados (la misma
// explicación en las 3). El equipo es experto, así que la ayuda no estorba:
// vive detrás de un "?" y sólo se abre si la tocan.
//
// Accesibilidad: el botón es role de disparo con aria-haspopup="dialog" +
// aria-expanded/aria-controls sincronizados; el panel es role="dialog" con
// aria-label. Escape cierra y devuelve el foco al botón; click afuera cierra;
// sólo un popover abierto a la vez.

let idCounter = 0;

// Popovers abiertos (normalmente 0 o 1). Un solo set de listeners a nivel de
// módulo — no uno por instancia (si no, cada re-render dejaría listeners
// colgados apuntando a paneles ya desmontados).
const openPopovers = new Set();

function closeAllPopovers() {
  for (const inst of [...openPopovers]) inst.close();
}

document.addEventListener('click', closeAllPopovers);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || openPopovers.size === 0) return;
  const last = [...openPopovers].pop();
  closeAllPopovers();
  last?.focusButton();
});

// Contenido estándar: cómo ejecutar un control (el flujo de 3 pasos + la regla
// del semáforo, que es la lógica central del rediseño).
export const CONTROL_HELP = {
  label: 'Cómo ejecutar un control',
  bodyHtml: `
    <ol class="help-popover__steps">
      <li><strong>Elegí los controles</strong> que querés correr para este cliente.</li>
      <li><strong>Cargá los archivos</strong> que piden: el Tabulado y los reportes de Meta4. Se reconocen por la sigla en el nombre.</li>
      <li><strong>Ejecutá</strong> — al terminar ves el veredicto con un semáforo por control.</li>
    </ol>
    <p class="help-popover__note">
      Semáforo por % de legajos con diferencia:
      <b style="color:var(--ok-tx,#177A50);">verde</b> 0% ·
      <b style="color:var(--warn-tx,#9A5A0B);">amarillo</b> ≤2% ·
      <b style="color:var(--error-tx,#C0420F);">rojo</b> &gt;2%.
    </p>
  `,
};

/**
 * Monta un botón "?" con popover de ayuda dentro de `container`.
 *
 * @param {HTMLElement} container - se reemplaza su innerHTML
 * @param {object} opts
 * @param {string} opts.label     - título del panel (y aria-label del botón)
 * @param {string} opts.bodyHtml  - HTML del cuerpo del panel
 * @returns {{ close: () => void }}
 */
export function renderHelpPopover(container, { label, bodyHtml } = {}) {
  const id = `help-pop-${++idCounter}`;

  container.innerHTML = `
    <span class="help-popover">
      <button type="button" class="help-popover__btn" id="${id}-btn"
        aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}-panel"
        aria-label="${esc(label || 'Ayuda')}">?</button>
      <div class="help-popover__panel" id="${id}-panel" role="dialog"
        aria-label="${esc(label || 'Ayuda')}" hidden>
        ${label ? `<h4 class="help-popover__title">${esc(label)}</h4>` : ''}
        <div class="help-popover__body">${bodyHtml || ''}</div>
      </div>
    </span>
  `;

  const btn   = container.querySelector(`#${id}-btn`);
  const panel = container.querySelector(`#${id}-panel`);

  const inst = {
    close() {
      panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      openPopovers.delete(inst);
    },
    open() {
      closeAllPopovers(); // sólo un popover abierto a la vez
      panel.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      openPopovers.add(inst);
    },
    focusButton() { btn.focus(); },
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hasAttribute('hidden')) inst.open(); else inst.close();
  });
  // Clicks dentro del panel no lo cierran (sí el click-afuera global).
  panel.addEventListener('click', (e) => e.stopPropagation());

  return inst;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
