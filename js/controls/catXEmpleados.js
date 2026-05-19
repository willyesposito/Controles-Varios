// catXEmpleados.js — Lógica y render del Control 1: Catálogo × Empleados
//
// Qué valida:
//   1. Diferencias de cantidad: empleados activos en CAT vs empleados en Tabulado
//   2. Empleados activos en CAT que no aparecen en Tabulado (con ID, Apellido, Nombre)
//   3. Empleados en Tabulado que no aparecen en CAT activos
//   4. Discrepancias de campo (PUESTO, CC, DEPTO) en empleados coincidentes
//   5. Distribución por PUESTO: conteo de CUILs únicos en cada archivo
//   6. Distribución por CENTRO DE COSTO: ídem

/**
 * Ejecuta el control.
 *
 * @param {object[]} catActivos  - Filas de CAT ya filtradas (solo activos, F.BAJA vacía)
 * @param {object[]} tabRows     - Filas del Tabulado
 * @param {object}   mapping     - { cat: catMapping, tab: tabMapping }
 * @returns {object}             - { summary, missingInTab, missingInCat, fieldDiscrepancies, byPuesto, byCC }
 */
export function runCatXEmpleados(catActivos, tabRows, mapping) {
  const cm = mapping.cat;
  const tm = mapping.tab;

  // Indexar por ID de empleado (normalizado a string sin espacios)
  const catByEmp = new Map(catActivos.map(r => [norm(r[cm.idEmpColumn]), r]));
  const tabByEmp = new Map(tabRows.map(r => [norm(r[tm.empleadoColumn]), r]));

  // ── 1. Diferencias de empleados ────────────────────────────────────────────

  const missingInTab = [];
  for (const [id, r] of catByEmp) {
    if (!tabByEmp.has(id)) {
      missingInTab.push({
        id,
        apellido: norm(r[cm.apellidoColumn]),
        nombre:   norm(r[cm.nombreColumn]),
      });
    }
  }

  const missingInCat = [];
  for (const [id, r] of tabByEmp) {
    if (!catByEmp.has(id)) {
      missingInCat.push({
        id,
        apellidoNombre: norm(r[tm.apellidoNombreColumn]),
      });
    }
  }

  // ── 2. Discrepancias de campo en empleados que coinciden ───────────────────

  const fieldDiscrepancies = [];
  for (const [id, catRow] of catByEmp) {
    const tabRow = tabByEmp.get(id);
    if (!tabRow) continue;

    const diffs = [];

    if (cm.puestoColumn && tm.puestoColumn) {
      const catVal = norm(catRow[cm.puestoColumn]);
      const tabVal = norm(tabRow[tm.puestoColumn]);
      if (catVal !== tabVal) diffs.push({ field: 'PUESTO', cat: catVal, tab: tabVal });
    }

    if (cm.centroCostoColumn && tm.ccColumn) {
      const catVal = norm(catRow[cm.centroCostoColumn]);
      const tabVal = norm(tabRow[tm.ccColumn]);
      if (catVal !== tabVal) diffs.push({ field: 'CENTRO_COSTO', cat: catVal, tab: tabVal });
    }

    if (cm.departamentoColumn && tm.deptoColumn) {
      const catVal = norm(catRow[cm.departamentoColumn]);
      const tabVal = norm(tabRow[tm.deptoColumn]);
      if (catVal !== tabVal) diffs.push({ field: 'DEPTO', cat: catVal, tab: tabVal });
    }

    if (diffs.length) {
      const apellido = norm(catRow[cm.apellidoColumn]);
      const nombre   = norm(catRow[cm.nombreColumn]);
      fieldDiscrepancies.push({ id, apellido, nombre, diffs });
    }
  }

  // ── 3. Agregaciones por PUESTO y por CENTRO DE COSTO ──────────────────────

  const dedupeKeyCAT = cm.cuilColumn || cm.idEmpColumn;
  const dedupeKeyTAB = tm.cuilColumn || tm.empleadoColumn;

  const byPuesto = mergeAggregations(
    countDistinct(catActivos, cm.puestoColumn, dedupeKeyCAT),
    countDistinct(tabRows,    tm.puestoColumn, dedupeKeyTAB)
  );

  const byCC = mergeAggregations(
    countDistinct(catActivos, cm.centroCostoColumn, dedupeKeyCAT),
    countDistinct(tabRows,    tm.ccColumn,           dedupeKeyTAB)
  );

  return {
    summary: {
      catActivos:              catActivos.length,
      tabTotal:                tabRows.length,
      diff:                    catActivos.length - tabRows.length,
      missingInTabCount:       missingInTab.length,
      missingInCatCount:       missingInCat.length,
      fieldDiscrepancyCount:   fieldDiscrepancies.length,
    },
    missingInTab,
    missingInCat,
    fieldDiscrepancies,
    byPuesto,
    byCC,
  };
}

