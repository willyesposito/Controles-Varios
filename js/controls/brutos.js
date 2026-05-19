// brutos.js — Control "Reporte de Brutos"
//
// Cruza el Reporte de Brutos contra los conceptos 1003 y 1017 del Tabulado:
//   - SAL_BASE (Brutos) vs concepto 1003 (SUELDO) → columna CTRL SALARIO BASE
//   - A_CTA_FUT_AUMEN (Brutos) vs concepto 1017 → columna CTRL A_CTA_FUT_AUMEN
//   - Columna extra VALORES TABULADO: legajo, val_1003, val_1017 del Tabulado

// Los conceptos se buscan por su código como clave de columna en el Tabulado.
// XLSX lee los encabezados numéricos como números → String(1003) === '1003' en JS.
const COL_1003 = '1003';
const COL_1017 = '1017';

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

  const tableHtml = `
    <div style="overflow-x:auto;">
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
    </div>
  `;

  container.innerHTML = tableHtml;
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
