// catXEmpleados.js — Lógica y render del Control "EE x CATEG" (Empleados por Categoría)
//
// Valida:
//   1. Diferencias de cantidad: activos en CAT vs Tabulado
//   2. Activos en CAT que no están en Tabulado (con F. Alta)
//   3. Empleados en Tabulado que no están en CAT activos
//   4. Discrepancias de campo (PUESTO, CC, DEPTO) en empleados coincidentes
//   5. Distribución por PUESTO — con detalle de empleados cuando hay diferencia
//   6. Distribución por CC — ídem

/**
 * Resumen del control para la tarjeta colapsada en la pantalla de resultados.
 * Devuelve { status, headline, insights[] }.
 */
export function summarizeCatXEmpleados(results) {
  const s = results.summary;
  const hasDiff = s.missingInTabCount > 0
    || s.missingInCatCount > 0
    || s.fieldDiscrepancyCount > 0;
  const sign = s.diff > 0 ? '+' : '';
  return {
    status: hasDiff ? 'warning' : 'success',
    headline: `EE x CATEG activos: ${s.catActivos} · Tabulado: ${s.tabTotal} · Diferencia neta: ${sign}${s.diff}`,
    insights: [
      {
        type:  s.missingInTabCount > 0 ? 'warning' : 'success',
        label: 'En CAT, faltan en Tabulado',
        value: s.missingInTabCount,
      },
      {
        type:  s.missingInCatCount > 0 ? 'warning' : 'success',
        label: 'En Tabulado, faltan en CAT',
        value: s.missingInCatCount,
      },
      {
        type:  s.fieldDiscrepancyCount > 0 ? 'warning' : 'success',
        label: 'Discrepancias de campo',
        value: s.fieldDiscrepancyCount,
      },
    ],
  };
}

