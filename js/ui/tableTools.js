// tableTools.js — Utilidades compartidas para tablas largas de resultados
// (una fila por legajo/CC, a veces cientos): paginación "Mostrar todas" +
// combobox accesible de búsqueda/filtro. Usado por la tabla principal de cada
// control (catXEmpleados, brutos, gsPers, nr, rendVsTabu, rendVsAsiento,
// rendXEe). Las tablas de resumen/distribución (pocas filas) no lo necesitan.
//
// Los dos convergen en la MISMA visibilidad de cada <tr>: paginación decide
// qué se ve "por longitud", el combobox decide qué se ve "por búsqueda", y
// applyVisibility() combina ambos criterios.

const PAGE_SIZE_DEFAULT = 50;

/**
 * Pagina un <tbody> ya renderizado con TODAS las filas: muestra las primeras
 * `pageSize` y agrega una fila "Mostrar todas (N más)" al final. No cambia el
 * HTML de cada <tr> ni pide los datos de nuevo — sólo oculta con `display:none`
 * las que exceden la página, hasta que se pide ver todas.
 *
 * @param {HTMLTableSectionElement} tbodyEl - el <tbody> con todas las filas ya insertadas
 * @param {object} [opts]
 * @param {number} [opts.pageSize=50]
 * @returns {{
 *   dataRows: HTMLTableRowElement[],
 *   setFilter: (matchSet: Set<HTMLTableRowElement>|null) => void,
 * }}
 */
export function initShowMorePagination(tbodyEl, { pageSize = PAGE_SIZE_DEFAULT } = {}) {
  const dataRows = [...tbodyEl.querySelectorAll(':scope > tr')];
  let expanded = dataRows.length <= pageSize;
  let filterSet = null; // null = sin búsqueda activa

  let moreRow = null;
  if (!expanded) {
    const nCols = dataRows[0]?.children.length || 1;
    moreRow = document.createElement('tr');
    moreRow.className = 'table-show-more-row';
    moreRow.innerHTML = `
      <td colspan="${nCols}" style="text-align:center;padding:var(--sp-3);">
        <button type="button" class="btn btn--ghost btn--sm js-show-more">
          Mostrar todas (${dataRows.length - pageSize} más)
        </button>
      </td>
    `;
    tbodyEl.appendChild(moreRow);
    moreRow.querySelector('.js-show-more').addEventListener('click', () => {
      expanded = true;
      applyVisibility();
    });
  }

  function applyVisibility() {
    dataRows.forEach((tr, i) => {
      const withinPage = expanded || i < pageSize;
      const matchesFilter = filterSet === null || filterSet.has(tr);
      tr.style.display = (withinPage && matchesFilter) ? '' : 'none';
    });
    if (moreRow) moreRow.style.display = (filterSet === null && !expanded) ? '' : 'none';
  }

  applyVisibility();

  return {
    dataRows,
    setFilter(matchSet) { filterSet = matchSet; applyVisibility(); },
  };
}

let comboIdCounter = 0;

/**
 * Combobox accesible (patrón WAI-ARIA "Combobox with Listbox Popup") para
 * buscar y filtrar filas de una tabla. Al elegir una opción, filtra el
 * <tbody> para mostrar sólo esa fila (coordinado con `pagination.setFilter`
 * si se pasa un resultado de initShowMorePagination).
 *
 * - role="combobox" en el <input>, role="listbox" en el popup, cada
 *   resultado con role="option".
 * - aria-expanded / aria-controls siempre sincronizados con el estado real.
 * - El foco del DOM nunca sale del <input> — la opción activa se comunica
 *   con aria-activedescendant, no moviendo el foco.
 * - Flechas ↑/↓ navegan, Enter selecciona, Escape cierra (o limpia si ya
 *   estaba cerrado y hay texto). Sin autofocus al montar.
 *
 * @param {HTMLElement} container - dónde montar el combobox (arriba de la tabla)
 * @param {object} opts
 * @param {any[]} opts.rows - los datos originales, en el MISMO orden que se usó para pintar las filas
 * @param {HTMLTableRowElement[]} opts.trEls - los <tr> ya en el DOM, mismo orden que `rows` (ej: pagination.dataRows)
 * @param {(row: any) => string} opts.getLabel - texto buscable/mostrado de una fila (ej: "847 — Pérez Juan")
 * @param {{ setFilter: (s: Set|null) => void }} [opts.pagination] - resultado de initShowMorePagination
 * @param {string} [opts.label='Buscar legajo o nombre']
 * @param {string} [opts.placeholder='Escribí para buscar…']
 */
