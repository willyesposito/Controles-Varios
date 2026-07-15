// exportMenu.js — Dropdown "⬇ Exportar ▾" para el detalle de cualquier control:
// Excel (.xlsx), CSV y copiar al portapapeles. Reemplaza el botón suelto
// "⬇ Exportar .xlsx" que cada control repetía por separado.
//
// Reusa las clases .row-menu / .row-menu__panel / .row-menu__item que ya
// existen para el menú "⋯" de clientsList.js, pero con su propio listener de
// click-afuera-para-cerrar (no depende de que clientsList.js esté cargado).

import { showToast } from './toast.js';

// Un solo listener a nivel de módulo (no uno por cada renderExportMenu()) —
// si no, cada corrida vista en la sesión deja un listener de document
// colgado apuntando a un panel ya desmontado. Mismo patrón que clientsList.js.
function closeAllPanels() {
  document.querySelectorAll('.row-menu__panel').forEach(p => {
    p.setAttribute('hidden', '');
    p.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', closeAllPanels);

let idCounter = 0;

/**
 * @param {HTMLElement} container - se reemplaza su innerHTML con el dropdown
 * @param {object} handlers
 * @param {() => Promise<void>} [handlers.onExcel] - genera y descarga el .xlsx
 * @param {() => void}          [handlers.onCsv]   - genera y descarga el .csv
 * @param {() => Promise<void>|void} [handlers.onCopy] - copia al portapapeles
 */
export function renderExportMenu(container, { onExcel, onCsv, onCopy } = {}) {
  const id = `export-menu-${++idCounter}`;
  const items = [];
  if (onExcel) items.push({ key: 'excel', label: '📊 Exportar a Excel (.xlsx)', action: onExcel });
  if (onCsv)   items.push({ key: 'csv',   label: '📄 Exportar CSV',              action: onCsv });
  if (onCopy)  items.push({ key: 'copy',  label: '📋 Copiar tabla',              action: onCopy });
  if (items.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="row-menu">
      <button type="button" class="btn btn--primary btn--sm" id="${id}-btn" aria-haspopup="true" aria-expanded="false">⬇ Exportar ▾</button>
      <div class="row-menu__panel" id="${id}-panel" role="menu" hidden>
        ${items.map(i => `<button type="button" class="row-menu__item" role="menuitem" data-key="${i.key}">${i.label}</button>`).join('')}
      </div>
    </div>
  `;

  const btn   = container.querySelector(`#${id}-btn`);
  const panel = container.querySelector(`#${id}-panel`);

  function closePanel() {
    panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openPanel() {
    closeAllPanels(); // cierra cualquier otro dropdown de exportar abierto
    panel.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.hasAttribute('hidden')) openPanel(); else closePanel();
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });
  panel.addEventListener('click', e => e.stopPropagation());
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanel(); btn.focus(); }
  });

  for (const item of items) {
    panel.querySelector(`[data-key="${item.key}"]`).addEventListener('click', async () => {
      closePanel();
      if (item.key === 'excel') {
        // El export a Excel puede demorar (ExcelJS + workbook grande) — feedback en el botón.
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Generando…';
        try {
          await item.action();
        } catch (err) {
          showToast('Error al generar el archivo: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      } else {
        try {
          await item.action();
          if (item.key === 'copy') showToast('📋 Tabla copiada al portapapeles', 'success');
        } catch (err) {
          showToast('Error: ' + err.message, 'danger');
        }
      }
    });
  }
}
