// controlsResults.js — Pantalla de resultados de un control run

import { getControlRun, getClient, getControlRunResults } from '../db.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { periodToLabel }    from '../utils/dates.js';

export async function renderControlsResults(root, runId) {
  const run = await getControlRun(Number(runId));
  if (!run) {
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          No se encontró el control #${Number(runId)}. <a href="#/">← Inicio</a>
        </div>
      </div>
    `;
    return;
  }

  const [client, resultsRows] = await Promise.all([
    getClient(run.clientId),
    getControlRunResults(runId),
  ]);

  const periodLabel = periodToLabel(run.period);
  const createdAt   = run.createdAt
    ? new Date(run.createdAt).toLocaleString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <a href="#/" class="btn btn--ghost btn--sm">← Inicio</a>
          <h2 style="margin:0 0 0 var(--sp-3);">
            ${esc(client?.name ?? 'Cliente')} — Controles ${esc(periodLabel)}
          </h2>
        </div>
        <div class="page-actions__buttons">
          <a href="#/controls/${run.clientId}" class="btn btn--primary btn--sm">▶ Nuevo control</a>
        </div>
      </div>

      <div class="alert alert--info" style="margin-bottom:var(--sp-4);font-size:var(--text-sm);">
        Ejecutado el ${esc(createdAt)}
        ${run.notes ? ` &nbsp;·&nbsp; <em>${esc(run.notes)}</em>` : ''}
      </div>

      <div id="js-control-sections"></div>
    </div>
  `;

  const sectionsEl = root.querySelector('#js-control-sections');

  if (resultsRows.length === 0) {
    sectionsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__title">Sin resultados</div>
        <p class="empty-state__text">Este run no tiene resultados guardados.</p>
      </div>
    `;
    return;
  }

  for (const row of resultsRows) {
    const ctrl = CONTROL_REGISTRY[row.controlId];
    if (!ctrl) continue;

    const section = document.createElement('div');
    section.className = 'card';
    section.style.marginBottom = 'var(--sp-6)';
    section.innerHTML = `
      <div class="card__header">
        <h3 style="margin:0;">${esc(ctrl.label)}</h3>
      </div>
      <div class="card__body" style="padding:var(--sp-5) var(--sp-6);" id="js-ctrl-${esc(row.controlId)}"></div>
    `;
    sectionsEl.appendChild(section);

    const resultContainer = section.querySelector(`#js-ctrl-${CSS.escape(row.controlId)}`);
    ctrl.renderResults(row.results, resultContainer);
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
