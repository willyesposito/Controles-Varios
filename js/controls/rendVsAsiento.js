// rendVsAsiento.js — Control 6: Rendimiento vs Asiento (Contabilidad Desglosada)
import { diffStats } from './semaforo.js';
import { loadExcelJS, downloadWorkbook } from '../utils/exportData.js';
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

// ── Configuración por defecto ────────────────────────────────────────────────
//
// Mapeo de CONTA → categorías del Rendimiento. Se puede sobrescribir por cliente
// pasando `mapping.rvaConfig` con la misma estructura. La UI del wizard expone
// un editor para que el usuario lo ajuste.

export const DEFAULT_RVA_CONFIG = {
  // CUENTA_CONTAB → categoría: arrays porque PROV. MES tiene varias
  cuentaCats: {
    precio:   ['5208001'],
    estimulo: ['5208006'],
    cargas:   ['5208005'],
    provMes:  ['5208007', '5208004', '5208003'],
  },
  // PROV. CCSS MES: lista plana de ID_CONCEPTO. La fila va EXCLUSIVAMENTE a provCcss
  // sumando (DEBE − HABER). Los signos salen naturalmente de DEBE/HABER en cada fila.
  provCcssConcepts: ['3572', '3672', '7292', '3576', '3676', '7289'],
  // Redirects de CC: nombres CONTA que se suman al CC equivalente de Rendimiento.
  ccRedirects: [
    { from: 'Finanzas',   to: 'Servicios Legales' },
    { from: 'Facilities', to: 'Administración' },
  ],
};

/**
 * Construye índices rápidos desde la config para uso en runRendVsAsiento.
 * Tolera config vacía/parcial.
 */
function buildIndexes(config) {
  const cuentaToCat = new Map();
  const provCcss    = new Set();
  const ccRedir     = new Map();   // normKey → normKey
  const ccRedirLbl  = new Map();   // normKey destino → label legible

  for (const [catKey, codes] of Object.entries(config?.cuentaCats || {})) {
    for (const code of (codes || [])) {
      const c = String(code).trim();
      if (c) cuentaToCat.set(c, catKey);
    }
  }
  for (const code of (config?.provCcssConcepts || [])) {
    const c = String(code).trim();
    if (c) provCcss.add(c);
  }
  for (const { from, to } of (config?.ccRedirects || [])) {
    const fk = normCCName(from);
    const tk = normCCName(to);
    if (fk && tk) {
      ccRedir.set(fk, tk);
      ccRedirLbl.set(tk, String(to).trim());
    }
  }
  return { cuentaToCat, provCcss, ccRedir, ccRedirLbl };
}

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

// Mapa categoría → label legible
const CAT_LABELS = {
  precio:   'PRECIO',
  estimulo: 'ASIG. ESTÍMULO',
  cargas:   'CARGAS SS',
  provMes:  'PROV. MES',
};

/**
 * Convierte una config (DEFAULT_RVA_CONFIG-like) en filas de display para
 * el panel de mapeo. Cada fila trae { cat, entries: [{ code, type }] }.
 */
function configToDisplayBlocks(config) {
  const blocks = [];
  for (const [catKey, codes] of Object.entries(config?.cuentaCats || {})) {
    if (!codes || codes.length === 0) continue;
    blocks.push({
      cat: CAT_LABELS[catKey] || catKey,
      entries: codes.map(code => ({ code: String(code), type: 'cuenta' })),
    });
  }
  if (config?.provCcssConcepts?.length) {
    blocks.push({
      cat: 'PROV. CCSS MES',
      entries: config.provCcssConcepts.map(code => ({ code: String(code), type: 'concepto' })),
    });
  }
  return blocks;
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

// ── Drill-down (zoom de celdas CONTA) ────────────────────────────────────────

/**
 * Arma el desglose de una celda CONTA: filtra el detalle por CC y categoría,
 * agrupa por concepto (CUENTA_CONTAB + ID_CONCEPTO) y, dentro de cada concepto,
 * suma por empleado. Es el equivalente al doble click de una tabla dinámica.
 *
 * @param {Array} detalle  — filas clasificadas de runRendVsAsiento (results.meta.detalle)
 * @param {Object} filtro
 * @param {string|Set|null} filtro.ccKey — CC normalizado con normCCName(), o Set de varios.
 *                                          null = todos los CCs
 * @param {string|null} filtro.catLabel  — label de categoría ('PRECIO', …). null = todas
 * @returns {Array} conceptos ordenados por |neto| desc:
 *   { cuentaContab, nCuentaContable, idConcepto, nombreLargo, debe, haber, neto, asientos,
 *     empleados: [{ idEmpleado, nombre, debe, haber, neto, asientos }] }
 */
export function buildDrillRollup(detalle, { ccKey = null, catLabel = null } = {}) {
  const conceptos = new Map();

  for (const d of (detalle || [])) {
    // ccKey puede faltar en runs guardados antes de esta versión — fallback al nombre
    const dKey = d.ccKey || normCCName(d.ccRendimiento);
    if (ccKey instanceof Set) {
      if (!ccKey.has(dKey)) continue;
    } else if (ccKey && dKey !== ccKey) {
      continue;
    }
    if (catLabel && d.categoria !== catLabel) continue;

    const k = `${d.cuentaContab}|${d.idConcepto}`;
    let c = conceptos.get(k);
    if (!c) {
      c = {
        cuentaContab:    d.cuentaContab,
        nCuentaContable: d.nCuentaContable,
        idConcepto:      d.idConcepto,
        nombreLargo:     d.nombreLargo,
        debe: 0, haber: 0, neto: 0, asientos: 0,
        empleados: new Map(),
      };
      conceptos.set(k, c);
    }
    c.debe += d.debe; c.haber += d.haber; c.neto += d.neto; c.asientos++;

    const empId = d.idEmpleado || '(sin empleado)';
    let e = c.empleados.get(empId);
    if (!e) {
      e = { idEmpleado: d.idEmpleado, nombre: d.empleadoNombre || '', debe: 0, haber: 0, neto: 0, asientos: 0 };
      c.empleados.set(empId, e);
    }
    if (!e.nombre && d.empleadoNombre) e.nombre = d.empleadoNombre;
    e.debe += d.debe; e.haber += d.haber; e.neto += d.neto; e.asientos++;
  }

  return [...conceptos.values()]
    .map(c => ({
      ...c,
      empleados: [...c.empleados.values()].sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto)),
    }))
    .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
}

