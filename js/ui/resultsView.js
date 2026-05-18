// resultsView.js — Pantalla de resultados del cruce
//
// Muestra en una sola página con secciones:
//   1. Encabezado del cruce (cliente, período, agrupadores)
//   2. Tabla de totales por agrupador
//   3. Legajos faltantes
//   4. Top 10 diferencias
//   5. Detalle completo por agrupador

import { getSession, getSessionResults, getClient } from '../db.js';
import { formatAmount, formatDiff, formatPct } from '../utils/currency.js';
import { periodToLabel } from '../utils/dates.js';

export async function renderResultsView(root, sessionId) {
  root.innerHTML = `<div class="page-content"><div class="loading-screen"><div class="spinner"></div></div></div>`;

  const session = await getSession(sessionId);
  if (!session) {
    root.innerHTML = `<div class="page-content"><div class="alert alert--danger">Sesión no encontrada.</div></div>`;
    return;
  }

  const [client, results] = await Promise.all([
    getClient(session.clientId),
    getSessionResults(sessionId),
  ]);

  if (!results) {
    root.innerHTML = `<div class="page-content"><div class="alert alert--danger">No se encontraron resultados para esta sesión.</div></div>`;
    return;
  }

  const { byGrouper, missingInResumen, missingInNomina, topDifferences, resultsPorGrupo, grouperDefs } = results;
  const totalDiffs = byGrouper.reduce((s, g) => s + g.rowsWithDiff, 0);
  const hasDiffs   = totalDiffs > 0 || missingInResumen.length > 0 || missingInNomina.length > 0;

  root.innerHTML = `
    <div class="page-content">

      <!-- Encabezado y acciones -->
      <div class="page-actions" style="margin-bottom:var(--sp-6);">
        <div class="page-actions__title">
          <button class="btn btn--ghost btn--sm" id="js-back-btn">← Clientes</button>
          <div>
            <h2 style="margin:0;">${escHtml(client?.name || '—')}</h2>
            <p class="text-muted text-sm">${periodToLabel(session.period)} · Validación del ${formatDate(session.createdAt)}</p>
          </div>
        </div>
        <div class="page-actions__buttons">
          <button class="btn btn--secondary" id="js-new-session-btn">▶ Nueva validación</button>
        </div>
      </div>

      <!-- Semáforo general -->
      <div class="alert alert--${hasDiffs ? 'warning' : 'success'}" style="margin-bottom:var(--sp-6);">
        ${hasDiffs
          ? `⚠️ Se detectaron diferencias: <strong>${totalDiffs}</strong> fila(s) con diferencias · ${missingInResumen.length} legajos solo en nómina · ${missingInNomina.length} legajos solo en resumen`
          : '✅ No se encontraron diferencias en los agrupadores seleccionados.'}
      </div>

      <!-- Sección 1: Totales por agrupador -->
      <div class="card" style="margin-bottom:var(--sp-6);">
        <div class="card__header"><h3>Totales por agrupador</h3></div>
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Agrupador</th>
                <th style="text-align:right;">Total Nómina</th>
                <th style="text-align:right;">Total Resumen</th>
                <th style="text-align:right;">Diferencia $</th>
                <th style="text-align:right;">Diferencia %</th>
                <th style="text-align:center;">Filas c/diff</th>
              </tr>
            </thead>
            <tbody>
              ${byGrouper.map(g => `
                <tr class="${Math.abs(g.diffAbsolute) > 0 ? 'row--diff' : ''}">
                  <td><strong>${escHtml(g.grouperName)}</strong></td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(g.totalNomina)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(g.totalResumen)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(g.diffAbsolute)}</td>
                  <td style="text-align:right;">${formatPct(g.diffPercentage)}</td>
                  <td style="text-align:center;">
                    ${g.rowsWithDiff > 0
                      ? `<span class="badge badge--warning">${g.rowsWithDiff} / ${g.rowsTotal}</span>`
                      : `<span class="badge badge--success">0 / ${g.rowsTotal}</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sección 2: Legajos faltantes -->
      ${(missingInResumen.length || missingInNomina.length) ? `
        <div class="card" style="margin-bottom:var(--sp-6);">
          <div class="card__header"><h3>Legajos faltantes</h3></div>
          <div class="card__body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-6);">
              <div>
                <p class="font-semibold" style="margin-bottom:var(--sp-3);">
                  En Nómina pero NO en Resumen (${missingInResumen.length})
                </p>
                ${missingInResumen.length
                  ? `<div class="pill-group">${missingInResumen.map(l => `<span class="badge badge--warning">${escHtml(l)}</span>`).join('')}</div>`
                  : `<p class="text-muted text-sm">Ninguno</p>`}
              </div>
              <div>
                <p class="font-semibold" style="margin-bottom:var(--sp-3);">
                  En Resumen pero NO en Nómina (${missingInNomina.length})
                </p>
                ${missingInNomina.length
                  ? `<div class="pill-group">${missingInNomina.map(l => `<span class="badge badge--danger">${escHtml(l)}</span>`).join('')}</div>`
                  : `<p class="text-muted text-sm">Ninguno</p>`}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Sección 3: Top diferencias -->
      ${topDifferences.length ? `
        <div class="card" style="margin-bottom:var(--sp-6);">
          <div class="card__header"><h3>Top ${topDifferences.length} diferencias más grandes</h3></div>
          <div class="card__body" style="padding:0;overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Legajo</th>
                  <th>Apellido y Nombre</th>
                  <th>Agrupador</th>
                  <th style="text-align:right;">Nómina</th>
                  <th style="text-align:right;">Resumen</th>
                  <th style="text-align:right;">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                ${topDifferences.map(r => `
                  <tr class="row--diff">
                    <td><code>${escHtml(r.legajo)}</code></td>
                    <td>${escHtml([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                    <td><span class="badge badge--primary">${escHtml(r.grouperName || '')}</span></td>
                    <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                    <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                    <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Sección 4: Detalle completo por agrupador -->
      <h3 style="margin-bottom:var(--sp-4);">Detalle completo por agrupador</h3>
      ${(grouperDefs || []).map(g => renderGrouperDetail(g, resultsPorGrupo?.[g.id] || [])).join('')}

    </div>
  `;

  root.querySelector('#js-back-btn').addEventListener('click', () => { window.location.hash = '#/'; });
  root.querySelector('#js-new-session-btn').addEventListener('click', () => {
    window.location.hash = `#/wizard/${session.clientId}`;
  });
}

function renderGrouperDetail(grouper, rows) {
  const rowsWithDiff = rows.filter(r => r.tieneDiff);
  const rowsOk       = rows.filter(r => !r.tieneDiff);

  // Paginación: mostramos hasta 100 filas de diferencias + resumen de las sin diff
  const SHOW_MAX = 100;
  const rowsToShow = rowsWithDiff.slice(0, SHOW_MAX);
  const extraDiffs = rowsWithDiff.length - rowsToShow.length;

  return `
    <div class="card" style="margin-bottom:var(--sp-5);">
      <div class="card__header">
        <h4 style="margin:0;">${escHtml(grouper.name)}</h4>
        <div style="display:flex;gap:var(--sp-2);">
          ${rowsWithDiff.length
            ? `<span class="badge badge--warning">${rowsWithDiff.length} con diferencia</span>`
            : `<span class="badge badge--success">Sin diferencias</span>`}
          <span class="badge badge--neutral">${rowsOk.length} OK</span>
        </div>
      </div>
      ${rows.length === 0 ? `<div class="card__body"><p class="text-muted">No hay datos para este agrupador.</p></div>` : `
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Legajo</th>
                <th>Apellido / Nombre</th>
                <th style="text-align:right;">Nómina</th>
                <th style="text-align:right;">Resumen</th>
                <th style="text-align:right;">Diferencia $</th>
                <th style="text-align:right;">Diferencia %</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsToShow.map(r => `
                <tr class="row--diff">
                  <td><code>${escHtml(r.legajo)}</code></td>
                  <td>${escHtml([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                  <td style="text-align:right;">${r.diffPct !== null ? formatPct(r.diffPct) : '—'}</td>
                  <td>
                    ${r.soloEnNomina  ? '<span class="badge badge--warning">Solo en nómina</span>'  : ''}
                    ${r.soloEnResumen ? '<span class="badge badge--danger">Solo en resumen</span>'   : ''}
                    ${!r.soloEnNomina && !r.soloEnResumen ? '<span class="badge badge--warning">Diferencia</span>' : ''}
                  </td>
                </tr>
              `).join('')}
              ${extraDiffs > 0 ? `
                <tr><td colspan="7" class="text-center text-muted text-sm" style="padding:var(--sp-3);">
                  ... y ${extraDiffs} fila(s) más con diferencia (limitado a ${SHOW_MAX} por rendimiento)
                </td></tr>
              ` : ''}
              ${rowsOk.length > 0 ? `
                <tr><td colspan="7" style="padding:var(--sp-2) var(--sp-4);background:var(--color-success-bg);">
                  <span class="text-sm text-success">✅ ${rowsOk.length} legajo(s) sin diferencias</span>
                </td></tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
