// rendVsAsiento.js — Control 6: Rendimiento vs Asiento
//
// Compara el Reporte de Rendimiento de M4 (por CC) contra el Asiento Contable.
// Verifica que los importes de cada categoría (PRECIO, CARGAS SS, etc.)
// del Rendimiento coincidan con las líneas correspondientes del Asiento.

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Run ───────────────────────────────────────────────────────────────────────

export function runRendVsAsiento(primaryRows, tabRows, mapping) {
  // primaryRows = filas del Reporte de Rendimiento
  // mapping.asientoRows = filas del Asiento Contable
  const rendRows    = primaryRows || [];
  const asientoRows = mapping?.asientoRows || [];   // pasadas por el wizard desde el segundo additionalFile

  if (!rendRows.length) return { error: 'No hay datos del Reporte de Rendimiento.' };
  if (!asientoRows.length) return { error: 'No hay datos del Asiento Contable.' };

  // TODO: implementar lógica de cruce una vez conocido el formato del Asiento.
  // Por ahora devuelve un resultado pendiente para que el control sea registrable.
  return {
    pending: true,
    message: 'Control pendiente de implementación. Se necesita una muestra del Asiento Contable para definir el cruce.',
    rendRows:    rendRows.length,
    asientoRows: asientoRows.length,
  };
}

// ── Summarize ─────────────────────────────────────────────────────────────────

export function summarizeRendVsAsiento(results) {
  if (results?.error) {
    return { status: 'error', headline: results.error, insights: [] };
  }
  if (results?.pending) {
    return {
      status: 'warn',
      headline: 'Control en desarrollo',
      insights: [results.message],
    };
  }
  const diffs = results?.rows?.filter(r => r.hasDiff)?.length ?? 0;
  if (diffs === 0) {
    return { status: 'ok', headline: 'Sin diferencias', insights: [] };
  }
  return {
    status: 'error',
    headline: `${diffs} diferencia${diffs !== 1 ? 's' : ''} encontrada${diffs !== 1 ? 's' : ''}`,
    insights: [],
  };
}

// ── Render results ────────────────────────────────────────────────────────────

export function renderRendVsAsientoResults(results, container) {
  if (!results) { container.innerHTML = ''; return; }

  if (results.error) {
    container.innerHTML = `<div class="alert alert--danger">${esc(results.error)}</div>`;
    return;
  }

  if (results.pending) {
    container.innerHTML = `
      <div style="padding:var(--sp-6);text-align:center;color:var(--color-text-muted);">
        <div style="font-size:2em;margin-bottom:var(--sp-3);">🚧</div>
        <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);">Control en desarrollo</p>
        <p style="margin:0;font-size:var(--text-sm);">${esc(results.message)}</p>
        <p style="margin:var(--sp-3) 0 0;font-size:var(--text-sm);color:var(--color-text-muted);">
          Rendimiento: ${results.rendRows} filas &nbsp;·&nbsp; Asiento: ${results.asientoRows} filas
        </p>
      </div>
    `;
    return;
  }

  // Tabla de resultados (a implementar cuando se defina el formato del Asiento)
  container.innerHTML = `<p class="text-muted text-sm">Resultados pendientes de implementación.</p>`;
}
