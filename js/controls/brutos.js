// brutos.js — Controles del Reporte de Brutos
import { showToast } from '../ui/toast.js';
import { diffStats } from './semaforo.js';
//
// Modo 1 — "Controlar": cruza SAL_BASE y A_CTA_FUT_AUMEN del Reporte de Brutos
//   contra las columnas configuradas en el Tabulado (tabSalBaseColumn / tabACuFutAumenColumn).
//
// Modo 2 — "Generar Reporte": genera el Reporte de Brutos directamente desde el
//   Tabulado, sin necesitar el archivo de Brutos. Usa las columnas configuradas
//   en el mapeo del Tabulado y exporta a .xlsx sin columnas de control ni colores.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeBrutos(results) {
  const s = results.summary;
  const hasDiff = s.conDifSalario > 0 || s.conDifACuFutAumen > 0;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    [
      { key: 'ctrlSalBase',     get: r => r.ctrlSalBase,     label: 'SAL_BASE' },
      { key: 'ctrlACuFutAumen', get: r => r.ctrlACuFutAumen, label: 'A_CTA_FUT_AUMEN' },
    ],
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );
  const concepts = [];
  if (s.conDifSalario > 0)     concepts.push('SAL_BASE');
  if (s.conDifACuFutAumen > 0) concepts.push('A_CTA_FUT_AUMEN');
  const contextNote = concepts.length === 0
    ? 'SAL_BASE y A_CTA_FUT_AUMEN verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    status:   hasDiff ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDifSalario > 0 ? 'warning' : 'success',
        label: 'diferencias SAL_BASE vs Tabulado',
        value: s.conDifSalario,
      },
      {
        type:  s.conDifACuFutAumen > 0 ? 'warning' : 'success',
        label: 'diferencias A_CTA_FUT_AUMEN vs Tabulado',
        value: s.conDifACuFutAumen,
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

export function runBrutos(brutosRows, tabRows, mapping) {
  const bm = mapping.brutos;
  const tm = mapping.tab;

  // Columnas del Tabulado para los conceptos — configuradas por el usuario en el mapeo.
  // Fallback a '1003' / '1017' por compatibilidad con tabulados que usan código solo.
  const salBaseTabCol   = tm.tabSalBaseColumn    || null;
  const aCuFutAuTabCol  = tm.tabACuFutAumenColumn || null;

  // Índice del Tabulado: legajo → { valSal, valAcu }
  // Un legajo puede tener más de una liquidación en el mes (ej: baja después
  // de haber cobrado el mensual). Meta4 suma todas las liquidaciones del
  // legajo en el Reporte de Brutos real, así que consolidamos igual acá para
  // comparar contra el mismo total (en vez de quedarnos solo con la última).
  const tabGroups = groupTabRowsByLegajo(tabRows, tm.empleadoColumn);
  const tabByLegajo = new Map();
  for (const [id, group] of tabGroups) {
    const last   = group[group.length - 1];
    const valSal = sumTabColumn(group, salBaseTabCol, '1003');
    const valAcu = sumTabColumn(group, aCuFutAuTabCol, '1017');
    const nombre = tm.apellidoNombreColumn ? norm(last[tm.apellidoNombreColumn]) : '';
    tabByLegajo.set(id, { valSal, valAcu, nombre });
  }

  const rows = brutosRows.map(row => {
    const legajo      = norm(row[bm.legajoColumn]);
    const salBase     = toNum(row[bm.salBaseColumn]);
    const aCuFutAumen = toNum(row[bm.aCuFutAumenColumn]);
    const tab         = tabByLegajo.get(legajo) ?? { valSal: null, valAcu: null };

    const ctrlSalBase     = tab.valSal !== null && salBase !== null
      ? tab.valSal - salBase : null;
    const ctrlACuFutAumen = tab.valAcu !== null && aCuFutAumen !== null
      ? tab.valAcu - aCuFutAumen : null;

    return {
      legajo,
      nombre:       tab.nombre ?? '',
      salBase,
      aCuFutAumen,
      tabValSal:    tab.valSal,
      tabValAcu:    tab.valAcu,
      ctrlSalBase,
      ctrlACuFutAumen,
    };
  });

  const conDifSalario     = rows.filter(r => r.ctrlSalBase !== null     && Math.abs(r.ctrlSalBase)     > 0.01).length;
  const conDifACuFutAumen = rows.filter(r => r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01).length;
  const sinTabData        = rows.filter(r => r.tabValSal === null && r.tabValAcu === null).length;

  return {
    summary: { total: rows.length, conDifSalario, conDifACuFutAumen, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

export function renderBrutosResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const CYAN_BG   = 'rgba(0,172,212,0.10)';
  const CYAN_HDR  = 'rgba(0,172,212,0.22)';
  const LILAC_BG  = 'rgba(130,80,200,0.09)';
  const LILAC_HDR = 'rgba(130,80,200,0.20)';

  const fmt = v => v === null
    ? '—'
    : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const diffStyle = v =>
    (v !== null && Math.abs(v) > 0.01)
      ? 'color:var(--color-danger);font-weight:600;'
      : '';

  // Totales para el chip de resumen
  const sumSalBrutos = rows.reduce((s, r) => s + (r.salBase   ?? 0), 0);
  const sumSalTab    = rows.reduce((s, r) => s + (r.tabValSal ?? 0), 0);
  const diffSal      = sumSalTab - sumSalBrutos;
  const sumAcuBrutos = rows.reduce((s, r) => s + (r.aCuFutAumen ?? 0), 0);
  const sumAcuTab    = rows.reduce((s, r) => s + (r.tabValAcu  ?? 0), 0);
  const diffAcu      = sumAcuTab - sumAcuBrutos;
  const countDiff    = rows.filter(r =>
    (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01) ||
    (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01)
  ).length;

  const chipEl = document.createElement('div');
  chipEl.style.cssText = 'padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);margin:var(--sp-3) var(--sp-3) 0;display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:center;';
  chipEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:600;">SAL_BASE</span>
      <span style="font-size:var(--text-sm);">Brutos: <strong>${fmt(sumSalBrutos)}</strong> &middot; Tab: <strong>${fmt(sumSalTab)}</strong> &middot; Diff: <strong style="${Math.abs(diffSal) > 0.01 ? 'color:var(--color-danger);' : ''}">${fmt(diffSal)}</strong></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:600;">A_CTA_FUT_AUMEN</span>
      <span style="font-size:var(--text-sm);">Brutos: <strong>${fmt(sumAcuBrutos)}</strong> &middot; Tab: <strong>${fmt(sumAcuTab)}</strong> &middot; Diff: <strong style="${Math.abs(diffAcu) > 0.01 ? 'color:var(--color-danger);' : ''}">${fmt(diffAcu)}</strong></span>
    </div>
    <div style="margin-left:auto;font-size:var(--text-sm);">
      ${rows.length} registros &middot; ${countDiff > 0 ? `<span style="color:var(--color-danger);font-weight:600;">${countDiff} con diferencias</span>` : '<span style="color:var(--color-success);">&#10003; Sin diferencias</span>'}
    </div>
  `;

  // Botón exportar
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:var(--sp-3) var(--sp-3) 0;';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--primary btn--sm';
  exportBtn.textContent = '⬇ Exportar .xlsx';
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Generando…';
    try {
      await exportBrutosToXlsx(results);
    } catch (err) {
      showToast('Error al generar el archivo: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '⬇ Exportar .xlsx';
    }
  });
  toolbar.appendChild(exportBtn);

  // Tabla
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th rowspan="2">Legajo</th>
          <th rowspan="2">Nombre</th>
          <th colspan="2" style="text-align:center;background:${CYAN_HDR};">Salario Base</th>
          <th colspan="2" style="text-align:center;background:${LILAC_HDR};">A Cta Fut Aumen</th>
          <th colspan="3" style="text-align:center;">Valores Tabulado</th>
        </tr>
        <tr>
          <th style="background:${CYAN_HDR};">SAL_BASE</th>
          <th style="background:${CYAN_HDR};"><strong>CTRL SALARIO BASE</strong><br><small style="font-weight:400;">Tab − Brutos</small></th>
          <th style="background:${LILAC_HDR};">A_CTA_FUT_AUMEN</th>
          <th style="background:${LILAC_HDR};"><strong>CTRL A_CTA_FUT_AUMEN</strong><br><small style="font-weight:400;">Tab − Brutos</small></th>
          <th>Legajo</th>
          <th>SAL_BASE (Tab)</th>
          <th>A_CTA_FUT (Tab)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.legajo)}</td>
            <td style="font-size:var(--text-sm);">${esc(r.nombre)}</td>
            <td style="text-align:right;background:${CYAN_BG};">${fmt(r.salBase)}</td>
            <td style="text-align:right;background:${CYAN_BG};${diffStyle(r.ctrlSalBase)}">${fmt(r.ctrlSalBase)}</td>
            <td style="text-align:right;background:${LILAC_BG};">${fmt(r.aCuFutAumen)}</td>
            <td style="text-align:right;background:${LILAC_BG};${diffStyle(r.ctrlACuFutAumen)}">${fmt(r.ctrlACuFutAumen)}</td>
            <td>${esc(r.legajo)}</td>
            <td style="text-align:right;">${fmt(r.tabValSal)}</td>
            <td style="text-align:right;">${fmt(r.tabValAcu)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = '';
  container.appendChild(chipEl);
  container.appendChild(toolbar);
  container.appendChild(tableWrap);
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runBrutosReporte(_primaryRows, tabRows, mapping) {
  const tm     = mapping.tab;
  const period = mapping.period || '';

  // FECHA_INI y FECHA_FIN: primer y último día hábil del período
  const [year, month] = period.split('-').map(Number);
  const fecIniStr = (year && month) ? fmtDateAR(firstBusinessDay(year, month)) : '';
  const fecFinStr = (year && month) ? fmtDateAR(lastBusinessDay(year, month))  : '';

  // La columna de nombre puede ser combinada (apellidoNombreColumn) o
  // separada (tabNombreColumn + tabApellido1Column)
  const nombreCol   = tm.tabNombreColumn   || tm.apellidoNombreColumn || null;
  const apellido1Col = tm.tabApellido1Column || null;

  // Un legajo puede tener más de una liquidación en el mes (ej: baja después
  // de haber cobrado el mensual). Consolidamos por legajo: los importes se
  // suman (igual que hace Meta4 en el Reporte de Brutos real) y los datos de
  // referencia (nombre, fechas, puesto) se toman de la última liquidación.
  const tabGroups = groupTabRowsByLegajo(tabRows, tm.empleadoColumn);
  const rows = [...tabGroups.entries()].map(([legajo, group]) => {
    const last = group[group.length - 1];
    return {
      fecIni:      fecIniStr,
      fecFin:      fecFinStr,
      legajo,
      nombre:      nombreCol    ? norm(last[nombreCol])                      : null,
      apellido1:   apellido1Col ? norm(last[apellido1Col])                  : null,
      fecAlta:     tm.tabFecAltaColumn ? fmtDate(last[tm.tabFecAltaColumn]) : null,
      fecBaja:     tm.tabFecBajaColumn ? fmtDate(last[tm.tabFecBajaColumn]) : null,
      fecPago:     tm.tabFecPagoColumn ? fmtDate(last[tm.tabFecPagoColumn]) : null,
      salBase:     sumTabColumn(group, tm.tabSalBaseColumn,     null),
      aCuFutAumen: sumTabColumn(group, tm.tabACuFutAumenColumn, null),
      puesto:      tm.puestoColumn ? norm(last[tm.puestoColumn]) : null,
    };
  });

  return {
    summary: { total: rows.length },
    rows,
    period,
    cols: {
      hasNombre:    !!nombreCol,
      hasApellido1: !!apellido1Col,
      hasFecAlta:   !!tm.tabFecAltaColumn,
      hasFecBaja:   !!tm.tabFecBajaColumn,
      hasFecPago:   !!tm.tabFecPagoColumn,
      hasSalBase:   !!tm.tabSalBaseColumn,
      hasACuFut:    !!tm.tabACuFutAumenColumn,
      hasPuesto:    !!tm.puestoColumn,
    },
  };
}

export function summarizeBrutosReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte generado del Tabulado`,
    insights: [],
    // Genera el reporte desde el Tabulado — no hay una segunda fuente contra
    // la cual cruzar, así que no aplica un semáforo de diferencias.
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

export function renderBrutosReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const fmt    = v => v === null ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTxt = v => v === null ? '—' : esc(String(v));

  // Definición de columnas activas (orden idéntico al archivo de Brutos)
  const colDefs = [
    { label: 'FECHA_INI',                            key: 'fecIni',      type: 'txt' },
    { label: 'FECHA_FIN',                            key: 'fecFin',      type: 'txt' },
    { label: 'ID_EMPLEADO',                          key: 'legajo',      type: 'txt' },
    cols.hasNombre    && { label: 'NOMBRE',           key: 'nombre',      type: 'txt' },
    cols.hasApellido1 && { label: 'APELLIDO_1',       key: 'apellido1',   type: 'txt' },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',       key: 'fecAlta',     type: 'txt' },
    cols.hasFecBaja   && { label: 'FECHA_BAJA',       key: 'fecBaja',     type: 'txt' },
    cols.hasFecPago   && { label: 'FEC_PAGO',         key: 'fecPago',     type: 'txt' },
    cols.hasSalBase   && { label: 'SAL_BASE',         key: 'salBase',     type: 'num' },
    cols.hasACuFut    && { label: 'A_CTA_FUT_AUMEN',  key: 'aCuFutAumen', type: 'num' },
    cols.hasPuesto    && { label: 'N_PUESTO',         key: 'puesto',      type: 'txt' },
  ].filter(Boolean);

  // Botón exportar
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:var(--sp-3) var(--sp-3) 0;';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--primary btn--sm';
  exportBtn.textContent = '⬇ Exportar .xlsx';
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Generando…';
    try {
      await exportBrutosReporteToXlsx(results);
    } catch (err) {
      showToast('Error al generar el archivo: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '⬇ Exportar .xlsx';
    }
  });
  toolbar.appendChild(exportBtn);

  // Tabla
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          ${colDefs.map(c => `<th>${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            ${colDefs.map(c =>
              c.type === 'num'
                ? `<td style="text-align:right;">${fmt(r[c.key])}</td>`
                : `<td>${fmtTxt(r[c.key])}</td>`
            ).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  if (colDefs.length <= 1) {
    tableWrap.innerHTML = `
      <div class="alert alert--warning" style="margin:var(--sp-4);">
        ⚠ No hay columnas configuradas en el Tabulado para el Reporte de Brutos.<br>
        Volvé a cargar el Tabulado y completá los campos de la sección "Brutos".
      </div>
    `;
  }

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(tableWrap);
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

async function loadExcelJS() {
  if (!window.ExcelJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ExcelJS. Verificá la conexión a internet.'));
      document.head.appendChild(s);
    });
  }
}

async function exportBrutosToXlsx(results) {
  await loadExcelJS();
  const { rows, period } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');
  ws.columns = [
    { width: 12 }, { width: 28 }, { width: 18 }, { width: 22 },
    { width: 20 }, { width: 24 }, { width: 12 },
    { width: 18 }, { width: 18 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  const CYAN_HDR  = 'FFC7ECF6';
  const CYAN_BG   = 'FFE6F8FB';
  const LILAC_HDR = 'FFE6DCF4';
  const LILAC_BG  = 'FFF4EFFA';
  const GRAY_HDR  = 'FFE8E8E8';

  // Fila 1: grupos  (col A=Legajo, B=Nombre, C:D=Salario Base, E:F=ACFA, G:I=Tabulado)
  const r1 = ws.addRow(['Legajo', 'Apellido y Nombre', 'Salario Base', null, 'A Cta Fut Aumen', null, 'Valores Tabulado', null, null]);
  const r2 = ws.addRow(['', '', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'Legajo', 'SAL_BASE (Tab)', 'A_CTA_FUT (Tab)']);

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('C1:D1');
  ws.mergeCells('E1:F1');
  ws.mergeCells('G1:I1');
  r1.height = 22;
  r2.height = 20;

  const styleGrp = (cell, bg) => {
    cell.font = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  };
  styleGrp(r1.getCell(1), GRAY_HDR);
  styleGrp(r1.getCell(2), GRAY_HDR);
  styleGrp(r1.getCell(3), CYAN_HDR);
  styleGrp(r1.getCell(5), LILAC_HDR);
  styleGrp(r1.getCell(7), GRAY_HDR);

  const styleCol = (cell, bg, isBold = false) => {
    cell.font = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  };
  styleCol(r2.getCell(3), CYAN_HDR,  false);
  styleCol(r2.getCell(4), CYAN_HDR,  true);
  styleCol(r2.getCell(5), LILAC_HDR, false);
  styleCol(r2.getCell(6), LILAC_HDR, true);
  styleCol(r2.getCell(7), GRAY_HDR,  false);
  styleCol(r2.getCell(8), GRAY_HDR,  false);
  styleCol(r2.getCell(9), GRAY_HDR,  false);

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const dr = ws.addRow([r.legajo, r.nombre, r.salBase, r.ctrlSalBase, r.aCuFutAumen, r.ctrlACuFutAumen, r.legajo, r.tabValSal, r.tabValAcu]);
    dr.getCell(3).fill = solidFill(CYAN_BG);
    dr.getCell(4).fill = solidFill(CYAN_BG);
    dr.getCell(5).fill = solidFill(LILAC_BG);
    dr.getCell(6).fill = solidFill(LILAC_BG);
    for (const col of [3, 4, 5, 6, 8, 9]) {
      dr.getCell(col).numFmt    = numFmt;
      dr.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      dr.getCell(col).font      = { ...base };
    }
    if (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01)
      dr.getCell(4).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    if (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01)
      dr.getCell(6).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    dr.getCell(1).font = { ...base };
    dr.getCell(2).font = { ...base };
    dr.getCell(7).font = { ...base };
  }

  await downloadXlsx(wb, `Brutos_Control_${periodSuffix(period)}.xlsx`);
}

async function exportBrutosReporteToXlsx(results) {
  await loadExcelJS();
  const { rows, cols } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');

  // Columnas activas (orden idéntico al archivo de Brutos)
  const colDefs = [
    { label: 'FECHA_INI',                             key: 'fecIni',      type: 'txt', width: 14 },
    { label: 'FECHA_FIN',                             key: 'fecFin',      type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',        key: 'legajo',     type: 'txt', width: 12 },
    cols.hasNombre    && { label: 'NOMBRE',            key: 'nombre',      type: 'txt', width: 22 },
    cols.hasApellido1 && { label: 'APELLIDO_1',        key: 'apellido1',   type: 'txt', width: 22 },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',        key: 'fecAlta',     type: 'txt', width: 14 },
    cols.hasFecBaja   && { label: 'FECHA_BAJA',        key: 'fecBaja',     type: 'txt', width: 14 },
    cols.hasFecPago   && { label: 'FEC_PAGO',          key: 'fecPago',     type: 'txt', width: 14 },
    cols.hasSalBase   && { label: 'SAL_BASE',          key: 'salBase',     type: 'num', width: 18 },
    cols.hasACuFut    && { label: 'A_CTA_FUT_AUMEN',   key: 'aCuFutAumen', type: 'num', width: 20 },
    cols.hasPuesto    && { label: 'N_PUESTO',          key: 'puesto',      type: 'txt', width: 14 },
  ].filter(Boolean);

  ws.columns = colDefs.map(c => ({ width: c.width }));

  // Fila de encabezado
  const hdr = ws.addRow(colDefs.map(c => c.label));
  hdr.height = 20;
  hdr.eachCell(cell => {
    cell.font      = { name: 'Calibri', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const values = colDefs.map(c => r[c.key]);
    const dr = ws.addRow(values);
    colDefs.forEach((c, i) => {
      const cell = dr.getCell(i + 1);
      cell.font = { name: 'Calibri', size: 10 };
      if (c.type === 'num') {
        cell.numFmt    = numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle' };
      }
    });
  }

  await downloadXlsx(wb, `Brutos_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Agrupa las filas del Tabulado por legajo, preservando el orden de aparición
// (tanto de los legajos como de las liquidaciones dentro de cada uno).
function groupTabRowsByLegajo(tabRows, empleadoColumn) {
  const groups = new Map();
  for (const row of tabRows) {
    const id = norm(row[empleadoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

// Suma un mismo concepto a través de varias liquidaciones del mismo legajo.
// `col` es la columna configurada por el usuario; si no está configurada y se
// pasa `fallbackCode`, intenta leer esa columna por código (ej: '1003').
// Devuelve null si ninguna liquidación tiene datos (para distinguir de 0).
function sumTabColumn(rows, col, fallbackCode) {
  if (!col && !fallbackCode) return null;
  let total = null;
  for (const row of rows) {
    const v = col
      ? toNum(row[col])
      : (toNum(row[fallbackCode]) ?? toNum(row[Number(fallbackCode)]));
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

function fmtRaw(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Convierte un serial de fecha Excel (ej: 45734) a "D/M/YYYY".
// Si el valor no es un serial válido (ya viene como texto de fecha), lo devuelve tal cual.
function fmtDate(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  // Seriales razonables: > 1 (post 1900) y < 100000 (no es un importe)
  if (!isNaN(n) && n > 1 && n < 100000 && String(v).trim() !== '') {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  // Ya viene como string de fecha u otro formato — lo devuelve sin cambios
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

// Primer día hábil (lun–vie) del mes
function firstBusinessDay(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// Último día hábil (lun–vie) del mes
function lastBusinessDay(year, month) {
  const d = new Date(year, month, 0); // día 0 del mes siguiente = último del actual
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// Fecha como D/M/YYYY (formato usado en el archivo de Brutos)
function fmtDateAR(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

async function downloadXlsx(wb, fileName) {
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
