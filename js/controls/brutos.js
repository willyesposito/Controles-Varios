// brutos.js — Control "Reporte de Brutos"
//
// Cruza el Reporte de Brutos contra los conceptos 1003 y 1017 del Tabulado:
//   - SAL_BASE (Brutos) vs concepto 1003 (SUELDO) → columna CTRL SALARIO BASE (celeste)
//   - A_CTA_FUT_AUMEN (Brutos) vs concepto 1017 → columna CTRL A_CTA_FUT_AUMEN (lila)
//   - Columna extra VALORES TABULADO: legajo, val_1003, val_1017 del Tabulado

const COL_1003 = '1003';
const COL_1017 = '1017';

// Colores ARGB para el Excel (blending de los tokens CSS sobre blanco):
//   rgba(0,172,212,0.22)  → #C7ECF6   rgba(0,172,212,0.10)  → #E6F8FB
//   rgba(130,80,200,0.20) → #E6DCF4   rgba(130,80,200,0.09) → #F4EFFA
const XL_CYAN_HDR  = 'FFC7ECF6';
const XL_CYAN_BG   = 'FFE6F8FB';
const XL_LILAC_HDR = 'FFE6DCF4';
const XL_LILAC_BG  = 'FFF4EFFA';
const XL_GRAY_HDR  = 'FFE8E8E8';

export function summarizeBrutos(results) {
  const s = results.summary;
  const hasDiff = s.conDifSalario > 0 || s.conDifACuFutAumen > 0;
  return {
    status:   hasDiff ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDifSalario > 0 ? 'warning' : 'success',
        label: 'diferencias SAL_BASE vs 1003',
        value: s.conDifSalario,
      },
      {
        type:  s.conDifACuFutAumen > 0 ? 'warning' : 'success',
        label: 'diferencias A_CTA_FUT_AUMEN vs 1017',
        value: s.conDifACuFutAumen,
      },
    ],
  };
}