export function initSearchCombobox(container, {
  rows, trEls, getLabel, pagination,
  label = 'Buscar legajo o nombre',
  placeholder = 'Escribí para buscar…',
} = {}) {
  const id = `combo-${++comboIdCounter}`;
  const items = rows.map((row, i) => ({ tr: trEls[i], text: getLabel(row) })).filter(it => it.tr);

  container.innerHTML = `
    <div class="table-search">
      <label class="table-search__label" for="${id}-input">${esc(label)}</label>
      <div class="table-search__control">
        <input
          type="text"
          id="${id}-input"
          class="table-search__input"
          role="combobox"
          aria-expanded="false"
          aria-controls="${id}-listbox"
          aria-autocomplete="list"
          autocomplete="off"
          placeholder="${esc(placeholder)}"
        >
        <button type="button" class="table-search__clear" id="${id}-clear" hidden aria-label="Limpiar búsqueda">✕</button>
      </div>
      <ul class="table-search__listbox" id="${id}-listbox" role="listbox" aria-label="${esc(label)}" hidden></ul>
      <p class="sr-only" id="${id}-status" role="status"></p>
    </div>
  `;

  const input    = container.querySelector(`#${id}-input`);
  const listbox  = container.querySelector(`#${id}-listbox`);
  const clearBtn = container.querySelector(`#${id}-clear`);
  const statusEl = container.querySelector(`#${id}-status`);

  let activeIndex = -1;
  let visibleOptions = [];

  function closeListbox() {
    listbox.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function renderOptions(query) {
    const q = query.trim().toLowerCase();
    if (q === '') { closeListbox(); listbox.innerHTML = ''; return; }

    visibleOptions = items.filter(it => it.text.toLowerCase().includes(q)).slice(0, 10);
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');

    if (visibleOptions.length === 0) {
      listbox.innerHTML = `<li class="table-search__empty" role="presentation">Sin resultados</li>`;
      listbox.removeAttribute('hidden');
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    listbox.innerHTML = visibleOptions.map((it, i) => `
      <li role="option" id="${id}-opt-${i}" class="table-search__option" data-index="${i}">${esc(it.text)}</li>
    `).join('');
    listbox.removeAttribute('hidden');
    input.setAttribute('aria-expanded', 'true');

    listbox.querySelectorAll('.table-search__option').forEach(optEl => {
      // mousedown (no click) para que dispare ANTES del blur del input al clickear.
      optEl.addEventListener('mousedown', e => {
        e.preventDefault();
        selectOption(Number(optEl.dataset.index));
      });
    });
  }

  function setActiveIndex(i) {
    activeIndex = i;
    listbox.querySelectorAll('.table-search__option').forEach((el, idx) => {
      el.classList.toggle('table-search__option--active', idx === i);
    });
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `${id}-opt-${i}`);
      listbox.querySelector(`#${id}-opt-${i}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function selectOption(i) {
    const opt = visibleOptions[i];
    if (!opt) return;
    input.value = opt.text;
    closeListbox();
    if (pagination) pagination.setFilter(new Set([opt.tr]));
    clearBtn.removeAttribute('hidden');
    statusEl.textContent = `Mostrando 1 resultado para "${opt.text}"`;
  }

  function clearFilter({ focusInput = false } = {}) {
    input.value = '';
    closeListbox();
    listbox.innerHTML = '';
    if (pagination) pagination.setFilter(null);
    clearBtn.setAttribute('hidden', '');
    statusEl.textContent = '';
    if (focusInput) input.focus();
  }

  input.addEventListener('input', () => {
    if (input.value.trim() === '') clearFilter();
    renderOptions(input.value);
  });

  input.addEventListener('keydown', e => {
    const isOpen = !listbox.hasAttribute('hidden');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { renderOptions(input.value); return; }
      if (visibleOptions.length) setActiveIndex(Math.min(activeIndex + 1, visibleOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && visibleOptions.length) setActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (!isOpen) return;
      if (activeIndex >= 0) { e.preventDefault(); selectOption(activeIndex); }
      else if (visibleOptions.length === 1) { e.preventDefault(); selectOption(0); }
    } else if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); closeListbox(); }
      else if (input.value) { e.preventDefault(); clearFilter({ focusInput: true }); }
    }
  });

  // Blur cierra el popup; el timeout deja que el mousedown de una opción se
  // procese primero (si no, el blur cerraría la lista antes del click).
  input.addEventListener('blur', () => setTimeout(closeListbox, 0));

  clearBtn.addEventListener('click', () => clearFilter({ focusInput: true }));

  // Sin autofocus al montar — el usuario decide cuándo buscar.
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