// ── Render de resultados ──────────────────────────────────────────────────────

/**
 * Renderiza los resultados del Control 1 dentro del contenedor indicado.
 *
 * @param {object}      results   - Salida de runCatXEmpleados
 * @param {HTMLElement} container
 */
export function renderCatXEmpleadosResults(results, container) {
  const { summary, missingInTab, missingInCat, fieldDiscrepancies, byPuesto, byCC } = results;
  const hasDiff = summary.missingInTabCount > 0
    || summary.missingInCatCount > 0
    || summary.fieldDiscrepancyCount > 0;

  const diffSign = summary.diff > 0 ? '+' : '';

  container.innerHTML = `
    <div class="alert ${hasDiff ? 'alert--warning' : 'alert--success'}" style="margin-bottom:var(--sp-5);">
      <div>
        <strong>CAT (activos):</strong> ${summary.catActivos} &nbsp;·&nbsp;
        <strong>Tabulado:</strong> ${summary.tabTotal} &nbsp;·&nbsp;
        <strong>Diferencia neta:</strong>
        <span style="color:${summary.diff !== 0 ? 'var(--color-danger)' : 'inherit'};font-weight:600;">
          ${diffSign}${summary.diff}
        </span>
        <br><br>
        ${hasDiff
          ? `⚠️ &nbsp;<strong>${summary.missingInTabCount}</strong> en CAT no en Tabulado &nbsp;·&nbsp;
               <strong>${summary.missingInCatCount}</strong> en Tabulado no en CAT &nbsp;·&nbsp;
               <strong>${summary.fieldDiscrepancyCount}</strong> con campos distintos`
          : '✅ Los empleados activos del CAT coinciden con el Tabulado.'
        }
      </div>
    </div>

    ${missingInTab.length ? `
      <h4 style="margin:var(--sp-5) 0 var(--sp-3);">
        Activos en CAT que NO están en Tabulado (${missingInTab.length})
      </h4>
      <div style="overflow-x:auto;margin-bottom:var(--sp-6);">
        <table class="data-table data-table--compact">
          <thead><tr><th>ID</th><th>Apellido</th><th>Nombre</th></tr></thead>
          <tbody>
            ${missingInTab.map(r => `
              <tr>
                <td>${esc(r.id)}</td>
                <td>${esc(r.apellido)}</td>
                <td>${esc(r.nombre)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${missingInCat.length ? `
      <h4 style="margin:var(--sp-5) 0 var(--sp-3);">
        En Tabulado que NO están en CAT activos (${missingInCat.length})
      </h4>
      <div style="overflow-x:auto;margin-bottom:var(--sp-6);">
        <table class="data-table data-table--compact">
          <thead><tr><th>ID</th><th>Nombre</th></tr></thead>
          <tbody>
            ${missingInCat.map(r => `
              <tr>
                <td>${esc(r.id)}</td>
                <td>${esc(r.apellidoNombre)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${fieldDiscrepancies.length ? `
      <h4 style="margin:var(--sp-5) 0 var(--sp-3);">
        Discrepancias de campo en empleados coincidentes (${fieldDiscrepancies.length})
      </h4>
      <div style="overflow-x:auto;margin-bottom:var(--sp-6);">
        <table class="data-table data-table--compact">
          <thead>
            <tr><th>ID</th><th>Empleado</th><th>Campo</th><th>Valor en CAT</th><th>Valor en Tabulado</th></tr>
          </thead>
          <tbody>
            ${fieldDiscrepancies.flatMap(e =>
              e.diffs.map(d => `
                <tr>
                  <td>${esc(e.id)}</td>
                  <td>${esc([e.apellido, e.nombre].filter(Boolean).join(', '))}</td>
                  <td><strong>${esc(d.field)}</strong></td>
                  <td>${esc(d.cat)}</td>
                  <td>${esc(d.tab)}</td>
                </tr>
              `)
            ).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <h4 style="margin:var(--sp-5) 0 var(--sp-3);">Distribución por Puesto</h4>
    <div style="overflow-x:auto;margin-bottom:var(--sp-6);">
      <table class="data-table data-table--compact">
        <thead>
          <tr><th>Puesto</th><th style="text-align:right;">CAT</th><th style="text-align:right;">Tabulado</th><th style="text-align:right;">Dif.</th></tr>
        </thead>
        <tbody>
          ${byPuesto.map(r => `
            <tr ${r.diff !== 0 ? 'style="background:var(--color-warning-bg);"' : ''}>
              <td>${esc(r.key)}</td>
              <td style="text-align:right;">${r.catCount}</td>
              <td style="text-align:right;">${r.tabCount}</td>
              <td style="text-align:right;font-weight:600;color:${r.diff !== 0 ? 'var(--color-danger)' : 'inherit'};">
                ${r.diff !== 0 ? (r.diff > 0 ? '+' : '') + r.diff : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <h4 style="margin:var(--sp-5) 0 var(--sp-3);">Distribución por Centro de Costo</h4>
    <div style="overflow-x:auto;margin-bottom:var(--sp-6);">
      <table class="data-table data-table--compact">
        <thead>
          <tr><th>Centro de Costo</th><th style="text-align:right;">CAT</th><th style="text-align:right;">Tabulado</th><th style="text-align:right;">Dif.</th></tr>
        </thead>
        <tbody>
          ${byCC.map(r => `
            <tr ${r.diff !== 0 ? 'style="background:var(--color-warning-bg);"' : ''}>
              <td>${esc(r.key)}</td>
              <td style="text-align:right;">${r.catCount}</td>
              <td style="text-align:right;">${r.tabCount}</td>
              <td style="text-align:right;font-weight:600;color:${r.diff !== 0 ? 'var(--color-danger)' : 'inherit'};">
                ${r.diff !== 0 ? (r.diff > 0 ? '+' : '') + r.diff : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Agrupa filas por groupCol, contando valores únicos de dedupeCol */
function countDistinct(rows, groupCol, dedupeCol) {
  const map = new Map();
  if (!groupCol || !dedupeCol) return map;
  for (const r of rows) {
    const key = norm(r[groupCol]) || '(sin valor)';
    if (!map.has(key)) map.set(key, new Set());
    const val = norm(r[dedupeCol]);
    if (val) map.get(key).add(val);
  }
  return new Map([...map.entries()].map(([k, s]) => [k, s.size]));
}

/** Fusiona dos Maps en un array { key, catCount, tabCount, diff } ordenado por key */
function mergeAggregations(catMap, tabMap) {
  const keys = new Set([...catMap.keys(), ...tabMap.keys()]);
  return [...keys].sort().map(key => ({
    key,
    catCount: catMap.get(key) ?? 0,
    tabCount: tabMap.get(key) ?? 0,
    diff:     (catMap.get(key) ?? 0) - (tabMap.get(key) ?? 0),
  }));
}

function norm(v) { return v != null ? String(v).trim() : ''; }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
