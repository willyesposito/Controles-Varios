// catXEmpleados.js — Lógica y render del Control "EE x CATEG" (Empleados por Categoría)
//
// El reporte de Categorías trae TODA la nómina (activos + bajas). El control
// separa unos de otros con la columna F. BAJA y NO marca como faltantes a los
// empleados que figuran en el Tabulado pero ya son bajas en el reporte.
//
// Valida:
//   1. Diferencias de cantidad: activos en Rep. Categ. vs Tabulado
//   2. Activos en Rep. Categ. que no están en Tabulado (con F. Alta)
//   3. Empleados en Tabulado que no están en Rep. Categ. (ni activos ni bajas)
//   4. Discrepancias de campo (PUESTO, CC, DEPTO) en empleados coincidentes
//   5. Distribución por PUESTO — con detalle de empleados cuando hay diferencia
//   6. Distribución por CC — ídem

import { showToast } from '../ui/toast.js';

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
        label: 'En Rep. Categ., faltan en Tabulado',
        value: s.missingInTabCount,
      },
      {
        type:  s.missingInCatCount > 0 ? 'warning' : 'success',
        label: 'En Tabulado, faltan en Rep. Categ.',
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

export function runCatXEmpleados(catAllRows, tabRows, mapping) {
  const cm = mapping.cat;
  const tm = mapping.tab;

  // Partir el reporte en activos y bajas usando F. BAJA.
  const fBajaCol = cm.fBajaColumn;
  const esBaja = (row) => {
    if (!fBajaCol) return false;
    const v = row[fBajaCol];
    return !(v === null || v === undefined || String(v).trim() === '');
  };
  const catActivos = catAllRows.filter(r => !esBaja(r));
  const catBajaIds = new Set(
    catAllRows.filter(esBaja).map(r => normId(r[cm.idEmpColumn]))
  );

  const catByEmp = new Map(catActivos.map(r => [normId(r[cm.idEmpColumn]), r]));
  const tabByEmp = new Map(tabRows.map(r => [normId(r[tm.empleadoColumn]), r]));

  // ── 1. Empleados faltantes ─────────────────────────────────────────────────

  const missingInTab = [];
  for (const [, r] of catByEmp) {
    if (!tabByEmp.has(normId(r[cm.idEmpColumn]))) {
      missingInTab.push({
        id:      norm(r[cm.idEmpColumn]),   // display: valor original (con ceros)
        apellido: norm(r[cm.apellidoColumn]),
        nombre:   norm(r[cm.nombreColumn]),
        fAlta:    cm.fAltaColumn ? fmtDate(r[cm.fAltaColumn]) : '',
      });
    }
  }

  const missingInCat = [];
  for (const [, r] of tabByEmp) {
    // Si el empleado existe en Rep. Categ. como baja, no es un error: el
    // Tabulado todavía lo lista pero el reporte ya lo dio de baja.
    const tid = normId(r[tm.empleadoColumn]);
    if (!catByEmp.has(tid) && !catBajaIds.has(tid)) {
      missingInCat.push({
        id:              norm(r[tm.empleadoColumn]),  // display: valor original
        apellidoNombre:  norm(r[tm.apellidoNombreColumn]),
      });
    }
  }

  // ── 2. Discrepancias de campo en empleados coincidentes ────────────────────

  const fieldDiscrepancies = [];
  for (const [nid, catRow] of catByEmp) {
    const tabRow = tabByEmp.get(nid);
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
        id:      norm(catRow[cm.idEmpColumn]),  // display: valor original
        apellido: norm(catRow[cm.apellidoColumn]),
        nombre:   norm(catRow[cm.nombreColumn]),
        diffs,
      });
    }
  }

  // ── 3. Distribuciones con detalle de empleados por grupo ───────────────────
  // Las distribuciones agrupan SOLO empleados activos en Rep. Categ. y
  // empleados del Tabulado que no son bajas en el reporte. Las bajas se
  // excluyen para no inflar el lado Tabulado con gente que ya no está activa.

  const tabRowsForDist = tabRows.filter(r => !catBajaIds.has(normId(r[tm.empleadoColumn])));

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
    groupByKey(catActivos,     cm.puestoColumn, dedupeCAT, catDispFn),
    groupByKey(tabRowsForDist, tm.puestoColumn, dedupeTAB, tabDispFn)
  );

  const byCC = mergeAggregations(
    groupByKey(catActivos,     cm.centroCostoColumn, dedupeCAT, catDispFn),
    groupByKey(tabRowsForDist, tm.ccColumn,           dedupeTAB, tabDispFn)
  );

  return {
    summary: {
      catActivos:            catActivos.length,
      catBajas:              catBajaIds.size,
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
  const { summary, missingInTab, missingInCat, fieldDiscrepancies, byPuesto, byCC } = results;
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
    `Activos en Rep. Categ. que NO están en Tabulado (${missingInTab.length})`,
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
    `En Tabulado que NO están en Rep. Categ. activos (${missingInCat.length})`,
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
          <tr><th>ID</th><th>Empleado</th><th>Campo</th><th>Valor en Rep. Categ.</th><th>Valor en Tabulado</th></tr>
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
        <strong style="font-size:var(--text-sm);">Solo en Rep. Categ. (${r.onlyInCat.length}):</strong>
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
            <th style="text-align:right;">Rep. Categ.</th>
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

  // ── Botón de exportación a Excel ───────────────────────────────────────────

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:var(--sp-2) var(--sp-3);';
  const exportBtn = document.createElement('button');
  exportBtn.className   = 'btn btn--primary btn--sm';
  exportBtn.textContent = '⬇ Exportar .xlsx';
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled    = true;
    exportBtn.textContent = 'Generando…';
    try {
      await exportCatXEmpleadosToXlsx(results);
    } catch (err) {
      showToast('Error al generar el archivo: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled    = false;
      exportBtn.textContent = '⬇ Exportar .xlsx';
    }
  });
  toolbar.appendChild(exportBtn);

  // ── Render final ───────────────────────────────────────────────────────────

  const sectionsHtml = `
    ${buildDiffChip(summary)}
    ${missingInTabHtml}
    ${missingInCatHtml}
    ${discrepanciesHtml}
    ${puestoHtml}
    ${ccHtml}
  `;

  container.innerHTML = '';
  container.appendChild(toolbar);
  const sectionsWrap = document.createElement('div');
  sectionsWrap.innerHTML = sectionsHtml;
  container.appendChild(sectionsWrap);
}

