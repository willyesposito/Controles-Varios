// rendVsAsiento.js — Control 6: Rendimiento vs Asiento (Contabilidad Desglosada)
//
// Compara el Reporte de Rendimiento de M4 (por CC) contra la Contabilidad
// Desglosada (CONTA). Para cada CC, agrupa las filas de CONTA clasificando
// por CUENTA_CONTAB (categorías 1–4) y por ID_CONCEPTO (PROV. CCSS MES),
// suma DEBE − HABER y cruza contra el Rendimiento.
//
// Archivos:
//   - Rendimiento (rend_file)        — obligatorio
//   - Contabilidad Desglosada (CONTA) — obligatorio
//   - CC x Empleado                   — opcional, sobrescribe CC_NOMBRE de CONTA

// ── Clasificación por CUENTA_CONTAB ──────────────────────────────────────────

const CUENTA_CONTAB_CATS = {
  '5208001': 'precio',
  '5208006': 'estimulo',
  '5208005': 'cargas',
  '5208007': 'provMes',
  '5208004': 'provMes',
  '5208003': 'provMes',
};

// PROV. CCSS MES: clasificación EXCLUSIVA por ID_CONCEPTO.
// Estas 6 filas existen dentro de CUENTA_CONTAB 5208005 (CARGAS) pero conceptualmente
// pertenecen a PROV. CCSS MES — NO se cuentan en CARGAS.
// Los 3 "positivos" cargan al DEBE (3572, 3672, 7292) y los 3 "negativos" al HABER
// (3576, 3676, 7289); al sumar (DEBE − HABER) de las 6 filas, los signos caen naturalmente
// y el resultado equivale a (sum positivos) − (sum negativos).
const PROV_CCSS_POS = new Set(['3572', '3672', '7292']);
const PROV_CCSS_NEG = new Set(['3576', '3676', '7289']);
const PROV_CCSS_ALL = new Set([...PROV_CCSS_POS, ...PROV_CCSS_NEG]);

// Redirects de CC: Finanzas y Facilities en CONTA se suman a los CC equivalentes de Rendimiento
const CC_REDIR = {
  'finanzas':   'servicios legales',
  'facilities': 'administracion',
};
// Nombres legibles de los CC destino (para la etiqueta cuando el grupo se crea con datos redirigidos)
const CC_REDIR_LABEL = {
  'servicios legales': 'Servicios Legales',
  'administracion':    'Administración',
};

// ── Definición de columnas comparadas ────────────────────────────────────────

const COLS = [
  { key: 'precio',   label: 'PRECIO',         rKey: 'rPrecio',   cKey: 'cPrecio',   dKey: 'dPrecio',
    hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)',  xlHdr: 'FFCCE0F5', xlBg: 'FFF0F6FD' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO', rKey: 'rEstimulo', cKey: 'cEstimulo', dKey: 'dEstimulo',
    hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)',   xlHdr: 'FFC9EDD8', xlBg: 'FFEDF9F2' },
  { key: 'cargas',   label: 'CARGAS SS',      rKey: 'rCargas',   cKey: 'cCargas',   dKey: 'dCargas',
    hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)',    xlHdr: 'FFF5CCCC', xlBg: 'FFFCEAEA' },
  { key: 'provMes',  label: 'PROV. MES',      rKey: 'rProvMes',  cKey: 'cProvMes',  dKey: 'dProvMes',
    hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)',  xlHdr: 'FFC7EDF9', xlBg: 'FFEAF7FD' },
  { key: 'provCcss', label: 'PROV. CCSS MES', rKey: 'rProvCcss', cKey: 'cProvCcss', dKey: 'dProvCcss',
    hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)',   xlHdr: 'FFCCDDED', xlBg: 'FFEAF2F8' },
  { key: 'total',    label: 'COSTO TOTAL',    rKey: 'rTotal',    cKey: 'cTotal',    dKey: 'dTotal',
    hdr: 'rgba(64,64,64,0.18)',   bg: 'rgba(64,64,64,0.07)',   xlHdr: 'FFDCDCDC', xlBg: 'FFF2F2F2' },
];

