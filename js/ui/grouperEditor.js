// grouperEditor.js — Pantalla de configuración de agrupadores de conceptos
//
// Un "agrupador" es una carpeta lógica de conceptos.
// Ejemplo: el agrupador "Remunerativos" agrupa los conceptos 100, 110, 115.
// El usuario puede crear los agrupadores que quiera y asignarles los códigos
// de concepto que usa Meta4 para ese cliente.

import {
  getClient, getGroupers, createGrouper, deleteGrouper,
  getGrouperConcepts, addConceptToGrouper, removeConceptFromGrouper,
} from '../db.js';
import { showToast, showConfirm } from './toast.js';

export async function renderGrouperEditor(root, clientId) {
  const client = await getClient(clientId);
  if (!client) {
    root.innerHTML = `<div class="page-content"><div class="alert alert--danger">Cliente no encontrado.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <button class="btn btn--ghost btn--sm" id="js-back-btn">← Volver</button>
          <h2>Agrupadores — <span style="color:var(--color-wordmark);font-weight:300;">${escHtml(client.name)}</span></h2>
        </div>
        <div class="page-actions__buttons">
          <button class="btn btn--primary" id="js-new-grouper-btn">+ Nuevo agrupador</button>
        </div>
      </div>
      <div class="alert alert--info" style="margin-bottom:var(--sp-5);">
        ℹ️ Cada agrupador es un conjunto de conceptos. Al ejecutar un cruce,
        la app suma los importes de cada agrupador por legajo y compara los dos archivos.
      </div>
      <div id="js-groupers-container"></div>
    </div>
  `;

  root.querySelector('#js-back-btn').addEventListener('click', () => { window.location.hash = '#/'; });
  root.querySelector('#js-new-grouper-btn').addEventListener('click', () => showNewGrouperModal(root, clientId));

  await reloadGroupers(root, clientId);
}

async function reloadGroupers(root, clientId) {
  const container = root.querySelector('#js-groupers-container');
  const groupers = await getGroupers(clientId);

  if (groupers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📂</div>
        <div class="empty-state__title">No hay agrupadores todavía</div>
        <p class="empty-state__text">
          Creá un agrupador (ej: "Remunerativos") y añadile los códigos de concepto
          que correspondan a este cliente.
        </p>
      </div>
    `;
    return;
  }

  // Cargamos los conceptos de todos los agrupadores en paralelo
  const allConcepts = await Promise.all(groupers.map(g => getGrouperConcepts(g.id)));

  container.innerHTML = groupers.map((g, i) => renderGrouperCard(g, allConcepts[i])).join('');

  // Eventos por cada agrupador
  groupers.forEach((grouper, i) => {
    const card = container.querySelector(`[data-grouper-id="${grouper.id}"]`);

    // Borrar agrupador
    card.querySelector('.js-delete-grouper').addEventListener('click', async () => {
      if (!await showConfirm(`¿Borrar el agrupador "${grouper.name}"? Se eliminan también sus conceptos.`, { type: 'danger', confirmLabel: 'Borrar' })) return;
      await deleteGrouper(grouper.id);
      await reloadGroupers(root, clientId);
    });

    // Borrar concepto individual
    card.querySelectorAll('.js-remove-concept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        await removeConceptFromGrouper(grouper.id, code);
        await reloadGroupers(root, clientId);
      });
    });

    // Agregar concepto
    const input = card.querySelector('.js-concept-input');
    const addBtn = card.querySelector('.js-add-concept-btn');

    const addConcept = async () => {
      const code = input.value.trim();
      if (!code) return;
      try {
        await addConceptToGrouper(grouper.id, code);
        input.value = '';
        await reloadGroupers(root, clientId);
      } catch (err) {
        showToast(`Error al agregar el concepto: ${err.message}`, 'danger');
      }
    };

    addBtn.addEventListener('click', addConcept);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addConcept(); } });
  });
}

function renderGrouperCard(grouper, concepts) {
  const pillsHtml = concepts.length
    ? concepts.map(c => `
        <span class="pill pill--active" style="gap:var(--sp-1);">
          ${escHtml(c.conceptCode)}
          ${c.conceptLabel ? `<small style="opacity:.7;">${escHtml(c.conceptLabel)}</small>` : ''}
          <button class="js-remove-concept" data-code="${escHtml(c.conceptCode)}"
            style="background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;font-size:12px;padding:0 0 0 var(--sp-1);"
            title="Quitar concepto">✕</button>
        </span>
      `).join('')
    : `<span class="text-sm text-muted">Sin conceptos aún</span>`;

  return `
    <div class="card" data-grouper-id="${grouper.id}" style="margin-bottom:var(--sp-4);">
      <div class="card__header">
        <h4 style="margin:0;">${escHtml(grouper.name)}</h4>
        <button class="btn btn--ghost btn--sm js-delete-grouper">🗑 Borrar</button>
      </div>
      <div class="card__body">
        <div class="pill-group" style="margin-bottom:var(--sp-4);">
          ${pillsHtml}
        </div>
        <div style="display:flex;gap:var(--sp-2);align-items:center;">
          <input type="text" class="form-input js-concept-input"
            placeholder="Código de concepto (ej: 100)" style="max-width:220px;">
          <button class="btn btn--secondary btn--sm js-add-concept-btn">+ Agregar</button>
        </div>
        <p class="form-hint">
          Escribí el código del concepto como aparece en el Excel y presioná Enter o el botón.
        </p>
      </div>
    </div>
  `;
}

function showNewGrouperModal(root, clientId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>Nuevo agrupador</h3>
        <button class="modal__close" id="js-close-modal">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-group">
          <label class="form-label form-label--required">Nombre del agrupador</label>
          <input type="text" class="form-input" id="js-grouper-name"
            placeholder="Ej: Remunerativos, Aportes, Descuentos..." autofocus>
          <p class="form-hint">Después de crearlo podés agregarle los códigos de concepto.</p>
        </div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" id="js-cancel">Cancelar</button>
        <button class="btn btn--primary" id="js-confirm">Crear</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#js-close-modal').addEventListener('click', close);
  overlay.querySelector('#js-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#js-confirm').addEventListener('click', async () => {
    const name = overlay.querySelector('#js-grouper-name').value.trim();
    if (!name) { showToast('El nombre del agrupador es obligatorio.', 'warning'); return; }
    await createGrouper(clientId, name);
    close();
    await reloadGroupers(root, clientId);
  });

  overlay.querySelector('#js-grouper-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#js-confirm').click();
  });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
