// gsPers.js — Controles de Gastos Personales y Cochera (GS Pers)
import { diffStats } from './semaforo.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
//
// Modo 1 — "Controlar": cruza GTOS_PERSONALES y DTO_COCHERA del Reporte de GS Pers
//   contra las columnas configuradas en el Tabulado (tabGtosPersonalesColumn / tabDtoCocheraColumn).
//
// Modo 2 — "Generar Reporte": genera el Reporte de GS Pers directamente desde el
//   Tabulado, sin necesitar el archivo externo. Exporta a .xlsx sin colores de control.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeGsPers(results) {
  const s = results.summary;
  const hasDiff = s.conDifGtos > 0 || s.conDifDto > 0;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    [
      { key: 'ctrlGtos', get: r => r.ctrlGtos, label: 'GTOS_PERSONALES' },
      { key: 'ctrlDto',  get: r => r.ctrlDto,  label: 'DTO_COCHERA' },
    ],
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );
  const concepts = [];
  if (s.conDifGtos > 0) concepts.push('GTOS_PERSONALES');
  if (s.conDifDto > 0)  concepts.push('DTO_COCHERA');
  const contextNote = concepts.length === 0
    ? 'GTOS_PERSONALES y DTO_COCHERA verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    status:   hasDiff ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDifGtos > 0 ? 'warning' : 'success',
        label: 'diferencias GTOS_PERSONALES vs Tabulado',
        value: s.conDifGtos,
      },
      {
        type:  s.conDifDto > 0 ? 'warning' : 'success',
        label: 'diferencias DTO_COCHERA vs Tabulado',
        value: s.conDifDto,
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

export function runGsPers(gsRows, tabRows, mapping) {
  const gm = mapping.gs_pers;
  const tm = mapping.tab;

  const gtosTabCol = tm.tabGtosPersonalesColumn || null;
  const dtoTabCol  = tm.tabDtoCocheraColumn     || null;

  // Índice del Tabulado: legajo → { valGtos, valDto }
  const tabByLegajo = new Map();
  for (const row of tabRows) {
    const id = norm(row[tm.empleadoColumn]);
    if (!id) continue;
    const valGtos = gtosTabCol ? toNum(row[gtosTabCol]) : null;
    const valDto  = dtoTabCol  ? toNum(row[dtoTabCol])  : null;
    tabByLegajo.set(id, { valGtos, valDto });
  }

  const rows = gsRows.map(row => {
    const legajo = norm(row[gm.legajoColumn]);
    const gtos   = toNum(row[gm.gtosPersonalesColumn]);
    const dto    = toNum(row[gm.dtoCocheraColumn]);
    const tab    = tabByLegajo.get(legajo) ?? { valGtos: null, valDto: null };

    const ctrlGtos = tab.valGtos !== null && gtos !== null ? tab.valGtos - gtos : null;
    const ctrlDto  = tab.valDto  !== null && dto  !== null ? tab.valDto  - dto  : null;

    return {
      legajo,
      gtos,
      dto,
      tabValGtos: tab.valGtos,
      tabValDto:  tab.valDto,
      ctrlGtos,
      ctrlDto,
    };
  });

  const conDifGtos  = rows.filter(r => r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01).length;
  const conDifDto   = rows.filter(r => r.ctrlDto  !== null && Math.abs(r.ctrlDto)  > 0.01).length;
  const sinTabData  = rows.filter(r => r.tabValGtos === null && r.tabValDto === null).length;

  return {
    summary: { total: rows.length, conDifGtos, conDifDto, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

export function renderGsPersResults(results, container) {
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

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const searchEl = document.createElement('div');
  const exportEl = document.createElement('div');
  toolbar.appendChild(searchEl);
  toolbar.appendChild(exportEl);

  // Tabla
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th rowspan="2">Legajo</th>
          <th colspan="2" style="text-align:center;background:${CYAN_HDR};">GTOS_PERSONALES</th>
          <th colspan="2" style="text-align:center;background:${LILAC_HDR};">DTO_COCHERA</th>
          <th colspan="3" style="text-align:center;">Valores Tabulado</th>
        </tr>
        <tr>
          <th style="background:${CYAN_HDR};">GTOS_PERSONALES</th>
          <th style="background:${CYAN_HDR};"><strong>CTRL GTOS_PERSONALES</strong><br><small style="font-weight:400;">Tab − GS Pers</small></th>
          <th style="background:${LILAC_HDR};">DTO_COCHERA</th>
          <th style="background:${LILAC_HDR};"><strong>CTRL DTO_COCHERA</strong><br><small style="font-weight:400;">Tab − GS Pers</small></th>
          <th>Legajo</th>
          <th>GTOS_PERSONALES (Tab)</th>
          <th>DTO_COCHERA (Tab)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.legajo)}</td>
            <td style="text-align:right;background:${CYAN_BG};">${fmt(r.gtos)}</td>
            <td style="text-align:right;background:${CYAN_BG};${diffStyle(r.ctrlGtos)}">${fmt(r.ctrlGtos)}</td>
            <td style="text-align:right;background:${LILAC_BG};">${fmt(r.dto)}</td>
            <td style="text-align:right;background:${LILAC_BG};${diffStyle(r.ctrlDto)}">${fmt(r.ctrlDto)}</td>
            <td>${esc(r.legajo)}</td>
            <td style="text-align:right;">${fmt(r.tabValGtos)}</td>
            <td style="text-align:right;">${fmt(r.tabValDto)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(tableWrap);

  // Paginación (tablas de cientos de legajos) + buscador por legajo
  const tbodyEl = tableWrap.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  initSearchCombobox(searchEl, {
    rows,
    trEls: pagination.dataRows,
    getLabel: r => `${r.legajo}`,
    pagination,
  });

  const csvHeaders = ['Legajo', 'GTOS_PERSONALES', 'CTRL GTOS_PERSONALES', 'DTO_COCHERA', 'CTRL DTO_COCHERA', 'Legajo (Tab)', 'GTOS_PERSONALES (Tab)', 'DTO_COCHERA (Tab)'];
  const csvRows = () => rows.map(r => [r.legajo, fmt(r.gtos), fmt(r.ctrlGtos), fmt(r.dto), fmt(r.ctrlDto), r.legajo, fmt(r.tabValGtos), fmt(r.tabValDto)]);

  renderExportMenu(exportEl, {
    onExcel: () => exportGsPersToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runGsPersReporte(_primaryRows, tabRows, mapping) {
  const tm     = mapping.tab;
  const period = mapping.period || '';

  const [year, month] = period.split('-').map(Number);
  const fecIniStr = (year && month) ? fmtDateAR(firstBusinessDay(year, month)) : '';
  const fecFinStr = (year && month) ? fmtDateAR(lastBusinessDay(year, month))  : '';

  const nombreCol    = tm.tabNombreColumn   || tm.apellidoNombreColumn || null;
  const apellido1Col = tm.tabApellido1Column || null;
  const idCCCol      = tm.idCCColumn || null;
  const ccCol        = tm.ccColumn   || null;

  const rows = tabRows
    .filter(row => !!norm(row[tm.empleadoColumn]))
    .map(row => ({
      fecIni:       fecIniStr,
      fecFin:       fecFinStr,
      legajo:       norm(row[tm.empleadoColumn]),
      nombre:       nombreCol    ? norm(row[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(row[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn ? fmtDate(row[tm.tabFecAltaColumn]) : null,
      fecPago:      tm.tabFecPagoColumn ? fmtDate(row[tm.tabFecPagoColumn]) : null,
      idCC:         idCCCol ? norm(row[idCCCol]) : null,
      gtos:         tm.tabGtosPersonalesColumn ? toNum(row[tm.tabGtosPersonalesColumn]) : null,
      dto:          tm.tabDtoCocheraColumn     ? toNum(row[tm.tabDtoCocheraColumn])     : null,
      nCC:          ccCol ? norm(row[ccCol]) : null,
    }));

  return {
    summary: { total: rows.length },
    rows,
    period,
    cols: {
      hasNombre:    !!nombreCol,
      hasApellido1: !!apellido1Col,
      hasFecAlta:   !!tm.tabFecAltaColumn,
      hasFecPago:   !!tm.tabFecPagoColumn,
      hasIdCC:      !!idCCCol,
      hasGtos:      !!tm.tabGtosPersonalesColumn,
      hasDto:       !!tm.tabDtoCocheraColumn,
      hasNCC:       !!ccCol,
    },
  };
}

export function summarizeGsPersReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte de GS Pers generado del Tabulado`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

export function renderGsPersReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const fmt    = v => v === null ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTxt = v => v === null ? '—' : esc(String(v));

  const colDefs = [
    { label: 'FECHA_INI',         key: 'fecIni',    type: 'txt' },
    { label: 'FECHA_FIN',         key: 'fecFin',    type: 'txt' },
    { label: 'ID_EMPLEADO',       key: 'legajo',    type: 'txt' },
    cols.hasNombre    && { label: 'NOMBRE',         key: 'nombre',    type: 'txt' },
    cols.hasApellido1 && { label: 'APELLIDO_1',     key: 'apellido1', type: 'txt' },
    cols.hasFecPago   && { label: 'FEC_PAG',        key: 'fecPago',   type: 'txt' },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',     key: 'fecAlta',   type: 'txt' },
    cols.hasIdCC      && { label: 'ID_CENTRO_COSTO', key: 'idCC',     type: 'txt' },
    cols.hasGtos      && { label: 'GTOS_PERSONALES', key: 'gtos',     type: 'num' },
    cols.hasDto       && { label: 'DTO_COCHERA',     key: 'dto',      type: 'num' },
    cols.hasNCC       && { label: 'N_CENTRO_COSTO',  key: 'nCC',      type: 'txt' },
  ].filter(Boolean);

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const searchEl = document.createElement('div');
  const exportEl = document.createElement('div');
  toolbar.appendChild(searchEl);
  toolbar.appendChild(exportEl);

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

  if (colDefs.length <= 3) {
    tableWrap.innerHTML = `
      <div class="alert alert--warning" style="margin:var(--sp-4);">
        ⚠ No hay columnas configuradas en el Tabulado para el Reporte de GS Pers.<br>
        Volvé al paso de Controles y completá los campos de la sección "GS Pers".
      </div>
    `;
  }

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(tableWrap);

  if (colDefs.length <= 3) return; // sin tabla real, no hay nada que paginar/exportar

  const tbodyEl = tableWrap.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  const legajoKey  = colDefs.find(c => c.key === 'legajo') ? 'legajo' : colDefs[0].key;
  const nombreKey  = cols.hasNombre ? 'nombre' : (cols.hasApellido1 ? 'apellido1' : null);
  initSearchCombobox(searchEl, {
    rows,
    trEls: pagination.dataRows,
    getLabel: r => nombreKey ? `${r[legajoKey]} — ${r[nombreKey]}` : `${r[legajoKey]}`,
    pagination,
  });

  const csvHeaders = colDefs.map(c => c.label);
  const csvRows = () => rows.map(r => colDefs.map(c => c.type === 'num' ? fmt(r[c.key]) : (r[c.key] ?? '')));

  renderExportMenu(exportEl, {
    onExcel: () => exportGsPersReporteToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Reporte_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

async function exportGsPersToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Control GS Pers');
  ws.columns = [
    { width: 12 }, { width: 20 }, { width: 24 },
    { width: 18 }, { width: 22 }, { width: 12 },
    { width: 22 }, { width: 22 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  const CYAN_HDR  = 'FFC7ECF6';
  const CYAN_BG   = 'FFE6F8FB';
  const LILAC_HDR = 'FFE6DCF4';
  const LILAC_BG  = 'FFF4EFFA';
  const GRAY_HDR  = 'FFE8E8E8';

  const r1 = ws.addRow(['Legajo', 'GTOS_PERSONALES', null, 'DTO_COCHERA', null, 'Valores Tabulado', null, null]);
  const r2 = ws.addRow(['', 'GTOS_PERSONALES', 'CTRL GTOS_PERSONALES', 'DTO_COCHERA', 'CTRL DTO_COCHERA', 'Legajo', 'GTOS_PERS (Tab)', 'DTO_COCHERA (Tab)']);

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
    const dr = ws.addRow([r.legajo, r.gtos, r.ctrlGtos, r.dto, r.ctrlDto, r.legajo, r.tabValGtos, r.tabValDto]);
    dr.getCell(2).fill = solidFill(CYAN_BG);
    dr.getCell(3).fill = solidFill(CYAN_BG);
    dr.getCell(4).fill = solidFill(LILAC_BG);
    dr.getCell(5).fill = solidFill(LILAC_BG);
    for (const col of [2, 3, 4, 5, 7, 8]) {
      dr.getCell(col).numFmt    = numFmt;
      dr.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      dr.getCell(col).font      = { ...base };
    }
    if (r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01)
      dr.getCell(3).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    if (r.ctrlDto !== null && Math.abs(r.ctrlDto) > 0.01)
      dr.getCell(5).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    dr.getCell(1).font = { ...base };
    dr.getCell(6).font = { ...base };
  }

  await downloadWorkbook(wb, `GsPers_Control_${periodSuffix(results.period)}.xlsx`);
}

async function exportGsPersReporteToXlsx(results) {
  await loadExcelJS();
  const { rows, cols } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte GS Pers');

  const colDefs = [
    { label: 'FECHA_INI',          key: 'fecIni',    type: 'txt', width: 14 },
    { label: 'FECHA_FIN',          key: 'fecFin',    type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',        key: 'legajo',    type: 'txt', width: 12 },
    cols.hasNombre    && { label: 'NOMBRE',           key: 'nombre',    type: 'txt', width: 22 },
    cols.hasApellido1 && { label: 'APELLIDO_1',       key: 'apellido1', type: 'txt', width: 22 },
    cols.hasFecPago   && { label: 'FEC_PAG',          key: 'fecPago',   type: 'txt', width: 14 },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',       key: 'fecAlta',   type: 'txt', width: 14 },
    cols.hasIdCC      && { label: 'ID_CENTRO_COSTO',  key: 'idCC',      type: 'txt', width: 16 },
    cols.hasGtos      && { label: 'GTOS_PERSONALES',  key: 'gtos',      type: 'num', width: 18 },
    cols.hasDto       && { label: 'DTO_COCHERA',      key: 'dto',       type: 'num', width: 18 },
    cols.hasNCC       && { label: 'N_CENTRO_COSTO',   key: 'nCC',       type: 'txt', width: 22 },
  ].filter(Boolean);

  ws.columns = colDefs.map(c => ({ width: c.width }));

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

  await downloadWorkbook(wb, `GsPers_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Convierte un serial de fecha Excel a "D/M/YYYY".
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

function firstBusinessDay(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function lastBusinessDay(year, month) {
  const d = new Date(year, month, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function fmtDateAR(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
