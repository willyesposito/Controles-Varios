// rendVsAsiento.js — Control 6: Rendimiento vs Asiento (Contabilidad Desglosada)
//
// Compara el Reporte de Rendimiento de M4 (por CC) contra la Contabilidad
// Desglosada (CONTA). Para cada CC, agrupa las filas de CONTA por categoría
// (clasificando ID_CONCEPTO con la misma config que el Control 5) y suma
// DEBE − HABER. El cruce se muestra como tabla por CC × categoría, con la
// columna CTRL = CONTA − Rend en rojo cuando hay diferencia.
//
// Archivos:
//   - Rendimiento (rend_file)        — obligatorio
//   - Contabilidad Desglosada (CONTA) — obligatorio
//   - CC x Empleado                   — opcional, sobrescribe CC_NOMBRE de CONTA
//     por el ID_CENTRO_COSTO/CENTRO_COSTO actualizado a partir de ID_EMPLEADO.

import { DEFAULT_CONCEPT_CONFIG } from './rendVsTabu.js';

// ── Definición de columnas comparadas (mismo orden que Control 5, sin RETIROS) ─

const COLS = [
  { key: 'precio',   label: 'PRECIO',          rKey: 'rPrecio',   cKey: 'cPrecio',   dKey: 'dPrecio',
    hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)',  xlHdr: 'FFCCE0F5', xlBg: 'FFF0F6FD' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  rKey: 'rEstimulo', cKey: 'cEstimulo', dKey: 'dEstimulo',
    hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)',   xlHdr: 'FFC9EDD8', xlBg: 'FFEDF9F2' },
  { key: 'cargas',   label: 'CARGAS SS',       rKey: 'rCargas',   cKey: 'cCargas',   dKey: 'dCargas',
    hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)',    xlHdr: 'FFF5CCCC', xlBg: 'FFFCEAEA' },
  { key: 'provMes',  label: 'PROV. MES',       rKey: 'rProvMes',  cKey: 'cProvMes',  dKey: 'dProvMes',
    hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)',  xlHdr: 'FFC7EDF9', xlBg: 'FFEAF7FD' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  rKey: 'rProvCcss', cKey: 'cProvCcss', dKey: 'dProvCcss',
    hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)',   xlHdr: 'FFCCDDED', xlBg: 'FFEAF2F8' },
  { key: 'total',    label: 'COSTO TOTAL',     rKey: 'rTotal',    cKey: 'cTotal',    dKey: 'dTotal',
    hdr: 'rgba(64,64,64,0.18)',   bg: 'rgba(64,64,64,0.07)',   xlHdr: 'FFDCDCDC', xlBg: 'FFF2F2F2' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normCCName(v) {
  // Normaliza para matching tolerante: trim + lower + espacios + sin acentos.
  // Necesario porque CONTA suele tener "ADMINISTRACION" y Rendimiento "Administración".
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacríticos
    .replace(/\s+/g, ' ')
    || null;
}

const fmt = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const THRESHOLD = 0.01;
const hasDiff   = d => d !== null && Math.abs(d) > THRESHOLD;
const diffStyle = d => hasDiff(d) ? 'color:var(--color-danger);font-weight:600;' : '';

// Construye índice: id_concepto → { catKey, sign }
function buildConceptIndex(conceptConfig) {
  const idx = {};
  for (const [catKey, entries] of Object.entries(conceptConfig)) {
    for (const e of entries) {
      idx[String(e.code).trim()] = { catKey, sign: e.sign };
    }
  }
  return idx;
}

// ── runRendVsAsiento ──────────────────────────────────────────────────────────

export function runRendVsAsiento(rendRows, _tabRows, mapping) {
  const rm        = mapping.rend || {};
  const contaRows = mapping.contaRows || [];
  const ccXEeRows = mapping.ccXEeRows || [];

  if (!rendRows?.length)   return { error: 'No hay datos del Reporte de Rendimiento.' };
  if (!contaRows?.length)  return { error: 'No hay datos de Contabilidad Desglosada (CONTA).' };

  const conceptConfig  = mapping.conceptGrouping || DEFAULT_CONCEPT_CONFIG;
  const conceptByCode  = buildConceptIndex(conceptConfig);

  // Mapa de override por ID_EMPLEADO → CENTRO_COSTO (si CC x Empleado fue cargado)
  const ccOverride = new Map();
  for (const r of ccXEeRows) {
    const emp = norm(r.id_empleado);
    const cc  = norm(r.centro_costo);
    if (emp && cc) ccOverride.set(emp, cc);
  }
  const hasOverride = ccOverride.size > 0;

  // ── Agrupar CONTA por CC × categoría ──────────────────────────────────────
  // Para cada fila: clasificar por id_concepto, sumar (debe - haber) * sign
  const contaGroups = new Map();  // nameKey → bucket
  let descartadasSinConcepto = 0;

  for (const row of contaRows) {
    // Resolver CC: override por ID_EMPLEADO tiene prioridad si CC x EE fue cargado
    const empleado = norm(row.id_empleado);
    const ccRaw    = hasOverride && empleado && ccOverride.has(empleado)
      ? ccOverride.get(empleado)
      : norm(row.cc_nombre);
    if (!ccRaw) continue;

    const nameKey = normCCName(ccRaw);
    if (!nameKey) continue;

    const cat = conceptByCode[String(row.id_concepto).trim()];
    if (!cat) { descartadasSinConcepto++; continue; }

    if (!contaGroups.has(nameKey)) {
      contaGroups.set(nameKey, {
        ccLabel: ccRaw,  // primer label visto para mostrar en la tabla
        precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0,
      });
    }
    const g = contaGroups.get(nameKey);
    const valor = (toNum(row.debe) ?? 0) - (toNum(row.haber) ?? 0);
    g[cat.catKey] += valor * cat.sign;
  }

  // COSTO TOTAL por grupo = suma de las 5 categorías
  for (const g of contaGroups.values()) {
    g.total = g.precio + g.estimulo + g.cargas + g.provMes + g.provCcss;
  }

  // ── Cruzar con Rendimiento ────────────────────────────────────────────────
  const rows = [];
  const matchedCCs = new Set();

  for (const rRow of rendRows) {
    const ccCode = norm(rRow[rm.ccCodeColumn]);
    const ccName = norm(rRow[rm.ccNameColumn]);
    if (!ccName && !ccCode) continue;
    if (ccName.toLowerCase().startsWith('total')) continue;

    const rPrecio   = toNum(rRow[rm.precioColumn]);
    const rEstimulo = toNum(rRow[rm.estimuloColumn]);
    const rCargas   = toNum(rRow[rm.cargasColumn]);
    const rProvMes  = toNum(rRow[rm.provMesColumn]);
    const rProvCcss = toNum(rRow[rm.provCcssColumn]);
    const rTotal    = (rPrecio ?? 0) + (rEstimulo ?? 0) + (rCargas ?? 0) + (rProvMes ?? 0) + (rProvCcss ?? 0);

    const nameKey = normCCName(ccName);
    const conta   = nameKey ? contaGroups.get(nameKey) : null;
    if (conta) matchedCCs.add(nameKey);

    // Usar `!= null` (no estricto) para descartar tanto null como undefined.
    // Si conta es null, conta?.precio devuelve undefined y queremos retornar null, no NaN.
    const diff = (c, r) => (c != null && r != null) ? c - r : null;

    rows.push({
      ccCode, ccName,
      rPrecio, rEstimulo, rCargas, rProvMes, rProvCcss, rTotal,
      cPrecio:   conta ? conta.precio   : null,
      cEstimulo: conta ? conta.estimulo : null,
      cCargas:   conta ? conta.cargas   : null,
      cProvMes:  conta ? conta.provMes  : null,
      cProvCcss: conta ? conta.provCcss : null,
      cTotal:    conta ? conta.total    : null,
      dPrecio:   diff(conta?.precio,   rPrecio),
      dEstimulo: diff(conta?.estimulo, rEstimulo),
      dCargas:   diff(conta?.cargas,   rCargas),
      dProvMes:  diff(conta?.provMes,  rProvMes),
      dProvCcss: diff(conta?.provCcss, rProvCcss),
      dTotal:    diff(conta?.total,    rTotal),
      sinContaData: conta === null,
    });
  }

  // CCs presentes en CONTA pero ausentes del Rendimiento (huérfanos)
  const ccsSoloEnConta = [];
  for (const [nameKey, g] of contaGroups) {
    if (!matchedCCs.has(nameKey)) {
      ccsSoloEnConta.push({
        ccName:    g.ccLabel,
        cPrecio:   g.precio,
        cEstimulo: g.estimulo,
        cCargas:   g.cargas,
        cProvMes:  g.provMes,
        cProvCcss: g.provCcss,
        cTotal:    g.total,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {
    total:                 rows.length,
    sinContaData:          rows.filter(r => r.sinContaData).length,
    ccsSoloEnConta:        ccsSoloEnConta.length,
    descartadasSinConcepto,
    difPrecio:             rows.filter(r => hasDiff(r.dPrecio)).length,
    difEstimulo:           rows.filter(r => hasDiff(r.dEstimulo)).length,
    difCargas:             rows.filter(r => hasDiff(r.dCargas)).length,
    difProvMes:            rows.filter(r => hasDiff(r.dProvMes)).length,
    difProvCcss:           rows.filter(r => hasDiff(r.dProvCcss)).length,
    difTotal:              rows.filter(r => hasDiff(r.dTotal)).length,
    usoCCXEE:              hasOverride,
  };

  return { summary, rows, ccsSoloEnConta, meta: { conceptConfig, hasOverride } };
}

// ── summarizeRendVsAsiento ────────────────────────────────────────────────────

export function summarizeRendVsAsiento(results) {
  if (results?.error) {
    return { status: 'error', headline: results.error, insights: [] };
  }
  const s = results.summary;
  const anyDiff = COLS.some(c => {
    const k = `dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`;
    return s[k] > 0;
  });
  return {
    status:   anyDiff ? 'warning' : 'success',
    headline: `${s.total} centros de costo · ${s.sinContaData} sin datos en CONTA`
      + (s.ccsSoloEnConta > 0 ? ` · ${s.ccsSoloEnConta} CCs sólo en CONTA` : ''),
    insights: COLS.map(c => {
      const k = `dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`;
      return {
        type:  s[k] > 0 ? 'warning' : 'success',
        label: `diferencias ${c.label}`,
        value: s[k],
      };
    }),
  };
}

// ── renderRendVsAsientoResults ────────────────────────────────────────────────

export function renderRendVsAsientoResults(results, container) {
  if (!results) { container.innerHTML = ''; return; }

  if (results.error) {
    container.innerHTML = `<div class="alert alert--danger">${esc(results.error)}</div>`;
    return;
  }

  const { rows, ccsSoloEnConta, summary } = results;

  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Acumuladores para fila de totales
  const totals = {};
  for (const c of COLS) {
    totals[c.rKey] = 0;
    totals[c.cKey] = 0;
  }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.cKey] += r[c.cKey] ?? 0;
    }
  }

  // ── Encabezados ───────────────────────────────────────────────────────────
  const hdr1 = COLS.map(c =>
    `<th colspan="3" style="text-align:center;background:${c.hdr};">${esc(c.label)}</th>`
  ).join('');

  const hdr2 = COLS.map(c => `
    <th style="text-align:right;background:${c.hdr};">Rend</th>
    <th style="text-align:right;background:${c.hdr};">CONTA</th>
    <th style="text-align:right;background:${c.hdr};"><strong>CTRL</strong><br>
      <small style="font-weight:400;white-space:nowrap;">CONTA−Rend</small></th>
  `).join('');

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const dataRows = rows.map(r => {
    const cells = COLS.map(c => `
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.rKey])}</td>
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.cKey])}</td>
      <td style="text-align:right;background:${c.bg};${diffStyle(r[c.dKey])}">${fmt(r[c.dKey])}</td>
    `).join('');
    const rowStyle = r.sinContaData ? ' style="opacity:0.55;"' : '';
    return `
      <tr${rowStyle}>
        <td style="white-space:nowrap;font-family:monospace;">${esc(r.ccCode)}</td>
        <td style="white-space:nowrap;">${esc(r.ccName)}</td>
        ${cells}
      </tr>
    `;
  }).join('');

  // ── Fila de totales ────────────────────────────────────────────────────────
  const totRow = COLS.map(c => {
    const d = totals[c.cKey] - totals[c.rKey];
    return `
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.rKey])}</td>
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.cKey])}</td>
      <td style="text-align:right;background:${c.hdr};font-weight:600;${diffStyle(d)}">${fmt(d)}</td>
    `;
  }).join('');

  // ── CCs sólo en CONTA (sin contraparte en Rendimiento) ────────────────────
  let orphansHtml = '';
  if (ccsSoloEnConta && ccsSoloEnConta.length > 0) {
    const orphanRows = ccsSoloEnConta.map(o => {
      const cells = COLS.map(c => `
        <td style="text-align:right;background:${c.bg};">${fmt(o[c.cKey])}</td>
      `).join('');
      return `
        <tr>
          <td>${esc(o.ccName)}</td>
          ${cells}
        </tr>
      `;
    }).join('');
    const orphanHeaders = COLS.map(c =>
      `<th style="text-align:right;background:${c.hdr};">${esc(c.label)}</th>`
    ).join('');
    orphansHtml = `
      <details open style="margin-top:var(--sp-4);">
        <summary style="cursor:pointer;font-weight:var(--fw-semibold);color:var(--color-warning);margin-bottom:var(--sp-2);">
          ⚠ ${ccsSoloEnConta.length} CC${ccsSoloEnConta.length !== 1 ? 's' : ''} en CONTA sin contraparte en Rendimiento
        </summary>
        <div style="overflow-x:auto;">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Centro de Costo (sólo CONTA)</th>
                ${orphanHeaders}
              </tr>
            </thead>
            <tbody>
              ${orphanRows}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  // ── Badges informativos ───────────────────────────────────────────────────
  const badges = [];
  if (summary?.usoCCXEE) {
    badges.push(`<span class="badge badge--info" style="margin-right:var(--sp-2);">↺ CC x Empleado aplicado</span>`);
  }
  if (summary?.descartadasSinConcepto > 0) {
    badges.push(`<span class="badge badge--warning" style="margin-right:var(--sp-2);">${summary.descartadasSinConcepto} filas de CONTA con ID_CONCEPTO no categorizado</span>`);
  }
  const badgesHtml = badges.length
    ? `<div style="margin-bottom:var(--sp-2);font-size:var(--text-sm);">${badges.join('')}</div>`
    : '';

  const exportBtn = document.createElement('div');
  exportBtn.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:var(--sp-2);';
  exportBtn.innerHTML = `<button type="button" id="js-rva-export" class="btn btn--ghost btn--sm">⬇ Exportar a Excel</button>`;

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    ${badgesHtml}
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th rowspan="2" style="white-space:nowrap;">CC</th>
          <th rowspan="2">Centro de Costo</th>
          ${hdr1}
        </tr>
        <tr>
          ${hdr2}
        </tr>
      </thead>
      <tbody>
        ${dataRows}
        <tr style="background:var(--color-surface);">
          <td colspan="2" style="font-weight:600;white-space:nowrap;">TOTAL GENERAL</td>
          ${totRow}
        </tr>
      </tbody>
    </table>
    ${orphansHtml}
  `;

  container.innerHTML = '';
  container.appendChild(exportBtn);
  container.appendChild(tableWrap);

  container.querySelector('#js-rva-export')?.addEventListener('click', () => exportRendVsAsientoToXlsx(results));
}

// ── Excel export ──────────────────────────────────────────────────────────────

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

function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function exportRendVsAsientoToXlsx(results) {
  await loadExcelJS();
  const { rows, ccsSoloEnConta } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Rend vs CONTA');

  ws.columns = [
    { width: 10 }, { width: 30 },
    ...COLS.flatMap(() => [{ width: 18 }, { width: 18 }, { width: 18 }]),
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';
  const RED = 'FFCC0000';
  const GRAY_HDR = 'FFE0E0E0';

  // Fila 1: nombres de categorías
  const hdr1Values = ['CC', 'Centro de Costo', ...COLS.flatMap(c => [c.label, null, null])];
  const r1 = ws.addRow(hdr1Values);
  r1.height = 22;

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');

  COLS.forEach((c, i) => {
    const startCol = 3 + i * 3;
    const endCol   = startCol + 2;
    ws.mergeCells(1, startCol, 1, endCol);
    const cell = r1.getCell(startCol);
    cell.value = c.label;
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = solidFill(c.xlHdr);
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  });

  ['A1', 'B1'].forEach(addr => {
    const cell = ws.getCell(addr);
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = solidFill(GRAY_HDR);
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  });

  // Fila 2: sub-encabezados Rend / CONTA / CTRL
  const hdr2Values = ['', '', ...COLS.flatMap(() => ['Rend', 'CONTA', 'CTRL\nCONTA−Rend'])];
  const r2 = ws.addRow(hdr2Values);
  r2.height = 28;

  COLS.forEach((c, i) => {
    const startCol = 3 + i * 3;
    for (let col = startCol; col <= startCol + 2; col++) {
      const cell = r2.getCell(col);
      cell.font      = col === startCol + 2 ? { ...bold } : { ...base };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill      = solidFill(c.xlHdr);
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    }
  });
  r2.getCell(1).fill = solidFill(GRAY_HDR);
  r2.getCell(2).fill = solidFill(GRAY_HDR);

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // Filas de datos
  for (const r of rows) {
    const values = [
      r.ccCode, r.ccName,
      ...COLS.flatMap(c => [r[c.rKey], r[c.cKey], r[c.dKey]]),
    ];
    const dr = ws.addRow(values);
    dr.getCell(1).font = { ...base };
    dr.getCell(2).font = { ...base };

    COLS.forEach((c, i) => {
      const startCol = 3 + i * 3;
      for (let col = startCol; col <= startCol + 2; col++) {
        const cell = dr.getCell(col);
        cell.numFmt    = numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill      = solidFill(c.xlBg);
        cell.font      = { ...base };
      }
      const dCell = dr.getCell(startCol + 2);
      const dVal  = r[c.dKey];
      if (dVal !== null && Math.abs(dVal) > 0.01) {
        dCell.font = { ...bold, color: { argb: RED } };
      }
    });

    if (r.sinContaData) dr.eachCell(cell => { cell.font = { ...cell.font, color: { argb: 'FF999999' } }; });
  }

  // Fila de totales
  const totals = {};
  for (const c of COLS) { totals[c.rKey] = 0; totals[c.cKey] = 0; }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.cKey] += r[c.cKey] ?? 0;
    }
  }

  const totValues = [
    'TOTAL GENERAL', '',
    ...COLS.flatMap(c => {
      const d = totals[c.cKey] - totals[c.rKey];
      return [totals[c.rKey], totals[c.cKey], d];
    }),
  ];
  const tr = ws.addRow(totValues);
  tr.getCell(1).font = { ...bold };
  tr.getCell(2).font = { ...bold };

  COLS.forEach((c, i) => {
    const startCol = 3 + i * 3;
    for (let col = startCol; col <= startCol + 2; col++) {
      const cell = tr.getCell(col);
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill      = solidFill(c.xlHdr);
      cell.font      = { ...bold };
      cell.border    = { top: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    }
    const dCell = tr.getCell(startCol + 2);
    const d = totals[c.cKey] - totals[c.rKey];
    if (Math.abs(d) > 0.01) dCell.font = { ...bold, color: { argb: RED } };
  });

  // CCs huérfanos (sólo en CONTA) en hoja aparte
  if (ccsSoloEnConta && ccsSoloEnConta.length > 0) {
    const ws2 = wb.addWorksheet('CCs sólo en CONTA');
    ws2.columns = [{ width: 30 }, ...COLS.map(() => ({ width: 18 }))];
    const h2 = ws2.addRow(['Centro de Costo', ...COLS.map(c => c.label)]);
    h2.font = { ...bold };
    h2.eachCell(cell => {
      cell.fill      = solidFill(GRAY_HDR);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    for (const o of ccsSoloEnConta) {
      const dr = ws2.addRow([o.ccName, ...COLS.map(c => o[c.cKey])]);
      for (let col = 2; col <= COLS.length + 1; col++) {
        dr.getCell(col).numFmt = numFmt;
        dr.getCell(col).alignment = { horizontal: 'right' };
      }
    }
  }

  await downloadXlsx(wb, `RendVsCONTA_${dateSuffix()}.xlsx`);
}
