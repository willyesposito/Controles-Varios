// clientsList.js — Pantalla de inicio: lista de clientes
//
// De un vistazo: el estado del mes de cada cliente (semáforo), qué controles
// corrió y cuándo. Desde acá el usuario ejecuta controles, ve resultados,
// o entra al menú "⋯" para agrupadores / checklist / borrar.

import { getClients, createClient, deleteClient, getControlRuns, getControlRunResults } from '../db.js';
import { showToast, showConfirm } from './toast.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { periodToLabel, currentPeriod, previousPeriod, nextPeriod } from '../utils/dates.js';

const TIER_DOT = { ok: 'ok', warn: 'warn', error: 'error', neutral: 'neutral', info: 'neutral' };

// Cierra cualquier menú "⋯" abierto al clickear afuera. Se registra una sola
// vez a nivel módulo (el módulo sólo se evalúa una vez por carga de página).
document.addEventListener('click', () => {
  document.querySelectorAll('.row-menu__panel').forEach(p => p.setAttribute('hidden', ''));
});

/**
 * Renderiza la pantalla de clientes en el elemento indicado.
 * @param {HTMLElement} root
 */
export async function renderClientsList(root) {
  const state = { period: currentPeriod() };

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <h2>Clientes</h2>
        </div>
        <div class="page-actions__buttons" style="align-items:center;">
          <div class="month-selector">
            <button type="button" class="month-selector__arrow" id="js-month-prev" aria-label="Mes anterior">‹</button>
            <span class="month-selector__label" id="js-month-label"></span>
            <button type="button" class="month-selector__arrow" id="js-month-next" aria-label="Mes siguiente">›</button>
          </div>
          <button class="btn btn--primary btn--pill" id="js-new-client-btn">+ Nuevo cliente</button>
        </div>
      </div>
      <div id="js-clients-container">
        <div class="skeleton-cards">
          ${[0,1,2].map(() => `
            <div class="skeleton-card">
              <div class="skeleton-line skeleton-line--title"></div>
              <div class="skeleton-line skeleton-line--sm"></div>
              <div class="skeleton-line skeleton-line--sm"></div>
              <div class="skeleton-footer"></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  root.querySelector('#js-new-client-btn').addEventListener('click', () => showCreateModal(root, state));
  root.querySelector('#js-month-prev').addEventListener('click', () => changeMonth(root, state, previousPeriod));
  root.querySelector('#js-month-next').addEventListener('click', () => changeMonth(root, state, nextPeriod));

  updateMonthLabel(root, state);
  await reloadList(root, state);
}

async function changeMonth(root, state, stepFn) {
  state.period = stepFn(state.period);
  updateMonthLabel(root, state);
  await reloadList(root, state);
}

function updateMonthLabel(root, state) {
  const label = root.querySelector('#js-month-label');
  if (label) label.textContent = periodToLabel(state.period);
}

async function reloadList(root, state) {
  const container = root.querySelector('#js-clients-container');
  const clients = await getClients();

  if (clients.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="max-width:680px;margin:0 auto;">
        <div class="empty-state__icon" style="margin-bottom:var(--sp-3);">
          <img
            src="https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/ha-iso.png"
            alt="Hidalgo &amp; Asociados"
            width="64" height="64"
            style="display:block;margin:0 auto;border-radius:50%;"
            onerror="this.outerHTML='<div style=&quot;width:64px;height:64px;margin:0 auto;border-radius:50%;background:var(--color-primary);color:var(--color-white);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;&quot;>H&amp;A</div>'">
        </div>
        <div class="empty-state__title">Bienvenido a Controles Nómina</div>
        <p class="empty-state__text" style="margin-bottom:var(--sp-5);">
          Esta app cruza los archivos que te manda el cliente contra el Tabulado de nómina y
          detecta diferencias de manera automática — todo en tu navegador, sin subir nada a Internet.
        </p>

        <div style="
          display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:var(--sp-3);text-align:left;margin-bottom:var(--sp-5);
        ">
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">1️⃣</div>
            <strong style="font-size:var(--text-sm);">Creá un cliente</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Cada cliente guarda su propio catálogo de conceptos y sus perfiles de columnas.</p>
          </div>
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">2️⃣</div>
            <strong style="font-size:var(--text-sm);">Cargá los archivos</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Tabulado, Cat. Empleados, Brutos, NR, Rendimiento — solo los que necesite cada control.</p>
          </div>
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">3️⃣</div>
            <strong style="font-size:var(--text-sm);">Ejecutá los controles</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Mirás los resultados, descargás un Excel con las diferencias y listo.</p>
          </div>
        </div>

        <button class="btn btn--primary btn--lg" id="js-first-client-btn">+ Crear primer cliente</button>
        <p class="text-sm text-muted" style="margin-top:var(--sp-3);">
          🔒 Todos los datos quedan guardados localmente en este navegador.
        </p>
      </div>
    `;
    container.querySelector('#js-first-client-btn').addEventListener('click', () => showCreateModal(root, state));
    return;
  }

  const rows = await Promise.all(clients.map(c => buildClientRowData(c, state.period)));

  const monthName = periodToLabel(state.period).split(' ')[0];
  container.innerHTML = `
    <div class="card" style="overflow-x:auto;">
      <div class="home-table" style="min-width:900px;">
        <div class="home-table__head">
          <span>Cliente</span>
          <span>Estado ${esc(monthName)}</span>
          <span>Controles del mes</span>
          <span>Última corrida</span>
          <span style="text-align:right;">Acciones</span>
        </div>
        ${rows.map(renderClientRow).join('')}
      </div>
    </div>
  `;

  rows.forEach(r => attachRowEvents(container, r, root, state));
}

// Deriva, para un cliente y un período, el estado del mes + mini-dots por
// control + fecha de la última corrida (de ese período, o la más reciente
// de cualquier período si este mes no se corrió nada).
async function buildClientRowData(client, period) {
  const allRuns = await getControlRuns(client.id); // ya viene ordenado desc por createdAt
  const runsForPeriod = allRuns.filter(r => r.period === period);
  const statusRun = runsForPeriod.find(r => r.isDefinitive) || runsForPeriod[0] || null;
  const lastRunOverall = allRuns[0] || null;

  let status = { tier: 'neutral', label: 'Sin correr este mes' };
  let miniDots = [];

  if (statusRun) {
    const resultsRows = await getControlRunResults(statusRun.id);
    const summaries = resultsRows.map(row => {
      const ctrl = CONTROL_REGISTRY[row.controlId];
      if (!ctrl) return null;
      const summary = ctrl.summarize ? ctrl.summarize(row.results) : { status: 'info' };
      const tier = summary.status === 'error'
        ? 'error'
        : summary.unitsTotal == null
          ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, DEFAULT_SEMAFORO_THRESHOLD_PCT);
      return { ctrl, tier, unitsWithDiff: summary.unitsWithDiff || 0 };
    }).filter(Boolean);

    miniDots = summaries.map(s => ({ label: s.ctrl.label, tier: s.tier }));

    const checked = summaries.filter(s => s.tier !== 'info');
    const overallTier = checked.some(s => s.tier === 'error') ? 'error'
      : checked.some(s => s.tier === 'warn') ? 'warn'
      : checked.length > 0 ? 'ok' : 'neutral';
    const totalDiffUnits = checked.reduce((sum, s) => sum + s.unitsWithDiff, 0);

    if (overallTier === 'ok') {
      status = { tier: 'ok', label: statusRun.isDefinitive ? 'Definitivo · sin difs' : 'Sin diferencias · borrador' };
    } else if (overallTier === 'error') {
      status = { tier: 'error', label: `${totalDiffUnits} dif${totalDiffUnits === 1 ? '' : 's'} · revisar` };
    } else if (overallTier === 'warn') {
      status = { tier: 'warn', label: `${totalDiffUnits} dif${totalDiffUnits === 1 ? '' : 's'} · en revisión` };
    } else {
      status = { tier: 'neutral', label: statusRun.isDefinitive ? 'Definitivo' : 'Borrador' };
    }
  }

  const dateSourceRun = statusRun || lastRunOverall;
  const lastRunText = dateSourceRun
    ? `${fmtRelativeShort(dateSourceRun.createdAt)} · ${dateSourceRun.isDefinitive ? 'definitivo' : 'borrador'}`
      + (dateSourceRun.period !== period ? ` (${periodToLabel(dateSourceRun.period)})` : '')
    : '—';

  return { client, period, statusRun, lastRunOverall, status, miniDots, lastRunText };
}

