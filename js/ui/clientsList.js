// clientsList.js — Pantalla de inicio: lista de clientes
//
// Desde acá el usuario puede crear un cliente nuevo, arrancar una validación,
// ir al editor de agrupadores o borrar un cliente.

import { getClients, createClient, updateClient, deleteClient } from '../db.js';
import { showToast, showConfirm } from './toast.js';

/**
 * Renderiza la pantalla de clientes en el elemento indicado.
 * @param {HTMLElement} root
 */
export async function renderClientsList(root) {
  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <h2>Clientes</h2>
        </div>
        <div class="page-actions__buttons">
          <button class="btn btn--primary" id="js-new-client-btn">+ Nuevo cliente</button>
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

  root.querySelector('#js-new-client-btn').addEventListener('click', () => showCreateModal(root));

  await reloadList(root);
}

async function reloadList(root) {
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
    container.querySelector('#js-first-client-btn').addEventListener('click', () => showCreateModal(root));
    return;
  }

  container.innerHTML = `
    <div class="clients-grid">
      ${clients.map(c => renderClientCard(c)).join('')}
    </div>
  `;

  // Adjuntamos eventos a cada botón de cada tarjeta
  clients.forEach(client => {
    const card = container.querySelector(`[data-client-id="${client.id}"]`);

    card.querySelector('.js-controls-btn').addEventListener('click', () => {
      window.location.hash = `#/controls/${client.id}`;
    });

    card.querySelector('.js-run-btn').addEventListener('click', () => {
      window.location.hash = `#/wizard/${client.id}`;
    });

    card.querySelector('.js-groupers-btn').addEventListener('click', () => {
      window.location.hash = `#/client/${client.id}/groupers`;
    });

    card.querySelector('.js-delete-btn').addEventListener('click', async () => {
      if (!await showConfirm(`¿Borrar el cliente "${client.name}"?\nSe borrarán también todos sus agrupadores y sesiones.`, { type: 'danger', confirmLabel: 'Borrar' })) return;
      try {
        await deleteClient(client.id);
        await reloadList(root);
      } catch (err) {
        showToast(`Error al borrar: ${err.message}`, 'danger');
      }
    });
  });
}

function renderClientCard(client) {
  const fecha = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  return `
    <div class="card client-card" data-client-id="${client.id}">
      <div class="card__header">
        <div>
          <h3 style="margin:0;font-size:var(--text-lg);">${escHtml(client.name)}</h3>
          ${fecha ? `<p class="text-sm text-muted" style="margin-top:var(--sp-1);">Creado ${fecha}</p>` : ''}
        </div>
      </div>
      ${client.notes ? `<div class="card__body" style="padding:var(--sp-3) var(--sp-6);font-size:var(--text-sm);color:var(--color-wordmark);">${escHtml(client.notes)}</div>` : ''}
      <div class="card__footer" style="justify-content:space-between;gap:var(--sp-2);flex-wrap:wrap;">
        <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
          <button class="btn btn--primary btn--sm js-controls-btn">📋 Controles</button>
          <button class="btn btn--secondary btn--sm js-run-btn">▶ Cruce nómina</button>
          <button class="btn btn--secondary btn--sm js-groupers-btn">⚙ Agrupadores</button>
        </div>
        <button class="btn btn--ghost btn--sm js-delete-btn">🗑 Borrar</button>
      </div>
    </div>
  `;
}

function showCreateModal(root) {
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
      await reloadList(root);
    } catch (err) {
      showToast(`Error al crear el cliente: ${err.message}`, 'danger');
    }
  });

  // Enter en el campo de nombre también guarda
  overlay.querySelector('#js-client-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#js-confirm-create').click();
  });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
