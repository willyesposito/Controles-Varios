// controlsResults.js — Pantalla de resultados de un control run
//
// Cada control se renderiza como una tarjeta colapsada que muestra:
//   - Status (✅/⚠️) + nombre del control
//   - Headline con totales clave
//   - Badges con insights de qué revisar
//   - Botón "Detalle" que expande para ver las tablas completas

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

  // Una tarjeta colapsable por control
  for (const row of resultsRows) {
    const ctrl = CONTROL_REGISTRY[row.controlId];
    if (!ctrl) continue;

    const summary = ctrl.summarize
      ? ctrl.summarize(row.results)
      : { status: 'info', headline: '', insights: [] };

    const card = document.createElement('div');
    card.className = `control-card control-card--${summary.status}`;
    card.innerHTML = `
      <details>
        <summary class="control-card__summary">
          <div class="control-card__row">
            <span class="control-card__status" aria-hidden="true">${statusIcon(summary.status)}</span>
            <h3 class="control-card__name">${esc(ctrl.label)}</h3>
            <span class="control-card__headline">${esc(summary.headline)}</span>
            <span class="control-card__expand">
              <span class="control-card__expand-icon">▶</span>
              <span class="control-card__expand-text">Ver detalle</span>
            </span>
          </div>
          ${summary.insights?.length ? `
            <div class="control-card__insights">
              ${summary.insights.map(i => `
                <span class="badge badge--${esc(i.type)}">
                  <strong style="margin-right:4px;">${esc(String(i.value))}</strong>${esc(i.label)}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </summary>
        <div class="control-card__detail" id="js-ctrl-${esc(row.controlId)}"></div>
      </details>
    `;
    sectionsEl.appendChild(card);

    const detailEl = card.querySelector(`#js-ctrl-${CSS.escape(row.controlId)}`);
    ctrl.renderResults(row.results, detailEl);
  }
}

function statusIcon(status) {
  switch (status) {
    case 'success': return '✅';
    case 'warning': return '⚠️';
    case 'danger':  return '⛔';
    default:        return 'ℹ️';
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