function renderClientRow(r) {
  const { client, status, miniDots, lastRunText, lastRunOverall } = r;

  const miniDotsHtml = miniDots.length
    ? miniDots.map(d => `<span class="status-dot status-dot--sm status-dot--${TIER_DOT[d.tier]}" title="${esc(d.label)}"></span>`).join('')
    : '<span style="font-size:12px;color:var(--t3);">—</span>';

  return `
    <div class="home-table__row" data-client-id="${client.id}">
      <div>
        <strong class="home-table__client-name">${esc(client.name)}</strong>
        ${client.notes ? `<span class="home-table__client-sub">${esc(client.notes)}</span>` : ''}
      </div>
      <span class="home-table__status home-table__status--${TIER_DOT[status.tier]}">
        <span class="status-dot status-dot--sm status-dot--${TIER_DOT[status.tier]}"></span>
        ${esc(status.label)}
      </span>
      <span class="home-mini-dots">${miniDotsHtml}</span>
      <span class="home-table__last-run">${esc(lastRunText)}</span>
      <div class="home-table__actions">
        <button class="btn btn--primary btn--sm btn--pill js-run-btn">▶ Ejecutar</button>
        <button class="btn btn--ghost btn--sm btn--pill js-results-btn" ${lastRunOverall ? '' : 'disabled'}>Resultados</button>
        <div class="row-menu">
          <button class="btn btn--ghost btn--sm btn--pill js-menu-btn" aria-label="Más acciones">⋯</button>
          <div class="row-menu__panel" hidden>
            <button class="row-menu__item js-groupers-btn">⚙ Agrupadores</button>
            <button class="row-menu__item js-checklist-btn">📊 Estado mensual</button>
            <button class="row-menu__item row-menu__item--danger js-delete-btn">🗑 Borrar cliente</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachRowEvents(container, r, root, state) {
  const row = container.querySelector(`[data-client-id="${r.client.id}"]`);
  if (!row) return;

  row.querySelector('.js-run-btn').addEventListener('click', () => {
    window.location.hash = `#/controls/${r.client.id}`;
  });

  const resultsBtn = row.querySelector('.js-results-btn');
  if (r.lastRunOverall) {
    resultsBtn.addEventListener('click', () => {
      window.location.hash = `#/control-results/${r.lastRunOverall.id}`;
    });
  }

  row.querySelector('.js-checklist-btn').addEventListener('click', () => {
    window.location.hash = `#/checklist/${r.client.id}`;
  });
  row.querySelector('.js-groupers-btn').addEventListener('click', () => {
    window.location.hash = `#/client/${r.client.id}/groupers`;
  });
  row.querySelector('.js-delete-btn').addEventListener('click', async () => {
    row.querySelector('.row-menu__panel')?.setAttribute('hidden', '');
    if (!await showConfirm(`¿Borrar el cliente "${r.client.name}"?\nSe borrarán también todos sus agrupadores y sesiones.`, { type: 'danger', confirmLabel: 'Borrar' })) return;
    try {
      await deleteClient(r.client.id);
      await reloadList(root, state);
    } catch (err) {
      showToast(`Error al borrar: ${err.message}`, 'danger');
    }
  });

  const menuBtn = row.querySelector('.js-menu-btn');
  const panel   = row.querySelector('.row-menu__panel');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = panel.hasAttribute('hidden');
    document.querySelectorAll('.row-menu__panel').forEach(p => p.setAttribute('hidden', ''));
    if (wasHidden) panel.removeAttribute('hidden');
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
}

