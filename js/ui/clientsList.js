// clientsList.js — Pantalla de inicio: lista de clientes
//
// Desde acá el usuario puede crear un cliente nuevo, arrancar una validación,
// ir al editor de agrupadores o borrar un cliente.

import { getClients, createClient, updateClient, deleteClient } from '../db.js';

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
        <div class="loading-screen"><div class="spinner"></div></div>
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
      <div class="empty-state">
        <div class="empty-state__icon">🏢</div>
        <div class="empty-state__title">Todavía no hay clientes</div>
        <p class="empty-state__text">Creá el primer cliente para empezar a validar nóminas.</p>
        <button class="btn btn--primary" id="js-first-client-btn">+ Crear primer cliente</button>
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
      if (!confirm(`¿Seguro que querés borrar el cliente "${client.name}"?\nSe borrarán también todos sus agrupadores y sesiones.`)) return;
      try {
        await deleteClient(client.id);
        await reloadList(root);
      } catch (err) {
        alert(`Error al borrar: ${err.message}`);
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
    if (!name) { alert('El nombre del cliente es obligatorio.'); return; }
    try {
      await createClient(name, notes);
      close();
      await reloadList(root);
    } catch (err) {
      alert(`Error al crear el cliente: ${err.message}`);
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