// ── Chip de resumen de diferencias ───────────────────────────────────────────

function buildDiffChip(summary) {
  const { missingInTabCount, missingInCatCount, fieldDiscrepancyCount,
          catActivos, catBajas, tabTotal, diff } = summary;
  const totalDiffs = missingInTabCount + missingInCatCount + fieldDiscrepancyCount;
  const sign       = diff > 0 ? '+' : '';

  const CHIP = [
    'margin-bottom:var(--sp-5)',
    'border:1px solid var(--color-border)',
    'border-radius:var(--radius-md)',
    'overflow:hidden',
    'box-shadow:var(--shadow-sm)',
    'background:var(--color-surface)',
  ].join(';');

  if (totalDiffs === 0) {
    return `
      <div style="${CHIP};display:flex;align-items:center;gap:var(--sp-3);
        padding:var(--sp-4) var(--sp-5);
        border-left:4px solid var(--color-success);">
        <span style="font-size:var(--text-xl);color:var(--color-success);">✓</span>
        <div>
          <div style="font-weight:600;color:var(--color-success);font-size:var(--text-base);">
            Sin diferencias
          </div>
          <div style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:2px;">
            ${catActivos} activos en Rep. Categ. · ${tabTotal} en Tabulado
          </div>
        </div>
      </div>
    `;
  }

  const tile = (count, label, isWarning) => {
    const numColor  = isWarning ? 'var(--color-warning)' : 'var(--color-success)';
    const topBorder = isWarning ? 'var(--color-warning)' : 'var(--color-success)';
    return `
      <div style="
        flex:1; padding:var(--sp-4) var(--sp-5); text-align:center;
        border-right:1px solid var(--color-border);
        border-top:3px solid ${topBorder};
        background:var(--color-surface);
      ">
        <div style="
          font-size:var(--text-3xl); font-weight:700;
          font-family:monospace; line-height:1.1;
          color:${numColor}; letter-spacing:-1px;
        ">${count}</div>
        <div style="
          font-size:var(--text-sm); color:var(--color-text-muted);
          margin-top:var(--sp-1); line-height:1.3;
        ">${esc(label)}</div>
      </div>
    `;
  };

  const diffLabel = diff === 0 ? 'sin diferencia neta'
    : diff > 0  ? `${sign}${diff} más en Rep. Categ.`
    :             `${diff} menos en Rep. Categ.`;

  return `
    <div style="${CHIP}">
      <div style="
        padding:var(--sp-2) var(--sp-5);
        background:var(--color-bg-subtle);
        border-bottom:1px solid var(--color-border);
        display:flex; align-items:center; justify-content:space-between;
      ">
        <span style="font-size:var(--text-sm);font-weight:600;color:var(--color-text-muted);
                     letter-spacing:.04em; text-transform:uppercase;">
          Resumen de diferencias
        </span>
        <span style="font-size:var(--text-sm);color:var(--color-text-muted);">
          ${catActivos} activos · ${tabTotal} en Tab · ${esc(diffLabel)}
          ${catBajas > 0 ? ` · <em>${catBajas} bajas excluidas</em>` : ''}
        </span>
      </div>
      <div style="display:flex;">
        ${tile(missingInTabCount, 'activos sin Tabulado',    missingInTabCount     > 0)}
        ${tile(missingInCatCount, 'en Tab sin Rep. Categ.',  missingInCatCount     > 0)}
        ${tile(fieldDiscrepancyCount, 'discrepancias de campo', fieldDiscrepancyCount > 0)}
      </div>
    </div>
  `;
}

