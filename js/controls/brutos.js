// brutos.js — Controles del Reporte de Brutos
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
  const tabByLegajo = new Map();
  for (const row of tabRows) {
    const id = norm(row[tm.empleadoColumn]);
    if (!id) continue;
    const valSal = salBaseTabCol
      ? toNum(row[salBaseTabCol])
      : (toNum(row['1003']) ?? toNum(row[1003]));
    const valAcu = aCuFutAuTabCol
      ? toNum(row[aCuFutAuTabCol])
      : (toNum(row['1017']) ?? toNum(row[1017]));
    tabByLegajo.set(id, { valSal, valAcu });
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
      alert('Error al generar el archivo: ' + err.message);
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

  const rows = tabRows
    .filter(row => !!norm(row[tm.empleadoColumn]))
    .map(row => ({
      fecIni:      fecIniStr,
      fecFin:      fecFinStr,
      legajo:      norm(row[tm.empleadoColumn]),
      nombre:      nombreCol    ? norm(row[nombreCol])                          : null,
      apellido1:   apellido1Col ? norm(row[apellido1Col])                      : null,
      fecAlta:     tm.tabFecAltaColumn ? fmtRaw(row[tm.tabFecAltaColumn])     : null,
      fecBaja:     tm.tabFecBajaColumn ? fmtRaw(row[tm.tabFecBajaColumn])     : null,
      fecPago:     tm.tabFecPagoColumn ? fmtRaw(row[tm.tabFecPagoColumn])     : null,
      salBase:     tm.tabSalBaseColumn     ? toNum(row[tm.tabSalBaseColumn])  : null,
      aCuFutAumen: tm.tabACuFutAumenColumn ? toNum(row[tm.tabACuFutAumenColumn]) : null,
      puesto:      tm.puestoColumn         ? norm(row[tm.puestoColumn])       : null,
    }));

  return {
    summary: { total: rows.length },
    rows,
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
      alert('Error al generar el archivo: ' + err.message);
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
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');
  ws.columns = [
    { width: 12 }, { width: 18 }, { width: 22 },
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

  // Fila 1: grupos
  const r1 = ws.addRow(['Legajo', 'Salario Base', null, 'A Cta Fut Aumen', null, 'Valores Tabulado', null, null]);
  const r2 = ws.addRow(['', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'Legajo', 'SAL_BASE (Tab)', 'A_CTA_FUT (Tab)']);

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:C1');
  ws.mergeCells('D1:E1');
  ws.mergeCells('F1:H1');
  r1.height = 22;
  r2.height = 20;

  const styleGrp = (cell, bg) => {
    cell.font = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  };
  styleGrp(r1.getCell(1), GRAY_HDR);
  styleGrp(r1.getCell(2), CYAN_HDR);
  styleGrp(r1.getCell(4), LILAC_HDR);
  styleGrp(r1.getCell(6), GRAY_HDR);

  const styleCol = (cell, bg, isBold = false) => {
    cell.font = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  };
  styleCol(r2.getCell(2), CYAN_HDR,  false);
  styleCol(r2.getCell(3), CYAN_HDR,  true);
  styleCol(r2.getCell(4), LILAC_HDR, false);
  styleCol(r2.getCell(5), LILAC_HDR, true);
  styleCol(r2.getCell(6), GRAY_HDR,  false);
  styleCol(r2.getCell(7), GRAY_HDR,  false);
  styleCol(r2.getCell(8), GRAY_HDR,  false);

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const dr = ws.addRow([r.legajo, r.salBase, r.ctrlSalBase, r.aCuFutAumen, r.ctrlACuFutAumen, r.legajo, r.tabValSal, r.tabValAcu]);
    dr.getCell(2).fill = solidFill(CYAN_BG);
    dr.getCell(3).fill = solidFill(CYAN_BG);
    dr.getCell(4).fill = solidFill(LILAC_BG);
    dr.getCell(5).fill = solidFill(LILAC_BG);
    for (const col of [2, 3, 4, 5, 7, 8]) {
      dr.getCell(col).numFmt    = numFmt;
      dr.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      dr.getCell(col).font      = { ...base };
    }
    if (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01)
      dr.getCell(3).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    if (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01)
      dr.getCell(5).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    dr.getCell(1).font = { ...base };
    dr.getCell(6).font = { ...base };
  }

  await downloadXlsx(wb, `Brutos_Control_${dateSuffix()}.xlsx`);
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

  await downloadXlsx(wb, `Brutos_Reporte_${dateSuffix()}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmtRaw(v) {
  if (v === null || v === undefined) return null;
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