function showCreateModal(root, state) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>Nuevo cliente</h3>
        <button class="modal__close" id="js-close-modal">✕</button>
      </div>
      <div class="modal__body">
        <form id="js-create-client-form">
          <div class="form-group">
            <label class="form-label form-label--required">Nombre del cliente</label>
            <input type="text" class="form-input" id="js-client-name" placeholder="Ej: ACME SA" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Notas internas (opcional)</label>
            <input type="text" class="form-input" id="js-client-notes" placeholder="Ej: CUIT, contacto, observaciones...">
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" id="js-cancel-create">Cancelar</button>
        <button class="btn btn--primary" id="js-confirm-create">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('#js-close-modal').addEventListener('click', close);
  overlay.querySelector('#js-cancel-create').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#js-confirm-create').addEventListener('click', async () => {
    const name  = overlay.querySelector('#js-client-name').value.trim();
    const notes = overlay.querySelector('#js-client-notes').value.trim();
    if (!name) { showToast('El nombre del cliente es obligatorio.', 'warning'); return; }
    try {
      await createClient(name, notes);
      close();
      await reloadList(root, state);
    } catch (err) {
      showToast(`Error al crear el cliente: ${err.message}`, 'danger');
    }
  });

  // Enter en el campo de nombre también guarda
  overlay.querySelector('#js-client-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#js-confirm-create').click();
  });
}

function fmtRelativeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
