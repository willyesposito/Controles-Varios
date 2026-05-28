// rendVsTabu.js — Control 5: Rendimiento vs Tabulado (RendvsTabu)
//
// Compara el Reporte de Rendimiento de M4 (por CC) contra el Tabulado.
// Calcula PRECIO, ASIG. ESTÍMULO, CARGAS SS, PROV. MES, PROV. CCSS MES y RETIROS
// directamente de las columnas individuales del Tabulado (ej: "1003-SUELDO"),
// usando los conceptos definidos en "Detalles de conceptos".

// ── Conceptos del Tabulado por categoría ─────────────────────────────────────
// sign: +1 suma, -1 resta
// Fuente: pestaña "Detalles de conceptos" del archivo de referencia.

const CONCEPT_CONFIG = {
  precio: [
    { code: '1153', sign: 1 }, { code: '2000', sign: 1 }, { code: '2996', sign: 1 },
    { code: '3025', sign: 1 }, { code: '3999', sign: 1 }, { code: '4897', sign: 1 },
    { code: '8505', sign: 1 }, { code: '8508', sign: 1 }, { code: '5800', sign: 1 },
    { code: '1003', sign: 1 }, { code: '1004', sign: 1 }, { code: '1163', sign: 1 },
    { code: '1017', sign: 1 }, { code: '4092', sign: 1 }, { code: '4110', sign: 1 },
    { code: '4091', sign: 1 }, { code: '4130', sign: 1 }, { code: '4473', sign: 1 },
  ],
  estimulo: [
    { code: '1006', sign: 1 }, { code: '1009', sign: 1 },
  ],
  cargas: [
    { code: '6050', sign:  1 }, { code: '6093', sign:  1 }, { code: '6100', sign:  1 },
    { code: '6110', sign: -1 }, { code: '6120', sign:  1 }, { code: '6130', sign: -1 },
    { code: '6134', sign:  1 }, { code: '6145', sign:  1 }, { code: '7015', sign:  1 },
  ],
  provMes: [
    { code: '3670', sign:  1 }, { code: '3674', sign:  1 }, { code: '3570', sign:  1 },
    { code: '3574', sign: -1 }, { code: '7291', sign:  1 }, { code: '7290', sign: -1 },
  ],
  provCcss: [
    { code: '3672', sign:  1 }, { code: '3676', sign:  1 }, { code: '3572', sign:  1 },
    { code: '3576', sign: -1 }, { code: '7292', sign:  1 }, { code: '7289', sign: -1 },
  ],
  // Solo para filas donde EMPRESA = 03
  retiros: [
    { code: '9200', sign: 1 }, { code: '9205', sign: 1 },
  ],
};

// ── Definición de columnas de comparación ────────────────────────────────────

const COLS = [
  { key: 'precio',   label: 'PRECIO',          rKey: 'rPrecio',   tKey: 'tPrecio',   dKey: 'dPrecio',
    hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  rKey: 'rEstimulo', tKey: 'tEstimulo', dKey: 'dEstimulo',
    hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)' },
  { key: 'retiros',  label: 'RETIROS',         rKey: 'rRetiros',  tKey: 'tRetiros',  dKey: 'dRetiros',
    hdr: 'rgba(112,48,160,0.22)', bg: 'rgba(112,48,160,0.08)' },
  { key: 'cargas',   label: 'CARGAS SS',       rKey: 'rCargas',   tKey: 'tCargas',   dKey: 'dCargas',
    hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)' },
  { key: 'provMes',  label: 'PROV. MES',       rKey: 'rProvMes',  tKey: 'tProvMes',  dKey: 'dProvMes',
    hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  rKey: 'rProvCcss', tKey: 'tProvCcss', dKey: 'dProvCcss',
    hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)' },
  { key: 'total',    label: 'COSTO TOTAL',     rKey: 'rTotal',    tKey: 'tTotal',    dKey: 'dTotal',
    hdr: 'rgba(64,64,64,0.18)',   bg: 'rgba(64,64,64,0.07)' },
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

// Normaliza código de CC: quita ceros iniciales → "0011" y "11" se comparan igual
function normCCCode(v) {
  const s = String(v ?? '').trim().replace(/^0+/, '');
  return s || null;
}

function normCCName(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

const fmt = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const THRESHOLD = 0.01;
const hasDiff   = d => d !== null && Math.abs(d) > THRESHOLD;
const diffStyle = d => hasDiff(d) ? 'color:var(--color-danger);font-weight:600;' : '';

// Construye mapa código numérico → clave de columna a partir de los headers del Tabulado.
// Soporta formato "1003-SUELDO" (extrae "1003") o nombre numérico exacto "1003".
function buildColByCode(sampleRow) {
  const colByCode = {};
  for (const col of Object.keys(sampleRow)) {
    const s = String(col).trim();
    const m = s.match(/^(\d+)[-_]/);
    if (m) {
      if (!colByCode[m[1]]) colByCode[m[1]] = col;
    } else if (/^\d+$/.test(s)) {
      if (!colByCode[s]) colByCode[s] = col;
    }
  }
  return colByCode;
}

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

  // Construir mapa código → columna desde los headers del Tabulado
  const sampleRow  = tabRows[0] || {};
  const colByCode  = buildColByCode(sampleRow);

  // Para cada categoría, resolver qué columnas del Tabulado corresponden
  const catCols = {};
  for (const [catKey, entries] of Object.entries(CONCEPT_CONFIG)) {
    catCols[catKey] = entries
      .map(e => ({ col: colByCode[e.code] || null, sign: e.sign, code: e.code }))
      .filter(e => e.col !== null);
  }

  const retirosColsFound = catCols.retiros.length > 0;

  // Columna EMPRESA para filtro de retiros (busca header exactamente igual a 'EMPRESA')
  const empresaCol = Object.keys(sampleRow)
    .find(k => String(k).trim().toUpperCase() === 'EMPRESA') || null;

  // Columnas CC del Tabulado (del mapping estándar del tabulado)
  const tabCcCodeCol = tm.idCCColumn || null;
  const tabCcNameCol = tm.ccColumn   || null;

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
        precio: 0, estimulo: 0, retiros: 0, cargas: 0, provMes: 0, provCcss: 0,
      });
    }
    const g = tabGroups.get(mapKey);

    // Sumar conceptos para cada categoría (excepto retiros)
    for (const catKey of ['precio', 'estimulo', 'cargas', 'provMes', 'provCcss']) {
      for (const { col, sign } of catCols[catKey]) {
        g[catKey] += (toNum(row[col]) ?? 0) * sign;
      }
    }

    // RETIROS: solo filas donde EMPRESA = 03
    if (empresaCol) {
      const emp = norm(row[empresaCol]);
      if (emp === '03' || emp === '3') {
        for (const { col, sign } of catCols.retiros) {
          g.retiros += (toNum(row[col]) ?? 0) * sign;
        }
      }
    }
  }

  // COSTO TOTAL por grupo = suma de todas las categorías
  for (const g of tabGroups.values()) {
    g.total = g.precio + g.estimulo + g.retiros + g.cargas + g.provMes + g.provCcss;
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

  return { summary, rows, meta: { retirosColsFound } };
}

// ── renderRendVsTabuResults ───────────────────────────────────────────────────

export function renderRendVsTabuResults(results, container) {
  const { rows, meta } = results;

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
  const retirosNote = !meta?.retirosColsFound
    ? `<p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) var(--sp-3) 0;">
        ⓘ RETIROS (Tab) = 0 porque el Tabulado no tiene columnas con código 9200 o 9205.
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