// Panel de mapeo: qué cuenta/concepto alimenta cada categoría
export const ACCOUNT_MAP_DISPLAY = [
  { cat: 'PRECIO',         entries: [{ code: '5208001', type: 'cuenta' }] },
  { cat: 'ASIG. ESTÍMULO', entries: [{ code: '5208006', type: 'cuenta' }] },
  { cat: 'CARGAS SS',      entries: [{ code: '5208005', type: 'cuenta' }] },
  { cat: 'PROV. MES',      entries: [{ code: '5208007', type: 'cuenta' }, { code: '5208004', type: 'cuenta' }, { code: '5208003', type: 'cuenta' }] },
  { cat: 'PROV. CCSS MES', entries: [
    { code: '3572', type: 'concepto', sign: '+' },
    { code: '3672', type: 'concepto', sign: '+' },
    { code: '7292', type: 'concepto', sign: '+' },
    { code: '3576', type: 'concepto', sign: '−' },
    { code: '3676', type: 'concepto', sign: '−' },
    { code: '7289', type: 'concepto', sign: '−' },
  ]},
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
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    || null;
}

const fmt = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const THRESHOLD = 0.01;
const hasDiff   = d => d !== null && Math.abs(d) > THRESHOLD;
const diffStyle = d => hasDiff(d) ? 'color:var(--color-danger);font-weight:600;' : '';

// ── Panel de mapeo (visible en Archivos y en Resultados) ─────────────────────

/**
 * Renderiza un panel informativo con el mapeo de CONTA → Rendimiento.
 * @param {HTMLElement} container - dónde insertar el panel
 * @param {Object} opts
 * @param {Object} opts.accountNames - mapeo opcional CUENTA_CONTAB → nombre legible
 *                                     (ej: '5208001' → 'REMUNERACIONES'). Si no se
 *                                     pasa, solo se muestra el código.
 * @param {boolean} opts.openByDefault - si el <details> arranca abierto
 */
