// toast.js — Sistema de notificaciones no bloqueantes
//
// Reemplaza alert() y confirm() nativos por toasts y diálogos con estilo H&A.
//   showToast(message, type, duration)  — notificación sin bloquear la UI
//   showConfirm(message, opts)          — diálogo de confirmación, devuelve Promise<boolean>

let container = null;

function getContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'danger'} type
 * @param {number} duration  ms; 0 = permanente hasta que el usuario lo cierre
 */
export function showToast(message, type = 'info', duration = 4500) {
  const c    = getContainer();
  const el   = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icons  = { info: 'ℹ', success: '✓', warning: '⚠', danger: '✕' };

  el.innerHTML = `
    <span style="font-size:1.15em;flex-shrink:0;line-height:1;">${icons[type] || 'ℹ'}</span>
    <span style="flex:1;line-height:1.4;">${escHtml(message)}</span>
    <button style="background:none;border:none;cursor:pointer;opacity:0.55;font-size:15px;line-height:1;padding:0 0 0 var(--sp-2);flex-shrink:0;" title="Cerrar">✕</button>
  `;

  const close = () => {
    el.style.transition = 'opacity 180ms ease, transform 180ms ease';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(120%)';
    setTimeout(() => el.remove(), 200);
  };

  el.querySelector('button').addEventListener('click', close);
  c.appendChild(el);

  if (duration > 0) setTimeout(close, duration);
  return close;
}

/**
 * Reemplaza confirm() nativo. Devuelve Promise<boolean>.
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, type?: 'warning'|'danger'|'info' }} opts
 */
export function showConfirm(message, {
  confirmLabel = 'Aceptar',
  cancelLabel  = 'Cancelar',
  type         = 'warning',
} = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const icons    = { warning: '⚠', danger: '🗑', info: 'ℹ' };
    const btnClass = type === 'danger' ? 'btn--danger' : 'btn--primary';

    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal__body" style="text-align:center;padding:var(--sp-8) var(--sp-6) var(--sp-5);">
          <div style="font-size:2em;margin-bottom:var(--sp-3);">${icons[type] || '⚠'}</div>
          <p style="margin:0;font-size:var(--text-base);color:var(--color-text);line-height:1.5;">${escHtml(message)}</p>
        </div>
        <div class="modal__footer" style="justify-content:center;gap:var(--sp-3);">
          <button class="btn btn--ghost" id="js-confirm-cancel">${escHtml(cancelLabel)}</button>
          <button class="btn ${btnClass}" id="js-confirm-ok">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    const cleanup = (result) => { overlay.remove(); resolve(result); };

    overlay.querySelector('#js-confirm-ok').addEventListener('click',     () => cleanup(true));
    overlay.querySelector('#js-confirm-cancel').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    // Esc cancela
    const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); cleanup(false); } };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    overlay.querySelector('#js-confirm-ok').focus();
  });
}