export function runBrutos(brutosRows, tabRows, mapping) {
  const bm = mapping.brutos;
  const tm = mapping.tab;

  // Índice del Tabulado: legajo → { val1003, val1017 }
  const tabByLegajo = new Map();
  for (const row of tabRows) {
    const id = norm(row[tm.empleadoColumn]);
    if (!id) continue;
    // Los conceptos son columnas numéricas — el header puede ser número o string según el Excel
    const val1003 = toNum(row[COL_1003]) ?? toNum(row[1003]);
    const val1017 = toNum(row[COL_1017]) ?? toNum(row[1017]);
    tabByLegajo.set(id, { val1003, val1017 });
  }

  const rows = brutosRows.map(row => {
    const legajo      = norm(row[bm.legajoColumn]);
    const salBase     = toNum(row[bm.salBaseColumn]);
    const aCuFutAumen = toNum(row[bm.aCuFutAumenColumn]);
    const tab         = tabByLegajo.get(legajo) ?? { val1003: null, val1017: null };

    const ctrlSalBase     = tab.val1003 !== null && salBase !== null
      ? tab.val1003 - salBase : null;
    const ctrlACuFutAumen = tab.val1017 !== null && aCuFutAumen !== null
      ? tab.val1017 - aCuFutAumen : null;

    return {
      legajo,
      salBase,
      aCuFutAumen,
      tabVal1003:     tab.val1003,
      tabVal1017:     tab.val1017,
      ctrlSalBase,
      ctrlACuFutAumen,
    };
  });

  const conDifSalario     = rows.filter(r => r.ctrlSalBase !== null     && Math.abs(r.ctrlSalBase)     > 0.01).length;
  const conDifACuFutAumen = rows.filter(r => r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01).length;
  const sinTabData        = rows.filter(r => r.tabVal1003 === null && r.tabVal1017 === null).length;

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
          <th style="background:${CYAN_HDR};"><strong>CTRL SALARIO BASE</strong><br><small style="font-weight:400;">1003 − SAL_BASE</small></th>
          <th style="background:${LILAC_HDR};">A_CTA_FUT_AUMEN</th>
          <th style="background:${LILAC_HDR};"><strong>CTRL A_CTA_FUT_AUMEN</strong><br><small style="font-weight:400;">1017 − A_CTA_FUT_AUMEN</small></th>
          <th>Legajo</th>
          <th>1003 (SUELDO)</th>
          <th>1017 (A CTA FUT)</th>
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
            <td style="text-align:right;">${fmt(r.tabVal1003)}</td>
            <td style="text-align:right;">${fmt(r.tabVal1017)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(tableWrap);
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportBrutosToXlsx(results) {
  if (!window.ExcelJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ExcelJS. Verificá la conexión a internet.'));
      document.head.appendChild(s);
    });
  }

  const { rows } = results;
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');

  ws.columns = [
    { width: 12 },  // A: Legajo
    { width: 18 },  // B: SAL_BASE
    { width: 22 },  // C: CTRL SALARIO BASE
    { width: 20 },  // D: A_CTA_FUT_AUMEN
    { width: 24 },  // E: CTRL A_CTA_FUT_AUMEN
    { width: 12 },  // F: Legajo (Tabulado)
    { width: 18 },  // G: 1003 (SUELDO)
    { width: 18 },  // H: 1017 (A CTA FUT)
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  // Fila 1: encabezados de grupo (con merge)
  const r1 = ws.addRow(['Legajo', 'Salario Base', null, 'A Cta Fut Aumen', null, 'Valores Tabulado', null, null]);

  // Fila 2: encabezados de columna
  const r2 = ws.addRow(['', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'Legajo', '1003 (SUELDO)', '1017 (A CTA FUT)']);

  // Merges (después de agregar las dos filas)
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:C1');
  ws.mergeCells('D1:E1');
  ws.mergeCells('F1:H1');

  r1.height = 22;
  r2.height = 20;

  const styleGrpHdr = (cell, bgArgb) => {
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = solidFill(bgArgb);
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  };

  styleGrpHdr(r1.getCell(1), XL_GRAY_HDR);   // Legajo (merge A1:A2)
  styleGrpHdr(r1.getCell(2), XL_CYAN_HDR);   // Salario Base
  styleGrpHdr(r1.getCell(4), XL_LILAC_HDR);  // A Cta Fut Aumen
  styleGrpHdr(r1.getCell(6), XL_GRAY_HDR);   // Valores Tabulado

  const styleColHdr = (cell, bgArgb, isBold = false) => {
    cell.font      = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill      = solidFill(bgArgb);
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  };

  styleColHdr(r2.getCell(2), XL_CYAN_HDR,  false);  // SAL_BASE
  styleColHdr(r2.getCell(3), XL_CYAN_HDR,  true);   // CTRL SALARIO BASE — negrita
  styleColHdr(r2.getCell(4), XL_LILAC_HDR, false);  // A_CTA_FUT_AUMEN
  styleColHdr(r2.getCell(5), XL_LILAC_HDR, true);   // CTRL A_CTA_FUT_AUMEN — negrita
  styleColHdr(r2.getCell(6), XL_GRAY_HDR,  false);  // Legajo Tab
  styleColHdr(r2.getCell(7), XL_GRAY_HDR,  false);  // 1003
  styleColHdr(r2.getCell(8), XL_GRAY_HDR,  false);  // 1017

  // Filas de datos congeladas desde la fila 3
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  const numFmt = '#,##0.00';

  for (const r of rows) {
    const dr = ws.addRow([
      r.legajo,
      r.salBase,
      r.ctrlSalBase,
      r.aCuFutAumen,
      r.ctrlACuFutAumen,
      r.legajo,
      r.tabVal1003,
      r.tabVal1017,
    ]);

    // Fondos de color
    dr.getCell(2).fill = solidFill(XL_CYAN_BG);
    dr.getCell(3).fill = solidFill(XL_CYAN_BG);
    dr.getCell(4).fill = solidFill(XL_LILAC_BG);
    dr.getCell(5).fill = solidFill(XL_LILAC_BG);

    // Formato numérico y alineación
    for (const col of [2, 3, 4, 5, 7, 8]) {
      const cell = dr.getCell(col);
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.font      = { ...base };
    }

    // Rojo+negrita cuando hay diferencia
    if (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01) {
      dr.getCell(3).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    }
    if (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01) {
      dr.getCell(5).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    }

    dr.getCell(1).font      = { ...base };
    dr.getCell(6).font      = { ...base };
    dr.getCell(1).alignment = { vertical: 'middle' };
    dr.getCell(6).alignment = { vertical: 'middle' };
  }

  // Descarga
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Brutos_Control_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