export function renderRendVsAsientoMappingPanel(container, { accountNames = {}, openByDefault = true } = {}) {
  const ccRedirRows = Object.entries(CC_REDIR).map(([from, to]) => ({
    from: from.replace(/\b\w/g, c => c.toUpperCase()),
    to:   CC_REDIR_LABEL[to] ?? to,
  }));

  const categoryRows = ACCOUNT_MAP_DISPLAY.map(({ cat, entries }) => {
    const items = entries.map(e => {
      const sign = e.sign || '';
      const name = e.type === 'cuenta' ? (accountNames[e.code] || '') : '';
      return { sign, code: e.code, name, type: e.type };
    });
    return { cat, items };
  });

  const itemHtml = it => {
    const signColor = it.sign === '−'
      ? 'color:var(--color-danger);'
      : it.sign === '+'
        ? 'color:var(--color-match-exact, green);'
        : '';
    const nameSuffix = it.name
      ? ` <span style="color:var(--color-text-muted);">— ${esc(it.name)}</span>`
      : '';
    const prefix = it.type === 'concepto' ? 'ID_CONCEPTO ' : '';
    return `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;background:var(--color-bg-subtle);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-family:monospace;font-size:var(--text-sm);${signColor}">${esc(prefix)}${esc(it.sign)}${esc(it.code)}${nameSuffix}</span>`;
  };

  const categoryRowsHtml = categoryRows.map(({ cat, items }) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid var(--color-border);font-weight:var(--fw-semibold);white-space:nowrap;vertical-align:top;background:var(--color-bg-subtle);">${esc(cat)}</td>
      <td style="padding:6px 10px;border:1px solid var(--color-border);">${items.map(itemHtml).join('')}</td>
    </tr>
  `).join('');

  const ccRedirHtml = ccRedirRows.length === 0
    ? ''
    : `
      <p style="margin:var(--sp-3) 0 var(--sp-2);font-size:var(--text-sm);font-weight:var(--fw-semibold);">Mapeo de Centro de Costo (CONTA → Rendimiento)</p>
      <ul style="margin:0;padding-left:var(--sp-5);font-size:var(--text-sm);line-height:1.8;">
        ${ccRedirRows.map(r => `<li><code>${esc(r.from)}</code> en CONTA → <code>${esc(r.to)}</code> en Rendimiento</li>`).join('')}
      </ul>
    `;

  const details = document.createElement('details');
  if (openByDefault) details.open = true;
  details.style.cssText = 'margin-top:var(--sp-3);';
  details.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;display:flex;align-items:center;gap:var(--sp-2);user-select:none;padding:var(--sp-2) 0;">
      <span class="js-rva-arrow">▾</span> Cómo se mapea CONTA a Rendimiento
    </summary>
    <div style="padding:var(--sp-3) var(--sp-4);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
      <p style="margin:0 0 var(--sp-3);font-size:var(--text-sm);color:var(--color-text-muted);">
        Cada fila de la Contabilidad Desglosada se clasifica según su <code>CUENTA_CONTAB</code>
        (o <code>ID_CONCEPTO</code> en el caso de PROV. CCSS MES). Por cada CC se suma <code>DEBE − HABER</code>
        y el total se compara contra la columna correspondiente del Rendimiento.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:var(--text-sm);">
        <thead>
          <tr>
            <th style="padding:6px 10px;border:1px solid var(--color-border);background:var(--color-bg-subtle);text-align:left;">Categoría</th>
            <th style="padding:6px 10px;border:1px solid var(--color-border);background:var(--color-bg-subtle);text-align:left;">Cuentas / Conceptos</th>
          </tr>
        </thead>
        <tbody>${categoryRowsHtml}</tbody>
      </table>
      ${ccRedirHtml}
      <p style="margin:var(--sp-3) 0 0;font-size:var(--text-sm);color:var(--color-text-muted);font-style:italic;">
        Estos códigos son fijos según el plan de cuentas estándar de M4. Si en tu caso son distintos, avisanos.
      </p>
    </div>
  `;
  container.appendChild(details);
}

// ── runRendVsAsiento ──────────────────────────────────────────────────────────

export function runRendVsAsiento(rendRows, _tabRows, mapping) {
  const rm        = mapping.rend || {};
  const contaRows = mapping.contaRows || [];
  const ccXEeRows = mapping.ccXEeRows || [];

  if (!rendRows?.length)  return { error: 'No hay datos del Reporte de Rendimiento.' };
  if (!contaRows?.length) return { error: 'No hay datos de Contabilidad Desglosada (CONTA).' };

  // Mapa de override por ID_EMPLEADO → CENTRO_COSTO (CC x Empleado opcional)
  const ccOverride = new Map();
  for (const r of ccXEeRows) {
    const emp = norm(r.id_empleado);
    const cc  = norm(r.centro_costo);
    if (emp && cc) ccOverride.set(emp, cc);
  }
  const hasOverride = ccOverride.size > 0;

  // ── Agrupar CONTA por CC × categoría ─────────────────────────────────────
  const contaGroups  = new Map();   // nameKey → bucket
  const accountNames = new Map();   // cuenta_contab code → N_CUENTA_CONTABLE
  const detalle      = [];          // toda fila clasificada (para Excel de auditoría)
  let noCategorizadas = 0;

  // Mapa categoría interna → label legible (para el detalle)
  const CAT_LABEL = Object.fromEntries(COLS.map(c => [c.key, c.label]));

  for (const row of contaRows) {
    const empleado = norm(row.id_empleado);
    const ccRaw    = hasOverride && empleado && ccOverride.has(empleado)
      ? ccOverride.get(empleado)
      : norm(row.cc_nombre);
    if (!ccRaw) continue;

    const origKey = normCCName(ccRaw);
    if (!origKey) continue;

    // Aplicar redirect de CC (Finanzas → Servicios Legales, Facilities → Administración)
    const nameKey = CC_REDIR[origKey] ?? origKey;
    const wasRedirected = nameKey !== origKey;

    if (!contaGroups.has(nameKey)) {
      contaGroups.set(nameKey, {
        ccLabel: wasRedirected ? (CC_REDIR_LABEL[nameKey] ?? ccRaw) : ccRaw,
        precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0,
      });
    }
    const g     = contaGroups.get(nameKey);
    const valor = (toNum(row.debe) ?? 0) - (toNum(row.haber) ?? 0);

    // Colectar nombres de cuentas para el panel de mapeo
    const cuentaCode = norm(row.cuenta_contab);
    if (cuentaCode && row.n_cuenta_contable && !accountNames.has(cuentaCode)) {
      accountNames.set(cuentaCode, norm(row.n_cuenta_contable));
    }

    // Clasificación EXCLUSIVA: si la fila es de un concepto de PROV. CCSS, va sólo
    // a provCcss (no a CARGAS, aunque su CUENTA_CONTAB sea 5208005). El resto se
    // clasifica por CUENTA_CONTAB.
    const concepto = norm(row.id_concepto);
    let catKey = null;
    if (PROV_CCSS_ALL.has(concepto)) {
      catKey = 'provCcss';
      g.provCcss += valor;
    } else {
      const catByAccount = cuentaCode ? CUENTA_CONTAB_CATS[cuentaCode] : null;
      if (catByAccount) {
        catKey = catByAccount;
        g[catByAccount] += valor;
      } else {
        noCategorizadas++;
      }
    }

    if (catKey) {
      detalle.push({
        ccRendimiento:     g.ccLabel,
        ccOriginal:        wasRedirected ? ccRaw : '',
        categoria:         CAT_LABEL[catKey] || catKey,
        cuentaContab:      cuentaCode,
        nCuentaContable:   norm(row.n_cuenta_contable),
        idConcepto:        concepto,
        nombreLargo:       norm(row.nombre_largo),
        idEmpleado:        empleado,
        debe:              toNum(row.debe)  ?? 0,
        haber:             toNum(row.haber) ?? 0,
        neto:              valor,
      });
    }
  }

  // COSTO TOTAL por grupo = suma de las 5 categorías
  for (const g of contaGroups.values()) {
    g.total = g.precio + g.estimulo + g.cargas + g.provMes + g.provCcss;
  }

  // ── Cruzar con Rendimiento ────────────────────────────────────────────────
  const rows      = [];
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

  // CCs solo en CONTA (sin contraparte en Rendimiento)
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

  const summary = {
    total:          rows.length,
    sinContaData:   rows.filter(r => r.sinContaData).length,
    ccsSoloEnConta: ccsSoloEnConta.length,
    noCategorizadas,
    difPrecio:   rows.filter(r => hasDiff(r.dPrecio)).length,
    difEstimulo: rows.filter(r => hasDiff(r.dEstimulo)).length,
    difCargas:   rows.filter(r => hasDiff(r.dCargas)).length,
    difProvMes:  rows.filter(r => hasDiff(r.dProvMes)).length,
    difProvCcss: rows.filter(r => hasDiff(r.dProvCcss)).length,
    difTotal:    rows.filter(r => hasDiff(r.dTotal)).length,
    usoCCXEE:    hasOverride,
  };

  return {
    summary, rows, ccsSoloEnConta,
    meta: {
      accountNames: Object.fromEntries(accountNames),
      hasOverride,
      detalle,  // todas las filas clasificadas — usadas por las pestañas Detalle/Desglose del export
    },
  };
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
      return { type: s[k] > 0 ? 'warning' : 'success', label: `diferencias ${c.label}`, value: s[k] };
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

  const { rows, ccsSoloEnConta, summary, meta } = results;

  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const accountNames = meta?.accountNames || {};

  // ── Panel de cuentas utilizadas ───────────────────────────────────────────
  let accountMapSortCol = 'cat';  // 'cat' | 'code' | 'name'
  let accountMapSortAsc = true;

  const buildAccountMapRows = () => {
    const flat = [];
    for (const { cat, entries } of ACCOUNT_MAP_DISPLAY) {
      for (const e of entries) {
        const name = e.type === 'cuenta'
          ? (accountNames[e.code] || '')
          : `(por ID_CONCEPTO)`;
        const sign = e.sign || '';
        flat.push({ cat, code: `${sign}${e.code}`, name, type: e.type, sign });
      }
    }
    return flat.sort((a, b) => {
      let va = a[accountMapSortCol === 'code' ? 'code' : accountMapSortCol === 'name' ? 'name' : 'cat'];
      let vb = b[accountMapSortCol === 'code' ? 'code' : accountMapSortCol === 'name' ? 'name' : 'cat'];
      const res = String(va).localeCompare(String(vb), 'es');
      return accountMapSortAsc ? res : -res;
    });
  };

  const buildAccountMapHtml = () => {
    const mapRows = buildAccountMapRows();
    const thStyle = col => `
      cursor:pointer;user-select:none;padding:4px 8px;
      background:var(--color-bg-subtle);border:1px solid var(--color-border);
      text-align:left;font-size:var(--text-sm);white-space:nowrap;
    `;
    const arrow = col => accountMapSortCol === col ? (accountMapSortAsc ? ' ▲' : ' ▼') : '';
    return `
      <table style="border-collapse:collapse;font-size:var(--text-sm);width:100%;">
        <thead>
          <tr>
            <th data-sort="cat"  style="${thStyle('cat')} ">Categoría${arrow('cat')}</th>
            <th data-sort="code" style="${thStyle('code')}">Código${arrow('code')}</th>
            <th data-sort="name" style="${thStyle('name')}">Nombre (CONTA)${arrow('name')}</th>
          </tr>
        </thead>
        <tbody>
          ${mapRows.map(r => `
            <tr>
              <td style="padding:3px 8px;border:1px solid var(--color-border);">${esc(r.cat)}</td>
              <td style="padding:3px 8px;border:1px solid var(--color-border);font-family:monospace;color:${r.sign === '−' ? 'var(--color-danger)' : r.sign === '+' ? 'var(--color-success,green)' : 'inherit'};">${esc(r.code)}</td>
              <td style="padding:3px 8px;border:1px solid var(--color-border);color:var(--color-text-muted);">${esc(r.name)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  // ── Tabla principal (sortable) ────────────────────────────────────────────
  let sortCol = null;
  let sortAsc = true;

  const sortRows = (arr) => {
    if (!sortCol) return arr;
    return [...arr].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (va === null && vb === null) return 0;
      if (va === null) return sortAsc ? 1 : -1;
      if (vb === null) return sortAsc ? -1 : 1;
      const res = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      return sortAsc ? res : -res;
    });
  };

  // Acumuladores para totales
  const totals = {};
  for (const c of COLS) { totals[c.rKey] = 0; totals[c.cKey] = 0; }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.cKey] += r[c.cKey] ?? 0;
    }
  }

  const buildTbody = () => {
    const sorted = sortRows(rows);
    const arrow = col => sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : '';

    const dataRows = sorted.map(r => {
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

    const totRow = COLS.map(c => {
      const d = totals[c.cKey] - totals[c.rKey];
      return `
        <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.rKey])}</td>
        <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.cKey])}</td>
        <td style="text-align:right;background:${c.hdr};font-weight:600;${diffStyle(d)}">${fmt(d)}</td>
      `;
    }).join('');

    return `
      <tbody id="js-rva-tbody">
        ${dataRows}
        <tr style="background:var(--color-surface);">
          <td colspan="2" style="font-weight:600;white-space:nowrap;">TOTAL GENERAL</td>
          ${totRow}
        </tr>
      </tbody>
    `;
  };

  const buildTheadTr2 = () => {
    const arrow = col => sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : '';
    return COLS.map(c => `
      <th data-sort="${c.rKey}" style="text-align:right;background:${c.hdr};cursor:pointer;user-select:none;white-space:nowrap;">Rend${arrow(c.rKey)}</th>
      <th data-sort="${c.cKey}" style="text-align:right;background:${c.hdr};cursor:pointer;user-select:none;white-space:nowrap;">CONTA${arrow(c.cKey)}</th>
      <th data-sort="${c.dKey}" style="text-align:right;background:${c.hdr};cursor:pointer;user-select:none;"><strong>CTRL</strong><br><small style="font-weight:400;white-space:nowrap;">CONTA−Rend${arrow(c.dKey)}</small></th>
    `).join('');
  };

  const hdr1 = COLS.map(c =>
    `<th colspan="3" style="text-align:center;background:${c.hdr};">${esc(c.label)}</th>`
  ).join('');

  // ── CCs sólo en CONTA ─────────────────────────────────────────────────────
  let orphansHtml = '';
  if (ccsSoloEnConta && ccsSoloEnConta.length > 0) {
    const orphanRows = ccsSoloEnConta.map(o => {
      const cells = COLS.map(c => `<td style="text-align:right;background:${c.bg};">${fmt(o[c.cKey])}</td>`).join('');
      return `<tr><td>${esc(o.ccName)}</td>${cells}</tr>`;
    }).join('');
    const orphanHeaders = COLS.map(c =>
      `<th style="text-align:right;background:${c.hdr};">${esc(c.label)}</th>`
    ).join('');
    orphansHtml = `
      <details open style="margin-top:var(--sp-4);">
        <summary style="cursor:pointer;font-weight:var(--fw-semibold);color:var(--color-warning);margin-bottom:var(--sp-2);">
          ▼ ⚠ ${ccsSoloEnConta.length} CC${ccsSoloEnConta.length !== 1 ? 's' : ''} en CONTA sin contraparte en Rendimiento
        </summary>
        <div style="overflow-x:auto;">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Centro de Costo (sólo CONTA)</th>${orphanHeaders}
              </tr>
            </thead>
            <tbody>${orphanRows}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  // ── Badges ────────────────────────────────────────────────────────────────
  const badges = [];
  if (summary?.usoCCXEE) badges.push(`<span class="badge badge--info">↺ CC x Empleado aplicado</span>`);
  if (summary?.noCategorizadas > 0) badges.push(`<span class="badge badge--warning">${summary.noCategorizadas} filas CONTA no categorizadas</span>`);
  const badgesHtml = badges.length
    ? `<div style="margin-bottom:var(--sp-2);font-size:var(--text-sm);display:flex;gap:var(--sp-2);">${badges.join('')}</div>`
    : '';

  // ── Render final ─────────────────────────────────────────────────────────
  container.innerHTML = '';

  // Botón exportar
  const exportBtn = document.createElement('div');
  exportBtn.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:var(--sp-2);';
  exportBtn.innerHTML = `<button type="button" id="js-rva-export" class="btn btn--ghost btn--sm">⬇ Exportar a Excel</button>`;
  container.appendChild(exportBtn);

  // Panel de cuentas
  const accountPanel = document.createElement('details');
  accountPanel.style.cssText = 'margin-bottom:var(--sp-3);';
  accountPanel.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;display:flex;align-items:center;gap:var(--sp-2);user-select:none;">
      ▸ Cuentas y conceptos utilizados
    </summary>
    <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow-x:auto;" id="js-rva-account-map">
      ${buildAccountMapHtml()}
    </div>
  `;
  container.appendChild(accountPanel);

  // Tabla principal
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.innerHTML = `
    ${badgesHtml}
    <table class="data-table data-table--compact" id="js-rva-table">
      <thead>
        <tr>
          <th rowspan="2" data-sort="ccCode" style="cursor:pointer;user-select:none;white-space:nowrap;">CC</th>
          <th rowspan="2" data-sort="ccName" style="cursor:pointer;user-select:none;">Centro de Costo</th>
          ${hdr1}
        </tr>
        <tr id="js-rva-hdr2">
          ${buildTheadTr2()}
        </tr>
      </thead>
      ${buildTbody()}
    </table>
    ${orphansHtml}
  `;
  container.appendChild(tableWrap);

  // Eventos: sort en tabla principal
  tableWrap.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      // Re-render tbody y encabezados de fila 2
      const table = tableWrap.querySelector('#js-rva-table');
      const oldTbody = table.querySelector('#js-rva-tbody');
      const newTbody = document.createElement('tbody');
      newTbody.id = 'js-rva-tbody';
      newTbody.innerHTML = buildTbody().replace('<tbody id="js-rva-tbody">', '').replace('</tbody>', '');
      oldTbody.replaceWith(newTbody);
      tableWrap.querySelector('#js-rva-hdr2').innerHTML = buildTheadTr2();
      // Re-attach sort listeners en los nuevos headers
      tableWrap.querySelectorAll('th[data-sort]').forEach(th2 => {
        th2.addEventListener('click', th2._sortFn || (() => {}));
      });
    });
  });

  // Eventos: sort en panel de cuentas
  const mapDiv = accountPanel.querySelector('#js-rva-account-map');
  mapDiv?.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (accountMapSortCol === col) accountMapSortAsc = !accountMapSortAsc;
    else { accountMapSortCol = col; accountMapSortAsc = true; }
    mapDiv.innerHTML = buildAccountMapHtml();
  });

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

