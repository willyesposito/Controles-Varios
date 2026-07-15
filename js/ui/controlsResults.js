// controlsResults.js — Pantalla de resultados de un control run
//
// Arriba: un hero-veredicto (gauge + badge + KPIs + lista de controles
// ordenada errores-primero) que responde "¿está bien?" de un vistazo.
// Abajo: las tarjetas de detalle existentes, una por control, colapsadas.

import { getControlRun, updateControlRun, getClient, getControlRunResults, getControlRunFiles, getConfig } from '../db.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { periodToLabel }    from '../utils/dates.js';
import { formatAmount }     from '../utils/currency.js';
import { showToast }        from './toast.js';

const TIER_RANK = { error: 0, warn: 1, ok: 2, info: 3 };
const TIER_DOT  = { error: 'error', warn: 'warn', ok: 'ok', info: 'neutral' };

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

  const [client, resultsRows, runFiles, thresholdPctCfg] = await Promise.all([
    getClient(run.clientId),
    getControlRunResults(runId),
    getControlRunFiles(runId),
    getConfig('semaforoThresholdPct'),
  ]);
  const thresholdPct = thresholdPctCfg ?? DEFAULT_SEMAFORO_THRESHOLD_PCT;

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
          <a href="#/controls/${run.clientId}" class="btn btn--primary btn--sm btn--pill">▶ Nuevo control</a>
        </div>
      </div>

      <div class="alert alert--info" style="margin-bottom:var(--sp-3);font-size:var(--text-sm);">
        Ejecutado el ${esc(createdAt)}
        ${run.notes ? ` &nbsp;·&nbsp; <em>${esc(run.notes)}</em>` : ''}
      </div>

      <div id="js-status-banner" style="margin-bottom:var(--sp-4);"></div>

      <div id="js-hero"></div>
      <div id="js-control-sections"></div>
    </div>
  `;

  // Banner Borrador / Definitivo con toggle
  const bannerEl = root.querySelector('#js-status-banner');
  renderRunStatusBanner(bannerEl, run);

  const heroEl     = root.querySelector('#js-hero');
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

  // Un resumen por control — se calcula una sola vez y alimenta tanto el hero
  // como las tarjetas de detalle de abajo (mismo criterio de color en las dos).
  const controlSummaries = resultsRows
    .map(row => {
      const ctrl = CONTROL_REGISTRY[row.controlId];
      if (!ctrl) return null;
      const summary = ctrl.summarize
        ? ctrl.summarize(row.results)
        : { status: 'info', headline: '', insights: [] };
      const tier = summary.status === 'error'
        ? 'error'
        : summary.unitsTotal == null
          ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
      return { row, ctrl, summary, tier };
    })
    .filter(Boolean)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  heroEl.innerHTML = buildHeroHtml(controlSummaries, runFiles, thresholdPct);

  // Una tarjeta colapsable por control (mismo orden que el hero: errores primero)
  for (const item of controlSummaries) {
    const { row, ctrl, summary, tier } = item;

    const card = document.createElement('div');
    card.className = `control-card control-card--tier-${tier}`;
    card.dataset.controlId = row.controlId;
    card.innerHTML = `
      <details>
        <summary class="control-card__summary">
          <div class="control-card__row">
            <span class="status-dot status-dot--${TIER_DOT[tier]}" aria-hidden="true"></span>
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

  // "Ir al detalle →" / "Detalle" del hero: abre y hace scroll a la tarjeta de abajo
  heroEl.querySelectorAll('[data-hero-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.heroDetail;
      const card = sectionsEl.querySelector(`[data-control-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const details = card.querySelector('details');
      if (details) details.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── Hero de resultados ──────────────────────────────────────────────────────

function buildHeroHtml(controlSummaries, runFiles, thresholdPct) {
  // "Legajos cruzados": tamaño del Tabulado de esta corrida si está disponible;
  // si no (ej. corrida sin Tabulado), el mayor unitsTotal entre controles por legajo.
  const tabFile = runFiles.find(f => f.fileType === 'tab_control');
  const legajoCtrls = controlSummaries.filter(c => c.summary.unit === 'legajo' && c.summary.unitsTotal != null);
  const totalLegajosCruzados = tabFile?.parseMetadata?.totalRows
    ?? legajoCtrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal), 0);

  // % OK del gauge — sólo entre controles cuya unidad es "legajo" (los de CC,
  // como Rendimiento vs Tabulado/Asiento, usan otra unidad y no se mezclan acá;
  // igual entran en la lista de la derecha y en el veredicto general).
  const totalLegajoUnits    = legajoCtrls.reduce((sum, c) => sum + c.summary.unitsTotal, 0);
  const totalLegajoWithDiff = legajoCtrls.reduce((sum, c) => sum + (c.summary.unitsWithDiff || 0), 0);
  const pctOk = totalLegajoUnits > 0 ? Math.max(0, 100 - (totalLegajoWithDiff / totalLegajoUnits) * 100) : 100;

  // Controles "de verificación" (excluye los modos "Generar Reporte", que no cruzan nada)
  const checkedControls = controlSummaries.filter(c => c.tier !== 'info');
  const okCount    = checkedControls.filter(c => c.tier === 'ok').length;
  const errorCount = checkedControls.filter(c => c.tier === 'error').length;
  const warnCount  = checkedControls.filter(c => c.tier === 'warn').length;
  const totalChecked = checkedControls.length;

  const overallTier = totalChecked === 0
    ? 'info'
    : errorCount > 0 ? 'error'
    : warnCount  > 0 ? 'warn'
    : 'ok';

  const totalDiffAmount = controlSummaries.reduce((sum, c) => sum + (c.summary.diffTotalAmount || 0), 0);

  // ── Gauge SVG ──────────────────────────────────────────────────────────────
  const R = 82;
  const CIRC = 2 * Math.PI * R;
  const fillLen = (pctOk / 100) * CIRC;
  const ringClass = overallTier === 'error' ? 'hero-gauge__ring-fill--error'
                  : overallTier === 'warn'  ? 'hero-gauge__ring-fill--warn'
                  : 'hero-gauge__ring-fill--ok';

  const gaugeSvg = `
    <svg width="190" height="190" viewBox="0 0 190 190">
      <circle class="hero-gauge__ring-bg" cx="95" cy="95" r="${R}"></circle>
      <circle class="hero-gauge__ring-fill ${ringClass}" cx="95" cy="95" r="${R}"
        stroke-dasharray="${fillLen.toFixed(1)} ${CIRC.toFixed(1)}"></circle>
    </svg>
  `;

  // ── Badge + subtítulo de veredicto ───────────────────────────────────────────
  const badgeCopy = {
    error: 'Revisar antes de cerrar el mes',
    warn:  'Diferencias menores — revisar',
    ok:    'Todo en orden — listo para marcar definitivo',
    info:  'Sin controles de verificación en esta corrida',
  }[overallTier];

  let subline;
  if (totalChecked === 0) {
    subline = 'Esta corrida sólo incluye controles de generación de reporte (sin cruce de diferencias).';
  } else if (overallTier === 'ok') {
    subline = `${fmtInt(totalLegajoUnits)} legajo${totalLegajoUnits === 1 ? '' : 's'} verificado${totalLegajoUnits === 1 ? '' : 's'} sin diferencias.`;
  } else {
    const bits = [];
    if (errorCount > 0) bits.push(`${errorCount} control${errorCount === 1 ? '' : 'es'} en rojo`);
    if (warnCount  > 0) bits.push(`${warnCount} control${warnCount === 1 ? '' : 'es'} en amarillo`);
    subline = `${bits.join(' y ')}.<br>${fmtInt(totalLegajoWithDiff)} legajo${totalLegajoWithDiff === 1 ? '' : 's'} con diferencia`
      + (totalDiffAmount > 0 ? ` · dif. total <strong>$ ${formatAmount(totalDiffAmount)}</strong>` : '');
  }

  // ── Filas por control (errores primero — ya vienen ordenadas) ───────────────
  const rowsHtml = controlSummaries.map(buildCtrlRowHtml).join('');

  return `
    <div class="hero-verdict">
      <div class="hero-verdict__gauge-col">
        <div class="hero-gauge">
          ${gaugeSvg}
          <div class="hero-gauge__center">
            <span class="hero-gauge__pct">${fmtPct1(pctOk)}%</span>
            <span class="hero-gauge__label">legajos OK</span>
          </div>
        </div>
        <div style="text-align:center;">
          <span class="hero-verdict__badge hero-verdict__badge--${overallTier === 'info' ? 'ok' : overallTier}">
            <span class="status-dot status-dot--${TIER_DOT[overallTier]}"></span>
            ${esc(badgeCopy)}
          </span>
          <p class="hero-verdict__subline">${subline}</p>
        </div>
        <div class="hero-kpis">
          <div class="hero-kpi">
            <span class="hero-kpi__value">${fmtInt(totalLegajosCruzados)}</span>
            <span class="hero-kpi__label">Legajos cruzados</span>
          </div>
          <div class="hero-kpi">
            <span class="hero-kpi__value ${okCount === totalChecked && totalChecked > 0 ? 'hero-kpi__value--ok' : ''}">${okCount} / ${totalChecked}</span>
            <span class="hero-kpi__label">Controles en verde</span>
          </div>
        </div>
      </div>
      <div class="hero-verdict__list-col">
        <div class="hero-ctrl-header">
          <span class="hero-ctrl-header__label">Controles · errores primero</span>
          <span class="hero-ctrl-header__legend">verde 0% · amarillo ≤${thresholdPct}% · rojo &gt;${thresholdPct}% de legajos c/dif</span>
        </div>
        <div class="hero-ctrl-rows">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;
}

function buildCtrlRowHtml(item) {
  const { row, ctrl, summary, tier } = item;
  const rowClass = tier === 'error' ? 'hero-ctrl-row--error'
                 : tier === 'warn'  ? 'hero-ctrl-row--warn'
                 : tier === 'info'  ? 'hero-ctrl-row--neutral'
                 : 'hero-ctrl-row--ok';

  let countText = '';
  let contextText;
  let linkText;

  if (tier === 'info') {
    contextText = summary.headline || 'Sin cruce de diferencias';
    linkText = 'Detalle';
  } else {
    const isCc = summary.unit === 'cc';
    const unitLabel = isCc ? 'CC' : (summary.unitsWithDiff === 1 ? 'legajo' : 'legajos');
    const hasDiff = summary.unitsWithDiff > 0;

    if (hasDiff) {
      const pct = summary.unitsTotal > 0 ? (summary.unitsWithDiff / summary.unitsTotal) * 100 : 0;
      countText = `${summary.unitsWithDiff} ${unitLabel} · ${fmtPct1(pct)}%`;
    } else {
      countText = summary.unit === 'cc'
        ? `${summary.unitsTotal}/${summary.unitsTotal} CC OK`
        : '0 diferencias';
    }

    const amountText = summary.diffTotalAmount != null && summary.diffTotalAmount > 0
      ? `$ ${formatAmount(summary.diffTotalAmount)}`
      : null;
    const note = summary.contextNote
      || (summary.worstCase ? `mayor: ${summary.worstCase.label} ($ ${formatAmount(summary.worstCase.amount)})` : null);

    contextText = hasDiff
      ? [amountText, note].filter(Boolean).join(' · ')
      : `${fmtInt(summary.unitsTotal)} ${summary.unit === 'cc' ? 'centros de costo' : 'legajos'} verificados`;

    linkText = hasDiff ? 'Ir al detalle →' : 'Detalle';
  }

  return `
    <div class="hero-ctrl-row ${rowClass}">
      <span class="status-dot status-dot--${TIER_DOT[tier]}"></span>
      <strong class="hero-ctrl-row__name">${esc(ctrl.label)}</strong>
      ${countText ? `<span class="hero-ctrl-row__count">${esc(countText)}</span>` : ''}
      <span class="hero-ctrl-row__context">${esc(contextText)}</span>
      <button type="button" class="hero-ctrl-row__link" data-hero-detail="${esc(row.controlId)}">${esc(linkText)}</button>
    </div>
  `;
}

// ── Banner Borrador / Definitivo ─────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

function fmtPct1(n) {
  return (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
