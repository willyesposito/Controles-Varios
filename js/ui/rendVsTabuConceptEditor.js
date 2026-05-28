// rendVsTabuConceptEditor.js — Editor de agrupación de conceptos para Control 5 RendvsTabu

import { DEFAULT_CONCEPT_CONFIG } from '../controls/rendVsTabu.js';

const CAT_META = [
  { key: 'precio',   label: 'PRECIO',          hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)' },
  { key: 'cargas',   label: 'CARGAS SS',       hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)' },
  { key: 'provMes',  label: 'PROV. MES',       hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)' },
];

function buildColByCode(sampleRow) {
  const colByCode = {};
  for (const col of Object.keys(sampleRow)) {
    const s = String(col).trim();
    const m = s.match(/^(\d+)[-_]/);
    if (m) {
      if (!colByCode[m[1]]) colByCode[m[1]] = col;
    } else if (/^\d+$/.test(s)) {
      if (!colByCode[s]) colByCode[s] = col;
    }
  }
  return colByCode;
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderConceptGroupingEditor(container, tabRows, currentGrouping, onChange) {
  const colByCode = buildColByCode(tabRows[0] || {});
  const allCodes  = Object.keys(colByCode).sort((a, b) => Number(a) - Number(b));

  let grouping = currentGrouping ? deepClone(currentGrouping) : deepClone(DEFAULT_CONCEPT_CONFIG);
  let uiState  = { sort: 'num', hideNotFound: false };

  function getAssignedCodes() {
    const s = new Set();
    for (const cat of CAT_META) {
      for (const e of (grouping[cat.key] || [])) s.add(e.code);
    }
    return s;
  }

  function renderEditor() {
    const assignedCodes = getAssignedCodes();
    const orphanCodes   = allCodes.filter(c => !assignedCodes.has(c));

    const categorySections = CAT_META.map(cat => {
      const entries = grouping[cat.key] || [];

      let displayEntries = entries.map((e, i) => ({ ...e, originalIdx: i }));
      if (uiState.hideNotFound) displayEntries = displayEntries.filter(e => colByCode[e.code]);
      if (uiState.sort === 'num') {
        displayEntries.sort((a, b) => Number(a.code) - Number(b.code));
      } else if (uiState.sort === 'alpha') {
        displayEntries.sort((a, b) => (colByCode[a.code] || a.code).localeCompare(colByCode[b.code] || b.code, 'es'));
      }

      const chips = displayEntries.map(entry => {
        const found    = colByCode[entry.code];
        const label    = found ? esc(found) : esc(entry.code);
        const notFound = !found
          ? ` <span title="No encontrado en Tabulado" style="color:var(--color-warning);">⚠</span>`
          : '';
        const signLabel = entry.sign === 1 ? '+' : '−';
        const signColor = entry.sign === 1 ? 'var(--color-success)' : 'var(--color-danger)';
        return `
          <span style="display:inline-flex;align-items:center;gap:3px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:4px;padding:2px 5px;font-size:11px;margin:2px;">
            <button type="button" data-sign="${cat.key}:${entry.originalIdx}"
              style="border:none;background:none;cursor:pointer;font-weight:700;padding:0 1px;color:${signColor};"
              title="Cambiar signo">${signLabel}</button>
            <span>${label}${notFound}</span>
            <button type="button" data-remove="${cat.key}:${entry.originalIdx}"
              style="border:none;background:none;cursor:pointer;color:var(--color-danger);padding:0 1px;font-size:13px;line-height:1;"
              title="Quitar">×</button>
          </span>`;
      }).join('');

      const availableCodes = allCodes.filter(c => !entries.some(e => e.code === c));
      const addOpts = availableCodes
        .map(c => `<option value="${esc(c)}">${esc(colByCode[c] || c)}</option>`)
        .join('');

      return `
        <div style="padding:var(--sp-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:${cat.bg};">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2);">
            <strong style="font-size:var(--text-sm);">${esc(cat.label)}</strong>
            <span style="font-size:11px;color:var(--color-muted);">${entries.length} concepto${entries.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:2px;min-height:24px;margin-bottom:var(--sp-2);">
            ${chips || '<span style="font-size:11px;color:var(--color-muted);font-style:italic;">Sin conceptos asignados</span>'}
          </div>
          ${availableCodes.length > 0 ? `
            <select class="form-select" data-add-to="${cat.key}"
              style="font-size:11px;height:26px;padding:2px 6px;width:100%;">
              <option value="">+ Agregar concepto del Tabulado...</option>
              ${addOpts}
            </select>` : ''}
        </div>`;
    }).join('');

    const orphanRows = orphanCodes.map(c => {
      const catOpts = CAT_META.map(cat =>
        `<option value="${cat.key}">${esc(cat.label)}</option>`
      ).join('');
      return `
        <div style="display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-1) 0;border-bottom:1px solid var(--color-border);">
          <span style="flex:1;font-size:var(--text-sm);font-family:monospace;">${esc(colByCode[c])}</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap;">
            <input type="checkbox" data-orphan-neg="${esc(c)}" style="margin:0;"> resta
          </label>
          <select class="form-select" data-assign-orphan="${esc(c)}"
            style="width:160px;font-size:11px;height:26px;padding:2px 6px;">
            <option value="">— Asignar a... —</option>
            ${catOpts}
          </select>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="margin-top:var(--sp-6);padding:var(--sp-5);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--sp-4);gap:var(--sp-3);">
          <div>
            <h4 style="margin:0 0 var(--sp-1);">Agrupación de conceptos — RendvsTabu</h4>
            <p class="text-muted" style="margin:0;font-size:var(--text-sm);">
              Definí qué conceptos del Tabulado se suman en cada categoría. Los cambios se guardan al ejecutar.
            </p>
          </div>
          <button type="button" id="js-rtv-restore" class="btn btn--ghost btn--sm" style="white-space:nowrap;flex-shrink:0;">
            ↺ Restaurar defaults
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3);flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--color-muted);">Ordenar:</span>
          ${['none','num','alpha'].map(mode => {
            const labels = { none: 'Sin ordenar', num: 'Por número', alpha: 'Alfabético' };
            const active = uiState.sort === mode;
            return `<button type="button" data-sort="${mode}" class="btn btn--ghost btn--sm"
              style="${active ? 'font-weight:700;border-color:var(--color-primary);' : ''}">${labels[mode]}</button>`;
          }).join('')}
          <label style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="js-rtv-hide-notfound" ${uiState.hideNotFound ? 'checked' : ''}>
            Ocultar no encontrados en Tabulado
          </label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-3);">
          ${categorySections}
        </div>
        ${orphanCodes.length > 0 ? `
          <div style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--color-border);">
            <h5 style="margin:0 0 var(--sp-2);font-size:var(--text-sm);">
              Sin asignar — ${orphanCodes.length} concepto${orphanCodes.length !== 1 ? 's' : ''} del Tabulado
            </h5>
            ${orphanRows}
          </div>` : ''}
      </div>`;

    // ── Eventos ──────────────────────────────────────────────────────────────

    container.querySelectorAll('[data-sign]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [catKey, idxStr] = btn.dataset.sign.split(':');
        grouping[catKey][Number(idxStr)].sign *= -1;
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [catKey, idxStr] = btn.dataset.remove.split(':');
        grouping[catKey].splice(Number(idxStr), 1);
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-add-to]').forEach(sel => {
      sel.addEventListener('change', () => {
        const catKey = sel.dataset.addTo;
        const code   = sel.value;
        if (!code) return;
        if (!grouping[catKey]) grouping[catKey] = [];
        grouping[catKey].push({ code, sign: 1 });
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-assign-orphan]').forEach(sel => {
      sel.addEventListener('change', () => {
        const code   = sel.dataset.assignOrphan;
        const catKey = sel.value;
        if (!catKey) return;
        const negCheck = container.querySelector(`[data-orphan-neg="${CSS.escape(code)}"]`);
        const sign = negCheck?.checked ? -1 : 1;
        if (!grouping[catKey]) grouping[catKey] = [];
        grouping[catKey].push({ code, sign });
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelector('#js-rtv-restore')?.addEventListener('click', () => {
      grouping = deepClone(DEFAULT_CONCEPT_CONFIG);
      onChange(deepClone(grouping));
      renderEditor();
    });

    container.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        uiState.sort = btn.dataset.sort;
        renderEditor();
      });
    });

    container.querySelector('#js-rtv-hide-notfound')?.addEventListener('change', e => {
      uiState.hideNotFound = e.target.checked;
      renderEditor();
    });
  }

  renderEditor();
}