export function runCatXEmpleados(catActivos, tabRows, mapping) {
  const cm = mapping.cat;
  const tm = mapping.tab;

  const catByEmp = new Map(catActivos.map(r => [norm(r[cm.idEmpColumn]), r]));
  const tabByEmp = new Map(tabRows.map(r => [norm(r[tm.empleadoColumn]), r]));

  // ── 1. Empleados faltantes ─────────────────────────────────────────────────

  const missingInTab = [];
  for (const [id, r] of catByEmp) {
    if (!tabByEmp.has(id)) {
      missingInTab.push({
        id,
        apellido: norm(r[cm.apellidoColumn]),
        nombre:   norm(r[cm.nombreColumn]),
        fAlta:    cm.fAltaColumn ? fmtDate(r[cm.fAltaColumn]) : '',
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

  // ── 2. Discrepancias de campo en empleados coincidentes ────────────────────

  const fieldDiscrepancies = [];
  for (const [id, catRow] of catByEmp) {
    const tabRow = tabByEmp.get(id);
    if (!tabRow) continue;

    const diffs = [];
    if (cm.puestoColumn && tm.puestoColumn) {
      const cv = norm(catRow[cm.puestoColumn]), tv = norm(tabRow[tm.puestoColumn]);
      if (cv !== tv) diffs.push({ field: 'PUESTO', cat: cv, tab: tv });
    }
    if (cm.centroCostoColumn && tm.ccColumn) {
      const cv = norm(catRow[cm.centroCostoColumn]), tv = norm(tabRow[tm.ccColumn]);
      if (cv !== tv) diffs.push({ field: 'CENTRO_COSTO', cat: cv, tab: tv });
    }
    if (cm.departamentoColumn && tm.deptoColumn) {
      const cv = norm(catRow[cm.departamentoColumn]), tv = norm(tabRow[tm.deptoColumn]);
      if (cv !== tv) diffs.push({ field: 'DEPTO', cat: cv, tab: tv });
    }
    if (diffs.length) {
      fieldDiscrepancies.push({
        id,
        apellido: norm(catRow[cm.apellidoColumn]),
        nombre:   norm(catRow[cm.nombreColumn]),
        diffs,
      });
    }
  }

  // ── 3. Distribuciones con detalle de empleados por grupo ───────────────────

  const dedupeCAT = cm.cuilColumn || cm.idEmpColumn;
  const dedupeTAB = tm.cuilColumn || tm.empleadoColumn;

  const catDispFn = r => ({
    id:     norm(r[cm.idEmpColumn]),
    nombre: [norm(r[cm.apellidoColumn]), norm(r[cm.nombreColumn])].filter(Boolean).join(' '),
  });
  const tabDispFn = r => ({
    id:     norm(r[tm.empleadoColumn]),
    nombre: norm(r[tm.apellidoNombreColumn]) || norm(r[tm.empleadoColumn]),
  });

  const byPuesto = mergeAggregations(
    groupByKey(catActivos, cm.puestoColumn,      dedupeCAT, catDispFn),
    groupByKey(tabRows,    tm.puestoColumn,       dedupeTAB, tabDispFn)
  );

  const byCC = mergeAggregations(
    groupByKey(catActivos, cm.centroCostoColumn, dedupeCAT, catDispFn),
    groupByKey(tabRows,    tm.ccColumn,           dedupeTAB, tabDispFn)
  );

  return {
    summary: {
      catActivos:            catActivos.length,
      tabTotal:              tabRows.length,
      diff:                  catActivos.length - tabRows.length,
      missingInTabCount:     missingInTab.length,
      missingInCatCount:     missingInCat.length,
      fieldDiscrepancyCount: fieldDiscrepancies.length,
    },
    missingInTab,
    missingInCat,
    fieldDiscrepancies,
    byPuesto,
    byCC,
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderCatXEmpleadosResults(results, container) {
  const { missingInTab, missingInCat, fieldDiscrepancies, byPuesto, byCC } = results;
  const showFAlta = missingInTab.some(r => r.fAlta);

  const SUM_STYLE = [
    'cursor:pointer', 'list-style:none', 'display:flex', 'align-items:center',
    'gap:var(--sp-2)', 'padding:var(--sp-2) 0', 'font-weight:600',
    'color:var(--color-primary)', 'font-size:var(--text-base)',
    'border-bottom:1px solid var(--color-border)', 'margin-bottom:var(--sp-3)',
  ].join(';');

  // Envuelve contenido en un <details open> con título en el summary
  const section = (title, content) => `
    <div style="margin-bottom:var(--sp-6);">
      <details open>
        <summary style="${SUM_STYLE}">${esc(title)}</summary>
        ${content}
      </details>
    </div>
  `;

  // ── Secciones de cruces ────────────────────────────────────────────────────

  const missingInTabHtml = missingInTab.length === 0 ? '' : section(
    `Activos en CAT que NO están en Tabulado (${missingInTab.length})`,
    `<div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>ID</th><th>Apellido</th><th>Nombre</th>
            ${showFAlta ? '<th>F. Alta</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${missingInTab.map(r => `
            <tr>
              <td>${esc(r.id)}</td>
              <td>${esc(r.apellido)}</td>
              <td>${esc(r.nombre)}</td>
              ${showFAlta ? `<td>${esc(r.fAlta)}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`
  );

  const missingInCatHtml = missingInCat.length === 0 ? '' : section(
    `En Tabulado que NO están en CAT activos (${missingInCat.length})`,
    `<div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead><tr><th>ID</th><th>Nombre</th></tr></thead>
        <tbody>
          ${missingInCat.map(r => `
            <tr><td>${esc(r.id)}</td><td>${esc(r.apellidoNombre)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>`
  );

  const discrepanciesHtml = fieldDiscrepancies.length === 0 ? '' : section(
    `Discrepancias de campo en empleados coincidentes (${fieldDiscrepancies.length})`,
    `<div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr><th>ID</th><th>Empleado</th><th>Campo</th><th>Valor en CAT</th><th>Valor en Tabulado</th></tr>
        </thead>
        <tbody>
          ${fieldDiscrepancies.flatMap(e =>
            e.diffs.map(d => `
              <tr>
                <td>${esc(e.id)}</td>
                <td>${esc([e.apellido, e.nombre].filter(Boolean).join(' '))}</td>
                <td><strong>${esc(d.field)}</strong></td>
                <td>${esc(d.cat)}</td>
                <td>${esc(d.tab)}</td>
              </tr>
            `)
          ).join('')}
        </tbody>
      </table>
    </div>`
  );

  // ── Distribuciones con detalle de empleados en filas con diferencia ─────────

  const distRow = r => {
    if (r.diff === 0) {
      return `
        <tr>
          <td>${esc(r.key)}</td>
          <td style="text-align:right;">${r.catCount}</td>
          <td style="text-align:right;">${r.tabCount}</td>
          <td style="text-align:right;">—</td>
        </tr>
      `;
    }

    const sign       = r.diff > 0 ? '+' : '';
    const onlyCatHtml = r.onlyInCat.length === 0 ? '' : `
      <div style="margin-top:var(--sp-2);">
        <strong style="font-size:var(--text-sm);">Solo en CAT (${r.onlyInCat.length}):</strong>
        <table class="data-table data-table--compact" style="margin-top:var(--sp-1);">
          <thead><tr><th>ID</th><th>Empleado</th></tr></thead>
          <tbody>
            ${r.onlyInCat.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    const onlyTabHtml = r.onlyInTab.length === 0 ? '' : `
      <div style="margin-top:var(--sp-2);">
        <strong style="font-size:var(--text-sm);">Solo en Tabulado (${r.onlyInTab.length}):</strong>
        <table class="data-table data-table--compact" style="margin-top:var(--sp-1);">
          <thead><tr><th>ID</th><th>Empleado</th></tr></thead>
          <tbody>
            ${r.onlyInTab.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    return `
      <tr style="background:var(--color-warning-bg);">
        <td>
          <details>
            <summary style="cursor:pointer;">${esc(r.key)}</summary>
            <div style="padding:var(--sp-2) var(--sp-3) var(--sp-3);">
              ${onlyCatHtml}
              ${onlyTabHtml}
            </div>
          </details>
        </td>
        <td style="text-align:right;">${r.catCount}</td>
        <td style="text-align:right;">${r.tabCount}</td>
        <td style="text-align:right;font-weight:600;color:var(--color-danger);">${sign}${r.diff}</td>
      </tr>
    `;
  };

  const distTable = (rows, labelCol) => `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>${esc(labelCol)}</th>
            <th style="text-align:right;">CAT</th>
            <th style="text-align:right;">Tabulado</th>
            <th style="text-align:right;">Dif.</th>
          </tr>
        </thead>
        <tbody>${rows.map(distRow).join('')}</tbody>
      </table>
    </div>
  `;

  const puestoHtml = section(
    `Distribución por Puesto (${byPuesto.length} puestos)`,
    distTable(byPuesto, 'Puesto')
  );

  const ccHtml = section(
    `Distribución por Centro de Costo (${byCC.length} centros)`,
    distTable(byCC, 'Centro de Costo')
  );

  // ── Render final ───────────────────────────────────────────────────────────

  container.innerHTML = `
    ${missingInTabHtml}
    ${missingInCatHtml}
    ${discrepanciesHtml}
    ${puestoHtml}
    ${ccHtml}
  `;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Agrupa filas por groupCol, indexando por idCol → displayFn(row) */
function groupByKey(rows, groupCol, idCol, displayFn) {
  const map = new Map();
  if (!groupCol || !idCol) return map;
  for (const r of rows) {
    const key = norm(r[groupCol]) || '(sin valor)';
    if (!map.has(key)) map.set(key, new Map());
    const id = norm(r[idCol]);
    if (id) map.get(key).set(id, displayFn(r));
  }
  return map;
}

/** Fusiona dos Maps en array { key, catCount, tabCount, diff, onlyInCat, onlyInTab } */
function mergeAggregations(catGroupMap, tabGroupMap) {
  const keys = new Set([...catGroupMap.keys(), ...tabGroupMap.keys()]);
  return [...keys].sort().map(key => {
    const catMap = catGroupMap.get(key) ?? new Map();
    const tabMap = tabGroupMap.get(key) ?? new Map();
    const diff   = catMap.size - tabMap.size;
    const onlyInCat = diff !== 0
      ? [...catMap.entries()].filter(([id]) => !tabMap.has(id)).map(([, d]) => d)
      : [];
    const onlyInTab = diff !== 0
      ? [...tabMap.entries()].filter(([id]) => !catMap.has(id)).map(([, d]) => d)
      : [];
    return { key, catCount: catMap.size, tabCount: tabMap.size, diff, onlyInCat, onlyInTab };
  });
}

/** Formatea fechas: acepta serial de Excel (número) o string */
function fmtDate(val) {
  if (val == null || String(val).trim() === '') return '';
  if (typeof val === 'number' && val > 1000) {
    const d = new Date(Math.round((val - 25569) * 86400000));
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(val).trim();
}

function norm(v) { return v != null ? String(v).trim() : ''; }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