// ── Export a Excel ────────────────────────────────────────────────────────────

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

async function exportCatXEmpleadosToXlsx(results) {
  await loadExcelJS();
  const { byPuesto, byCC } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const HDR_BG   = 'FFE8E8E8';
  const WARN_BG  = 'FFFFF4E5';
  const base     = { name: 'Calibri', size: 10 };
  const bold     = { ...base, bold: true };
  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const styleHeader = (row) => {
    row.height = 20;
    row.eachCell(cell => {
      cell.font      = bold;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill      = solidFill(HDR_BG);
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    });
  };

  // ── Hojas: Distribuciones (Puesto y CC) ────────────────────────────────────
  addDistributionSheet(wb, 'Por Puesto',         'Puesto',          byPuesto, styleHeader, base, bold, solidFill, WARN_BG);
  addDistributionSheet(wb, 'Por Centro de Costo', 'Centro de Costo', byCC,     styleHeader, base, bold, solidFill, WARN_BG);

  await downloadXlsx(wb, `EE_x_CATEG_${dateSuffix()}.xlsx`);
}

function addDistributionSheet(wb, sheetName, labelCol, rows, styleHeader, base, bold, solidFill, warnBg) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 32 }, { width: 14 }, { width: 14 }, { width: 10 }];
  styleHeader(ws.addRow([labelCol, 'Rep. Categ.', 'Tabulado', 'Dif.']));
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  let lastDataRowNum = 1;

  for (const r of rows) {
    const dr = ws.addRow([r.key, r.catCount, r.tabCount, null]);
    const rn = dr.number;
    lastDataRowNum = rn;
    dr.getCell(4).value = { formula: `=B${rn}-C${rn}`, result: r.diff };
    dr.eachCell((cell, col) => {
      cell.font = base;
      if (col >= 2) cell.alignment = { horizontal: 'right' };
      if (r.diff !== 0) cell.fill = solidFill(warnBg);
    });
    if (r.diff !== 0) {
      dr.getCell(4).font = { ...bold, color: { argb: 'FFCC0000' } };
    }
  }

  // Fila de total
  if (rows.length > 0) {
    const tr = ws.addRow(['TOTAL', null, null, null]);
    const tNum = tr.number;
    const dataStart = 2;
    tr.getCell(1).font = bold;
    tr.getCell(2).value = { formula: `=SUM(B${dataStart}:B${lastDataRowNum})`, result: rows.reduce((s, r) => s + r.catCount, 0) };
    tr.getCell(3).value = { formula: `=SUM(C${dataStart}:C${lastDataRowNum})`, result: rows.reduce((s, r) => s + r.tabCount, 0) };
    tr.getCell(4).value = { formula: `=B${tNum}-C${tNum}`, result: rows.reduce((s, r) => s + r.diff, 0) };
    tr.eachCell((cell, col) => {
      if (col >= 2) {
        cell.font = bold;
        cell.alignment = { horizontal: 'right' };
        cell.border = { top: { style: 'medium', color: { argb: 'FF888888' } } };
      }
    });
  }

  // Detalle de diferencias debajo
  const hasDetail = rows.some(r => r.onlyInCat.length > 0 || r.onlyInTab.length > 0);
  if (!hasDetail) return;

  ws.addRow([]);
  const titleRow = ws.addRow(['Detalle de diferencias']);
  titleRow.getCell(1).font = bold;

  const detailHdr = ws.addRow([labelCol, 'Origen', 'ID', 'Empleado']);
  styleHeader(detailHdr);

  for (const r of rows) {
    if (r.diff === 0) continue;
    for (const e of r.onlyInCat) {
      const dr = ws.addRow([r.key, 'Solo en Rep. Categ.', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
    for (const e of r.onlyInTab) {
      const dr = ws.addRow([r.key, 'Solo en Tabulado', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
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

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Agrupa filas por groupCol, indexando por idCol → displayFn(row).
 *  Usa normId para la clave interna de deduplicación (elimina ceros a la izquierda). */
function groupByKey(rows, groupCol, idCol, displayFn) {
  const map = new Map();
  if (!groupCol || !idCol) return map;
  for (const r of rows) {
    const key = norm(r[groupCol]) || '(sin valor)';
    if (!map.has(key)) map.set(key, new Map());
    const id = normId(r[idCol]);
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

/** Normaliza IDs numéricos eliminando ceros a la izquierda para comparación.
 *  "0870" → "870", "870" → "870". Texto no numérico queda igual. */
function normId(v) {
  const s = norm(v);
  if (s === '') return '';
  const n = parseInt(s, 10);
  return isNaN(n) ? s : String(n);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
