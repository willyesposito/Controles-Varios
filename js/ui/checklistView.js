// checklistView.js — Grilla de meses × controles para un cliente
//
// Muestra qué controles "Controlar" se ejecutaron en cada período. Cada celda
// es clickeable y lleva al run correspondiente.

import { getClient, getControlRuns, getControlRunResults } from '../db.js';
import { CONTROL_REGISTRY }              from '../controls/registry.js';
import { periodToLabel, periodOptions }  from '../utils/dates.js';

// Solo "Controlar" — los de Generar Reporte no son controles propiamente dichos.
function checklistControls() {
  return Object.values(CONTROL_REGISTRY)
    .filter(c => !c.group || c.group.mode === 'Controlar');
}

export async function renderChecklist(root, clientId) {
  const client = await getClient(clientId);
  if (!client) {
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          Cliente no encontrado. <a href="#/">← Inicio</a>
        </div>
      </div>
    `;
    return;
  }

  const runs = await getControlRuns(clientId);

  // periodMap: period → Map(controlId → { runId, status, headline })
  // status: 'success' | 'warning' | 'error' (según summarize del control)
  const periodMap = new Map();
  for (const run of runs) {
    const results = await getControlRunResults(run.id);
    if (!periodMap.has(run.period)) periodMap.set(run.period, new Map());
    const m = periodMap.get(run.period);
    for (const r of results) {
      // Si ya hay una entrada para este control en este período, conservamos
      // la más reciente (los runs vienen ordenados desc por createdAt).
      if (m.has(r.controlId)) continue;
      const ctrl = CONTROL_REGISTRY[r.controlId];
      let status = 'success';
      let headline = '';
      if (r.results?.error) {
        status = 'error';
        headline = r.results.error;
      } else if (ctrl?.summarize) {
        const s = ctrl.summarize(r.results);
        status = s.status || 'success';
        headline = s.headline || '';
      }
      m.set(r.controlId, { runId: run.id, status, headline });
    }
  }

  // Combinamos: últimos 12 meses + cualquier período que tenga runs
  const last12 = periodOptions(12).map(p => p.value);
  const allPeriods = new Set([...last12, ...periodMap.keys()]);
  const periods = [...allPeriods].sort().reverse();

  const controls = checklistControls();

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <a href="#/" class="btn btn--ghost btn--sm">← Inicio</a>
          <h2 style="margin:0 0 0 var(--sp-3);">${esc(client.name)} — Estado de controles</h2>
        </div>
        <div class="page-actions__buttons">
          <a href="#/controls/${client.id}" class="btn btn--primary btn--sm">▶ Ejecutar controles</a>
        </div>
      </div>

      <p class="text-muted" style="margin:0 0 var(--sp-3);font-size:var(--text-sm);">
        Cuadro por período de los controles ejecutados. Click en una celda para abrir los resultados.
        <span style="margin-left:var(--sp-3);">Leyenda:</span>
        <span style="margin-left:var(--sp-2);color:var(--color-match-exact,green);">✓ Sin diferencias</span>
        <span style="margin-left:var(--sp-2);color:var(--color-warning);">⚠ Con diferencias</span>
        <span style="margin-left:var(--sp-2);color:var(--color-danger);">⛔ Error</span>
        <span style="margin-left:var(--sp-2);color:var(--color-text-muted);">— No ejecutado</span>
      </p>

      <div class="card">
        <div class="card__body" style="padding:0;overflow-x:auto;">
          ${buildChecklistTable(periods, controls, periodMap)}
        </div>
      </div>

      <p class="text-sm text-muted" style="margin-top:var(--sp-3);">
        Mostrando ${periods.length} períodos (últimos 12 meses + todos los que tienen runs).
        Total de controls ejecutados: ${countTotal(periodMap)} sobre ${periods.length * controls.length} posibles.
      </p>
    </div>
  `;

  // Click handlers en las celdas con runId
  root.querySelectorAll('[data-runid]').forEach(cell => {
    cell.addEventListener('click', () => {
      const id = cell.dataset.runid;
      if (id) window.location.hash = `#/control-results/${id}`;
    });
    cell.style.cursor = 'pointer';
  });
}

function buildChecklistTable(periods, controls, periodMap) {
  const stickyCell = `
    position:sticky;left:0;z-index:1;background:var(--color-surface);
    border-right:1px solid var(--color-border);font-weight:var(--fw-semibold);
  `;
  const headRow = `
    <tr>
      <th style="${stickyCell}text-align:left;padding:var(--sp-2) var(--sp-3);background:var(--color-bg-subtle);">Período</th>
      ${controls.map(c => `
        <th style="text-align:center;padding:var(--sp-2) var(--sp-3);background:var(--color-bg-subtle);min-width:130px;">
          <div style="font-size:var(--text-sm);">${esc(c.label)}</div>
        </th>
      `).join('')}
    </tr>
  `;

  const bodyRows = periods.map(p => {
    const m = periodMap.get(p) || new Map();
    const cells = controls.map(c => {
      const entry = m.get(c.id);
      return buildStatusCell(entry);
    }).join('');
    return `
      <tr>
        <td style="${stickyCell}padding:var(--sp-2) var(--sp-3);white-space:nowrap;">${esc(periodToLabel(p))}</td>
        ${cells}
      </tr>
    `;
  }).join('');

  return `
    <table class="data-table data-table--compact" style="margin:0;width:100%;border-collapse:collapse;">
      <thead>${headRow}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function buildStatusCell(entry) {
  if (!entry) {
    return `<td style="text-align:center;color:var(--color-text-muted);padding:var(--sp-2);">—</td>`;
  }
  const icon = entry.status === 'success' ? '✓'
             : entry.status === 'warning' ? '⚠'
             : entry.status === 'error'   ? '⛔'
             : 'ℹ';
  const color = entry.status === 'success' ? 'var(--color-match-exact, green)'
              : entry.status === 'warning' ? 'var(--color-warning)'
              : entry.status === 'error'   ? 'var(--color-danger)'
              : 'var(--color-primary)';
  const bg = entry.status === 'success' ? 'rgba(0,156,64,0.08)'
           : entry.status === 'warning' ? 'rgba(255,176,0,0.12)'
           : entry.status === 'error'   ? 'rgba(220,53,69,0.12)'
           : 'transparent';
  return `
    <td data-runid="${esc(String(entry.runId))}"
        title="${esc(entry.headline)}"
        style="text-align:center;padding:var(--sp-2);background:${bg};color:${color};font-size:1.2em;font-weight:var(--fw-semibold);">
      ${icon}
    </td>
  `;
}

function countTotal(periodMap) {
  let n = 0;
  for (const m of periodMap.values()) n += m.size;
  return n;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
