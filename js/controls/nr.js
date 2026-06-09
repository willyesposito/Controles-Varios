// nr.js — Control No Remunerativos (Control NR)
import { showToast } from '../ui/toast.js';
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
  };
}

export function runNr(nrRows, tabRows, mapping) {
  const nm = mapping.nr;
  const tm = mapping.tab;

  // Índice del Tabulado: legajo → { [conceptKey]: numericValue }
  const tabByLegajo = new Map();
  for (const row of tabRows) {
    const id = norm(row[tm.empleadoColumn]);
    if (!id) continue;
    const vals = {};
    for (const c of NR_CONCEPTS) {
      const col = tm[c.tabKey];
      vals[c.key] = col ? toNum(row[col]) : null;
    }
    tabByLegajo.set(id, vals);
  }

  const rows = nrRows.map(row => {
    const legajo  = norm(row[nm.legajoColumn]);
    const tabVals = tabByLegajo.get(legajo) ?? null;

    const valores = {};
    for (const c of NR_CONCEPTS) {
      const nrCol  = nm[c.nrKey];
      const nrVal  = nrCol ? toNum(row[nrCol]) : null;
      const tabVal = tabVals ? tabVals[c.key]  : null;
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

export function renderNrResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const fmt = v => v === null
    ? '—'
    : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isDif = v => v !== null && Math.abs(v) > 0.01;

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
      await exportNrToXlsx(results);
    } catch (err) {
      showToast('Error al generar el archivo: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '⬇ Exportar .xlsx';
    }
  });
  toolbar.appendChild(exportBtn);

  // Colores por grupo
  const INDEM_BG  = 'rgba(56,142,60,0.08)';
  const INDEM_HDR = 'rgba(56,142,60,0.18)';
  const OTROS_BG  = 'rgba(245,124,0,0.08)';
  const OTROS_HDR = 'rgba(245,124,0,0.18)';

  const cellBg = c => c.group === 'indem' ? INDEM_BG : OTROS_BG;

  // Tabla resumen HTML: Legajo + # difs + conceptos con diferencia
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Legajo</th>
          <th style="text-align:center;"># Difs</th>
          ${NR_CONCEPTS.map(c => {
            const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
            return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const difs = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
          const rowStyle = difs > 0 ? '' : '';
          return `
            <tr>
              <td>${esc(r.legajo)}</td>
              <td style="text-align:center;font-weight:${difs > 0 ? '700' : '400'};color:${difs > 0 ? 'var(--color-danger)' : 'inherit'};">${difs || '—'}</td>
              ${NR_CONCEPTS.map(c => {
                const v     = r.valores[c.key];
                const hasDif = isDif(v.ctrl);
                const style  = `text-align:right;background:${cellBg(c)};${hasDif ? 'color:var(--color-danger);font-weight:600;' : ''}`;
                return `<td style="${style}">${fmt(v.ctrl)}</td>`;
              }).join('')}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
      Valores mostrados: Tab − NR. Cero = OK. Rojo = diferencia.
      Exportá el .xlsx para ver los valores originales de cada fuente.
    </p>
  `;

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(tableWrap);
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runNrReporte(_primaryRows, tabRows, mapping) {
  const tm = mapping.tab;

  const nombreCol    = tm.tabNombreColumn    || null;
  const apellido1Col = tm.tabApellido1Column || null;

  const rows = tabRows
    .filter(row => !!norm(row[tm.empleadoColumn]))
    .map(row => {
      const base = {
        legajo:       norm(row[tm.empleadoColumn]),
        nombre:       nombreCol    ? norm(row[nombreCol])    : null,
        apellido1:    apellido1Col ? norm(row[apellido1Col]) : null,
        fecAlta:      tm.tabFecAltaColumn     ? fmtDate(row[tm.tabFecAltaColumn])     : null,
        fecBaja:      tm.tabFecBajaColumn     ? fmtDate(row[tm.tabFecBajaColumn])     : null,
        fecPago:      tm.tabFecPagoColumn     ? fmtDate(row[tm.tabFecPagoColumn])     : null,
        idCentroTrab: tm.tabIdCentroTrabColumn ? norm(row[tm.tabIdCentroTrabColumn]) : null,
        idCategoria:  tm.tabIdCategoriaColumn  ? norm(row[tm.tabIdCategoriaColumn])  : null,
      };
      for (const c of NR_CONCEPTS) {
        const col = tm[c.tabKey];
        base[c.key] = col ? toNum(row[col]) : null;
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
  };
}

export function renderNrReporteResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const fmt    = v => v === null ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTxt = v => v === null ? '—' : esc(String(v));

  const INDEM_HDR = 'rgba(56,142,60,0.18)';
  const OTROS_HDR = 'rgba(245,124,0,0.18)';

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
      await exportNrReporteToXlsx(results);
    } catch (err) {
      showToast('Error al generar el archivo: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '⬇ Exportar .xlsx';
    }
  });
  toolbar.appendChild(exportBtn);

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
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
          ${NR_CONCEPTS.map(c => {
            const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
            return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${fmtTxt(r.legajo)}</td>
            <td>${fmtTxt(r.nombre)}</td>
            <td>${fmtTxt(r.apellido1)}</td>
            <td>${fmtTxt(r.fecAlta)}</td>
            <td>${fmtTxt(r.fecBaja)}</td>
            <td>${fmtTxt(r.fecPago)}</td>
            <td>${fmtTxt(r.idCentroTrab)}</td>
            <td>${fmtTxt(r.idCategoria)}</td>
            ${NR_CONCEPTS.map(c =>
              `<td style="text-align:right;">${fmt(r[c.key])}</td>`
            ).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

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

  await downloadXlsx(wb, `NR_Control_${periodSuffix(results.period)}.xlsx`);
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

  await downloadXlsx(wb, `NR_Reporte_${periodSuffix(results.period)}.xlsx`);
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