/**
 * Abre el modal de zoom para una celda CONTA (CC × categoría, o totales).
 * @param {Object} opts
 * @param {Array}  opts.detalle  — results.meta.detalle
 * @param {string|null} opts.ccKey — CC normalizado; null = todos (fila TOTAL GENERAL)
 * @param {string} opts.catKey    — clave de columna ('precio', …, 'total')
 * @param {string} opts.ccLabel   — texto a mostrar en el título
 * @param {number|null} opts.cellValue — valor de la celda, para validar la suma
 */
function openDrillModal({ detalle, ccKey, catKey, ccLabel, cellValue }) {
  // 'total' muestra las 5 categorías en secciones; las demás, una sola
  const cats = catKey === 'total'
    ? COLS.filter(c => c.key !== 'total')
    : COLS.filter(c => c.key === catKey);

  const fmtInt = v => v.toLocaleString('es-AR');

  const empTableHtml = (empleados) => `
    <table class="data-table data-table--compact" style="margin:var(--sp-2) 0 var(--sp-1);">
      <thead>
        <tr>
          <th>Legajo</th>
          <th>Apellido y Nombre</th>
          <th style="text-align:right;">Debe</th>
          <th style="text-align:right;">Haber</th>
          <th style="text-align:right;">Neto</th>
          <th style="text-align:right;">Asientos</th>
        </tr>
      </thead>
      <tbody>
        ${empleados.map(e => `
          <tr>
            <td style="font-family:monospace;white-space:nowrap;">${esc(e.idEmpleado || '—')}</td>
            <td>${esc(e.nombre || '')}</td>
            <td style="text-align:right;">${fmt(e.debe)}</td>
            <td style="text-align:right;">${fmt(e.haber)}</td>
            <td style="text-align:right;font-weight:600;">${fmt(e.neto)}</td>
            <td style="text-align:right;color:var(--color-text-muted);">${fmtInt(e.asientos)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const conceptBlockHtml = (c) => `
    <details style="border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:var(--sp-2);background:var(--color-bg);">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);user-select:none;">
        <span style="color:var(--color-primary);">▸</span>
        <span style="font-family:monospace;white-space:nowrap;">${esc(c.cuentaContab || '—')}${c.idConcepto ? ` · ${esc(c.idConcepto)}` : ''}</span>
        <span style="flex:1;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.nombreLargo || c.nCuentaContable || '')}</span>
        <span style="white-space:nowrap;font-weight:600;">${fmt(c.neto)}</span>
        <span style="white-space:nowrap;color:var(--color-text-muted);font-size:var(--text-sm);">${fmtInt(c.empleados.length)} empl. · ${fmtInt(c.asientos)} asien.</span>
      </summary>
      <div style="padding:0 var(--sp-3) var(--sp-2);overflow-x:auto;">
        ${empTableHtml(c.empleados)}
      </div>
    </details>
  `;

  let grandTotal = 0;
  const sectionsHtml = cats.map(col => {
    const conceptos = buildDrillRollup(detalle, { ccKey, catLabel: col.label });
    if (conceptos.length === 0) return '';
    const subTotal = conceptos.reduce((s, c) => s + c.neto, 0);
    grandTotal += subTotal;
    const header = cats.length > 1
      ? `<div style="display:flex;align-items:center;gap:var(--sp-2);margin:var(--sp-3) 0 var(--sp-2);padding:var(--sp-1) var(--sp-2);background:${col.hdr};border-radius:var(--radius-sm);font-weight:var(--fw-semibold);font-size:var(--text-sm);">
           <span style="flex:1;">${esc(col.label)}</span><span>${fmt(subTotal)}</span>
         </div>`
      : '';
    return header + conceptos.map(conceptBlockHtml).join('');
  }).join('');

  // Aviso defensivo: la suma del desglose debería coincidir con el valor de la celda
  const mismatch = (cellValue !== null && cellValue !== undefined && Math.abs(grandTotal - cellValue) > THRESHOLD)
    ? `<div class="alert alert--warning" style="margin:0 0 var(--sp-2);padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
         ⚠ La suma del desglose (${fmt(grandTotal)}) no coincide con el valor de la celda (${fmt(cellValue)}).
       </div>`
    : '';

  const catTitle = catKey === 'total' ? 'COSTO TOTAL' : (cats[0]?.label || '');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:var(--sp-4);';
  overlay.innerHTML = `
    <div style="background:var(--color-bg);border-radius:var(--radius-md);box-shadow:var(--shadow-md);max-width:min(980px,96vw);width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;" role="dialog" aria-modal="true">
      <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-3) var(--sp-4);border-bottom:1px solid var(--color-border);background:var(--color-surface);">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:var(--fw-semibold);">${esc(ccLabel)} — ${esc(catTitle)}</div>
          <div style="font-size:var(--text-sm);color:var(--color-text-muted);">CONTA: <strong>${fmt(grandTotal)}</strong> · click en un concepto para ver los empleados</div>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-drill-close style="font-size:1.1em;line-height:1;">✕</button>
      </div>
      <div style="padding:var(--sp-3) var(--sp-4);overflow-y:auto;">
        ${mismatch}
        ${sectionsHtml || '<p class="text-muted">Sin filas de CONTA para esta celda.</p>'}
      </div>
    </div>
  `;

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-drill-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
}

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
export function renderRendVsAsientoMappingPanel(container, { accountNames = {}, conceptNames = {}, config = DEFAULT_RVA_CONFIG, openByDefault = true } = {}) {
  const ccRedirRows = (config?.ccRedirects || []).map(({ from, to }) => ({ from, to }));

  const categoryRows = configToDisplayBlocks(config).map(({ cat, entries }) => {
    const items = entries.map(e => {
      const name = e.type === 'cuenta'
        ? (accountNames[e.code] || '')
        : (conceptNames[e.code] || '');
      return { code: e.code, name, type: e.type, sign: '' };
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

// ── Editor de configuración (versión editable del panel) ─────────────────────

/**
 * Renderiza un editor que permite al usuario modificar el mapeo CONTA → Rendimiento.
 * Cada cambio dispara onChange(newConfig).
 *
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {Object} opts.config            — config actual (default: DEFAULT_RVA_CONFIG)
 * @param {Object} opts.accountNames      — mapa CUENTA_CONTAB → N_CUENTA_CONTABLE (de CONTA)
 * @param {Object} opts.conceptNames      — mapa ID_CONCEPTO → NOMBRE_LARGO (de CONTA)
 * @param {Function} opts.onChange        — callback(newConfig)
 * @param {boolean} opts.openByDefault
 */
export function renderRendVsAsientoConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_RVA_CONFIG,
    accountNames = {},
    conceptNames = {},
    onChange = () => {},
    openByDefault = true,
  } = opts;

  // Clon mutable que el editor va modificando
  let current = JSON.parse(JSON.stringify(config));
  // Asegurar shape consistente
  if (!current.cuentaCats) current.cuentaCats = {};
  if (!current.provCcssConcepts) current.provCcssConcepts = [];
  if (!current.ccRedirects) current.ccRedirects = [];

  const parseList = s => String(s || '').split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  const parseRedirects = s => String(s || '').split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/);
      return m ? { from: m[1].trim(), to: m[2].trim() } : null;
    })
    .filter(Boolean);

  const lookupsHtml = (codes, lookupMap, emptyMsg) => {
    if (!codes.length) return `<em style="color:var(--color-text-muted);">${esc(emptyMsg)}</em>`;
    return codes.map(c => {
      const name = lookupMap[c];
      if (name) {
        return `<span style="display:inline-block;padding:2px 6px;margin:2px 4px 0 0;background:var(--color-match-exact-bg,#e6f7ec);border-radius:var(--radius-sm);font-family:monospace;font-size:var(--text-sm);"><strong>${esc(c)}</strong> · ${esc(name)}</span>`;
      }
      return `<span style="display:inline-block;padding:2px 6px;margin:2px 4px 0 0;background:var(--color-warning-bg,#fff4e0);border-radius:var(--radius-sm);font-family:monospace;font-size:var(--text-sm);"><strong>${esc(c)}</strong> · <em>no encontrado en CONTA</em></span>`;
    }).join('');
  };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);';

  const renderInner = () => {
    const ccRedirText = current.ccRedirects.map(r => `${r.from} → ${r.to}`).join('\n');

    editor.innerHTML = `
      <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;display:flex;align-items:center;gap:var(--sp-2);user-select:none;padding:var(--sp-2) 0;">
        <span>▾</span> Mapeo CONTA → Rendimiento — Configuración
      </summary>
      <div style="padding:var(--sp-4);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <p style="margin:0 0 var(--sp-3);font-size:var(--text-sm);color:var(--color-text-muted);">
          Los códigos definen cómo se clasifica cada fila de CONTA. Los cambios se guardan por cliente y se aplican al ejecutar.
        </p>

        <h5 style="margin:var(--sp-3) 0 var(--sp-2);font-size:var(--text-sm);">Clasificación por CUENTA_CONTAB</h5>
        ${['precio', 'estimulo', 'cargas', 'provMes'].map(catKey => {
          const codes = current.cuentaCats[catKey] || [];
          return `
            <div style="display:grid;grid-template-columns:160px 1fr;gap:var(--sp-3);align-items:start;margin-bottom:var(--sp-3);">
              <label class="form-label" style="margin:0;padding-top:6px;">${esc(CAT_LABELS[catKey])}</label>
              <div>
                <input type="text" class="form-input" data-rva-cat="${catKey}" value="${esc(codes.join(', '))}" placeholder="ej: 5208001, 5208002" style="font-family:monospace;">
                <div data-rva-lookup="cat-${catKey}" style="margin-top:6px;font-size:var(--text-sm);">${lookupsHtml(codes, accountNames, 'Sin códigos asignados')}</div>
              </div>
            </div>
          `;
        }).join('')}

        <h5 style="margin:var(--sp-4) 0 var(--sp-2);font-size:var(--text-sm);">PROV. CCSS MES (por ID_CONCEPTO)</h5>
        <div style="display:grid;grid-template-columns:160px 1fr;gap:var(--sp-3);align-items:start;margin-bottom:var(--sp-2);">
          <label class="form-label" style="margin:0;padding-top:6px;">Conceptos</label>
          <div>
            <input type="text" class="form-input" data-rva-prov-ccss value="${esc(current.provCcssConcepts.join(', '))}" placeholder="ej: 3572, 3672, 7292, 3576, 3676, 7289" style="font-family:monospace;">
            <div data-rva-lookup="prov-ccss" style="margin-top:6px;font-size:var(--text-sm);">${lookupsHtml(current.provCcssConcepts, conceptNames, 'Sin conceptos asignados')}</div>
            <p class="text-muted" style="margin:var(--sp-2) 0 0;font-size:var(--text-sm);">Las filas con estos conceptos van exclusivamente a PROV. CCSS MES sumando DEBE−HABER.</p>
          </div>
        </div>

        <h5 style="margin:var(--sp-4) 0 var(--sp-2);font-size:var(--text-sm);">Mapeo de Centro de Costo (CONTA → Rendimiento)</h5>
        <div style="display:grid;grid-template-columns:160px 1fr;gap:var(--sp-3);align-items:start;">
          <label class="form-label" style="margin:0;padding-top:6px;">Redirects</label>
          <div>
            <textarea class="form-input" data-rva-cc-redirects rows="${Math.max(current.ccRedirects.length + 1, 3)}" placeholder="Uno por línea — formato: CONTA → Rendimiento" style="font-family:monospace;width:100%;resize:vertical;">${esc(ccRedirText)}</textarea>
            <p class="text-muted" style="margin:var(--sp-2) 0 0;font-size:var(--text-sm);">Uno por línea. Ejemplo: <code>Finanzas → Servicios Legales</code></p>
          </div>
        </div>

        <div style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--color-border);">
          <button type="button" class="btn btn--ghost btn--sm" data-rva-reset>↻ Restaurar valores por defecto</button>
        </div>
      </div>
    `;

    // Event handlers después de cada render
    editor.querySelectorAll('[data-rva-cat]').forEach(input => {
      const catKey = input.dataset.rvaCat;
      const lookupDiv = editor.querySelector(`[data-rva-lookup="cat-${catKey}"]`);
      input.addEventListener('input', () => {
        const codes = parseList(input.value);
        lookupDiv.innerHTML = lookupsHtml(codes, accountNames, 'Sin códigos asignados');
      });
      input.addEventListener('change', () => {
        current.cuentaCats[catKey] = parseList(input.value);
        onChange(current);
      });
    });

    const provInput   = editor.querySelector('[data-rva-prov-ccss]');
    const provLookup  = editor.querySelector('[data-rva-lookup="prov-ccss"]');
    provInput?.addEventListener('input', () => {
      const codes = parseList(provInput.value);
      provLookup.innerHTML = lookupsHtml(codes, conceptNames, 'Sin conceptos asignados');
    });
    provInput?.addEventListener('change', () => {
      current.provCcssConcepts = parseList(provInput.value);
      onChange(current);
    });

    editor.querySelector('[data-rva-cc-redirects]')?.addEventListener('change', e => {
      current.ccRedirects = parseRedirects(e.target.value);
      onChange(current);
    });

    editor.querySelector('[data-rva-reset]')?.addEventListener('click', () => {
      current = JSON.parse(JSON.stringify(DEFAULT_RVA_CONFIG));
      onChange(current);
      renderInner();
    });
  };

  renderInner();
  container.appendChild(editor);
}

