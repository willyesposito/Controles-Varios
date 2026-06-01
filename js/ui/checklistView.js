// checklistView.js — Grilla de meses × controles para un cliente
//
// Muestra qué controles "Controlar" se ejecutaron en cada período. Por
// default sólo cuenta los runs marcados como definitivos — los borradores
// quedan ocultos pero se pueden ver con un toggle.

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

  const allRuns = await getControlRuns(clientId);  // ordenados desc por createdAt

  // Pre-cargo los resultados de cada run (para conocer status por control)
  const runDataById = new Map();  // runId → { run, results }
  for (const run of allRuns) {
    const results = await getControlRunResults(run.id);
    runDataById.set(run.id, { run, results });
  }

  // Estado local de la vista
  const state = { includeDrafts: false };

  function render() {
    // Filtramos runs según el toggle
    const runs = state.includeDrafts ? allRuns : allRuns.filter(r => r.isDefinitive === true);

    // periodMap: period → Map(controlId → { runId, status, headline, isDraft })
    const periodMap = new Map();
    for (const run of runs) {
      const { results } = runDataById.get(run.id);
      if (!periodMap.has(run.period)) periodMap.set(run.period, new Map());
      const m = periodMap.get(run.period);
      for (const r of results) {
        // Conservamos el más reciente (runs vienen ordenados desc)
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
        m.set(r.controlId, { runId: run.id, status, headline, isDraft: !run.isDefinitive });
      }
    }

    // Borradores pendientes: todos los runs con isDefinitive=false
    const drafts = allRuns.filter(r => !r.isDefinitive);

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

        <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 var(--sp-3);gap:var(--sp-3);flex-wrap:wrap;">
          <p class="text-muted" style="margin:0;font-size:var(--text-sm);">
            Click en una celda para abrir los resultados.
            <span style="margin-left:var(--sp-2);color:var(--color-match-exact,green);">✓ Sin diferencias</span>
            <span style="margin-left:var(--sp-2);color:var(--color-warning);">⚠ Con diferencias</span>
            <span style="margin-left:var(--sp-2);color:var(--color-danger);">⛔ Error</span>
            <span style="margin-left:var(--sp-2);color:var(--color-text-muted);">— No ejecutado</span>
          </p>
          <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;font-size:var(--text-sm);">
            <input type="checkbox" id="js-include-drafts" ${state.includeDrafts ? 'checked' : ''}>
            <span>Incluir borradores (📝)</span>
          </label>
        </div>

        <div class="card">
          <div class="card__body" style="padding:0;overflow-x:auto;">
            ${buildChecklistTable(periods, controls, periodMap)}
          </div>
        </div>

        <p class="text-sm text-muted" style="margin-top:var(--sp-3);">
          ${periods.length} períodos · ${countTotal(periodMap)} controles ${state.includeDrafts ? '(definitivos + borradores)' : 'definitivos'} sobre ${periods.length * controls.length} posibles.
        </p>

        ${drafts.length > 0 ? renderDraftsSection(drafts, client.id) : ''}
      </div>
    `;

    // Toggle "Incluir borradores"
    root.querySelector('#js-include-drafts').addEventListener('change', (e) => {
      state.includeDrafts = e.target.checked;
      render();
    });

    // Click handlers en celdas con runId
    root.querySelectorAll('[data-runid]').forEach(cell => {
      cell.addEventListener('click', () => {
        const id = cell.dataset.runid;
        if (id) window.location.hash = `#/control-results/${id}`;
      });
      cell.style.cursor = 'pointer';
    });
  }

  render();
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
    const cells = controls.map(c => buildStatusCell(m.get(c.id))).join('');
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
  const draftBadge = entry.isDraft
    ? `<span style="font-size:0.7em;margin-left:4px;opacity:0.7;" title="Borrador">📝</span>`
    : '';
  return `
    <td data-runid="${esc(String(entry.runId))}"
        title="${esc(entry.headline)}${entry.isDraft ? ' (borrador)' : ''}"
        style="text-align:center;padding:var(--sp-2);background:${bg};color:${color};font-size:1.2em;font-weight:var(--fw-semibold);${entry.isDraft ? 'opacity:0.75;' : ''}">
      ${icon}${draftBadge}
    </td>
  `;
}

function renderDraftsSection(drafts, clientId) {
  const rows = drafts.map(d => {
    const date = d.createdAt
      ? new Date(d.createdAt).toLocaleString('es-AR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '';
    const ctrls = (d.selectedControls || []).map(id => CONTROL_REGISTRY[id]?.label || id).join(', ');
    return `
      <tr style="cursor:pointer;" data-runid="${esc(String(d.id))}">
        <td style="padding:var(--sp-2) var(--sp-3);">${esc(periodToLabel(d.period))}</td>
        <td style="padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">${esc(date)}</td>
        <td style="padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">${esc(ctrls)}</td>
        <td style="padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);color:var(--color-text-muted);">${esc(d.notes || '')}</td>
        <td style="padding:var(--sp-2) var(--sp-3);text-align:right;">
          <a href="#/control-results/${d.id}" class="btn btn--ghost btn--sm">Abrir →</a>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <details open style="margin-top:var(--sp-5);">
      <summary style="cursor:pointer;font-size:var(--text-base);font-weight:var(--fw-semibold);color:var(--color-primary);user-select:none;margin-bottom:var(--sp-2);">
        📝 Borradores pendientes (${drafts.length})
      </summary>
      <p class="text-muted text-sm" style="margin:0 0 var(--sp-2);">
        Estos runs todavía no se promocionaron a definitivos. Abrilos para revisar o marcarlos.
      </p>
      <div class="card">
        <div class="card__body" style="padding:0;">
          <table class="data-table data-table--compact" style="margin:0;width:100%;">
            <thead>
              <tr style="background:var(--color-bg-subtle);">
                <th style="padding:var(--sp-2) var(--sp-3);text-align:left;">Período</th>
                <th style="padding:var(--sp-2) var(--sp-3);text-align:left;">Ejecutado</th>
                <th style="padding:var(--sp-2) var(--sp-3);text-align:left;">Controles</th>
                <th style="padding:var(--sp-2) var(--sp-3);text-align:left;">Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </details>
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
