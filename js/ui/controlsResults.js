// controlsResults.js — Pantalla de resultados de un control run
//
// Cada control se renderiza como una tarjeta colapsada que muestra:
//   - Status (✅/⚠️) + nombre del control
//   - Headline con totales clave
//   - Badges con insights de qué revisar
//   - Botón "Detalle" que expande para ver las tablas completas

import { getControlRun, updateControlRun, getClient, getControlRunResults } from '../db.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { periodToLabel }    from '../utils/dates.js';
import { showToast }        from './toast.js';

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

      <div class="alert alert--info" style="margin-bottom:var(--sp-3);font-size:var(--text-sm);">
        Ejecutado el ${esc(createdAt)}
        ${run.notes ? ` &nbsp;·&nbsp; <em>${esc(run.notes)}</em>` : ''}
      </div>

      <div id="js-status-banner" style="margin-bottom:var(--sp-4);"></div>

      <div id="js-control-sections"></div>
    </div>
  `;

  // Banner Borrador / Definitivo con toggle
  const bannerEl = root.querySelector('#js-status-banner');
  renderRunStatusBanner(bannerEl, run);

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

function renderRunStatusBanner(bannerEl, run) {
  if (!bannerEl || !run) return;

  const isDef = run.isDefinitive === true;
  const icon  = isDef ? '✅' : '📝';
  const title = isDef ? 'Definitivo' : 'Borrador';
  const desc  = isDef
    ? 'Este run aparece en el checklist mensual.'
    : 'Este run no aparece en el checklist hasta que lo marques como definitivo.';
  const btnLabel = isDef ? '↩ Volver a borrador' : '📌 Marcar como definitivo';
  const borderCol = isDef ? 'var(--color-match-exact, #00a651)' : 'var(--color-border)';
  const bgCol = isDef ? 'rgba(0,166,81,0.06)' : 'var(--color-surface)';

  bannerEl.innerHTML = `
    <div style="padding:var(--sp-3) var(--sp-4);border:1px solid ${borderCol};border-radius:var(--radius-md);background:${bgCol};display:flex;align-items:center;gap:var(--sp-3);">
      <span style="font-size:1.4em;">${icon}</span>
      <div style="flex:1;">
        <strong>${title}</strong>
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">${esc(desc)}</p>
      </div>
      <button class="btn ${isDef ? 'btn--ghost' : 'btn--primary'} btn--sm" id="js-toggle-definitive">${btnLabel}</button>
    </div>
  `;

  bannerEl.querySelector('#js-toggle-definitive').addEventListener('click', async () => {
    const newValue = !run.isDefinitive;
    try {
      await updateControlRun(run.id, { isDefinitive: newValue });
      run.isDefinitive = newValue;
      renderRunStatusBanner(bannerEl, run);
      showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  });
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