// ── runRendVsAsiento ──────────────────────────────────────────────────────────

export function runRendVsAsiento(rendRows, _tabRows, mapping) {
  const rm        = mapping.rend || {};
  const contaRows = mapping.contaRows || [];
  const ccXEeRows = mapping.ccXEeRows || [];
  const config    = mapping.rvaConfig || DEFAULT_RVA_CONFIG;
  const { cuentaToCat, provCcss, ccRedir, ccRedirLbl } = buildIndexes(config);

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
  const conceptNames = new Map();   // id_concepto code → NOMBRE_LARGO
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

    // Aplicar redirect de CC según la config
    const nameKey = ccRedir.get(origKey) ?? origKey;
    const wasRedirected = nameKey !== origKey;

    if (!contaGroups.has(nameKey)) {
      contaGroups.set(nameKey, {
        ccLabel: wasRedirected ? (ccRedirLbl.get(nameKey) ?? ccRaw) : ccRaw,
        precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0,
      });
    }
    const g     = contaGroups.get(nameKey);
    const valor = (toNum(row.debe) ?? 0) - (toNum(row.haber) ?? 0);

    // Colectar nombres de cuentas y conceptos para el panel de mapeo
    const cuentaCode = norm(row.cuenta_contab);
    if (cuentaCode && row.n_cuenta_contable && !accountNames.has(cuentaCode)) {
      accountNames.set(cuentaCode, norm(row.n_cuenta_contable));
    }
    const concepto = norm(row.id_concepto);
    if (concepto && row.nombre_largo && !conceptNames.has(concepto)) {
      conceptNames.set(concepto, norm(row.nombre_largo));
    }

    // Clasificación EXCLUSIVA: si la fila es de un concepto de PROV. CCSS, va sólo
    // a provCcss (no a CARGAS, aunque su CUENTA_CONTAB sea 5208005). El resto se
    // clasifica por CUENTA_CONTAB según la config.
    let catKey = null;
    if (provCcss.has(concepto)) {
      catKey = 'provCcss';
      g.provCcss += valor;
    } else {
      const catByAccount = cuentaCode ? cuentaToCat.get(cuentaCode) : null;
      if (catByAccount) {
        catKey = catByAccount;
        g[catByAccount] += valor;
      } else {
        noCategorizadas++;
      }
    }

    if (catKey) {
      detalle.push({
        ccKey:             nameKey,
        ccRendimiento:     g.ccLabel,
        ccOriginal:        wasRedirected ? ccRaw : '',
        categoria:         CAT_LABEL[catKey] || catKey,
        cuentaContab:      cuentaCode,
        nCuentaContable:   norm(row.n_cuenta_contable),
        idConcepto:        concepto,
        nombreLargo:       norm(row.nombre_largo),
        idEmpleado:        empleado,
        empleadoNombre:    [norm(row.apellido_1), norm(row.nombre)].filter(Boolean).join(', '),
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
    period: mapping.period || '',
    meta: {
      accountNames: Object.fromEntries(accountNames),
      conceptNames: Object.fromEntries(conceptNames),
      hasOverride,
      detalle,  // todas las filas clasificadas — usadas por las pestañas Detalle/Desglose del export
      config,   // config aplicada en este run (para que los Resultados puedan mostrar exactamente qué se usó)
    },
  };
}

// ── summarizeRendVsAsiento ────────────────────────────────────────────────────

export function summarizeRendVsAsiento(results) {
  if (results?.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null, diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }
  const s = results.summary;
  const anyDiff = COLS.some(c => {
    const k = `dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`;
    return s[k] > 0;
  });

  // Igual que en Rend vs Tabulado: unidad = CC, se excluye COSTO TOTAL de la
  // suma de monto (ya es la suma de las otras 5 categorías).
  const amountFields = COLS
    .filter(c => c.key !== 'total')
    .map(c => ({ key: c.dKey, get: r => r[c.dKey] }));
  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows, amountFields, row => row.ccName || row.ccCode
  );

  return {
    status:   anyDiff ? 'warning' : 'success',
    headline: `${s.total} centros de costo · ${s.sinContaData} sin datos en CONTA`
      + (s.ccsSoloEnConta > 0 ? ` · ${s.ccsSoloEnConta} CCs sólo en CONTA` : ''),
    insights: COLS.map(c => {
      const k = `dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`;
      return { type: s[k] > 0 ? 'warning' : 'success', label: `diferencias ${c.label}`, value: s[k] };
    }),
    unit: 'cc',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: null,
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
  const conceptNames = meta?.conceptNames || {};

  // ── Panel de cuentas utilizadas ───────────────────────────────────────────
  let accountMapSortCol = 'cat';  // 'cat' | 'code' | 'name'
  let accountMapSortAsc = true;

  const buildAccountMapRows = () => {
    const flat = [];
    const cfg = meta?.config || DEFAULT_RVA_CONFIG;
    for (const { cat, entries } of configToDisplayBlocks(cfg)) {
      for (const e of entries) {
        const name = e.type === 'cuenta'
          ? (accountNames[e.code] || '')
          : (conceptNames[e.code] || '(por ID_CONCEPTO)');
        flat.push({ cat, code: e.code, name, type: e.type, sign: '' });
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

  // Zoom: celda CONTA clickeable si hay detalle disponible (runs viejos guardados
  // sin meta.detalle simplemente no ofrecen drill-down).
  const drillable = (meta?.detalle?.length || 0) > 0;
  const contaTd = (val, c, ccKey, ccLabel, { strong = false } = {}) => {
    const baseStyle = `text-align:right;background:${strong ? c.hdr : c.bg};${strong ? 'font-weight:600;' : ''}`;
    if (!drillable || val === null) return `<td style="${baseStyle}">${fmt(val)}</td>`;
    return `<td data-drill-cc="${esc(ccKey)}" data-drill-cat="${esc(c.key)}" data-drill-label="${esc(ccLabel)}" data-drill-val="${val}"
      title="🔍 Ver desglose: conceptos y empleados"
      style="${baseStyle}cursor:zoom-in;text-decoration:underline dotted;text-underline-offset:3px;">${fmt(val)}</td>`;
  };

  const buildTbody = () => {
    const sorted = sortRows(rows);

    const dataRows = sorted.map(r => {
      const ccKey = normCCName(r.ccName) || '';
      const cells = COLS.map(c => `
        <td style="text-align:right;background:${c.bg};">${fmt(r[c.rKey])}</td>
        ${contaTd(r[c.cKey], c, ccKey, r.ccName)}
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
        ${contaTd(totals[c.cKey], c, '', 'TOTAL GENERAL', { strong: true })}
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
      const ccKey = normCCName(o.ccName) || '';
      const cells = COLS.map(c => contaTd(o[c.cKey], c, ccKey, o.ccName)).join('');
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

  // Eventos de la tabla principal por DELEGACIÓN (un solo listener en el wrapper):
  // - click en celda CONTA → modal de zoom (conceptos + empleados)
  // - click en header → sort (el tbody se re-renderiza; con delegación los
  //   listeners no se pierden, cosa que antes pasaba después del primer sort)
  tableWrap.addEventListener('click', e => {
    const drillTd = e.target.closest('td[data-drill-cat]');
    if (drillTd) {
      // Celda de la fila TOTAL GENERAL (cc vacío): limitar el desglose a los CCs
      // que efectivamente suman en esa fila (los que matchearon con Rendimiento).
      const isTotalRow = !drillTd.dataset.drillCc;
      const ccKey = isTotalRow
        ? new Set(rows.filter(r => !r.sinContaData).map(r => normCCName(r.ccName)).filter(Boolean))
        : drillTd.dataset.drillCc;
      const rawVal = drillTd.dataset.drillVal;
      openDrillModal({
        detalle:   meta?.detalle || [],
        ccKey,
        catKey:    drillTd.dataset.drillCat,
        ccLabel:   drillTd.dataset.drillLabel || 'TOTAL GENERAL',
        cellValue: (rawVal === '' || rawVal === undefined) ? null : Number(rawVal),
      });
      return;
    }

    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
    const table = tableWrap.querySelector('#js-rva-table');
    const oldTbody = table.querySelector('#js-rva-tbody');
    const newTbody = document.createElement('tbody');
    newTbody.id = 'js-rva-tbody';
    newTbody.innerHTML = buildTbody().replace('<tbody id="js-rva-tbody">', '').replace('</tbody>', '');
    oldTbody.replaceWith(newTbody);
    tableWrap.querySelector('#js-rva-hdr2').innerHTML = buildTheadTr2();
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

function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = period.split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}

// ── Pestañas adicionales del export ──────────────────────────────────────────

// Orden canónico de categorías para Desglose / Detalle (mismo orden que COLS sin total)
const DETAIL_CAT_ORDER = COLS.filter(c => c.key !== 'total').map(c => c.label);

/**
 * Construye el rollup CC × Cat × (Cuenta, Concepto) desde el detalle plano.
 * Devuelve un Map: cc → Map(cat → array de filas rolled-up ordenadas).
 */
function buildCcCatRollup(detalle) {
  const byCC = new Map();
  for (const d of detalle) {
    if (!byCC.has(d.ccRendimiento)) byCC.set(d.ccRendimiento, new Map());
    const byCat = byCC.get(d.ccRendimiento);
    if (!byCat.has(d.categoria)) byCat.set(d.categoria, new Map());
    const byKey = byCat.get(d.categoria);
    const k = `${d.cuentaContab}|${d.idConcepto}`;
    let r = byKey.get(k);
    if (!r) {
      r = {
        cuentaContab:    d.cuentaContab,
        nCuentaContable: d.nCuentaContable,
        idConcepto:      d.idConcepto,
        nombreLargo:     d.nombreLargo,
        debe: 0, haber: 0, neto: 0, filas: 0,
      };
      byKey.set(k, r);
    }
    r.debe += d.debe; r.haber += d.haber; r.neto += d.neto; r.filas++;
  }
  // Reemplazar Map(key→row) por array ordenado
  for (const [, byCat] of byCC) {
    for (const [cat, byKey] of byCat) {
      const arr = [...byKey.values()].sort((a, b) =>
        a.cuentaContab.localeCompare(b.cuentaContab, 'es') ||
        a.idConcepto.localeCompare(b.idConcepto, 'es')
      );
      byCat.set(cat, arr);
    }
  }
  return byCC;
}

/**
 * Pestaña "Desglose por CC" — rolled-up por CC × Categoría × Cuenta × Concepto.
 * Empieza con cada CC mostrando todas sus categorías (PRECIO, ASIG, CARGAS, PROV, PROV CCSS),
 * con subtotal por categoría dentro del CC, total por CC y total general al final.
 * Los totalizadores son FÓRMULAS de Excel (SUM) — así parece hecho a mano.
 */
function addDesglosePorCcSheet(wb, detalle) {
  const byCC = buildCcCatRollup(detalle);
  const sortedCCs = [...byCC.keys()].sort((a, b) => a.localeCompare(b, 'es'));

  const ws = wb.addWorksheet('Desglose por CC');
  ws.columns = [
    { width: 22 }, { width: 18 }, { width: 16 }, { width: 28 },
    { width: 14 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 8 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';

  // Header
  const hdr = ws.addRow([
    'CC Rendimiento', 'Categoría', 'CUENTA_CONTAB', 'N_CUENTA_CONTABLE',
    'ID_CONCEPTO', 'NOMBRE_LARGO', 'DEBE', 'HABER', 'NETO', 'Filas',
  ]);
  hdr.font = { ...bold };
  hdr.eachCell(cell => {
    cell.fill = solidFill('FFE0E0E0');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  // Helper: arma la fórmula SUM con un rango de filas + las columnas numéricas
  const sumRange = (col, fromRow, toRow) => `SUM(${col}${fromRow}:${col}${toRow})`;
  const sumRefs  = (col, rowNums) => `SUM(${rowNums.map(r => `${col}${r}`).join(',')})`;

  let currentRow = 1;  // fila 1 = header
  const ccTotalRowNums = [];

  for (const cc of sortedCCs) {
    const byCat = byCC.get(cc);
    const sortedCats = [...byCat.keys()].sort((a, b) =>
      DETAIL_CAT_ORDER.indexOf(a) - DETAIL_CAT_ORDER.indexOf(b)
    );
    const catSubtotalRowNums = [];

    for (const cat of sortedCats) {
      const rolled = byCat.get(cat);
      const catFirstDataRow = currentRow + 1;

      for (const rr of rolled) {
        const dr = ws.addRow([
          cc, cat, rr.cuentaContab, rr.nCuentaContable,
          rr.idConcepto, rr.nombreLargo,
          rr.debe, rr.haber, rr.neto, rr.filas,
        ]);
        dr.eachCell((cell, col) => {
          cell.font = { ...base };
          if (col >= 7 && col <= 9) cell.numFmt = numFmt;
          if (col >= 7) cell.alignment = { horizontal: 'right' };
        });
        currentRow++;
      }

      const catLastDataRow = currentRow;
      // Subtotal por categoría (dentro del CC) con fórmulas
      const subDebe  = rolled.reduce((s, r) => s + r.debe, 0);
      const subHaber = rolled.reduce((s, r) => s + r.haber, 0);
      const subNeto  = rolled.reduce((s, r) => s + r.neto, 0);
      const subFilas = rolled.reduce((s, r) => s + r.filas, 0);

      const sub = ws.addRow([
        '', `Subtotal ${cat}`, '', '', '', '',
        { formula: sumRange('G', catFirstDataRow, catLastDataRow), result: subDebe },
        { formula: sumRange('H', catFirstDataRow, catLastDataRow), result: subHaber },
        { formula: sumRange('I', catFirstDataRow, catLastDataRow), result: subNeto },
        { formula: sumRange('J', catFirstDataRow, catLastDataRow), result: subFilas },
      ]);
      sub.eachCell((cell, col) => {
        cell.font = { ...bold };
        cell.fill = solidFill('FFF5F5F5');
        if (col >= 7 && col <= 9) cell.numFmt = numFmt;
        if (col >= 7) cell.alignment = { horizontal: 'right' };
      });
      currentRow++;
      catSubtotalRowNums.push(currentRow);
    }

    // Total por CC (suma de los subtotales por categoría)
    const ccDebe  = catSubtotalRowNums.length > 0
      ? sortedCats.reduce((s, c) => s + byCat.get(c).reduce((ss, r) => ss + r.debe, 0), 0)
      : 0;
    const ccHaber = sortedCats.reduce((s, c) => s + byCat.get(c).reduce((ss, r) => ss + r.haber, 0), 0);
    const ccNeto  = sortedCats.reduce((s, c) => s + byCat.get(c).reduce((ss, r) => ss + r.neto, 0), 0);
    const ccFilas = sortedCats.reduce((s, c) => s + byCat.get(c).reduce((ss, r) => ss + r.filas, 0), 0);

    const ccTotal = ws.addRow([
      `Total ${cc}`, '', '', '', '', '',
      { formula: sumRefs('G', catSubtotalRowNums), result: ccDebe },
      { formula: sumRefs('H', catSubtotalRowNums), result: ccHaber },
      { formula: sumRefs('I', catSubtotalRowNums), result: ccNeto },
      { formula: sumRefs('J', catSubtotalRowNums), result: ccFilas },
    ]);
    ccTotal.eachCell((cell, col) => {
      cell.font = { ...bold };
      cell.fill = solidFill('FFD0E4F5');
      cell.border = { top: { style: 'thin', color: { argb: 'FF8FBADD' } } };
      if (col >= 7 && col <= 9) cell.numFmt = numFmt;
      if (col >= 7) cell.alignment = { horizontal: 'right' };
    });
    currentRow++;
    ccTotalRowNums.push(currentRow);

    // Fila en blanco separadora entre CCs
    ws.addRow([]);
    currentRow++;
  }

  // TOTAL GENERAL: suma de los totales por CC
  let grandDebe = 0, grandHaber = 0, grandNeto = 0, grandFilas = 0;
  for (const [, byCat] of byCC) {
    for (const [, rolled] of byCat) {
      for (const r of rolled) { grandDebe += r.debe; grandHaber += r.haber; grandNeto += r.neto; grandFilas += r.filas; }
    }
  }

  const grand = ws.addRow([
    'TOTAL GENERAL', '', '', '', '', '',
    { formula: sumRefs('G', ccTotalRowNums), result: grandDebe },
    { formula: sumRefs('H', ccTotalRowNums), result: grandHaber },
    { formula: sumRefs('I', ccTotalRowNums), result: grandNeto },
    { formula: sumRefs('J', ccTotalRowNums), result: grandFilas },
  ]);
  grand.eachCell((cell, col) => {
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
 * Pestaña "Detalle por empleado" — el mismo zoom de la pantalla pero plano:
 * una fila por CC × Categoría × Cuenta × Concepto × Empleado, con autofiltro
 * para poder filtrar como tabla dinámica.
 */
function addDetallePorEmpleadoSheet(wb, detalle) {
  const byKey = new Map();
  for (const d of detalle) {
    const k = [d.ccRendimiento, d.categoria, d.cuentaContab, d.idConcepto, d.idEmpleado].join('|');
    let r = byKey.get(k);
    if (!r) {
      r = {
        cc:              d.ccRendimiento,
        cat:             d.categoria,
        cuentaContab:    d.cuentaContab,
        nCuentaContable: d.nCuentaContable,
        idConcepto:      d.idConcepto,
        nombreLargo:     d.nombreLargo,
        idEmpleado:      d.idEmpleado,
        empleadoNombre:  d.empleadoNombre || '',
        debe: 0, haber: 0, neto: 0, asientos: 0,
      };
      byKey.set(k, r);
    }
    if (!r.empleadoNombre && d.empleadoNombre) r.empleadoNombre = d.empleadoNombre;
    r.debe += d.debe; r.haber += d.haber; r.neto += d.neto; r.asientos++;
  }

  const flatRows = [...byKey.values()].sort((a, b) =>
    a.cc.localeCompare(b.cc, 'es') ||
    DETAIL_CAT_ORDER.indexOf(a.cat) - DETAIL_CAT_ORDER.indexOf(b.cat) ||
    a.cuentaContab.localeCompare(b.cuentaContab, 'es') ||
    a.idConcepto.localeCompare(b.idConcepto, 'es') ||
    Math.abs(b.neto) - Math.abs(a.neto)
  );

  const ws = wb.addWorksheet('Detalle por empleado');
  ws.columns = [
    { width: 22 }, { width: 18 }, { width: 16 }, { width: 28 },
    { width: 14 }, { width: 28 }, { width: 12 }, { width: 28 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 9 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';

  const hdr = ws.addRow([
    'CC Rendimiento', 'Categoría', 'CUENTA_CONTAB', 'N_CUENTA_CONTABLE',
    'ID_CONCEPTO', 'NOMBRE_LARGO', 'Legajo', 'Apellido y Nombre',
    'DEBE', 'HABER', 'NETO', 'Asientos',
  ]);
  hdr.font = { ...bold };
  hdr.eachCell(cell => {
    cell.fill = solidFill('FFE0E0E0');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  for (const r of flatRows) {
    const dr = ws.addRow([
      r.cc, r.cat, r.cuentaContab, r.nCuentaContable,
      r.idConcepto, r.nombreLargo, r.idEmpleado, r.empleadoNombre,
      r.debe, r.haber, r.neto, r.asientos,
    ]);
    dr.eachCell((cell, col) => {
      cell.font = { ...base };
      if (col >= 9 && col <= 11) cell.numFmt = numFmt;
      if (col >= 9) cell.alignment = { horizontal: 'right' };
    });
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
}

async function exportRendVsAsientoToXlsx(results) {
  await loadExcelJS();
  const { rows, ccsSoloEnConta, meta, period } = results;
  const detalle  = meta?.detalle || [];
  const pSuffix  = periodSuffix(period);

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

  const r2 = ws.addRow(['', '', ...COLS.flatMap(() => [`Rend ${pSuffix}`, `CONTA ${pSuffix}`, 'CTRL\nCONTA−Rend'])]);
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

  // TOTAL GENERAL con fórmulas SUM (más auditable para el cliente que valores hardcoded)
  const totals = {};
  for (const c of COLS) { totals[c.rKey] = 0; totals[c.cKey] = 0; }
  for (const r of rows) {
    for (const c of COLS) { totals[c.rKey] += r[c.rKey] ?? 0; totals[c.cKey] += r[c.cKey] ?? 0; }
  }

  // Las filas de datos van de Excel row 3 (después del header de 2 filas) a 3+rows.length-1
  const firstDataRow = 3;
  const lastDataRow  = 2 + rows.length;
  const colLetter = n => {
    let s = '', k = n;
    while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
    return s;
  };
  const sumFormula = colN => ({ formula: `SUM(${colLetter(colN)}${firstDataRow}:${colLetter(colN)}${lastDataRow})` });

  const tr = ws.addRow(['TOTAL GENERAL', '', ...COLS.flatMap((c, i) => {
    const startCol = 3 + i * 3;
    const d = totals[c.cKey] - totals[c.rKey];
    return [
      { ...sumFormula(startCol),     result: totals[c.rKey] },
      { ...sumFormula(startCol + 1), result: totals[c.cKey] },
      { ...sumFormula(startCol + 2), result: d },
    ];
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

  // ── Pestaña: Desglose por CC (rolled-up con subtotales por CC y categoría) ──
  if (detalle.length > 0) {
    addDesglosePorCcSheet(wb, detalle);
    addDetallePorEmpleadoSheet(wb, detalle);
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

  await downloadWorkbook(wb, `RendVsCONTA_${pSuffix}.xlsx`);
}
