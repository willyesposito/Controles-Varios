// nr.js — Control No Remunerativos (Control NR)
import { diffStats } from './semaforo.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
//
// Modo 1 — "Controlar": cruza los 18 conceptos NR del Reporte de M4
//   contra las columnas configuradas en el Tabulado.
//
// Modo 2 — "Generar Reporte": genera el Reporte de NR directamente desde
//   el Tabulado. Layout: A(vacía) | B=ID_EMPLEADO | C=NOMBRE | D=APELLIDO_1
//   | E=FECHA_ALTA | F=FECHA_BAJA | G=FEC_PAGO | H=ID_CENTRO_TRAB
//   | I=ID_CATEGORIA | J-AA = 18 conceptos en orden.

// ── Definición de conceptos NR ────────────────────────────────────────────────
// Orden = orden de columnas en el XLSX de salida.
// tabKey = clave en tabExtraConfig | nrKey = clave en mapping del archivo NR
// group: 'indem' = Indemnizatorios (verde) | 'otros' = Otros NR (naranja)

const NR_CONCEPTS = [
  { key: 'reinHomeOfice',  label: 'REIN_HOME_OFICE',  tabKey: 'tabReinHomeOficeColumn',  nrKey: 'reinHomeOficeColumn',  group: 'otros' },
  { key: 'indemPreaviso',  label: 'INDEM_PREAVISO',   tabKey: 'tabIndemPreavisoColumn',  nrKey: 'indemPreavisoColumn',  group: 'indem' },
  { key: 'sacPreaviso',    label: 'SAC_PREAVISO',     tabKey: 'tabSacPreavisoColumn',    nrKey: 'sacPreavisoColumn',    group: 'indem' },
  { key: 'indemAntDesp',   label: 'INDEM_ANT_DESP',   tabKey: 'tabIndemAntDespColumn',   nrKey: 'indemAntDespColumn',   group: 'indem' },
  { key: 'indemAntFalle',  label: 'INDEM_ANT_FALLE',  tabKey: 'tabIndemAntFalleColumn',  nrKey: 'indemAntFalleColumn',  group: 'indem' },
  { key: 'indemInteg',     label: 'INDEM_INTEG',      tabKey: 'tabIndemIntegColumn',     nrKey: 'indemIntegColumn',     group: 'indem' },
  { key: 'sacIndemInteg',  label: 'SAC_INDEM_INTEG',  tabKey: 'tabSacIndemIntegColumn',  nrKey: 'sacIndemIntegColumn',  group: 'indem' },
  { key: 'indmMaternidad', label: 'INDM_MATERNIDAD',  tabKey: 'tabIndmMaternidadColumn', nrKey: 'indmMaternidadColumn', group: 'indem' },
  { key: 'vacNoGozadas',   label: 'VAC_NO_GOZADAS',   tabKey: 'tabVacNoGozadasColumn',   nrKey: 'vacNoGozadasColumn',   group: 'indem' },
  { key: 'vacNoGozSac',    label: 'VAC_NO_GOZ_SAC',   tabKey: 'tabVacNoGozSacColumn',    nrKey: 'vacNoGozSacColumn',    group: 'indem' },
  { key: 'gratVac',        label: 'GRAT_VAC',         tabKey: 'tabGratVacColumn',        nrKey: 'gratVacColumn',        group: 'indem' },
  { key: 'graVacnogSac',   label: 'GRA_VACNOG_SAC',   tabKey: 'tabGraVacnogSacColumn',   nrKey: 'graVacnogSacColumn',   group: 'indem' },
  { key: 'indemFuerMay',   label: 'INDEM_FUER_MAY',   tabKey: 'tabIndemFuerMayColumn',   nrKey: 'indemFuerMayColumn',   group: 'indem' },
  { key: 'indemEmbarazo',  label: 'INDEM_EMBARAZO',   tabKey: 'tabIndemEmbarazoColumn',  nrKey: 'indemEmbarazoColumn',  group: 'indem' },
  { key: 'gratExtraord',   label: 'GRAT_EXTRAORD',    tabKey: 'tabGratExtraordColumn',   nrKey: 'gratExtraordColumn',   group: 'otros' },
  { key: 'asigPas',        label: 'ASIG_PAS',         tabKey: 'tabAsigPasColumn',        nrKey: 'asigPasColumn',        group: 'otros' },
  { key: 'reintGuard',     label: 'REINT_GUARD',      tabKey: 'tabReintGuardColumn',     nrKey: 'reintGuardColumn',     group: 'otros' },
  { key: 'incrementoSt',   label: 'INCREMENTO_ST',    tabKey: 'tabIncrementoStColumn',   nrKey: 'incrementoStColumn',   group: 'otros' },
];

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeNr(results) {
  const s = results.summary;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    NR_CONCEPTS.map(c => ({ key: c.key, get: row => row.valores[c.key]?.ctrl ?? null, label: c.label })),
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );

  // Concepto NR más afectado (el que aparece en más legajos con diferencia) —
  // más útil acá que "el peor caso individual" porque hay 18 conceptos posibles.
  const conceptCounts = NR_CONCEPTS
    .map(c => ({ label: c.label, count: results.rows.filter(r => isDif(r.valores[c.key].ctrl)).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const contextNote = conceptCounts.length
    ? `concepto más afectado: ${conceptCounts[0].label}${conceptCounts.length > 1 ? ` (+${conceptCounts.length - 1} más)` : ''}`
    : '18 conceptos NR verificados';

  return {
    status:   s.conDif > 0 ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDif > 0 ? 'warning' : 'success',
        label: 'empleados con al menos una diferencia NR',
        value: s.conDif,
      },
    ],
    unit: 'legajo',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote,
  };
}