// ── Pestañas adicionales del export ──────────────────────────────────────────

// Orden canónico de categorías para Desglose / Detalle (mismo orden que COLS sin total)
const DETAIL_CAT_ORDER = COLS.filter(c => c.key !== 'total').map(c => c.label);

/**
 * Pestaña "Desglose por Categoría" — totales rolled-up por CC × Cuenta × Concepto,
 * agrupados por categoría. Ideal para mandar al cliente: cada bloque de categoría
 * cierra con su subtotal y al final hay un total general.
 */
function addDesgloseSheet(wb, detalle) {
  // Rollup: clave = categoria|cc|cuenta|concepto
  const rollup = new Map();
  for (const d of detalle) {
    const key = `${d.categoria}|${d.ccRendimiento}|${d.cuentaContab}|${d.idConcepto}`;
    let r = rollup.get(key);
    if (!r) {
      r = {
        categoria:       d.categoria,
        ccRendimiento:   d.ccRendimiento,
        cuentaContab:    d.cuentaContab,
        nCuentaContable: d.nCuentaContable,
        idConcepto:      d.idConcepto,
        nombreLargo:     d.nombreLargo,
        debe: 0, haber: 0, neto: 0, filas: 0,
      };
      rollup.set(key, r);
    }
    r.debe  += d.debe;
    r.haber += d.haber;
    r.neto  += d.neto;
    r.filas++;
  }

  const sorted = [...rollup.values()].sort((a, b) => {
    const ca = DETAIL_CAT_ORDER.indexOf(a.categoria);
    const cb = DETAIL_CAT_ORDER.indexOf(b.categoria);
    if (ca !== cb) return ca - cb;
    return a.ccRendimiento.localeCompare(b.ccRendimiento, 'es')
        || a.cuentaContab.localeCompare(b.cuentaContab, 'es')
        || a.idConcepto.localeCompare(b.idConcepto, 'es');
  });

  const ws = wb.addWorksheet('Desglose por Categoría');
  ws.columns = [
    { width: 22 }, { width: 28 }, { width: 16 }, { width: 28 },
    { width: 14 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 8 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';

  // Header
  const hdr = ws.addRow([
    'Categoría', 'CC Rendimiento', 'CUENTA_CONTAB', 'N_CUENTA_CONTABLE',
    'ID_CONCEPTO', 'NOMBRE_LARGO', 'DEBE', 'HABER', 'NETO', 'Filas',
  ]);
  hdr.font = { ...bold };
  hdr.eachCell(cell => {
    cell.fill = solidFill('FFE0E0E0');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  // Filas por categoría con subtotales
  let currentCat = null;
  let catTotals = { debe: 0, haber: 0, neto: 0, filas: 0 };
  let grandTotal = { debe: 0, haber: 0, neto: 0, filas: 0 };

  const writeCatSubtotal = (cat, t) => {
    const r = ws.addRow([`Subtotal ${cat}`, '', '', '', '', '', t.debe, t.haber, t.neto, t.filas]);
    r.eachCell((cell, col) => {
      cell.font = { ...bold };
      cell.fill = solidFill('FFEEEEEE');
      if (col >= 7 && col <= 9) cell.numFmt = numFmt;
      if (col >= 7) cell.alignment = { horizontal: 'right' };
    });
    ws.addRow([]);  // blank separator
  };

  for (const r of sorted) {
    if (currentCat && currentCat !== r.categoria) {
      writeCatSubtotal(currentCat, catTotals);
      catTotals = { debe: 0, haber: 0, neto: 0, filas: 0 };
    }
    currentCat = r.categoria;

    const dataRow = ws.addRow([
      r.categoria, r.ccRendimiento, r.cuentaContab, r.nCuentaContable,
      r.idConcepto, r.nombreLargo, r.debe, r.haber, r.neto, r.filas,
    ]);
    dataRow.eachCell((cell, col) => {
      cell.font = { ...base };
      if (col >= 7 && col <= 9) cell.numFmt = numFmt;
      if (col >= 7) cell.alignment = { horizontal: 'right' };
    });

    catTotals.debe += r.debe; catTotals.haber += r.haber; catTotals.neto += r.neto; catTotals.filas += r.filas;
    grandTotal.debe += r.debe; grandTotal.haber += r.haber; grandTotal.neto += r.neto; grandTotal.filas += r.filas;
  }

  if (currentCat) writeCatSubtotal(currentCat, catTotals);

  const totalRow = ws.addRow(['TOTAL GENERAL', '', '', '', '', '', grandTotal.debe, grandTotal.haber, grandTotal.neto, grandTotal.filas]);
  totalRow.eachCell((cell, col) => {
    cell.font = { ...bold };
    cell.fill = solidFill('FFDCDCDC');
    cell.border = { top: { style: 'medium', color: { argb: 'FF808080' } } };
    if (col >= 7 && col <= 9) cell.numFmt = numFmt;
    if (col >= 7) cell.alignment = { horizontal: 'right' };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
}

/**
 * Pestaña "Detalle clasificado" — fila por fila de CONTA con la clasificación.
 * Diseñada para que el cliente pueda armar sus propias tablas dinámicas en Excel.
 */
function addDetalleSheet(wb, detalle) {
  const ws = wb.addWorksheet('Detalle clasificado');
  ws.columns = [
    { width: 22 }, { width: 22 }, { width: 22 },  // CC Rend / CC Original / Categoría
    { width: 16 }, { width: 28 },                  // Cuenta / N_Cuenta
    { width: 14 }, { width: 28 },                  // Concepto / Nombre largo
    { width: 14 },                                  // ID_EMPLEADO
    { width: 16 }, { width: 16 }, { width: 16 },  // DEBE / HABER / NETO
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';

  const hdr = ws.addRow([
    'CC Rendimiento', 'CC Original CONTA', 'Categoría',
    'CUENTA_CONTAB', 'N_CUENTA_CONTABLE',
    'ID_CONCEPTO', 'NOMBRE_LARGO',
    'ID_EMPLEADO', 'DEBE', 'HABER', 'NETO',
  ]);
  hdr.font = { ...bold };
  hdr.eachCell(cell => {
    cell.fill = solidFill('FFE0E0E0');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  const sorted = [...detalle].sort((a, b) => {
    const ca = DETAIL_CAT_ORDER.indexOf(a.categoria);
    const cb = DETAIL_CAT_ORDER.indexOf(b.categoria);
    return a.ccRendimiento.localeCompare(b.ccRendimiento, 'es')
        || (ca - cb)
        || a.cuentaContab.localeCompare(b.cuentaContab, 'es')
        || a.idConcepto.localeCompare(b.idConcepto, 'es')
        || a.idEmpleado.localeCompare(b.idEmpleado, 'es');
  });

  for (const d of sorted) {
    const dr = ws.addRow([
      d.ccRendimiento, d.ccOriginal, d.categoria,
      d.cuentaContab, d.nCuentaContable,
      d.idConcepto, d.nombreLargo,
      d.idEmpleado, d.debe, d.haber, d.neto,
    ]);
    dr.eachCell((cell, col) => {
      cell.font = { ...base };
      if (col >= 9) { cell.numFmt = numFmt; cell.alignment = { horizontal: 'right' }; }
    });
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
}

async function exportRendVsAsientoToXlsx(results) {
  await loadExcelJS();
  const { rows, ccsSoloEnConta, meta } = results;
  const detalle = meta?.detalle || [];

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Resumen');

  ws.columns = [
    { width: 10 }, { width: 30 },
    ...COLS.flatMap(() => [{ width: 18 }, { width: 18 }, { width: 18 }]),
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base    = { name: 'Calibri', size: 10 };
  const bold    = { ...base, bold: true };
  const numFmt  = '#,##0.00';
  const RED     = 'FFCC0000';
  const GRAY_HDR = 'FFE0E0E0';

  const r1 = ws.addRow(['Código CC', 'Centro de Costo', ...COLS.flatMap(c => [c.label, null, null])]);
  r1.height = 22;
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  COLS.forEach((c, i) => {
    const startCol = 3 + i * 3;
    ws.mergeCells(1, startCol, 1, startCol + 2);
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
  });

  const r2 = ws.addRow(['', '', ...COLS.flatMap(() => ['Rend', 'CONTA', 'CTRL\nCONTA−Rend'])]);
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

  for (const r of rows) {
    const dr = ws.addRow([r.ccCode, r.ccName, ...COLS.flatMap(c => [r[c.rKey], r[c.cKey], r[c.dKey]])]);
    COLS.forEach((c, i) => {
      const startCol = 3 + i * 3;
      for (let col = startCol; col <= startCol + 2; col++) {
        const cell = dr.getCell(col);
        cell.numFmt    = numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill      = solidFill(c.xlBg);
        cell.font      = { ...base };
      }
      const dVal = r[c.dKey];
      if (dVal !== null && Math.abs(dVal) > 0.01) {
        dr.getCell(startCol + 2).font = { ...bold, color: { argb: RED } };
      }
    });
    if (r.sinContaData) dr.eachCell(cell => { cell.font = { ...cell.font, color: { argb: 'FF999999' } }; });
  }

  const totals = {};
  for (const c of COLS) { totals[c.rKey] = 0; totals[c.cKey] = 0; }
  for (const r of rows) {
    for (const c of COLS) { totals[c.rKey] += r[c.rKey] ?? 0; totals[c.cKey] += r[c.cKey] ?? 0; }
  }
  const tr = ws.addRow(['TOTAL GENERAL', '', ...COLS.flatMap(c => {
    const d = totals[c.cKey] - totals[c.rKey];
    return [totals[c.rKey], totals[c.cKey], d];
  })]);
  tr.getCell(1).font = { ...bold };
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
    const d = totals[c.cKey] - totals[c.rKey];
    if (Math.abs(d) > 0.01) tr.getCell(startCol + 2).font = { ...bold, color: { argb: RED } };
  });

  // ── Pestaña: Desglose por Categoría (rolled-up por CC × Cuenta × Concepto) ──
  if (detalle.length > 0) {
    addDesgloseSheet(wb, detalle);
    addDetalleSheet(wb, detalle);
  }

  if (ccsSoloEnConta && ccsSoloEnConta.length > 0) {
    const ws2 = wb.addWorksheet('CCs sólo en CONTA');
    ws2.columns = [{ width: 30 }, ...COLS.map(() => ({ width: 18 }))];
    const h2 = ws2.addRow(['Centro de Costo', ...COLS.map(c => c.label)]);
    h2.font = { ...bold };
    h2.eachCell(cell => { cell.fill = solidFill(GRAY_HDR); cell.alignment = { horizontal: 'center' }; });
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
