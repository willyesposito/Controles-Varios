// rendVsTabu.js — Control 5: Rendimiento vs Tabulado (RendvsTabu)
//
// Lógica: agrupa el Tabulado por centro de costo, suma las columnas de importe
// pre-calculadas (PRECIO, ASIG. ESTÍMULO, CARGAS SS, PROV. MES, PROV. CCSS MES,
// COSTO TOTAL) y las compara contra el Reporte de Rendimiento de M4.
// RETIROS se calcula sumando conceptos 9200 + 9205 solo para filas EMPRESA = 03.

// ── Definición de columnas de comparación ────────────────────────────────────

const COLS = [
  { key: 'precio',   label: 'PRECIO',          rKey: 'rPrecio',   tKey: 'tPrecio',   dKey: 'dPrecio',
    tabKey: 'tabRvtPrecioColumn',   hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  rKey: 'rEstimulo', tKey: 'tEstimulo', dKey: 'dEstimulo',
    tabKey: 'tabRvtEstimuloColumn', hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)' },
  { key: 'retiros',  label: 'RETIROS',         rKey: 'rRetiros',  tKey: 'tRetiros',  dKey: 'dRetiros',
    tabKey: null,                   hdr: 'rgba(112,48,160,0.22)', bg: 'rgba(112,48,160,0.08)' },
  { key: 'cargas',   label: 'CARGAS SS',       rKey: 'rCargas',   tKey: 'tCargas',   dKey: 'dCargas',
    tabKey: 'tabRvtCargasColumn',   hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)' },
  { key: 'provMes',  label: 'PROV. MES',       rKey: 'rProvMes',  tKey: 'tProvMes',  dKey: 'dProvMes',
    tabKey: 'tabRvtProvMesColumn',  hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  rKey: 'rProvCcss', tKey: 'tProvCcss', dKey: 'dProvCcss',
    tabKey: 'tabRvtProvCcssColumn', hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)' },
  { key: 'total',    label: 'COSTO TOTAL',     rKey: 'rTotal',    tKey: 'tTotal',    dKey: 'dTotal',
    tabKey: 'tabRvtCostoTotalColumn', hdr: 'rgba(64,64,64,0.18)', bg: 'rgba(64,64,64,0.07)' },
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

// Normaliza código de CC: quita ceros iniciales → "0011" y 11 se comparan igual
function normCCCode(v) {
  const s = String(v ?? '').trim().replace(/^0+/, '');
  return s || null;
}

// Normaliza nombre de CC: minúsculas, espacios simples
function normCCName(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

const fmt = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const THRESHOLD = 0.01;
const hasDiff   = d => d !== null && Math.abs(d) > THRESHOLD;
const diffStyle = d => hasDiff(d) ? 'color:var(--color-danger);font-weight:600;' : '';

// ── summarize ─────────────────────────────────────────────────────────────────

export function summarizeRendVsTabu(results) {
  const s      = results.summary;
  const anyDiff = COLS.some(c => s[`dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`] > 0);
  return {
    status:   anyDiff ? 'warning' : 'success',
    headline: `${s.total} centros de costo · ${s.sinTabData} sin datos en Tabulado`,
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

// ── runRendVsTabu ─────────────────────────────────────────────────────────────

export function runRendVsTabu(rendRows, tabRows, mapping) {
  const rm = mapping.rend;
  const tm = mapping.tab;

  // Columnas del Tabulado para cada importe
  const tabCols = {};
  for (const c of COLS) {
    tabCols[c.key] = c.tabKey ? (tm[c.tabKey] || null) : null;
  }
  const tabCcCodeCol  = tm.idCCColumn  || null;
  const tabCcNameCol  = tm.ccColumn    || null;
  const tabEmpresaCol = tm.tabRvtEmpresaColumn  || null;
  const tabRet9200Col = tm.tabRvtRet9200Column  || null;
  const tabRet9205Col = tm.tabRvtRet9205Column  || null;

  // ── Agrupar Tabulado por CC ────────────────────────────────────────────────
  const tabGroups = new Map();  // mapKey → bucket de sumas

  for (const row of tabRows) {
    const rawCode = tabCcCodeCol ? norm(row[tabCcCodeCol]) : '';
    const rawName = tabCcNameCol ? norm(row[tabCcNameCol]) : '';
    const codeKey = normCCCode(rawCode);
    const nameKey = normCCName(rawName);
    const mapKey  = codeKey || nameKey;
    if (!mapKey) continue;

    if (!tabGroups.has(mapKey)) {
      tabGroups.set(mapKey, {
        codeKey, nameKey,
        precio: 0, estimulo: 0, retiros: 0, cargas: 0, provMes: 0, provCcss: 0, total: 0,
      });
    }
    const g = tabGroups.get(mapKey);
    g.precio   += toNum(row[tabCols.precio])   ?? 0;
    g.estimulo += toNum(row[tabCols.estimulo]) ?? 0;
    g.cargas   += toNum(row[tabCols.cargas])   ?? 0;
    g.provMes  += toNum(row[tabCols.provMes])  ?? 0;
    g.provCcss += toNum(row[tabCols.provCcss]) ?? 0;
    g.total    += toNum(row[tabCols.total])    ?? 0;

    // RETIROS: conceptos 9200 + 9205, solo filas con EMPRESA = 03
    if (tabEmpresaCol) {
      const emp = norm(row[tabEmpresaCol]);
      if (emp === '03' || emp === '3') {
        g.retiros += (toNum(row[tabRet9200Col]) ?? 0) + (toNum(row[tabRet9205Col]) ?? 0);
      }
    }
  }

  // Índice secundario por nombre (fallback en el matching)
  const tabByName = new Map();
  for (const [, data] of tabGroups) {
    if (data.nameKey && !tabByName.has(data.nameKey)) tabByName.set(data.nameKey, data);
  }

  // ── Cruzar con Rendimiento ─────────────────────────────────────────────────
  const rows = [];

  for (const rRow of rendRows) {
    const ccCode = norm(rRow[rm.ccCodeColumn]);
    const ccName = norm(rRow[rm.ccNameColumn]);
    if (!ccName && !ccCode) continue;
    if (ccName.toLowerCase().startsWith('total')) continue;

    const rPrecio   = toNum(rRow[rm.precioColumn]);
    const rEstimulo = toNum(rRow[rm.estimuloColumn]);
    const rRetiros  = toNum(rRow[rm.retirosColumn]);
    const rCargas   = toNum(rRow[rm.cargasColumn]);
    const rProvMes  = toNum(rRow[rm.provMesColumn]);
    const rProvCcss = toNum(rRow[rm.provCcssColumn]);
    const rTotal    = toNum(rRow[rm.costoTotalColumn]);

    // Matching: código primero, nombre como fallback
    const codeKey = normCCCode(ccCode);
    const nameKey = normCCName(ccName);
    const tab = (codeKey && tabGroups.get(codeKey))
             || (nameKey && tabByName.get(nameKey))
             || null;

    const diff = (t, r) => (t !== null && r !== null) ? t - r : null;

    rows.push({
      ccCode, ccName,
      rPrecio, rEstimulo, rRetiros, rCargas, rProvMes, rProvCcss, rTotal,
      tPrecio:   tab ? tab.precio   : null,
      tEstimulo: tab ? tab.estimulo : null,
      tRetiros:  tab ? tab.retiros  : null,
      tCargas:   tab ? tab.cargas   : null,
      tProvMes:  tab ? tab.provMes  : null,
      tProvCcss: tab ? tab.provCcss : null,
      tTotal:    tab ? tab.total    : null,
      dPrecio:   diff(tab?.precio,   rPrecio),
      dEstimulo: diff(tab?.estimulo, rEstimulo),
      dRetiros:  diff(tab?.retiros,  rRetiros),
      dCargas:   diff(tab?.cargas,   rCargas),
      dProvMes:  diff(tab?.provMes,  rProvMes),
      dProvCcss: diff(tab?.provCcss, rProvCcss),
      dTotal:    diff(tab?.total,    rTotal),
      sinTabData: tab === null,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {
    total:       rows.length,
    sinTabData:  rows.filter(r => r.sinTabData).length,
    difPrecio:   rows.filter(r => hasDiff(r.dPrecio)).length,
    difEstimulo: rows.filter(r => hasDiff(r.dEstimulo)).length,
    difRetiros:  rows.filter(r => hasDiff(r.dRetiros)).length,
    difCargas:   rows.filter(r => hasDiff(r.dCargas)).length,
    difProvMes:  rows.filter(r => hasDiff(r.dProvMes)).length,
    difProvCcss: rows.filter(r => hasDiff(r.dProvCcss)).length,
    difTotal:    rows.filter(r => hasDiff(r.dTotal)).length,
  };

  return { summary, rows };
}

// ── renderRendVsTabuResults ───────────────────────────────────────────────────

export function renderRendVsTabuResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Acumuladores para fila de totales
  const totals = {};
  for (const c of COLS) {
    totals[c.rKey] = 0;
    totals[c.tKey] = 0;
  }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.tKey] += r[c.tKey] ?? 0;
    }
  }

  // ── Encabezados ───────────────────────────────────────────────────────────
  const hdr1 = COLS.map(c =>
    `<th colspan="3" style="text-align:center;background:${c.hdr};">${esc(c.label)}</th>`
  ).join('');

  const hdr2 = COLS.map(c => `
    <th style="text-align:right;background:${c.hdr};">Rend</th>
    <th style="text-align:right;background:${c.hdr};">Tab</th>
    <th style="text-align:right;background:${c.hdr};"><strong>CTRL</strong><br>
      <small style="font-weight:400;white-space:nowrap;">Tab−Rend</small></th>
  `).join('');

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const dataRows = rows.map(r => {
    const cells = COLS.map(c => `
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.rKey])}</td>
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.tKey])}</td>
      <td style="text-align:right;background:${c.bg};${diffStyle(r[c.dKey])}">${fmt(r[c.dKey])}</td>
    `).join('');
    const rowStyle = r.sinTabData ? ' style="opacity:0.55;"' : '';
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
    const d = totals[c.tKey] - totals[c.rKey];
    return `
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.rKey])}</td>
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.tKey])}</td>
      <td style="text-align:right;background:${c.hdr};font-weight:600;${diffStyle(d)}">${fmt(d)}</td>
    `;
  }).join('');

  // ── Nota sobre RETIROS ─────────────────────────────────────────────────────
  const hasRetirosConfig = rows.some(r => r.tRetiros !== null && r.tRetiros !== 0);
  const retirosNote = !hasRetirosConfig
    ? `<p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) var(--sp-3) 0;">
        ⓘ RETIROS (Tab) = 0 porque ninguna fila del Tabulado tiene EMPRESA = 03
        o las columnas 9200/9205 no están configuradas.
       </p>`
    : '';

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
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
    ${retirosNote}
  `;

  container.innerHTML = '';
  container.appendChild(tableWrap);
}