export function runNr(nrRows, tabRows, mapping) {
  const nm = mapping.nr;
  const tm = mapping.tab;

  // Un legajo puede tener varias liquidaciones (pagas) en el mismo mes, tanto
  // en el Tabulado como en el Reporte de NR (ej: mensual + baja). Meta4 informa
  // el total sumado, así que consolidamos ambos lados por legajo antes de
  // comparar — igual que en Brutos (ver groupRowsByLegajo/sumColumn).

  // Índice del Tabulado: legajo → { [conceptKey]: total sumado entre pagas }
  const tabByLegajo = new Map();
  for (const [id, group] of groupRowsByLegajo(tabRows, tm.empleadoColumn)) {
    const vals = {};
    for (const c of NR_CONCEPTS) {
      vals[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    tabByLegajo.set(id, vals);
  }

  // Reporte de NR: una fila por legajo, sumando sus liquidaciones.
  const rows = [...groupRowsByLegajo(nrRows, nm.legajoColumn).entries()].map(([legajo, group]) => {
    const tabVals = tabByLegajo.get(legajo) ?? null;

    const valores = {};
    for (const c of NR_CONCEPTS) {
      const nrVal  = sumColumn(group, nm[c.nrKey]);
      const tabVal = tabVals ? tabVals[c.key] : null;
      const ctrl   = (tabVal !== null && nrVal !== null) ? tabVal - nrVal : null;
      valores[c.key] = { nrVal, tabVal, ctrl };
    }

    return { legajo, valores, sinTabData: !tabVals };
  });

  const conDif     = rows.filter(r =>
    Object.values(r.valores).some(v => v.ctrl !== null && Math.abs(v.ctrl) > 0.01)
  ).length;
  const sinTabData = rows.filter(r => r.sinTabData).length;

  return {
    summary: { total: rows.length, conDif, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

// Agrupa filas por legajo, preservando el orden de aparición (de los legajos y
// de las liquidaciones dentro de cada uno). Espeja groupTabRowsByLegajo de brutos.js.
function groupRowsByLegajo(rows, legajoColumn) {
  const groups = new Map();
  for (const row of rows) {
    const id = norm(row[legajoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

// Suma un concepto a través de las liquidaciones de un legajo. Devuelve null si
// la columna no está mapeada o ninguna liquidación tiene dato (distinto de 0).
function sumColumn(group, col) {
  if (!col) return null;
  let total = null;
  for (const row of group) {
    const v = toNum(row[col]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

// Un empleado es "relevante" si tiene algún valor NR (Tab o reporte) distinto de cero.
// Filtra el ruido de legajos que no cobran ningún concepto no remunerativo.
function hasAnyNrValue(r) {
  return Object.values(r.valores).some(v =>
    (v.nrVal !== null && Math.abs(v.nrVal) > 0.01) || (v.tabVal !== null && Math.abs(v.tabVal) > 0.01)
  );
}

const fmtNum = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isDif = v => v !== null && Math.abs(v) > 0.01;

// Colores por grupo (compartidos entre tabla y export)
const INDEM_BG  = 'rgba(56,142,60,0.08)';
const INDEM_HDR = 'rgba(56,142,60,0.18)';
const OTROS_BG  = 'rgba(245,124,0,0.08)';
const OTROS_HDR = 'rgba(245,124,0,0.18)';

export function renderNrResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const rowHasDiff = r => NR_CONCEPTS.some(c => isDif(r.valores[c.key].ctrl));

  // Empleados con algún valor NR (los "evaluables"); dentro de ellos, los que tienen diferencia.
  const relevantRows = rows.filter(hasAnyNrValue);
  const diffRows     = relevantRows.filter(rowHasDiff);
  const okCount      = relevantRows.length - diffRows.length;
  const noNrCount    = rows.length - relevantRows.length;

  container.innerHTML = '';

  // ── Hero: sin diferencia vs con diferencia ────────────────────────────────
  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-5);padding:var(--sp-3) var(--sp-4);margin:var(--sp-3) var(--sp-3) 0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);';
  hero.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:var(--color-success);">${okCount}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">sin diferencia</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:${diffRows.length > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${diffRows.length}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">con diferencia</span>
    </div>
    <div style="margin-left:auto;font-size:var(--text-sm);color:var(--color-text-muted);text-align:right;">
      ${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores NR
      ${noNrCount > 0 ? `<br>${noNrCount} sin valores NR (no se muestran)` : ''}
    </div>
  `;
  container.appendChild(hero);

  // Si no hay ninguna diferencia, la tabla no aporta nada: mostramos el OK y salimos.
  if (diffRows.length === 0) {
    const ok = document.createElement('div');
    ok.style.cssText = 'display:flex;align-items:center;gap:var(--sp-2);margin:var(--sp-3);padding:var(--sp-4);border:1px solid var(--color-border);border-left:4px solid var(--color-success);border-radius:var(--radius-md);background:var(--color-surface);';
    ok.innerHTML = `
      <span style="font-size:var(--text-xl);color:var(--color-success);">✓</span>
      <span>Todos los empleados con valores NR coinciden con el Tabulado. No hay diferencias para revisar.</span>
    `;
    container.appendChild(ok);
    return;
  }

  const filteredResults = { ...results, rows: diffRows };

  // ── Toolbar: filtro por concepto + buscador (izquierda) + exportar (derecha) ─
  // Sólo listamos conceptos que efectivamente tienen alguna diferencia.
  const conceptsWithDiff = NR_CONCEPTS.filter(c => diffRows.some(r => isDif(r.valores[c.key].ctrl)));

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';

  const leftGroup = document.createElement('div');
  leftGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:flex-end;';

  const filterGroup = document.createElement('div');
  filterGroup.className = 'form-group';
  filterGroup.style.cssText = 'margin-bottom:0;min-width:240px;';
  filterGroup.innerHTML = `
    <label class="form-label" style="font-size:var(--text-sm);">Filtrar por concepto</label>
    <select class="form-select form-select--sm" data-nr-concept-filter>
      <option value="all">Todos los conceptos con diferencia (${conceptsWithDiff.length})</option>
      ${conceptsWithDiff.map(c =>
        `<option value="${esc(c.key)}">${esc(c.label)}</option>`
      ).join('')}
    </select>
  `;

  const searchEl = document.createElement('div');

  leftGroup.appendChild(filterGroup);
  leftGroup.appendChild(searchEl);

  const exportEl = document.createElement('div');

  toolbar.appendChild(leftGroup);
  toolbar.appendChild(exportEl);
  container.appendChild(toolbar);

  // Exportar siempre incluye TODOS los legajos con diferencia y los 18
  // conceptos completos (igual que exportNrToXlsx) — el filtro de concepto de
  // arriba sólo recorta lo que se ve en pantalla, no lo que se exporta.
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => diffRows.map(r => {
    const difs = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
    return [r.legajo, difs, ...NR_CONCEPTS.map(c => fmtNum(r.valores[c.key].ctrl))];
  });

  renderExportMenu(exportEl, {
    onExcel: () => exportNrToXlsx(filteredResults),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // ── Tabla (se re-renderiza al cambiar el filtro de concepto) ───────────────
  const cellBg = c => c.group === 'indem' ? INDEM_BG : OTROS_BG;
  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable(selectedKey) {
    // Filas: todas las que tienen diferencia, o sólo las que difieren en el concepto elegido.
    const shownRows = selectedKey === 'all'
      ? diffRows
      : diffRows.filter(r => isDif(r.valores[selectedKey].ctrl));

    // Columnas: sólo las que tienen diferencia (oculta las 0/vacías), o sólo la elegida.
    const shownConcepts = selectedKey === 'all'
      ? conceptsWithDiff
      : NR_CONCEPTS.filter(c => c.key === selectedKey);

    const hiddenCols = NR_CONCEPTS.length - shownConcepts.length;

    tableHost.style.overflowX = 'auto';
    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>Legajo</th>
            <th style="text-align:center;"># Difs</th>
            ${shownConcepts.map(c => {
              const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
              return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => {
            const difs = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
            return `
              <tr>
                <td>${esc(r.legajo)}</td>
                <td style="text-align:center;font-weight:700;color:var(--color-danger);">${difs}</td>
                ${shownConcepts.map(c => {
                  const v      = r.valores[c.key];
                  const hasDif = isDif(v.ctrl);
                  const style  = `text-align:right;background:${cellBg(c)};${hasDif ? 'color:var(--color-danger);font-weight:600;' : ''}`;
                  return `<td style="${style}">${fmtNum(v.ctrl)}</td>`;
                }).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shownRows.length} empleado${shownRows.length === 1 ? '' : 's'} con diferencia.
        Valores: Tab − NR (rojo = diferencia).
        ${hiddenCols > 0 ? `Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} sin diferencias.` : ''}
        Exportá el .xlsx para ver los valores originales de cada fuente.
      </p>
    `;

    // Paginación (tablas de cientos de legajos) + buscador por legajo — se
    // re-inicializan porque el <tbody> se recrea entero en cada filtro.
    const tbodyEl = tableHost.querySelector('tbody');
    const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
    initSearchCombobox(searchEl, {
      rows: shownRows,
      trEls: pagination.dataRows,
      getLabel: r => `${r.legajo}`,
      label: 'Buscar legajo',
      pagination,
    });
  }

  filterGroup.querySelector('[data-nr-concept-filter]')
    .addEventListener('change', (e) => renderTable(e.target.value));
  renderTable('all');
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runNrReporte(_primaryRows, tabRows, mapping) {
  const tm = mapping.tab;

  const nombreCol    = tm.tabNombreColumn    || null;
  const apellido1Col = tm.tabApellido1Column || null;

  // Consolidar por legajo: los importes de cada concepto se suman entre todas
  // las liquidaciones del mes; los datos de referencia (nombre, fechas) se
  // toman de la última liquidación (igual que runBrutosReporte).
  const rows = [...groupRowsByLegajo(tabRows, tm.empleadoColumn).entries()].map(([legajo, group]) => {
    const last = group[group.length - 1];
    const base = {
      legajo,
      nombre:       nombreCol    ? norm(last[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(last[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn     ? fmtDate(last[tm.tabFecAltaColumn])     : null,
      fecBaja:      tm.tabFecBajaColumn     ? fmtDate(last[tm.tabFecBajaColumn])     : null,
      fecPago:      tm.tabFecPagoColumn     ? fmtDate(last[tm.tabFecPagoColumn])     : null,
      idCentroTrab: tm.tabIdCentroTrabColumn ? norm(last[tm.tabIdCentroTrabColumn]) : null,
      idCategoria:  tm.tabIdCategoriaColumn  ? norm(last[tm.tabIdCategoriaColumn])  : null,
    };
    for (const c of NR_CONCEPTS) {
      base[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    return base;
  });

  return {
    summary: { total: rows.length },
    rows,
    period: mapping.period || '',
  };
}

export function summarizeNrReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte de NR generado del Tabulado`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

// En "Generar Reporte" cada fila trae los conceptos como r[c.key] (número o null).
function reporteRowHasValue(r) {
  return NR_CONCEPTS.some(c => r[c.key] !== null && Math.abs(r[c.key]) > 0.01);
}

export function renderNrReporteResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const fmtTxt = v => v === null ? '—' : esc(String(v));

  // Sólo empleados con algún valor NR distinto de cero.
  const relevantRows = rows.filter(reporteRowHasValue);
  const noNrCount    = rows.length - relevantRows.length;

  container.innerHTML = '';

  // ── Hero: cuántos empleados entran al reporte ─────────────────────────────
  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-5);padding:var(--sp-3) var(--sp-4);margin:var(--sp-3) var(--sp-3) 0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);';
  hero.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:var(--color-wordmark);">${relevantRows.length}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">empleado${relevantRows.length === 1 ? '' : 's'} con valores NR</span>
    </div>
    ${noNrCount > 0 ? `
      <div style="margin-left:auto;font-size:var(--text-sm);color:var(--color-text-muted);text-align:right;">
        ${noNrCount} sin valores NR (no se muestran)
      </div>` : ''}
  `;
  container.appendChild(hero);

  if (relevantRows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.style.padding = 'var(--sp-4)';
    empty.textContent = 'Ningún empleado tiene valores NR distintos de cero en este período.';
    container.appendChild(empty);
    return;
  }

  const filteredResults = { ...results, rows: relevantRows };

  // ── Toolbar: filtro por concepto + buscador (izquierda) + exportar (derecha) ─
  const conceptsWithValue = NR_CONCEPTS.filter(c =>
    relevantRows.some(r => r[c.key] !== null && Math.abs(r[c.key]) > 0.01)
  );

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';

  const leftGroup = document.createElement('div');
  leftGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:flex-end;';

  const filterGroup = document.createElement('div');
  filterGroup.className = 'form-group';
  filterGroup.style.cssText = 'margin-bottom:0;min-width:240px;';
  filterGroup.innerHTML = `
    <label class="form-label" style="font-size:var(--text-sm);">Filtrar por concepto</label>
    <select class="form-select form-select--sm" data-nr-concept-filter>
      <option value="all">Todos los conceptos con valor (${conceptsWithValue.length})</option>
      ${conceptsWithValue.map(c =>
        `<option value="${esc(c.key)}">${esc(c.label)}</option>`
      ).join('')}
    </select>
  `;

  const searchEl = document.createElement('div');

  leftGroup.appendChild(filterGroup);
  leftGroup.appendChild(searchEl);

  const exportEl = document.createElement('div');

  toolbar.appendChild(leftGroup);
  toolbar.appendChild(exportEl);
  container.appendChild(toolbar);

  // Exportar siempre incluye TODOS los empleados con valores NR y las 18
  // columnas de conceptos completas (igual que exportNrReporteToXlsx) — el
  // filtro de concepto de arriba sólo recorta lo que se ve en pantalla.
  const csvHeaders = ['ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'FECHA_ALTA', 'FECHA_BAJA', 'FEC_PAGO', 'ID_CENTRO_TRAB', 'ID_CATEGORIA', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => relevantRows.map(r => [
    r.legajo, r.nombre ?? '', r.apellido1 ?? '', r.fecAlta ?? '', r.fecBaja ?? '', r.fecPago ?? '', r.idCentroTrab ?? '', r.idCategoria ?? '',
    ...NR_CONCEPTS.map(c => fmtNum(r[c.key])),
  ]);

  renderExportMenu(exportEl, {
    onExcel: () => exportNrReporteToXlsx(filteredResults),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Reporte_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // ── Tabla (re-render al cambiar el filtro) ────────────────────────────────
  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable(selectedKey) {
    const shownRows = selectedKey === 'all'
      ? relevantRows
      : relevantRows.filter(r => r[selectedKey] !== null && Math.abs(r[selectedKey]) > 0.01);

    const shownConcepts = selectedKey === 'all'
      ? conceptsWithValue
      : NR_CONCEPTS.filter(c => c.key === selectedKey);

    const hiddenCols = NR_CONCEPTS.length - shownConcepts.length;

    tableHost.style.overflowX = 'auto';
    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>ID_EMPLEADO</th>
            <th>NOMBRE</th>
            <th>APELLIDO_1</th>
            <th>FECHA_ALTA</th>
            <th>FECHA_BAJA</th>
            <th>FEC_PAGO</th>
            <th>ID_CENTRO_TRAB</th>
            <th>ID_CATEGORIA</th>
            ${shownConcepts.map(c => {
              const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
              return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => `
            <tr>
              <td>${fmtTxt(r.legajo)}</td>
              <td>${fmtTxt(r.nombre)}</td>
              <td>${fmtTxt(r.apellido1)}</td>
              <td>${fmtTxt(r.fecAlta)}</td>
              <td>${fmtTxt(r.fecBaja)}</td>
              <td>${fmtTxt(r.fecPago)}</td>
              <td>${fmtTxt(r.idCentroTrab)}</td>
              <td>${fmtTxt(r.idCategoria)}</td>
              ${shownConcepts.map(c => {
                const bg = c.group === 'indem' ? INDEM_BG : OTROS_BG;
                return `<td style="text-align:right;background:${bg};">${fmtNum(r[c.key])}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shownRows.length} empleado${shownRows.length === 1 ? '' : 's'}.
        ${hiddenCols > 0 ? `Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} sin valores.` : ''}
        El .xlsx exportado incluye las 18 columnas de conceptos en el layout estándar.
      </p>
    `;

    // Paginación (tablas de cientos de legajos) + buscador por legajo/nombre —
    // se re-inicializan porque el <tbody> se recrea entero en cada filtro.
    const tbodyEl = tableHost.querySelector('tbody');
    const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
    initSearchCombobox(searchEl, {
      rows: shownRows,
      trEls: pagination.dataRows,
      getLabel: r => r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`,
      pagination,
    });
  }

  filterGroup.querySelector('[data-nr-concept-filter]')
    .addEventListener('change', (e) => renderTable(e.target.value));
  renderTable('all');
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

// XLSX "Controlar": Legajo + 18 columnas CTRL (Tab − NR), coloreadas por grupo
async function exportNrToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Control NR');

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  // ARGB: Indemnizatorios = verde suave, Otros NR = naranja suave
  const INDEM_HDR = 'FFD4EDDA';
  const INDEM_BG  = 'FFEAF5EE';
  const OTROS_HDR = 'FFFFE4CC';
  const OTROS_BG  = 'FFFFEFE0';
  const GRAY_HDR  = 'FFE8E8E8';

  const conceptHdr = c => c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
  const conceptBg  = c => c.group === 'indem' ? INDEM_BG  : OTROS_BG;

  ws.columns = [
    { width: 12 },  // Legajo
    { width: 10 },  // # Difs
    ...NR_CONCEPTS.map(() => ({ width: 16 })),
  ];

  // Fila de headers
  const hdrRow = ws.addRow(['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)]);
  hdrRow.height = 20;

  hdrRow.getCell(1).fill = solidFill(GRAY_HDR);
  hdrRow.getCell(2).fill = solidFill(GRAY_HDR);
  NR_CONCEPTS.forEach((c, i) => {
    const cell = hdrRow.getCell(i + 3);
    cell.fill      = solidFill(conceptHdr(c));
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });
  hdrRow.getCell(1).font = { ...bold };
  hdrRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  hdrRow.getCell(1).border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  hdrRow.getCell(2).font = { ...bold };
  hdrRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  hdrRow.getCell(2).border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const numFmt = '#,##0.00';
  const isDif  = v => v !== null && Math.abs(v) > 0.01;

  for (const r of rows) {
    const difs   = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
    const values = [r.legajo, difs || 0, ...NR_CONCEPTS.map(c => r.valores[c.key].ctrl)];
    const dr     = ws.addRow(values);

    dr.getCell(1).font = { ...base };
    dr.getCell(2).font = difs > 0 ? { ...bold, color: { argb: 'FFCC0000' } } : { ...base };
    dr.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

    NR_CONCEPTS.forEach((c, i) => {
      const cell  = dr.getCell(i + 3);
      const ctrl  = r.valores[c.key].ctrl;
      cell.fill   = solidFill(conceptBg(c));
      cell.numFmt = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (isDif(ctrl)) {
        cell.font = { ...bold, color: { argb: 'FFCC0000' } };
      } else {
        cell.font = { ...base };
      }
    });
  }

  await downloadWorkbook(wb, `NR_Control_${periodSuffix(results.period)}.xlsx`);
}

// XLSX "Generar Reporte": A(vacía) · B=ID_EMPLEADO · ... · I=ID_CATEGORIA · J-AA=18 conceptos
async function exportNrReporteToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte NR');

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  const INDEM_HDR = 'FFD4EDDA';
  const INDEM_BG  = 'FFEAF5EE';
  const OTROS_HDR = 'FFFFE4CC';
  const OTROS_BG  = 'FFFFEFE0';
  const GRAY_HDR  = 'FFE8E8E8';

  // A=empty, B-I = campos fijos, J-AA = conceptos
  ws.columns = [
    { width: 4  },   // A (vacía)
    { width: 12 },   // B ID_EMPLEADO
    { width: 22 },   // C NOMBRE
    { width: 22 },   // D APELLIDO_1
    { width: 14 },   // E FECHA_ALTA
    { width: 14 },   // F FECHA_BAJA
    { width: 14 },   // G FEC_PAGO
    { width: 16 },   // H ID_CENTRO_TRAB
    { width: 16 },   // I ID_CATEGORIA
    ...NR_CONCEPTS.map(() => ({ width: 16 })),  // J-AA
  ];

  const fixedLabels  = [null, 'ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'FECHA_ALTA', 'FECHA_BAJA', 'FEC_PAGO', 'ID_CENTRO_TRAB', 'ID_CATEGORIA'];
  const conceptLabels = NR_CONCEPTS.map(c => c.label);
  const hdrRow = ws.addRow([...fixedLabels, ...conceptLabels]);
  hdrRow.height = 20;

  // Headers fijos — gris
  fixedLabels.forEach((lbl, i) => {
    if (lbl === null) return;
    const cell = hdrRow.getCell(i + 1);
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = solidFill(GRAY_HDR);
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  // Headers conceptos — coloreados por grupo
  NR_CONCEPTS.forEach((c, i) => {
    const cell = hdrRow.getCell(fixedLabels.length + i + 1);  // +1 para 1-index
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill      = solidFill(c.group === 'indem' ? INDEM_HDR : OTROS_HDR);
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const values = [
      null,          // A vacía
      r.legajo,
      r.nombre,
      r.apellido1,
      r.fecAlta,
      r.fecBaja,
      r.fecPago,
      r.idCentroTrab,
      r.idCategoria,
      ...NR_CONCEPTS.map(c => r[c.key]),
    ];
    const dr = ws.addRow(values);

    // Campos fijos
    for (let i = 2; i <= fixedLabels.length; i++) {
      dr.getCell(i).font      = { ...base };
      dr.getCell(i).alignment = { vertical: 'middle' };
    }

    // Conceptos
    NR_CONCEPTS.forEach((c, i) => {
      const cell = dr.getCell(fixedLabels.length + i + 1);
      cell.font      = { ...base };
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill      = solidFill(c.group === 'indem' ? INDEM_BG : OTROS_BG);
    });
  }

  await downloadWorkbook(wb, `NR_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmtDate(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000 && String(v).trim() !== '') {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = period.split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}
